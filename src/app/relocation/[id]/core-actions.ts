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


/**
 * 회선번호 콤마 일괄 입력 — 같은 케이블에 여러 회선을 한 번에 배정.
 *   - 회선번호별로 1코어씩, 빈 코어 중 가장 작은 번호부터 오름차순 자동 배정
 *   - 같은 project 안 회선번호가 이미 있으면 재사용, 없으면 즉시 생성
 *   - lifecycle·종단·세그먼트·종류·설치장소는 일괄 동일 적용
 *   - 중간 실패 시 best-effort (부분 성공 허용) — 결과 요약 반환
 */
export async function bulkAddCoresFromCanvas(input: {
  project_id: string
  cable_id: string
  cable_core_count: number // 케이블 규격이 허용하는 총 코어 수
  circuit_numbers: string[] // 콤마로 들어온 회선번호 리스트
  kind: string // 신규 회선용 종류 (기존 회선이면 무시)
  subscriber_name: string | null // 신규 회선용 설치장소 (기존 회선이면 무시)
  lifecycle: string
  is_terminal: boolean
  segment_idx: number
}): Promise<
  | {
      ok: true
      created: number
      skipped: { circuit: string; reason: string }[]
    }
  | { ok: false; error: string }
> {
  if (!input.project_id || !input.cable_id) {
    return { ok: false, error: '케이블 정보가 없습니다' }
  }
  const totalCores = Math.trunc(input.cable_core_count)
  if (!Number.isFinite(totalCores) || totalCores < 1) {
    return { ok: false, error: '케이블 규격에서 코어 수를 알 수 없습니다' }
  }
  const segment_idx = Math.trunc(input.segment_idx)
  if (!Number.isFinite(segment_idx) || segment_idx < 0 || segment_idx > 9) {
    return { ok: false, error: '세그먼트 번호는 0~9 여야 합니다' }
  }
  if (!isCoreLifecycle(input.lifecycle)) {
    return { ok: false, error: '코어 lifecycle 이 올바르지 않습니다' }
  }
  const kind = isCircuitKind(input.kind) ? input.kind : '1코어'

  // 회선번호 정규화 — trim, 빈 값/중복 제거, 길이·문자 검증
  const raw = Array.from(
    new Set(input.circuit_numbers.map((s) => s.trim()).filter((s) => s.length > 0)),
  )
  if (raw.length === 0) {
    return { ok: false, error: '회선번호를 한 개 이상 입력하세요' }
  }
  const tooLong = raw.find((s) => s.length > 100)
  if (tooLong) {
    return { ok: false, error: `회선번호가 너무 깁니다 (100자 이하): "${tooLong.slice(0, 30)}…"` }
  }

  const { supabase } = await requireMember()

  // 현재 이 케이블의 사용 중인 코어 번호 모음 — start=end 모델이라 start 만 본다.
  const { data: existingCores, error: cErr } = await supabase
    .from('relocation_core_assignments')
    .select('core_range_start')
    .eq('cable_id', input.cable_id)
  if (cErr) return { ok: false, error: '기존 코어 조회 실패: ' + cErr.message }
  const used = new Set<number>(
    (existingCores ?? []).map((r) => (r as { core_range_start: number }).core_range_start),
  )

  // 빈 코어 목록을 작은 번호부터
  const free: number[] = []
  for (let i = 1; i <= totalCores; i++) {
    if (!used.has(i)) free.push(i)
  }
  if (free.length < raw.length) {
    return {
      ok: false,
      error: `빈 코어가 부족합니다. 입력 회선 ${raw.length}개 vs 빈 코어 ${free.length}개`,
    }
  }

  // 회선 일괄 조회·생성 — project_id + circuit_id(string) UNIQUE 가정 (있으면 재사용)
  const { data: existingCircuits, error: ecErr } = await supabase
    .from('relocation_circuits')
    .select('id, circuit_id')
    .eq('project_id', input.project_id)
    .in('circuit_id', raw)
  if (ecErr) return { ok: false, error: '회선 조회 실패: ' + ecErr.message }

  const idByCircuit = new Map<string, string>()
  for (const r of (existingCircuits ?? []) as { id: string; circuit_id: string }[]) {
    idByCircuit.set(r.circuit_id, r.id)
  }

  // 누락된 회선 생성 (한 건씩 — 동시성/return id 위해)
  for (const n of raw) {
    if (idByCircuit.has(n)) continue
    const { data: created, error: insErr } = await supabase
      .from('relocation_circuits')
      .insert({
        project_id: input.project_id,
        circuit_id: n,
        subscriber_name: input.subscriber_name?.trim().slice(0, 200) || null,
        kind,
        status: 'OK',
      })
      .select('id')
      .single()
    if (insErr || !created) {
      return { ok: false, error: `회선 ${n} 생성 실패: ${insErr?.message ?? '알 수 없는 오류'}` }
    }
    idByCircuit.set(n, (created as { id: string }).id)
  }

  // 코어 배정 일괄 insert — 회선번호 입력 순서대로, 빈 코어 오름차순.
  const skipped: { circuit: string; reason: string }[] = []
  let created = 0
  for (let i = 0; i < raw.length; i++) {
    const circuitNo = raw[i]
    const coreNo = free[i]
    const circuitId = idByCircuit.get(circuitNo)!
    const { error: aErr } = await supabase.from('relocation_core_assignments').insert({
      project_id: input.project_id,
      circuit_id: circuitId,
      segment_idx,
      cable_id: input.cable_id,
      core_range_start: coreNo,
      core_range_end: coreNo,
      lifecycle: input.lifecycle,
      status: null,
      is_terminal: input.is_terminal,
      is_auto_assigned: false,
      notes: null,
    })
    if (aErr) {
      skipped.push({
        circuit: circuitNo,
        reason:
          aErr.message.includes('exclude') || aErr.code === '23P01'
            ? `코어 ${coreNo} 가 이미 사용 중 (동시 변경?)`
            : aErr.message,
      })
      continue
    }
    created++
  }

  revalidatePath(`/relocation/${input.project_id}`)
  return { ok: true, created, skipped }
}


/**
 * 코어 끼워넣기(shift insert) — A 를 새 코어 N 으로 옮기면서,
 * N 부터 연속 사용 중인 row 들을 한 칸씩 뒤로 밀어 첫 빈 코어까지 shift.
 * 마이그 0058 의 PL/pgSQL 함수가 임시값 경유 ordered update 로 처리.
 */
export async function shiftInsertCoreFromCanvas(input: {
  project_id: string
  assignment_id: string
  new_core_no: number
  cable_core_count: number
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.project_id || !input.assignment_id) {
    return { ok: false, error: '코어 배정 정보가 없습니다' }
  }
  const core = Math.trunc(input.new_core_no)
  if (!Number.isFinite(core) || core < 1) {
    return { ok: false, error: '코어 번호는 1 이상의 정수여야 합니다' }
  }
  const total = Math.trunc(input.cable_core_count)
  if (!Number.isFinite(total) || total < 1) {
    return { ok: false, error: '케이블 코어 한도가 올바르지 않습니다' }
  }
  if (core > total) {
    return { ok: false, error: `코어 번호는 1 ~ ${total} 범위여야 합니다` }
  }

  const { supabase } = await requireMember()

  const { error } = await supabase.rpc('shift_insert_core_assignment', {
    _a_id: input.assignment_id,
    _new_core: core,
    _cable_core_count: total,
  })

  if (error) {
    return { ok: false, error: '끼워넣기 실패: ' + error.message }
  }

  revalidatePath(`/relocation/${input.project_id}`)
  return { ok: true }
}


/**
 * 두 코어 배정의 코어 번호를 서로 교체 — 선번장에서 사용 중인 코어와 swap.
 * exclusion constraint(immediate) 우회를 위해 PL/pgSQL RPC 안에서
 * 임시값 경유 3단계 update (마이그 0057). 같은 케이블 안에서만 동작.
 */
export async function swapCoreAssignmentsFromCanvas(input: {
  project_id: string
  a_id: string
  b_id: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.project_id || !input.a_id || !input.b_id) {
    return { ok: false, error: '코어 배정 정보가 없습니다' }
  }
  if (input.a_id === input.b_id) {
    return { ok: false, error: '같은 행은 교체할 수 없습니다' }
  }

  const { supabase } = await requireMember()

  const { error } = await supabase.rpc('swap_core_assignments', {
    _a_id: input.a_id,
    _b_id: input.b_id,
  })

  if (error) {
    return { ok: false, error: '코어 교체 실패: ' + error.message }
  }

  revalidatePath(`/relocation/${input.project_id}`)
  return { ok: true }
}


/**
 * 코어 배정의 lifecycle 만 변경 — 선번장에서 신설/기설/이설 즉시 변경.
 * cable·circuit·코어 번호·종단은 그대로.
 */
export async function updateCoreLifecycleFromCanvas(input: {
  project_id: string
  assignment_id: string
  lifecycle: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.project_id || !input.assignment_id) {
    return { ok: false, error: '코어 배정 정보가 없습니다' }
  }
  if (!isCoreLifecycle(input.lifecycle)) {
    return { ok: false, error: '코어 lifecycle 값이 올바르지 않습니다' }
  }

  const { supabase } = await requireMember()

  const { error } = await supabase
    .from('relocation_core_assignments')
    .update({
      lifecycle: input.lifecycle,
      is_auto_assigned: false, // 사람이 손댄 row 표시
    })
    .eq('id', input.assignment_id)
    .eq('project_id', input.project_id) // RLS 보강

  if (error) return { ok: false, error: '구분 변경 실패: ' + error.message }

  revalidatePath(`/relocation/${input.project_id}`)
  return { ok: true }
}


/**
 * 코어 배정의 코어 번호만 변경 — 선번장에서 빈 코어로 옮길 때.
 * cable·circuit·lifecycle·종단은 그대로. 같은 케이블 안에서만 이동.
 */
export async function moveCoreAssignmentFromCanvas(input: {
  project_id: string
  assignment_id: string
  new_core_no: number
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.project_id || !input.assignment_id) {
    return { ok: false, error: '코어 배정 정보가 없습니다' }
  }
  const core = Math.trunc(input.new_core_no)
  if (!Number.isFinite(core) || core < 1) {
    return { ok: false, error: '코어 번호는 1 이상의 정수여야 합니다' }
  }

  const { supabase } = await requireMember()

  const { error } = await supabase
    .from('relocation_core_assignments')
    .update({
      core_range_start: core,
      core_range_end: core,
      is_auto_assigned: false, // 사람이 옮긴 코어는 사람 입력으로 표시
    })
    .eq('id', input.assignment_id)
    .eq('project_id', input.project_id) // RLS 보강

  if (error) {
    const friendly =
      error.message.includes('exclude') || error.code === '23P01'
        ? overlapErrorMessage(core)
        : '코어 변경 실패: ' + error.message
    return { ok: false, error: friendly }
  }

  revalidatePath(`/relocation/${input.project_id}`)
  return { ok: true }
}
