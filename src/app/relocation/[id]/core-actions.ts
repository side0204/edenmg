'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  CORE_LIFECYCLE_VALUES,
  CIRCUIT_STATUS_VALUES,
  type CoreLifecycle,
  type CircuitStatus,
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

type CoreFormParsed = {
  circuit_id: string | null
  segment_idx: number
  cable_id: string
  core_range_start: number
  core_range_end: number
  lifecycle: CoreLifecycle
  status: CircuitStatus | null
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

  const startRaw = String(formData.get('core_range_start') ?? '').trim()
  const start = Number.parseInt(startRaw, 10)
  if (!Number.isFinite(start) || start < 1) {
    return '시작 코어는 1 이상의 정수여야 합니다.'
  }

  const endRaw = String(formData.get('core_range_end') ?? '').trim()
  const end = Number.parseInt(endRaw, 10)
  if (!Number.isFinite(end) || end < 1) {
    return '끝 코어는 1 이상의 정수여야 합니다.'
  }
  if (end < start) return '끝 코어는 시작 코어보다 크거나 같아야 합니다.'

  const lifecycleRaw = String(formData.get('lifecycle') ?? '').trim() || 'new'
  if (!isCoreLifecycle(lifecycleRaw)) return '코어 lifecycle 이 올바르지 않습니다.'

  const statusRaw = String(formData.get('status') ?? '').trim()
  const status = statusRaw && isCircuitStatus(statusRaw) ? statusRaw : null

  const notes = String(formData.get('notes') ?? '').trim() || null

  return {
    circuit_id,
    segment_idx,
    cable_id,
    core_range_start: start,
    core_range_end: end,
    lifecycle: lifecycleRaw,
    status,
    notes,
  }
}

function overlapErrorMessage(start: number, end: number): string {
  return `코어 범위 ${start}~${end} 가 같은 케이블의 다른 배정과 겹칩니다. 다른 코어 번호를 선택해주세요.`
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
    is_auto_assigned: false, // 사람 입력
    notes: parsed.notes,
  })

  if (error) {
    const friendly =
      error.message.includes('exclude') || error.code === '23P01'
        ? overlapErrorMessage(parsed.core_range_start, parsed.core_range_end)
        : '등록 실패: ' + error.message
    redirect(`/relocation/${projectId}?tab=cores&err=` + encodeURIComponent(friendly))
  }

  revalidatePath(`/relocation/${projectId}`)
  redirect(
    `/relocation/${projectId}?tab=cores&ok=` +
      encodeURIComponent(
        `코어 ${parsed.core_range_start}~${parsed.core_range_end} 배정 완료`,
      ),
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
      is_auto_assigned: false,
      notes: parsed.notes,
    })
    .eq('id', id)

  if (error) {
    const friendly =
      error.message.includes('exclude') || error.code === '23P01'
        ? overlapErrorMessage(parsed.core_range_start, parsed.core_range_end)
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
