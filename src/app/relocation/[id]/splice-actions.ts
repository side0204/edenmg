'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// 지장이설 접속(splice) CRUD — 함체 안에서 입력 케이블 코어 ↔ 출력 케이블 코어 매핑.
//   직선도(§ 6-5)·검증 룰 U1·U2·차수 동시작업 페어링의 입력 데이터.
//   회사 스코프는 relocation_splices RLS 가 강제. redirect 안 함 — JSON 반환.

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

async function requireMember() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, permission, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | { id: string; company_id: string; permission: Permission; is_active: boolean }
    | null
  if (!me || !me.is_active) {
    redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  }
  return { supabase, me }
}

export async function createSplice(input: {
  project_id: string
  facility_id: string
  in_cable_id: string
  in_core: number
  out_cable_id: string
  out_core: number
  is_continuous: boolean
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.project_id || !input.facility_id) {
    return { ok: false, error: '프로젝트·시설 정보가 없습니다' }
  }
  if (!input.in_cable_id || !input.out_cable_id) {
    return { ok: false, error: '입력·출력 케이블을 선택하세요' }
  }

  const inCore = Math.trunc(input.in_core)
  const outCore = Math.trunc(input.out_core)
  if (!Number.isFinite(inCore) || inCore < 1) {
    return { ok: false, error: '입력 코어 번호는 1 이상이어야 합니다' }
  }
  if (!Number.isFinite(outCore) || outCore < 1) {
    return { ok: false, error: '출력 코어 번호는 1 이상이어야 합니다' }
  }
  if (input.in_cable_id === input.out_cable_id && inCore === outCore) {
    return { ok: false, error: '같은 케이블의 같은 코어끼리는 접속할 수 없습니다' }
  }

  const { supabase } = await requireMember()

  const { error } = await supabase.from('relocation_splices').insert({
    project_id: input.project_id,
    facility_id: input.facility_id,
    in_cable_id: input.in_cable_id,
    in_core: inCore,
    out_cable_id: input.out_cable_id,
    out_core: outCore,
    is_continuous: input.is_continuous,
  })
  if (error) return { ok: false, error: '접속 등록 실패: ' + error.message }

  revalidatePath(`/relocation/${input.project_id}`)
  return { ok: true }
}

/**
 * 두 케이블의 코어 배정 박스끼리 클릭으로 한 번에 접속.
 *   in_cores 와 out_cores 길이가 같아야 함 — index 별로 짝지어 splice 1행씩.
 *   같은 행(facility, in_cable, in_core, out_cable, out_core) 이 이미 있으면 건너뜀.
 *   회사 스코프는 RLS 가 강제.
 *
 * 반환:
 *   { ok: true, created } — 생성 수
 *   { ok: false, error: 'CORE_COUNT_MISMATCH' } — 호출자가 사용자 메시지 분기
 *   { ok: false, error: '...' } — 그 외 오류
 */
export async function createSplicesFromBoxes(input: {
  project_id: string
  facility_id: string
  in_cable_id: string
  in_cores: number[]
  out_cable_id: string
  out_cores: number[]
  is_continuous?: boolean
}): Promise<
  | { ok: true; created: number; skipped: number }
  | { ok: false; error: string }
> {
  if (!input.project_id || !input.facility_id) {
    return { ok: false, error: '프로젝트·시설 정보가 없습니다' }
  }
  if (!input.in_cable_id || !input.out_cable_id) {
    return { ok: false, error: '입력·출력 케이블을 선택하세요' }
  }
  if (input.in_cable_id === input.out_cable_id) {
    return { ok: false, error: '같은 케이블끼리는 접속할 수 없습니다' }
  }
  if (!Array.isArray(input.in_cores) || !Array.isArray(input.out_cores)) {
    return { ok: false, error: '코어 목록이 올바르지 않습니다' }
  }
  if (input.in_cores.length === 0 || input.out_cores.length === 0) {
    return { ok: false, error: '배정된 코어가 없습니다' }
  }
  if (input.in_cores.length !== input.out_cores.length) {
    return { ok: false, error: 'CORE_COUNT_MISMATCH' }
  }

  const isContinuous = input.is_continuous ?? true

  // 코어 번호 정렬·정규화
  const inCores = input.in_cores.map((c) => Math.trunc(c)).sort((a, b) => a - b)
  const outCores = input.out_cores.map((c) => Math.trunc(c)).sort((a, b) => a - b)
  for (const c of inCores) {
    if (!Number.isFinite(c) || c < 1) return { ok: false, error: '입력 코어 번호가 올바르지 않습니다' }
  }
  for (const c of outCores) {
    if (!Number.isFinite(c) || c < 1) return { ok: false, error: '출력 코어 번호가 올바르지 않습니다' }
  }

  const { supabase } = await requireMember()

  // 이미 등록된 splice 조회 — 중복 방지 (정확히 같은 행만 스킵)
  const { data: existing, error: readErr } = await supabase
    .from('relocation_splices')
    .select('in_cable_id, in_core, out_cable_id, out_core')
    .eq('project_id', input.project_id)
    .eq('facility_id', input.facility_id)
  if (readErr) return { ok: false, error: '기존 접속 조회 실패: ' + readErr.message }
  const existingSet = new Set(
    ((existing ?? []) as {
      in_cable_id: string
      in_core: number
      out_cable_id: string
      out_core: number
    }[]).map(
      (s) => `${s.in_cable_id}:${s.in_core}>${s.out_cable_id}:${s.out_core}`,
    ),
  )

  const rows: Array<{
    project_id: string
    facility_id: string
    in_cable_id: string
    in_core: number
    out_cable_id: string
    out_core: number
    is_continuous: boolean
  }> = []
  let skipped = 0
  for (let i = 0; i < inCores.length; i += 1) {
    const a = inCores[i]
    const b = outCores[i]
    const k = `${input.in_cable_id}:${a}>${input.out_cable_id}:${b}`
    const kRev = `${input.out_cable_id}:${b}>${input.in_cable_id}:${a}`
    if (existingSet.has(k) || existingSet.has(kRev)) {
      skipped += 1
      continue
    }
    rows.push({
      project_id: input.project_id,
      facility_id: input.facility_id,
      in_cable_id: input.in_cable_id,
      in_core: a,
      out_cable_id: input.out_cable_id,
      out_core: b,
      is_continuous: isContinuous,
    })
  }

  if (rows.length === 0) {
    return { ok: true, created: 0, skipped }
  }

  const { error } = await supabase.from('relocation_splices').insert(rows)
  if (error) return { ok: false, error: '접속 등록 실패: ' + error.message }

  revalidatePath(`/relocation/${input.project_id}`)
  return { ok: true, created: rows.length, skipped }
}

export async function deleteSplice(
  projectId: string,
  spliceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!projectId || !spliceId) return { ok: false, error: '대상이 올바르지 않습니다' }

  const { supabase } = await requireMember()

  const { error } = await supabase
    .from('relocation_splices')
    .delete()
    .eq('id', spliceId)
    .eq('project_id', projectId)
  if (error) return { ok: false, error: '삭제 실패: ' + error.message }

  revalidatePath(`/relocation/${projectId}`)
  return { ok: true }
}
