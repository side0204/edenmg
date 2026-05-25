'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// 작업자 위치 추적 — 청약 프로젝트 캔버스 지도 모드 에서 활성 작업자 위치 표시.
//
// 활성 조건 (한 가지라도 충족하면 push 허용):
//   - 이 프로젝트와 연동된 작업(works.relocation_project_id = projectId)의
//     work_daily_checks 에 본인 행이 있고 closed_at IS NULL
//
// 권한:
//   - upsertWorkerPosition: 본인 + 활성 조건 충족 시만
//   - 위치 저장: relocation_worker_positions RLS (본인만 insert/update)
//
// 사이트 메타: GPS accuracy_m 도 같이 저장해 표시 시 신뢰성 표현.

export type WorkerPositionResult =
  | { ok: true; recordedAt: string }
  | { ok: false; error: string; reason?: 'not_active' | 'no_employee' | 'db' }

export async function upsertWorkerPosition(input: {
  projectId: string
  lat: number
  lng: number
  accuracy?: number | null
}): Promise<WorkerPositionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: '로그인 필요', reason: 'no_employee' }

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; company_id: string; is_active: boolean } | null
  if (!me || !me.is_active)
    return { ok: false, error: '활성 직원이 아닙니다', reason: 'no_employee' }

  // 좌표 유효성
  if (
    typeof input.lat !== 'number' ||
    typeof input.lng !== 'number' ||
    !Number.isFinite(input.lat) ||
    !Number.isFinite(input.lng) ||
    input.lat < -90 ||
    input.lat > 90 ||
    input.lng < -180 ||
    input.lng > 180
  ) {
    return { ok: false, error: '잘못된 좌표', reason: 'db' }
  }

  // 프로젝트 회사 스코프 확인
  const { data: proj } = await supabase
    .from('relocation_projects')
    .select('id, company_id')
    .eq('id', input.projectId)
    .maybeSingle()
  if (!proj || (proj as { company_id: string }).company_id !== me.company_id) {
    return { ok: false, error: '프로젝트 접근 권한 없음', reason: 'no_employee' }
  }

  // 활성 작업 조건 — 이 프로젝트 연동 work 에 본인이 오늘 미마감 체크인 있어야 함
  const admin = createAdminClient()
  const { data: workRow } = await admin
    .from('works')
    .select('id')
    .eq('relocation_project_id', input.projectId)
    .maybeSingle()
  if (!workRow) {
    return { ok: false, error: '연동된 작업이 없습니다', reason: 'not_active' }
  }
  const workId = (workRow as { id: string }).id

  // 오늘(KST) 의 미마감 체크인
  const seoulToday = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }),
  )
  const yyyy = seoulToday.getFullYear()
  const mm = String(seoulToday.getMonth() + 1).padStart(2, '0')
  const dd = String(seoulToday.getDate()).padStart(2, '0')
  const todayKst = `${yyyy}-${mm}-${dd}`

  const { data: chk } = await admin
    .from('work_daily_checks')
    .select('id')
    .eq('work_id', workId)
    .eq('employee_id', me.id)
    .eq('check_date', todayKst)
    .is('closed_at', null)
    .maybeSingle()
  if (!chk) {
    return {
      ok: false,
      error: '작업 시작 상태가 아닙니다',
      reason: 'not_active',
    }
  }

  const nowIso = new Date().toISOString()
  // upsert by unique (project_id, employee_id)
  const { error } = await supabase
    .from('relocation_worker_positions')
    .upsert(
      {
        company_id: me.company_id,
        project_id: input.projectId,
        employee_id: me.id,
        lat: input.lat,
        lng: input.lng,
        accuracy_m: input.accuracy ?? null,
        recorded_at: nowIso,
        last_seen_at: nowIso,
      },
      { onConflict: 'project_id,employee_id' },
    )
  if (error) return { ok: false, error: error.message, reason: 'db' }

  return { ok: true, recordedAt: nowIso }
}

// 현재 본인이 이 프로젝트에서 활성 상태인지 (client 가 watchPosition 시작 전 체크)
export async function isWorkerActiveOnProject(
  projectId: string,
): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false
  const { data: meRow } = await supabase
    .from('employees')
    .select('id, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; is_active: boolean } | null
  if (!me || !me.is_active) return false

  const admin = createAdminClient()
  const { data: workRow } = await admin
    .from('works')
    .select('id')
    .eq('relocation_project_id', projectId)
    .maybeSingle()
  if (!workRow) return false
  const workId = (workRow as { id: string }).id

  const seoulToday = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }),
  )
  const yyyy = seoulToday.getFullYear()
  const mm = String(seoulToday.getMonth() + 1).padStart(2, '0')
  const dd = String(seoulToday.getDate()).padStart(2, '0')
  const todayKst = `${yyyy}-${mm}-${dd}`

  const { data: chk } = await admin
    .from('work_daily_checks')
    .select('id')
    .eq('work_id', workId)
    .eq('employee_id', me.id)
    .eq('check_date', todayKst)
    .is('closed_at', null)
    .maybeSingle()
  return !!chk
}
