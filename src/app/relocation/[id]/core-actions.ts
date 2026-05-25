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
 * 청약 카테고리 전용 — 케이블에 사용코어 입력.
 *
 * 동작:
 *   1) 프로젝트의 subscription_id / subscriber_name 으로 회선을 찾거나 생성.
 *      (한 청약 프로젝트 = 한 가입자 = 한 회선. 같은 회선에 여러 코어 배정.)
 *   2) 입력한 코어 번호 각각에 대해 core_assignments 1 행씩 insert.
 *   3) 이미 사용 중인 코어는 skip + 사유 보고.
 *
 * 청약 사양 (owner 2026-05-25):
 *   - 코어명 = 가입자명 (subscriber_name)
 *   - 회선 ID = 청약 ID (subscription_id)
 *   - 도식 모드 전용 — 지도 모드는 기존 흐름 유지
 */
export async function addSubscriptionCoresFromCanvas(input: {
  project_id: string
  cable_id: string
  core_numbers: number[]
}): Promise<
  | {
      ok: true
      created: number
      skipped: { core: number; reason: string }[]
      circuit_id: string
    }
  | { ok: false; error: string }
> {
  if (!input.project_id || !input.cable_id) {
    return { ok: false, error: '케이블 정보가 없습니다' }
  }
  if (!Array.isArray(input.core_numbers) || input.core_numbers.length === 0) {
    return { ok: false, error: '사용 코어를 1 개 이상 입력하세요' }
  }
  // 정수 + 1 이상 + 중복 제거 + 오름차순 정렬
  const cores = Array.from(
    new Set(
      input.core_numbers
        .map((n) => Math.trunc(n))
        .filter((n) => Number.isFinite(n) && n >= 1),
    ),
  ).sort((a, b) => a - b)
  if (cores.length === 0) {
    return { ok: false, error: '사용 코어가 모두 잘못된 값입니다' }
  }

  const { supabase } = await requireMember()

  // 프로젝트 — 청약 분류 + 가입자명 + 청약ID
  const { data: pRow } = await supabase
    .from('relocation_projects')
    .select('id, category, subscription_id, subscriber_name')
    .eq('id', input.project_id)
    .maybeSingle()
  const project = pRow as
    | {
        id: string
        category: string | null
        subscription_id: string | null
        subscriber_name: string | null
      }
    | null
  if (!project) return { ok: false, error: '프로젝트를 찾을 수 없습니다' }
  if (project.category !== '청약') {
    return { ok: false, error: '청약 카테고리 프로젝트만 사용할 수 있습니다' }
  }
  const subscriptionId = (project.subscription_id ?? '').trim()
  if (!subscriptionId) {
    return {
      ok: false,
      error: '프로젝트의 청약ID 가 입력되어 있어야 합니다 (편집 폼 확인)',
    }
  }
  const subscriberName = project.subscriber_name?.trim().slice(0, 200) || null

  // 케이블 — 같은 프로젝트인지 + 코어 수 검증
  const { data: cRow } = await supabase
    .from('relocation_cables')
    .select('id, project_id, spec')
    .eq('id', input.cable_id)
    .maybeSingle()
  const cable = cRow as { id: string; project_id: string; spec: string } | null
  if (!cable || cable.project_id !== input.project_id) {
    return { ok: false, error: '케이블을 찾을 수 없습니다' }
  }
  // 케이블 규격으로 코어 수 산출 — '12C' → 12 / '1C드랍' → 1
  const specMatch = /^(\d+)C/.exec(cable.spec)
  const cableCoreCount = specMatch ? Math.max(1, Number(specMatch[1])) : 1
  const outOfRange = cores.filter((c) => c > cableCoreCount)
  if (outOfRange.length > 0) {
    return {
      ok: false,
      error: `케이블 규격 ${cable.spec} 의 코어 수(${cableCoreCount})를 넘는 번호: ${outOfRange.join(', ')}`,
    }
  }

  // 회선 — 청약ID 로 찾거나 생성
  let circuitId: string
  {
    const { data: existing } = await supabase
      .from('relocation_circuits')
      .select('id, subscriber_name')
      .eq('project_id', input.project_id)
      .eq('circuit_id', subscriptionId)
      .maybeSingle()
    if (existing) {
      const exRow = existing as { id: string; subscriber_name: string | null }
      circuitId = exRow.id
      // 가입자명이 비어 있으면 보완 (프로젝트 수정 후 동기화 효과)
      if (!exRow.subscriber_name && subscriberName) {
        await supabase
          .from('relocation_circuits')
          .update({ subscriber_name: subscriberName })
          .eq('id', circuitId)
      }
    } else {
      const { data: created, error: cErr } = await supabase
        .from('relocation_circuits')
        .insert({
          project_id: input.project_id,
          circuit_id: subscriptionId,
          subscriber_name: subscriberName,
          kind: '1코어',
          status: 'OK',
        })
        .select('id')
        .single()
      if (cErr || !created) {
        return {
          ok: false,
          error: '회선 생성 실패: ' + (cErr?.message ?? '알 수 없는 오류'),
        }
      }
      circuitId = (created as { id: string }).id
    }
  }

  // 코어별 insert — 충돌(중복)은 skip
  const skipped: { core: number; reason: string }[] = []
  let created = 0
  for (const core of cores) {
    const { error } = await supabase.from('relocation_core_assignments').insert({
      project_id: input.project_id,
      circuit_id: circuitId,
      segment_idx: 0,
      cable_id: input.cable_id,
      core_range_start: core,
      core_range_end: core,
      lifecycle: 'new',
      status: null,
      is_terminal: true, // 청약 = 가입자 종단
      is_auto_assigned: false,
      notes: null,
    })
    if (error) {
      const reason =
        error.message.includes('exclude') || error.code === '23P01'
          ? '이미 사용 중'
          : error.message
      skipped.push({ core, reason })
    } else {
      created += 1
    }
  }

  revalidatePath(`/relocation/${input.project_id}`)
  return { ok: true, created, skipped, circuit_id: circuitId }
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
 * 코어·회선·설치장소 콤마 일괄 입력 — 같은 케이블에 여러 회선을 한 번에 배정.
 *   - 선번(코어)·회선번호를 콤마로 받아 같은 index 끼리 매칭. 길이 같아야 함.
 *   - 설치장소명은 콤마로 받되 생략 가능. 길이 0 이면 전부 null,
 *     길이 1 이면 전체 공통 적용(편의), 그 외엔 회선 길이와 같아야 함.
 *   - 같은 project 안 회선번호가 이미 있으면 재사용, 없으면 즉시 생성.
 *     기존 회선 재사용 시 설치장소·종류 입력은 무시 (기존 데이터 보존).
 *   - lifecycle·종단·세그먼트는 일괄 동일 적용.
 *   - 빈 코어 자동 채움 X — 사용자가 지정한 코어 번호 그대로 사용.
 */
export async function bulkAddCoresFromCanvas(input: {
  project_id: string
  cable_id: string
  cable_core_count: number
  core_numbers: number[]
  circuit_numbers: string[]
  subscriber_names: string[] // 길이 0(생략) · 1(공통) · circuit_numbers.length (개별)
  kind: string
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

  // 회선번호 정규화 — index 보존(코어와 짝). 빈 값은 입력 오류.
  const circuits = input.circuit_numbers.map((s) => s.trim())
  if (circuits.length === 0) {
    return { ok: false, error: '회선번호를 한 개 이상 입력하세요' }
  }
  const emptyCircuitIdx = circuits.findIndex((s) => s.length === 0)
  if (emptyCircuitIdx >= 0) {
    return { ok: false, error: `회선번호 ${emptyCircuitIdx + 1}번째가 비어 있습니다` }
  }
  const tooLong = circuits.find((s) => s.length > 100)
  if (tooLong) {
    return { ok: false, error: `회선번호가 너무 깁니다 (100자 이하): "${tooLong.slice(0, 30)}…"` }
  }
  // 회선번호 중복도 위치 정보 보존하며 검사
  const dupCircuit = circuits.find((c, i) => circuits.indexOf(c) !== i)
  if (dupCircuit) {
    return { ok: false, error: `회선번호가 중복됐습니다: ${dupCircuit}` }
  }

  // 선번(코어) — 길이 일치 + 정수 + 범위 + 중복·기존 사용 검사
  const cores = input.core_numbers.map((n) => Math.trunc(n))
  if (cores.length !== circuits.length) {
    return {
      ok: false,
      error: `선번 개수(${cores.length})와 회선번호 개수(${circuits.length})가 다릅니다`,
    }
  }
  for (let i = 0; i < cores.length; i++) {
    const c = cores[i]
    if (!Number.isFinite(c) || c < 1) {
      return { ok: false, error: `선번 ${i + 1}번째가 1 이상의 정수가 아닙니다` }
    }
    if (c > totalCores) {
      return { ok: false, error: `선번 ${c}이(가) 케이블 코어 한도(${totalCores})를 초과합니다` }
    }
  }
  const dupCore = cores.find((c, i) => cores.indexOf(c) !== i)
  if (dupCore !== undefined) {
    return { ok: false, error: `입력한 선번 안에서 코어 ${dupCore}이(가) 중복됐습니다` }
  }

  // 설치장소 — 0(전부 null) · 1(공통) · circuits.length(개별) 만 허용
  const rawLocs = input.subscriber_names.map((s) => s.trim())
  let locations: (string | null)[]
  if (rawLocs.length === 0) {
    locations = circuits.map(() => null)
  } else if (rawLocs.length === 1) {
    const v = rawLocs[0] || null
    locations = circuits.map(() => (v ? v.slice(0, 200) : null))
  } else if (rawLocs.length === circuits.length) {
    locations = rawLocs.map((s) => (s ? s.slice(0, 200) : null))
  } else {
    return {
      ok: false,
      error: `설치장소 개수(${rawLocs.length})는 0(생략) · 1(공통) · ${circuits.length}(개별) 중 하나여야 합니다`,
    }
  }

  const { supabase } = await requireMember()

  // 현재 이 케이블의 사용 중인 코어 번호 — 입력 코어와 충돌 검증
  const { data: existingCores, error: cErr } = await supabase
    .from('relocation_core_assignments')
    .select('core_range_start')
    .eq('cable_id', input.cable_id)
  if (cErr) return { ok: false, error: '기존 코어 조회 실패: ' + cErr.message }
  const used = new Set<number>(
    (existingCores ?? []).map((r) => (r as { core_range_start: number }).core_range_start),
  )
  const conflict = cores.find((c) => used.has(c))
  if (conflict !== undefined) {
    return { ok: false, error: `코어 ${conflict}은(는) 이미 다른 회선에 배정되어 있습니다` }
  }

  // 회선 일괄 조회·생성 — project_id + circuit_id(string) UNIQUE 가정
  const uniqueCircuits = Array.from(new Set(circuits))
  const { data: existingCircuits, error: ecErr } = await supabase
    .from('relocation_circuits')
    .select('id, circuit_id')
    .eq('project_id', input.project_id)
    .in('circuit_id', uniqueCircuits)
  if (ecErr) return { ok: false, error: '회선 조회 실패: ' + ecErr.message }

  const idByCircuit = new Map<string, string>()
  for (const r of (existingCircuits ?? []) as { id: string; circuit_id: string }[]) {
    idByCircuit.set(r.circuit_id, r.id)
  }

  // 누락된 회선 생성 — 회선별로 그 회선의 설치장소(첫 등장 index) 사용
  const firstLocByCircuit = new Map<string, string | null>()
  for (let i = 0; i < circuits.length; i++) {
    if (!firstLocByCircuit.has(circuits[i])) firstLocByCircuit.set(circuits[i], locations[i])
  }
  for (const n of uniqueCircuits) {
    if (idByCircuit.has(n)) continue
    const { data: created, error: insErr } = await supabase
      .from('relocation_circuits')
      .insert({
        project_id: input.project_id,
        circuit_id: n,
        subscriber_name: firstLocByCircuit.get(n) ?? null,
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

  // 코어 배정 일괄 insert — 사용자가 지정한 코어 번호로 그대로.
  const skipped: { circuit: string; reason: string }[] = []
  let created = 0
  for (let i = 0; i < circuits.length; i++) {
    const circuitNo = circuits[i]
    const coreNo = cores[i]
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
 * 코어 배정의 종단(is_terminal) 만 변경 — 선번장에서 회선의 끝 표시 즉시 토글.
 * cable·circuit·코어 번호·lifecycle 은 그대로.
 */
export async function updateCoreTerminalFromCanvas(input: {
  project_id: string
  assignment_id: string
  is_terminal: boolean
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.project_id || !input.assignment_id) {
    return { ok: false, error: '코어 배정 정보가 없습니다' }
  }

  const { supabase } = await requireMember()

  const { error } = await supabase
    .from('relocation_core_assignments')
    .update({
      is_terminal: input.is_terminal,
      is_auto_assigned: false, // 사람이 손댄 row 표시
    })
    .eq('id', input.assignment_id)
    .eq('project_id', input.project_id) // RLS 보강

  if (error) return { ok: false, error: '종단 변경 실패: ' + error.message }

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
