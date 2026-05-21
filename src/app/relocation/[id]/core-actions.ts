'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  CORE_LIFECYCLE_VALUES,
  CIRCUIT_STATUS_VALUES,
  CIRCUIT_KIND_VALUES,
  type CoreLifecycle,
  type CircuitStatus,
  type CircuitKind,
} from '@/lib/relocation'

// 코어 배정(core assignment) CRUD — 회사 스코프 + 권한 제한 없음.
//
// DB 의 exclusion constraint (relocation_core_no_overlap) 가 같은 케이블 안
// 코어 범위 중복을 차단. server action 은 친절한 에러 메시지만 변환.

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

function isCoreLifecycle(v: string): v is CoreLifecycle {
  return (CORE_LIFECYCLE_VALUES as readonly string[]).includes(v)
}

function isCircuitStatus(v: string): v is CircuitStatus {
  return (CIRCUIT_STATUS_VALUES as readonly string[]).includes(v)
}

function isCircuitKind(v: string): v is CircuitKind {
  return (CIRCUIT_KIND_VALUES as readonly string[]).includes(v)
}

type CoreFormParsed = {
  circuit_id: string | null
  segment_idx: number
  cable_id: string
  core_range_start: number
  core_range_end: number
  lifecycle: CoreLifecycle
  status: CircuitStatus | null
  is_terminal: boolean
  notes: string | null
}

function parseCoreForm(formData: FormData): CoreFormParsed | string {
  const circuitRaw = String(formData.get('circuit_id') ?? '').trim()
  const circuit_id = circuitRaw.length > 0 ? circuitRaw : null

  const segmentIdxRaw = String(formData.get('segment_idx') ?? '0').trim()
  const segment_idx = Number.parseInt(segmentIdxRaw, 10)
  if (!Number.isFinite(segment_idx) || segment_idx < 0 || segment_idx > 9) {
    return '세그먼트 번호가 올바르지 않습니다 (0~9).'
  }

  const cable_id = String(formData.get('cable_id') ?? '').trim()
  if (!cable_id) return '케이블을 선택하세요.'

  // 한 케이블·한 회선(세그먼트)은 코어 1개만 사용 — 단일 코어 번호 입력.
  // DB 는 core_range_start/end 범위 컬럼을 유지하되 start = end 로 저장.
  const coreRaw = String(formData.get('core_no') ?? '').trim()
  const core = Number.parseInt(coreRaw, 10)
  if (!Number.isFinite(core) || core < 1) {
    return '코어 번호는 1 이상의 정수여야 합니다.'
  }

  const lifecycleRaw = String(formData.get('lifecycle') ?? '').trim() || 'new'
  if (!isCoreLifecycle(lifecycleRaw)) return '코어 lifecycle 이 올바르지 않습니다.'

  const statusRaw = String(formData.get('status') ?? '').trim()
  const status = statusRaw && isCircuitStatus(statusRaw) ? statusRaw : null

  // 종단 여부 — 설계자가 명시적으로 체크. 자동 추론 X (가입자시설이라도 통과되는 경우 있음)
  const is_terminal = formData.get('is_terminal') === 'on'

  const notes = String(formData.get('notes') ?? '').trim() || null

  return {
    circuit_id,
    segment_idx,
    cable_id,
    core_range_start: core,
    core_range_end: core,
    lifecycle: lifecycleRaw,
    status,
    is_terminal,
    notes,
  }
}

function overlapErrorMessage(core: number): string {
  return `코어 ${core} 는 이미 같은 케이블의 다른 회선에 배정되어 있습니다. 다른 코어 번호를 선택해주세요.`
}


export async function createCoreAssignment(formData: FormData) {
  const projectId = String(formData.get('project_id') ?? '').trim()
  if (!projectId) redirect('/relocation?err=' + encodeURIComponent('프로젝트 id 가 없습니다'))

  const parsed = parseCoreForm(formData)
  if (typeof parsed === 'string') {
    redirect(`/relocation/${projectId}?tab=cores&err=` + encodeURIComponent(parsed))
  }

  const { supabase } = await requireMember()

  const { error } = await supabase.from('relocation_core_assignments').insert({
    project_id: projectId,
    circuit_id: parsed.circuit_id,
    segment_idx: parsed.segment_idx,
    cable_id: parsed.cable_id,
    core_range_start: parsed.core_range_start,
    core_range_end: parsed.core_range_end,
    lifecycle: parsed.lifecycle,
    status: parsed.status,
    is_terminal: parsed.is_terminal,
    is_auto_assigned: false, // 사람 입력
    notes: parsed.notes,
  })

  if (error) {
    const friendly =
      error.message.includes('exclude') || error.code === '23P01'
        ? overlapErrorMessage(parsed.core_range_start)
        : '등록 실패: ' + error.message
    redirect(`/relocation/${projectId}?tab=cores&err=` + encodeURIComponent(friendly))
  }

  revalidatePath(`/relocation/${projectId}`)
  redirect(
    `/relocation/${projectId}?tab=cores&ok=` +
      encodeURIComponent(`코어 ${parsed.core_range_start} 배정 완료`),
  )
}


export async function updateCoreAssignment(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  const projectId = String(formData.get('project_id') ?? '').trim()
  if (!id || !projectId) redirect('/relocation?err=' + encodeURIComponent('id 가 없습니다'))

  const parsed = parseCoreForm(formData)
  if (typeof parsed === 'string') {
    redirect(`/relocation/${projectId}?tab=cores&err=` + encodeURIComponent(parsed))
  }

  const { supabase } = await requireMember()

  // 사람이 수정한 row 는 is_auto_assigned=false 로 변경 (사양 § 6-1)
  const { error } = await supabase
    .from('relocation_core_assignments')
    .update({
      circuit_id: parsed.circuit_id,
      segment_idx: parsed.segment_idx,
      cable_id: parsed.cable_id,
      core_range_start: parsed.core_range_start,
      core_range_end: parsed.core_range_end,
      lifecycle: parsed.lifecycle,
      status: parsed.status,
      is_terminal: parsed.is_terminal,
      is_auto_assigned: false,
      notes: parsed.notes,
    })
    .eq('id', id)

  if (error) {
    const friendly =
      error.message.includes('exclude') || error.code === '23P01'
        ? overlapErrorMessage(parsed.core_range_start)
        : '수정 실패: ' + error.message
    redirect(`/relocation/${projectId}?tab=cores&err=` + encodeURIComponent(friendly))
  }

  revalidatePath(`/relocation/${projectId}`)
  redirect(
    `/relocation/${projectId}?tab=cores&ok=` +
      encodeURIComponent('코어 배정을 수정했습니다'),
  )
}


export async function deleteCoreAssignment(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  const projectId = String(formData.get('project_id') ?? '').trim()
  if (!id || !projectId) redirect('/relocation?err=' + encodeURIComponent('id 가 없습니다'))

  const { supabase } = await requireMember()

  const { error } = await supabase.from('relocation_core_assignments').delete().eq('id', id)
  if (error) {
    redirect(
      `/relocation/${projectId}?tab=cores&err=` +
        encodeURIComponent('삭제 실패: ' + error.message),
    )
  }

  revalidatePath(`/relocation/${projectId}`)
  redirect(
    `/relocation/${projectId}?tab=cores&ok=` + encodeURIComponent('코어 배정을 삭제했습니다'),
  )
}


/**
 * 캔버스 케이블 정보 패널에서 회선·코어 인라인 추가 (워크플로우 3단계).
 * 종단으로 표시한 케이블에 회선·사용코어를 입력한다.
 * 새 회선번호를 입력하면 회선을 즉시 생성 (같은 번호가 이미 있으면 재사용).
 * redirect 안 함 — JSON 결과 반환 (캔버스 컨텍스트 유지). 클라이언트가 router.refresh.
 */
export async function addCoreAssignmentFromCanvas(input: {
  project_id: string
  cable_id: string
  circuit_id: string | null
  new_circuit: {
    circuit_id: string
    kind: string
    subscriber_name: string | null
  } | null
  segment_idx: number
  core_no: number
  lifecycle: string
  is_terminal: boolean
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.project_id || !input.cable_id) {
    return { ok: false, error: '케이블 정보가 없습니다' }
  }

  // 한 케이블·한 회선(세그먼트)은 코어 1개만 — 단일 코어 번호.
  const core = Math.trunc(input.core_no)
  if (!Number.isFinite(core) || core < 1) {
    return { ok: false, error: '코어 번호는 1 이상의 정수여야 합니다' }
  }

  const segment_idx = Math.trunc(input.segment_idx)
  if (!Number.isFinite(segment_idx) || segment_idx < 0 || segment_idx > 9) {
    return { ok: false, error: '세그먼트 번호는 0~9 여야 합니다' }
  }

  if (!isCoreLifecycle(input.lifecycle)) {
    return { ok: false, error: '코어 lifecycle 이 올바르지 않습니다' }
  }

  const { supabase } = await requireMember()

  // 회선 결정 — 기존 선택 또는 새 회선 즉시 생성 (같은 번호 있으면 재사용)
  let circuitId: string | null = input.circuit_id || null
  if (input.new_circuit) {
    const newNo = input.new_circuit.circuit_id.trim()
    if (!newNo) return { ok: false, error: '새 회선번호를 입력하세요' }
    if (newNo.length > 100) return { ok: false, error: '회선번호는 100자 이하여야 합니다' }
    const kind = isCircuitKind(input.new_circuit.kind) ? input.new_circuit.kind : '1코어'

    const { data: existing } = await supabase
      .from('relocation_circuits')
      .select('id')
      .eq('project_id', input.project_id)
      .eq('circuit_id', newNo)
      .maybeSingle()

    if (existing) {
      circuitId = (existing as { id: string }).id
    } else {
      const { data: created, error: cErr } = await supabase
        .from('relocation_circuits')
        .insert({
          project_id: input.project_id,
          circuit_id: newNo,
          subscriber_name:
            input.new_circuit.subscriber_name?.trim().slice(0, 200) || null,
          kind,
          status: 'OK',
        })
        .select('id')
        .single()
      if (cErr || !created) {
        return { ok: false, error: '회선 생성 실패: ' + (cErr?.message ?? '알 수 없는 오류') }
      }
      circuitId = (created as { id: string }).id
    }
  }

  const { error } = await supabase.from('relocation_core_assignments').insert({
    project_id: input.project_id,
    circuit_id: circuitId,
    segment_idx,
    cable_id: input.cable_id,
    core_range_start: core,
    core_range_end: core,
    lifecycle: input.lifecycle,
    status: null,
    is_terminal: input.is_terminal,
    is_auto_assigned: false, // 사람 입력
    notes: null,
  })

  if (error) {
    const friendly =
      error.message.includes('exclude') || error.code === '23P01'
        ? overlapErrorMessage(core)
        : '코어 배정 실패: ' + error.message
    return { ok: false, error: friendly }
  }

  revalidatePath(`/relocation/${input.project_id}`)
  return { ok: true }
}


/**
 * 캔버스 케이블 정보 패널에서 코어 배정 삭제 — JSON 결과 반환 (redirect 안 함).
 */
export async function removeCoreAssignmentFromCanvas(
  projectId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!projectId || !id) return { ok: false, error: '코어 배정 정보가 없습니다' }

  const { supabase } = await requireMember()

  const { error } = await supabase
    .from('relocation_core_assignments')
    .delete()
    .eq('id', id)
    .eq('project_id', projectId) // RLS 보강

  if (error) return { ok: false, error: '삭제 실패: ' + error.message }

  revalidatePath(`/relocation/${projectId}`)
  return { ok: true }
}
