'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  CABLE_STATUS_VALUES,
  CABLE_INSTALLATION_TYPE_VALUES,
  formatNewCableCode,
  type CableStatus,
  type CableInstallationType,
} from '@/lib/relocation'
import type { CableSpec } from '@/lib/connection'
import { CABLE_SPEC_VALUES } from '@/lib/connection'

// 케이블 CRUD — 회사 스코프 + 권한 제한 없음.
// 신설(status='new') 케이블은 cable_code 자동 생성 (NEW-XXXX-NNNNNN).
// 기설/이설/철거는 사용자가 직접 입력 (LGU+ 제공 코드).

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

function isCableSpec(v: string): v is CableSpec {
  return (CABLE_SPEC_VALUES as readonly string[]).includes(v)
}

function isCableStatus(v: string): v is CableStatus {
  return (CABLE_STATUS_VALUES as readonly string[]).includes(v)
}

function isInstallationType(v: string): v is CableInstallationType {
  return (CABLE_INSTALLATION_TYPE_VALUES as readonly string[]).includes(v)
}

type CableFormParsed = {
  from_facility_id: string
  to_facility_id: string
  spec: CableSpec
  status: CableStatus
  cable_code: string                // create 시 비어있으면 신설 자동 생성
  installation_type: CableInstallationType | null  // LGU+ 광망 범례 — 가공·구내·해저·입상·지중
  notes: string | null
}

function parseCableForm(formData: FormData): CableFormParsed | string {
  const from_facility_id = String(formData.get('from_facility_id') ?? '').trim()
  if (!from_facility_id) return '출발 시설을 선택하세요.'

  const to_facility_id = String(formData.get('to_facility_id') ?? '').trim()
  if (!to_facility_id) return '도착 시설을 선택하세요.'

  if (from_facility_id === to_facility_id) {
    return '출발과 도착 시설이 같을 수 없습니다.'
  }

  const specRaw = String(formData.get('spec') ?? '').trim()
  if (!isCableSpec(specRaw)) return '케이블 규격을 선택하세요.'

  const statusRaw = String(formData.get('status') ?? '').trim() || 'new'
  if (!isCableStatus(statusRaw)) return '케이블 상태가 올바르지 않습니다.'

  const cable_code = String(formData.get('cable_code') ?? '').trim()

  const installRaw = String(formData.get('installation_type') ?? '').trim()
  const installation_type = installRaw && isInstallationType(installRaw) ? installRaw : null

  const notes = String(formData.get('notes') ?? '').trim() || null

  return {
    from_facility_id,
    to_facility_id,
    spec: specRaw,
    status: statusRaw,
    cable_code,
    installation_type,
    notes,
  }
}

/**
 * 신설 케이블 ID 자동 생성: NEW-{프로젝트 단축}-{6자리 순번}.
 * relocation_cable_seq 카운터를 UPSERT 로 갱신.
 * 동시성: race 시 unique 충돌은 server action 에서 catch+retry.
 */
async function allocateNextCableCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
): Promise<string> {
  const { data: row } = await supabase
    .from('relocation_cable_seq')
    .select('last_seq')
    .eq('project_id', projectId)
    .maybeSingle()

  const currentSeq = (row as { last_seq: number } | null)?.last_seq ?? 0
  const nextSeq = currentSeq + 1

  const { error } = await supabase
    .from('relocation_cable_seq')
    .upsert({ project_id: projectId, last_seq: nextSeq })
  if (error) throw new Error('케이블 카운터 갱신 실패: ' + error.message)

  return formatNewCableCode(projectId, nextSeq)
}


export async function createCable(formData: FormData) {
  const projectId = String(formData.get('project_id') ?? '').trim()
  if (!projectId) redirect('/relocation?err=' + encodeURIComponent('프로젝트 id 가 없습니다'))

  const parsed = parseCableForm(formData)
  if (typeof parsed === 'string') {
    redirect(`/relocation/${projectId}?tab=cables&err=` + encodeURIComponent(parsed))
  }

  const { supabase } = await requireMember()

  // 신설인데 cable_code 가 비어있으면 자동 생성
  let cableCode = parsed.cable_code
  if (!cableCode) {
    if (parsed.status !== 'new') {
      redirect(
        `/relocation/${projectId}?tab=cables&err=` +
          encodeURIComponent('기설·이설·철거 케이블은 LGU+ 제공 케이블 ID 입력이 필요합니다'),
      )
    }
    try {
      cableCode = await allocateNextCableCode(supabase, projectId)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('NEXT_REDIRECT')) throw e
      redirect(
        `/relocation/${projectId}?tab=cables&err=` + encodeURIComponent(msg),
      )
    }
  }

  let attempt = 0
  let lastErr: string | null = null
  while (attempt < 3) {
    attempt += 1
    const { error } = await supabase.from('relocation_cables').insert({
      project_id: projectId,
      from_facility_id: parsed.from_facility_id,
      to_facility_id: parsed.to_facility_id,
      spec: parsed.spec,
      status: parsed.status,
      cable_code: cableCode,
      installation_type: parsed.installation_type,
      notes: parsed.notes,
    })

    if (!error) {
      revalidatePath(`/relocation/${projectId}`)
      redirect(
        `/relocation/${projectId}?tab=cables&ok=` +
          encodeURIComponent(`${cableCode} 케이블을 등록했습니다`),
      )
    }

    lastErr = error.message
    // 자동 생성 모드에서 unique 충돌 → 다음 시퀀스로 재시도
    if (
      !parsed.cable_code &&
      (error.message.includes('unique') ||
        error.message.includes('duplicate') ||
        error.code === '23505')
    ) {
      try {
        cableCode = await allocateNextCableCode(supabase, projectId)
        continue
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.includes('NEXT_REDIRECT')) throw e
        lastErr = msg
        break
      }
    }
    // 사용자 입력 케이블 코드가 중복이면 즉시 에러
    if (
      error.message.includes('unique') ||
      error.message.includes('duplicate') ||
      error.code === '23505'
    ) {
      lastErr = `같은 케이블 ID 가 이미 등록되어 있습니다: ${cableCode}`
    }
    break
  }

  redirect(
    `/relocation/${projectId}?tab=cables&err=` +
      encodeURIComponent('등록 실패: ' + (lastErr ?? '알 수 없는 오류')),
  )
}


/**
 * 캔버스에서 케이블 생성 — redirect 안 함, JSON 결과 반환.
 * 케이블 추가 후 캔버스(도식/지도 모드)에 그대로 머물기 위함.
 */
export async function createCableFromCanvas(input: {
  project_id: string
  from_facility_id: string
  to_facility_id: string
  spec: string
  status: string
  cable_code: string
  installation_type: string | null
  notes: string | null
}): Promise<{ ok: true; cable_code: string } | { ok: false; error: string }> {
  if (!input.project_id) return { ok: false, error: '프로젝트 id 가 없습니다' }

  const from_facility_id = (input.from_facility_id ?? '').trim()
  const to_facility_id = (input.to_facility_id ?? '').trim()
  if (!from_facility_id || !to_facility_id) {
    return { ok: false, error: '출발·도착 시설을 선택하세요' }
  }
  if (from_facility_id === to_facility_id) {
    return { ok: false, error: '출발과 도착 시설이 같을 수 없습니다' }
  }
  if (!isCableSpec(input.spec)) return { ok: false, error: '케이블 규격을 선택하세요' }
  const status = (input.status ?? '').trim() || 'new'
  if (!isCableStatus(status)) return { ok: false, error: '케이블 상태가 올바르지 않습니다' }
  const installation_type =
    input.installation_type && isInstallationType(input.installation_type)
      ? input.installation_type
      : null
  const notes = (input.notes ?? '').trim() || null
  const userCableCode = (input.cable_code ?? '').trim()

  const { supabase } = await requireMember()

  let cableCode = userCableCode
  if (!cableCode) {
    if (status !== 'new') {
      return {
        ok: false,
        error: '기설·이설·철거 케이블은 LGU+ 제공 케이블 ID 입력이 필요합니다',
      }
    }
    try {
      cableCode = await allocateNextCableCode(supabase, input.project_id)
    } catch (e: unknown) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  let attempt = 0
  let lastErr: string | null = null
  while (attempt < 3) {
    attempt += 1
    const { error } = await supabase.from('relocation_cables').insert({
      project_id: input.project_id,
      from_facility_id,
      to_facility_id,
      spec: input.spec,
      status,
      cable_code: cableCode,
      installation_type,
      notes,
    })

    if (!error) {
      revalidatePath(`/relocation/${input.project_id}`)
      return { ok: true, cable_code: cableCode }
    }

    lastErr = error.message
    const isUnique =
      error.message.includes('unique') ||
      error.message.includes('duplicate') ||
      error.code === '23505'
    // 자동 생성 모드에서 unique 충돌 → 다음 시퀀스로 재시도
    if (!userCableCode && isUnique) {
      try {
        cableCode = await allocateNextCableCode(supabase, input.project_id)
        continue
      } catch (e: unknown) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    }
    if (isUnique) {
      lastErr = `같은 케이블 ID 가 이미 등록되어 있습니다: ${cableCode}`
    }
    break
  }

  return { ok: false, error: '등록 실패: ' + (lastErr ?? '알 수 없는 오류') }
}


export async function updateCable(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  const projectId = String(formData.get('project_id') ?? '').trim()
  if (!id || !projectId) redirect('/relocation?err=' + encodeURIComponent('id 가 없습니다'))

  const parsed = parseCableForm(formData)
  if (typeof parsed === 'string') {
    redirect(`/relocation/${projectId}?tab=cables&err=` + encodeURIComponent(parsed))
  }

  if (!parsed.cable_code) {
    redirect(
      `/relocation/${projectId}?tab=cables&err=` +
        encodeURIComponent('케이블 ID 는 비울 수 없습니다'),
    )
  }

  const { supabase } = await requireMember()

  const { error } = await supabase
    .from('relocation_cables')
    .update({
      from_facility_id: parsed.from_facility_id,
      to_facility_id: parsed.to_facility_id,
      spec: parsed.spec,
      status: parsed.status,
      cable_code: parsed.cable_code,
      installation_type: parsed.installation_type,
      notes: parsed.notes,
    })
    .eq('id', id)

  if (error) {
    redirect(
      `/relocation/${projectId}?tab=cables&err=` +
        encodeURIComponent('수정 실패: ' + error.message),
    )
  }

  revalidatePath(`/relocation/${projectId}`)
  redirect(
    `/relocation/${projectId}?tab=cables&ok=` +
      encodeURIComponent('케이블 정보를 수정했습니다'),
  )
}


/**
 * 캔버스에서 케이블 정보 수정 — 규격·상태·설치구분·전체거리 + 경로점(전주명·구간거리).
 * redirect 안 함 — JSON 결과 반환 (캔버스 컨텍스트 유지). 클라이언트가 router.refresh.
 */
export async function updateCableFromCanvas(input: {
  project_id: string
  cable_id: string
  spec: string
  status: string
  installation_type: string | null
  total_length: number | null
  end_distance: number | null
  waypoints: Array<{
    x: number
    y: number
    lat?: number | null
    lng?: number | null
    pole_name: string | null
    dist: number | null
  }>
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.project_id || !input.cable_id) {
    return { ok: false, error: '케이블 정보가 없습니다' }
  }
  if (!isCableSpec(input.spec)) return { ok: false, error: '케이블 규격이 올바르지 않습니다' }
  if (!isCableStatus(input.status)) return { ok: false, error: '케이블 상태가 올바르지 않습니다' }
  const installation_type =
    input.installation_type && isInstallationType(input.installation_type)
      ? input.installation_type
      : null

  const num = (v: number | null): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null

  if (input.waypoints.length > 200) {
    return { ok: false, error: '경로점이 너무 많습니다 (최대 200개)' }
  }
  const cleanWaypoints = input.waypoints.map((w) => ({
    x: Math.round(w.x),
    y: Math.round(w.y),
    lat: typeof w.lat === 'number' && Number.isFinite(w.lat) ? w.lat : null,
    lng: typeof w.lng === 'number' && Number.isFinite(w.lng) ? w.lng : null,
    pole_name: w.pole_name ? String(w.pole_name).slice(0, 100) : null,
    dist: num(w.dist),
  }))

  const { supabase } = await requireMember()

  const { error } = await supabase
    .from('relocation_cables')
    .update({
      spec: input.spec,
      status: input.status,
      installation_type,
      total_length: num(input.total_length),
      end_distance: num(input.end_distance),
      waypoints: cleanWaypoints,
    })
    .eq('id', input.cable_id)
    .eq('project_id', input.project_id) // RLS 보강

  if (error) {
    return { ok: false, error: '케이블 수정 실패: ' + error.message }
  }

  revalidatePath(`/relocation/${input.project_id}`)
  return { ok: true }
}


/**
 * 캔버스에서 케이블 삭제 — JSON 결과 반환 (redirect 안 함).
 */
export async function deleteCableFromCanvas(
  projectId: string,
  cableId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!projectId || !cableId) return { ok: false, error: '케이블 정보가 없습니다' }

  const { supabase } = await requireMember()

  const { error } = await supabase
    .from('relocation_cables')
    .delete()
    .eq('id', cableId)
    .eq('project_id', projectId)

  if (error) {
    const friendly = error.message.includes('foreign key')
      ? '이 케이블을 사용하는 코어 배정·접속이 있어 삭제할 수 없습니다. 먼저 제거해주세요.'
      : '삭제 실패: ' + error.message
    return { ok: false, error: friendly }
  }

  revalidatePath(`/relocation/${projectId}`)
  return { ok: true }
}


export async function deleteCable(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  const projectId = String(formData.get('project_id') ?? '').trim()
  if (!id || !projectId) redirect('/relocation?err=' + encodeURIComponent('id 가 없습니다'))

  const { supabase } = await requireMember()

  const { error } = await supabase.from('relocation_cables').delete().eq('id', id)
  if (error) {
    const friendly = error.message.includes('foreign key')
      ? '이 케이블을 사용하는 코어 배정·접속이 있어 삭제할 수 없습니다. 먼저 제거해주세요.'
      : '삭제 실패: ' + error.message
    redirect(
      `/relocation/${projectId}?tab=cables&err=` + encodeURIComponent(friendly),
    )
  }

  revalidatePath(`/relocation/${projectId}`)
  redirect(
    `/relocation/${projectId}?tab=cables&ok=` + encodeURIComponent('케이블을 삭제했습니다'),
  )
}
