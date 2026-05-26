'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  CLOSURE_TYPE_VALUES,
  CLOSURE_TYPE_CATEGORY,
  FACILITY_INSTALL_STATUS_VALUES,
  isInternalNode,
  isInstallNumbered,
  computeInstallNumbers,
  type ClosureType,
  type FacilityInstallStatus,
} from '@/lib/relocation'
import type { CableSpec } from '@/lib/connection'
import { CABLE_SPEC_VALUES } from '@/lib/connection'

// 시설(facility) CRUD — 회사 스코프 + 권한 제한 없음.
// 번호 자동 부여: project × closure_type 카운터(relocation_facility_seq)에서 last_seq+1.
//   동시성: 두 요청이 같은 last_seq 를 가져갈 가능성 있지만 DB 의
//   unique(project_id, closure_type, seq_no) 가 막아준다. 충돌 시 1회 재시도.

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

function isClosureType(v: string): v is ClosureType {
  return (CLOSURE_TYPE_VALUES as readonly string[]).includes(v)
}

function isCableSpec(v: string): v is CableSpec {
  return (CABLE_SPEC_VALUES as readonly string[]).includes(v)
}

function isInstallStatus(v: string): v is FacilityInstallStatus {
  return (FACILITY_INSTALL_STATUS_VALUES as readonly string[]).includes(v)
}

type FacilityFormParsed = {
  closure_type: ClosureType
  name: string
  facility_code: string | null
  install_address: string | null
  closure_spec: CableSpec | null
  parent_facility_id: string | null
  notes: string | null
  is_marked: boolean
  mark_note: string | null
  work_window_start: string | null
  work_window_end: string | null
  install_status: FacilityInstallStatus
}

function parseFacilityForm(formData: FormData): FacilityFormParsed | string {
  const closureTypeRaw = String(formData.get('closure_type') ?? '').trim()
  if (!isClosureType(closureTypeRaw)) return '시설 종류를 선택하세요.'
  const closure_type = closureTypeRaw

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return '시설 이름을 입력하세요.'
  if (name.length > 200) return '이름은 200자 이하로 입력하세요.'

  const facility_code =
    String(formData.get('facility_code') ?? '').trim().slice(0, 100) || null

  const install_address = String(formData.get('install_address') ?? '').trim() || null

  const specRaw = String(formData.get('closure_spec') ?? '').trim()
  const closure_spec = specRaw && isCableSpec(specRaw) ? specRaw : null

  const parentRaw = String(formData.get('parent_facility_id') ?? '').trim()
  const parent_facility_id = parentRaw.length > 0 ? parentRaw : null

  // 부모는 국사 내부 노드만 가질 수 있음
  if (parent_facility_id && !isInternalNode(closure_type)) {
    return '부모 시설은 MOFD·OJC·국사내장비만 가질 수 있습니다.'
  }

  const notes = String(formData.get('notes') ?? '').trim() || null
  const is_marked = formData.get('is_marked') === 'on'

  // 노란색 마크 내용 — 체크 해제 시 내용도 비움
  const markNoteRaw = String(formData.get('mark_note') ?? '').trim()
  const mark_note = is_marked && markNoteRaw ? markNoteRaw.slice(0, 500) : null

  // 설치 구분 — 기설/신설. 미입력(접속함체 아닌 종류)이면 'new' 기본.
  const installRaw = String(formData.get('install_status') ?? '').trim()
  const install_status: FacilityInstallStatus = isInstallStatus(installRaw)
    ? installRaw
    : 'new'

  // 작업 가능 시간대 — 특정 시간대만 작업 가능한 시설. 시작·종료 둘 다 또는 둘 다 비움.
  const wwsRaw = String(formData.get('work_window_start') ?? '').trim()
  const wweRaw = String(formData.get('work_window_end') ?? '').trim()
  let work_window_start: string | null = null
  let work_window_end: string | null = null
  if (wwsRaw || wweRaw) {
    const timeRe = /^\d{2}:\d{2}$/
    if (!timeRe.test(wwsRaw) || !timeRe.test(wweRaw)) {
      return '작업 가능 시간대는 시작·종료 모두 HH:MM 형식으로 입력하세요.'
    }
    work_window_start = wwsRaw
    work_window_end = wweRaw
  }

  return {
    closure_type,
    name,
    facility_code,
    install_address,
    closure_spec,
    parent_facility_id,
    notes,
    is_marked,
    mark_note,
    work_window_start,
    work_window_end,
    install_status,
  }
}

/**
 * 카운터(relocation_facility_seq) 에서 다음 시설 번호를 할당.
 * 동시성: race 시 DB unique 제약이 막아준다. server action 에서 catch+retry.
 */
async function allocateNextFacilitySeq(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  closureType: ClosureType,
): Promise<number> {
  // 현재 last_seq 읽기
  const { data: row } = await supabase
    .from('relocation_facility_seq')
    .select('last_seq')
    .eq('project_id', projectId)
    .eq('closure_type', closureType)
    .maybeSingle()

  const currentSeq = (row as { last_seq: number } | null)?.last_seq ?? 0
  const nextSeq = currentSeq + 1

  // UPSERT 로 카운터 갱신 — 새 row 면 insert, 있으면 update
  const { error } = await supabase
    .from('relocation_facility_seq')
    .upsert({
      project_id: projectId,
      closure_type: closureType,
      last_seq: nextSeq,
    })
  if (error) throw new Error('번호 카운터 갱신 실패: ' + error.message)

  return nextSeq
}

/**
 * 「빈 자리 메우기」 번호 할당 — 같은 project_id × closure_type 에서 살아있는
 *  seq_no 중 가장 작은 양의 정수 결손값을 반환.
 *    예: 살아있는 seq_no = [1, 2, 4, 5] → 3 반환
 *        살아있는 seq_no = [1, 2, 3]    → 4 반환
 *        살아있는 seq_no = []           → 1 반환
 *  실사정보 시설은 도면에 일시적으로 배치/삭제하는 경우가 잦아 owner 요청 (2026-05-25).
 *  다른 시설 종류는 기존 monotonic counter 유지 (도서·기별명세서 등에서 번호 보존 필요).
 *  안전망: 카운터 last_seq 도 max(현재, 새 번호) 로 갱신 (monotonic 시설과 혼선 방지).
 */
async function allocateLowestAvailableSeq(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  closureType: ClosureType,
): Promise<number> {
  const { data: rows } = await supabase
    .from('relocation_facilities')
    .select('seq_no')
    .eq('project_id', projectId)
    .eq('closure_type', closureType)
    .order('seq_no')

  const used = new Set(
    ((rows ?? []) as { seq_no: number }[])
      .map((r) => r.seq_no)
      .filter((n) => typeof n === 'number' && n > 0),
  )

  // 첫 결손값 — 1부터 순차로 검사
  let nextSeq = 1
  while (used.has(nextSeq)) nextSeq += 1

  // 카운터 row last_seq 갱신 (max 보존)
  const { data: counterRow } = await supabase
    .from('relocation_facility_seq')
    .select('last_seq')
    .eq('project_id', projectId)
    .eq('closure_type', closureType)
    .maybeSingle()
  const currentSeq = (counterRow as { last_seq: number } | null)?.last_seq ?? 0
  const newLastSeq = Math.max(currentSeq, nextSeq)
  await supabase.from('relocation_facility_seq').upsert({
    project_id: projectId,
    closure_type: closureType,
    last_seq: newLastSeq,
  })

  return nextSeq
}


export async function createFacility(formData: FormData) {
  const projectId = String(formData.get('project_id') ?? '').trim()
  if (!projectId) redirect('/relocation?err=' + encodeURIComponent('프로젝트 id 가 없습니다'))

  const parsed = parseFacilityForm(formData)
  if (typeof parsed === 'string') {
    redirect(
      `/relocation/${projectId}?tab=facilities&err=` + encodeURIComponent(parsed),
    )
  }

  const { supabase, me } = await requireMember()

  // 동시성 안전망: race 시 unique 충돌 → 1회 재시도
  let attempt = 0
  let lastErr: string | null = null
  while (attempt < 3) {
    attempt += 1
    try {
      const seqNo = await allocateNextFacilitySeq(supabase, projectId, parsed.closure_type)

      const { error } = await supabase.from('relocation_facilities').insert({
        project_id: projectId,
        closure_type: parsed.closure_type,
        seq_no: seqNo,
        name: parsed.name,
        facility_code: parsed.facility_code,
        install_address: parsed.install_address,
        closure_spec: parsed.closure_spec,
        parent_facility_id: parsed.parent_facility_id,
        is_marked: parsed.is_marked,
        mark_note: parsed.mark_note,
        notes: parsed.notes,
        work_window_start: parsed.work_window_start,
        work_window_end: parsed.work_window_end,
        install_status: parsed.install_status,
        created_by: me.id,
      })

      if (!error) {
        revalidatePath(`/relocation/${projectId}`)
        redirect(
          `/relocation/${projectId}?tab=facilities&ok=` +
            encodeURIComponent(`${parsed.name} 시설을 등록했습니다`),
        )
      }

      lastErr = error.message
      // unique 충돌이면 재시도
      if (
        error.message.includes('unique') ||
        error.message.includes('duplicate') ||
        error.code === '23505'
      ) {
        continue
      }
      // 그 외 에러는 즉시 중단
      break
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      // redirect() 는 throw 로 동작 — 그대로 전파
      if (msg.includes('NEXT_REDIRECT')) throw e
      lastErr = msg
      break
    }
  }

  redirect(
    `/relocation/${projectId}?tab=facilities&err=` +
      encodeURIComponent('등록 실패: ' + (lastErr ?? '알 수 없는 오류')),
  )
}


export async function updateFacility(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  const projectId = String(formData.get('project_id') ?? '').trim()
  if (!id || !projectId) {
    redirect('/relocation?err=' + encodeURIComponent('id 가 없습니다'))
  }

  const parsed = parseFacilityForm(formData)
  if (typeof parsed === 'string') {
    redirect(
      `/relocation/${projectId}?tab=facilities&err=` + encodeURIComponent(parsed),
    )
  }

  const { supabase } = await requireMember()

  // 종류는 변경 불가 (번호 prefix 가 종류 기반이라). closure_type 무시.
  const { error } = await supabase
    .from('relocation_facilities')
    .update({
      name: parsed.name,
      facility_code: parsed.facility_code,
      install_address: parsed.install_address,
      closure_spec: parsed.closure_spec,
      parent_facility_id: parsed.parent_facility_id,
      is_marked: parsed.is_marked,
      mark_note: parsed.mark_note,
      notes: parsed.notes,
      work_window_start: parsed.work_window_start,
      work_window_end: parsed.work_window_end,
      install_status: parsed.install_status,
    })
    .eq('id', id)

  if (error) {
    redirect(
      `/relocation/${projectId}?tab=facilities&err=` +
        encodeURIComponent('수정 실패: ' + error.message),
    )
  }

  revalidatePath(`/relocation/${projectId}`)
  redirect(
    `/relocation/${projectId}?tab=facilities&ok=` +
      encodeURIComponent('시설 정보를 수정했습니다'),
  )
}


/**
 * 캔버스에서 시설 직접 배치 — 좌표 + 마스터 FK 포함.
 *
 * 일반 폼 액션과 달리 redirect 안 함 — 결과를 JSON 으로 돌려서
 * 클라이언트가 모달 안에서 처리 (router.refresh 또는 revalidatePath 후 닫기).
 *
 * @param input - closure_type, name, x, y, master_facility_id?, closure_spec?, install_address?
 * @returns { ok: true, id, seq_no } | { ok: false, error: string }
 */
export async function createFacilityAtPosition(input: {
  project_id: string
  closure_type: ClosureType
  name: string
  x: number
  y: number
  master_facility_id?: string | null
  closure_spec?: CableSpec | null
  install_address?: string | null
  parent_facility_id?: string | null
  install_status?: FacilityInstallStatus | null
  facility_code?: string | null
}): Promise<
  | { ok: true; id: string; seq_no: number }
  | { ok: false; error: string }
> {
  if (!input.project_id) return { ok: false, error: '프로젝트 id 가 없습니다' }
  if (!isClosureType(input.closure_type)) return { ok: false, error: '시설 종류가 올바르지 않습니다' }
  const name = (input.name ?? '').trim()
  if (!name) return { ok: false, error: '시설 이름을 입력하세요' }
  if (name.length > 200) return { ok: false, error: '이름은 200자 이하로 입력하세요' }

  if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) {
    return { ok: false, error: '좌표가 올바르지 않습니다' }
  }
  if (input.closure_spec && !isCableSpec(input.closure_spec)) {
    return { ok: false, error: '함체 규격이 올바르지 않습니다' }
  }
  if (input.parent_facility_id && !isInternalNode(input.closure_type)) {
    return { ok: false, error: '부모 시설은 MOFD·OJC·국사내장비만 가질 수 있습니다' }
  }

  const { supabase, me } = await requireMember()

  // 동시성 안전망: race 시 unique 충돌 → 1회 재시도
  let attempt = 0
  let lastErr: string | null = null
  while (attempt < 3) {
    attempt += 1
    try {
      const seqNo = await allocateNextFacilitySeq(supabase, input.project_id, input.closure_type)

      const { data: row, error } = await supabase
        .from('relocation_facilities')
        .insert({
          project_id: input.project_id,
          closure_type: input.closure_type,
          seq_no: seqNo,
          name,
          facility_code: input.facility_code?.trim().slice(0, 100) || null,
          install_address: input.install_address ?? null,
          closure_spec: input.closure_spec ?? null,
          parent_facility_id: input.parent_facility_id ?? null,
          master_facility_id: input.master_facility_id ?? null,
          x_hint: Math.round(input.x),
          y_hint: Math.round(input.y),
          is_marked: false,
          install_status:
            input.install_status && isInstallStatus(input.install_status)
              ? input.install_status
              : 'new',
          created_by: me.id,
        })
        .select('id')
        .maybeSingle()

      if (!error && row) {
        revalidatePath(`/relocation/${input.project_id}`)
        return { ok: true, id: (row as { id: string }).id, seq_no: seqNo }
      }

      lastErr = error?.message ?? '알 수 없음'
      if (
        error?.message.includes('unique') ||
        error?.message.includes('duplicate') ||
        error?.code === '23505'
      ) {
        continue
      }
      break
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      lastErr = msg
      break
    }
  }

  return { ok: false, error: '등록 실패: ' + (lastErr ?? '알 수 없는 오류') }
}


/**
 * 캔버스 정보 패널에서 시설 기본 정보 수정 — 시설 정보 패널이 유일 정식 편집기.
 * 이름·함체 규격·설치주소·비고 + 부모 국사·작업가능시간대·노란마크.
 * redirect 안 함 — JSON 결과 반환 (패널 안에서 router.refresh 처리).
 */
export async function updateFacilityFromCanvas(input: {
  project_id: string
  id: string
  closure_type: ClosureType
  name: string
  facility_code: string | null
  closure_spec: CableSpec | null
  install_address: string | null
  notes: string | null
  inspection_request: string | null
  parent_facility_id: string | null
  is_marked: boolean
  mark_note: string | null
  work_window_start: string | null
  work_window_end: string | null
  install_status: FacilityInstallStatus
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.project_id || !input.id) return { ok: false, error: '대상이 올바르지 않습니다' }
  const name = (input.name ?? '').trim()
  if (!name) return { ok: false, error: '시설 이름을 입력하세요' }
  if (name.length > 200) return { ok: false, error: '이름은 200자 이하로 입력하세요' }
  if (input.closure_spec && !isCableSpec(input.closure_spec)) {
    return { ok: false, error: '함체 규격이 올바르지 않습니다' }
  }
  const installAddress = (input.install_address ?? '').trim() || null
  if (installAddress && installAddress.length > 500) {
    return { ok: false, error: '설치 주소는 500자 이하로 입력하세요' }
  }
  const notes = (input.notes ?? '').trim() || null
  if (notes && notes.length > 1000) return { ok: false, error: '비고는 1000자 이하로 입력하세요' }
  const inspectionRequest = (input.inspection_request ?? '').trim() || null
  if (inspectionRequest && inspectionRequest.length > 1000)
    return { ok: false, error: '실사요청은 1000자 이하로 입력하세요' }

  // 부모 국사 — 국사 내부 노드(MOFD·OJC·국사내장비)만 가질 수 있음
  const parentId = (input.parent_facility_id ?? '').trim() || null
  if (parentId && !isInternalNode(input.closure_type)) {
    return { ok: false, error: '부모 시설은 MOFD·OJC·국사내장비만 가질 수 있습니다' }
  }

  // 작업 가능 시간대 — 시작·종료 둘 다 또는 둘 다 비움 (HH:MM)
  const wws = (input.work_window_start ?? '').trim()
  const wwe = (input.work_window_end ?? '').trim()
  let workWindowStart: string | null = null
  let workWindowEnd: string | null = null
  if (wws || wwe) {
    const timeRe = /^\d{2}:\d{2}$/
    if (!timeRe.test(wws) || !timeRe.test(wwe)) {
      return {
        ok: false,
        error: '작업 가능 시간대는 시작·종료 모두 HH:MM 형식으로 입력하세요',
      }
    }
    workWindowStart = wws
    workWindowEnd = wwe
  }

  const { supabase } = await requireMember()

  const installStatus: FacilityInstallStatus = isInstallStatus(input.install_status)
    ? input.install_status
    : 'new'

  // 노란색 마크 내용 — 체크 해제 시 내용도 비움
  const markNote =
    input.is_marked && input.mark_note
      ? input.mark_note.trim().slice(0, 500) || null
      : null

  const { error } = await supabase
    .from('relocation_facilities')
    .update({
      name,
      facility_code: input.facility_code?.trim().slice(0, 100) || null,
      closure_spec: input.closure_spec ?? null,
      install_address: installAddress,
      notes,
      inspection_request: inspectionRequest,
      parent_facility_id: parentId,
      is_marked: !!input.is_marked,
      mark_note: markNote,
      work_window_start: workWindowStart,
      work_window_end: workWindowEnd,
      install_status: installStatus,
    })
    .eq('id', input.id)

  if (error) return { ok: false, error: '수정 실패: ' + error.message }

  revalidatePath(`/relocation/${input.project_id}`)
  return { ok: true }
}


/**
 * 캔버스에서 시설명 라벨을 마우스로 끌어 옮긴 offset(px) 저장.
 * redirect 안 함 — JSON 결과 반환 (캔버스 컨텍스트 유지).
 *
 * mode (2026-05-25 owner): 도식·지도 모드별 별도 컬럼.
 *   - 'schematic' → label_dx / label_dy
 *   - 'map'       → label_dx_map / label_dy_map
 *   한 모드에서 옮긴 위치가 다른 모드를 흔들지 않게.
 */
export async function saveFacilityLabelOffset(
  projectId: string,
  facilityId: string,
  dx: number,
  dy: number,
  mode: 'schematic' | 'map' = 'schematic',
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!projectId || !facilityId) return { ok: false, error: '대상이 올바르지 않습니다' }

  const clamp = (v: number): number => {
    if (!Number.isFinite(v)) return 0
    return Math.max(-4000, Math.min(4000, Math.round(v)))
  }

  const { supabase } = await requireMember()

  const update =
    mode === 'map'
      ? { label_dx_map: clamp(dx), label_dy_map: clamp(dy) }
      : { label_dx: clamp(dx), label_dy: clamp(dy) }
  const { error } = await supabase
    .from('relocation_facilities')
    .update(update)
    .eq('id', facilityId)
    .eq('project_id', projectId) // RLS 보강

  if (error) return { ok: false, error: '라벨 위치 저장 실패: ' + error.message }

  revalidatePath(`/relocation/${projectId}`)
  return { ok: true }
}


/**
 * 시설명 앞 설치 순번 배지 번호를 설계자가 수동 지정 — 캔버스 시설 정보 패널에서.
 *
 * 맞교환(swap) 방식: 설계자가 입력한 번호를 대상 시설에 그대로 적용한다.
 *   - 실제 시설 수보다 큰 번호도 그대로 허용 (1..N 연속 보장 안 함 — 빈 번호 가능).
 *   - 같은 번호를 쓰던 다른 시설이 있으면 그 시설은 대상이 갖던 옛 번호를 받는다.
 *   - 그 외 시설의 번호는 변하지 않는다.
 *
 * 빈 번호가 자동 채워지지 않도록 배지 대상(접속함체·RN·IJP) 전 시설의
 * install_order 를 현재 번호로 고정한다 (대상·교환 시설만 맞바꾼 값).
 * redirect 안 함 — JSON 결과 반환 (캔버스 컨텍스트 유지).
 */
export async function setFacilityInstallOrder(input: {
  project_id: string
  facility_id: string
  desired_no: number
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.project_id || !input.facility_id) {
    return { ok: false, error: '대상이 올바르지 않습니다' }
  }
  const desired = Math.trunc(Number(input.desired_no))
  if (!Number.isFinite(desired) || desired < 1) {
    return { ok: false, error: '순번은 1 이상의 정수로 입력하세요' }
  }

  const { supabase } = await requireMember()

  // 프로젝트의 모든 시설 + 케이블 — 배지 대상(eligible) 판정에 필요
  const { data: fRows, error: fErr } = await supabase
    .from('relocation_facilities')
    .select('id, closure_type, created_at, install_order')
    .eq('project_id', input.project_id)
  if (fErr) return { ok: false, error: '시설 조회 실패: ' + fErr.message }

  const { data: cRows, error: cErr } = await supabase
    .from('relocation_cables')
    .select('from_facility_id, to_facility_id, status')
    .eq('project_id', input.project_id)
  if (cErr) return { ok: false, error: '케이블 조회 실패: ' + cErr.message }

  type FRow = {
    id: string
    closure_type: ClosureType
    created_at: string | null
    install_order: number | null
  }
  const facilities = (fRows ?? []) as FRow[]
  const cables = (cRows ?? []) as {
    from_facility_id: string
    to_facility_id: string
    status: string
  }[]

  // 시설별 연결 케이블
  const connByFacility = new Map<string, string[]>()
  for (const c of cables) {
    for (const fid of [c.from_facility_id, c.to_facility_id]) {
      const arr = connByFacility.get(fid)
      if (arr) arr.push(c.status)
      else connByFacility.set(fid, [c.status])
    }
  }

  // 배지 대상 — TopologyCanvas 의 installNoByFacility 필터와 동일.
  //   기설 케이블 한 조만 연결된 시설은 작업 지점이 아니므로 제외.
  const eligible = facilities.filter((f) => {
    if (!isInstallNumbered(f.closure_type)) return false
    const conns = connByFacility.get(f.id) ?? []
    if (conns.length === 1 && conns[0] === 'existing') return false
    return true
  })

  const target = eligible.find((f) => f.id === input.facility_id)
  if (!target) {
    return { ok: false, error: '이 시설은 설치 순번 배지 대상이 아닙니다' }
  }

  // 배지 대상 전 시설의 현재 번호
  const current = computeInstallNumbers(
    eligible.map((f) => ({
      id: f.id,
      install_order: f.install_order,
      created_at: f.created_at,
    })),
  )
  const oldNo = current.get(input.facility_id)
  if (oldNo === desired) return { ok: true } // 변경 없음

  // 새 번호 map — 현재 번호를 복사한 뒤 대상에 desired 적용.
  //   같은 번호를 쓰던 시설이 있으면 그 시설은 대상의 옛 번호를 받는다 (맞교환).
  const next = new Map(current)
  const colliderId = [...current.entries()].find(
    ([id, n]) => id !== input.facility_id && n === desired,
  )?.[0]
  next.set(input.facility_id, desired)
  if (colliderId != null && oldNo != null) next.set(colliderId, oldNo)

  // 배지 대상 전 시설의 install_order 를 새 번호로 고정 — 빈 번호 자동 채움 방지.
  //   저장된 install_order 와 다른 시설만 update.
  for (const f of eligible) {
    const newOrder = next.get(f.id)
    if (newOrder == null || f.install_order === newOrder) continue
    const { error } = await supabase
      .from('relocation_facilities')
      .update({ install_order: newOrder })
      .eq('id', f.id)
      .eq('project_id', input.project_id) // RLS 보강
    if (error) return { ok: false, error: '순번 저장 실패: ' + error.message }
  }

  revalidatePath(`/relocation/${input.project_id}`)
  return { ok: true }
}


/**
 * 캔버스 정보 패널에서 시설 삭제 — JSON 결과 반환.
 * 공종·자재(facility_tasks·facility_materials)는 cascade 로 함께 삭제되지만
 * 연결된 케이블이 있으면 FK 위반 → 친절한 메시지.
 */
export async function deleteFacilityFromCanvas(
  projectId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!projectId || !id) return { ok: false, error: '대상이 올바르지 않습니다' }

  const { supabase } = await requireMember()

  const { error } = await supabase.from('relocation_facilities').delete().eq('id', id)
  if (error) {
    const friendly = error.message.includes('foreign key')
      ? '이 시설을 사용하는 케이블이 있어 삭제할 수 없습니다. 케이블을 먼저 제거해주세요.'
      : '삭제 실패: ' + error.message
    return { ok: false, error: friendly }
  }

  revalidatePath(`/relocation/${projectId}`)
  return { ok: true }
}


export async function deleteFacility(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  const projectId = String(formData.get('project_id') ?? '').trim()
  if (!id || !projectId) {
    redirect('/relocation?err=' + encodeURIComponent('id 가 없습니다'))
  }

  const { supabase } = await requireMember()

  const { error } = await supabase.from('relocation_facilities').delete().eq('id', id)
  if (error) {
    // FK 위반 — 연결된 케이블 있음
    const friendly = error.message.includes('foreign key')
      ? '이 시설을 사용하는 케이블이 있어 삭제할 수 없습니다. 케이블을 먼저 제거해주세요.'
      : '삭제 실패: ' + error.message
    redirect(
      `/relocation/${projectId}?tab=facilities&err=` + encodeURIComponent(friendly),
    )
  }

  revalidatePath(`/relocation/${projectId}`)
  redirect(
    `/relocation/${projectId}?tab=facilities&ok=` +
      encodeURIComponent('시설을 삭제했습니다'),
  )
}


// ===== 카카오맵 지도 모드 — GPS 좌표 기반 시설 배치 =====================

function isValidLat(v: number): boolean {
  return Number.isFinite(v) && v >= -90 && v <= 90
}
function isValidLng(v: number): boolean {
  return Number.isFinite(v) && v >= -180 && v <= 180
}

/**
 * 지도 모드에서 시설 신규 배치 — 지도 클릭 좌표(lat/lng)로 생성.
 * createFacilityAtPosition 의 GPS 판. x_hint/y_hint 는 비워둠 (도식 모드는 자동 배치).
 * redirect 안 함 — JSON 결과 반환.
 */
export async function createFacilityAtLatLng(input: {
  project_id: string
  closure_type: ClosureType
  name: string
  lat: number
  lng: number
  master_facility_id?: string | null
  closure_spec?: CableSpec | null
  install_address?: string | null
  parent_facility_id?: string | null
  install_status?: FacilityInstallStatus | null
  facility_code?: string | null
}): Promise<
  | { ok: true; id: string; seq_no: number }
  | { ok: false; error: string }
> {
  if (!input.project_id) return { ok: false, error: '프로젝트 id 가 없습니다' }
  if (!isClosureType(input.closure_type)) {
    return { ok: false, error: '시설 종류가 올바르지 않습니다' }
  }
  const name = (input.name ?? '').trim()
  if (!name) return { ok: false, error: '시설 이름을 입력하세요' }
  if (name.length > 200) return { ok: false, error: '이름은 200자 이하로 입력하세요' }
  if (!isValidLat(input.lat) || !isValidLng(input.lng)) {
    return { ok: false, error: 'GPS 좌표가 올바르지 않습니다' }
  }
  if (input.closure_spec && !isCableSpec(input.closure_spec)) {
    return { ok: false, error: '함체 규격이 올바르지 않습니다' }
  }
  if (input.parent_facility_id && !isInternalNode(input.closure_type)) {
    return { ok: false, error: '부모 시설은 MOFD·OJC·국사내장비만 가질 수 있습니다' }
  }

  const { supabase, me } = await requireMember()

  let attempt = 0
  let lastErr: string | null = null
  while (attempt < 3) {
    attempt += 1
    try {
      const seqNo = await allocateNextFacilitySeq(
        supabase,
        input.project_id,
        input.closure_type,
      )

      const { data: row, error } = await supabase
        .from('relocation_facilities')
        .insert({
          project_id: input.project_id,
          closure_type: input.closure_type,
          seq_no: seqNo,
          name,
          facility_code: input.facility_code?.trim().slice(0, 100) || null,
          lat: input.lat,
          lng: input.lng,
          install_address: input.install_address ?? null,
          closure_spec: input.closure_spec ?? null,
          parent_facility_id: input.parent_facility_id ?? null,
          master_facility_id: input.master_facility_id ?? null,
          is_marked: false,
          install_status:
            input.install_status && isInstallStatus(input.install_status)
              ? input.install_status
              : 'new',
          created_by: me.id,
        })
        .select('id')
        .maybeSingle()

      if (!error && row) {
        revalidatePath(`/relocation/${input.project_id}`)
        return { ok: true, id: (row as { id: string }).id, seq_no: seqNo }
      }

      lastErr = error?.message ?? '알 수 없음'
      if (
        error?.message.includes('unique') ||
        error?.message.includes('duplicate') ||
        error?.code === '23505'
      ) {
        continue
      }
      break
    } catch (e: unknown) {
      lastErr = e instanceof Error ? e.message : String(e)
      break
    }
  }

  return { ok: false, error: '등록 실패: ' + (lastErr ?? '알 수 없는 오류') }
}


/**
 * 지도 모드에서 시설 위치 이동/지정 — 마커 드래그 또는 미배치 시설 배치.
 * redirect 안 함 — JSON 결과 반환.
 */
export async function updateFacilityLatLng(input: {
  project_id: string
  facility_id: string
  lat: number
  lng: number
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.project_id || !input.facility_id) {
    return { ok: false, error: '대상이 올바르지 않습니다' }
  }
  if (!isValidLat(input.lat) || !isValidLng(input.lng)) {
    return { ok: false, error: 'GPS 좌표가 올바르지 않습니다' }
  }

  const { supabase } = await requireMember()

  const { error } = await supabase
    .from('relocation_facilities')
    .update({ lat: input.lat, lng: input.lng })
    .eq('id', input.facility_id)
    .eq('project_id', input.project_id) // RLS 보강

  if (error) return { ok: false, error: '위치 저장 실패: ' + error.message }

  revalidatePath(`/relocation/${input.project_id}`)
  return { ok: true }
}


/**
 * 도식 모드에서 만든 GPS 없는 시설들을 한 번에 지도에 배치.
 * 클라이언트가 지도 중심 기준 격자 좌표를 계산해 넘기면 일괄 update.
 * (시설마다 좌표가 달라 upsert 대신 행별 update — 회사 규모상 수십 건이라 OK)
 */
export async function bulkPlaceFacilities(
  projectId: string,
  items: { id: string; lat: number; lng: number }[],
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  if (!projectId) return { ok: false, error: '프로젝트 id 가 없습니다' }
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: '배치할 시설이 없습니다' }
  }
  if (items.length > 500) {
    return { ok: false, error: '한 번에 최대 500개까지 배치할 수 있습니다' }
  }

  const { supabase } = await requireMember()

  let count = 0
  for (const it of items) {
    if (!it.id || !isValidLat(it.lat) || !isValidLng(it.lng)) continue
    const { error } = await supabase
      .from('relocation_facilities')
      .update({ lat: it.lat, lng: it.lng })
      .eq('id', it.id)
      .eq('project_id', projectId) // RLS 보강
    if (error) return { ok: false, error: '배치 실패: ' + error.message }
    count += 1
  }

  revalidatePath(`/relocation/${projectId}`)
  return { ok: true, count }
}


/**
 * 실사정보 시설 즉시 배치 — 캔버스 좌클릭 시 모달 없이 바로 생성.
 *   이름은 자동 「실사{seq_no}」 (seq_no 는 카운터 atomic 발급).
 *   닥션: x/y 도식 모드 또는 lat/lng 지도 모드. 둘 다 없으면 좌표 null.
 *
 * @returns { ok: true, id, seq_no, name } | { ok: false, error: string }
 */
export async function createInspectionFacility(input: {
  project_id: string
  x?: number | null
  y?: number | null
  lat?: number | null
  lng?: number | null
}): Promise<
  | { ok: true; id: string; seq_no: number; name: string }
  | { ok: false; error: string }
> {
  if (!input.project_id) return { ok: false, error: '프로젝트 id 가 없습니다' }

  const { supabase, me } = await requireMember()

  let attempt = 0
  let lastErr: string | null = null
  while (attempt < 3) {
    attempt += 1
    try {
      // owner 요청 (2026-05-25): 실사정보는 삭제된 번호 자리를 메워 재사용 →
      //   도면에 실사 1개만 있는데 「실사3」 으로 표시되는 문제 방지
      const seqNo = await allocateLowestAvailableSeq(supabase, input.project_id, '실사정보')
      const name = `실사${seqNo}`

      const { data: row, error } = await supabase
        .from('relocation_facilities')
        .insert({
          project_id: input.project_id,
          closure_type: '실사정보',
          seq_no: seqNo,
          name,
          x_hint:
            typeof input.x === 'number' && Number.isFinite(input.x)
              ? Math.round(input.x)
              : null,
          y_hint:
            typeof input.y === 'number' && Number.isFinite(input.y)
              ? Math.round(input.y)
              : null,
          lat:
            typeof input.lat === 'number' && isValidLat(input.lat) ? input.lat : null,
          lng:
            typeof input.lng === 'number' && isValidLng(input.lng) ? input.lng : null,
          is_marked: false,
          install_status: 'new',
          created_by: me.id,
        })
        .select('id, seq_no, name')
        .maybeSingle()

      if (!error && row) {
        revalidatePath(`/relocation/${input.project_id}`)
        const r = row as { id: string; seq_no: number; name: string }
        return { ok: true, id: r.id, seq_no: r.seq_no, name: r.name }
      }

      lastErr = error?.message ?? '알 수 없음'
      if (
        error?.message.includes('unique') ||
        error?.message.includes('duplicate') ||
        error?.code === '23505'
      ) {
        continue // seq 충돌 — 재시도
      }
      break
    } catch (e: unknown) {
      lastErr = e instanceof Error ? e.message : String(e)
      break
    }
  }
  return { ok: false, error: '실사정보 시설 생성 실패: ' + (lastErr ?? '알 수 없음') }
}

/**
 * 시설 종류(closure_type) 변경 — 정보 패널의 「시설물 종류 변경」 액션.
 *   접속함체 → 설치장소·국사·RN 등 또는 반대 방향 모두 허용.
 *   owner 결정 2026-05-26: seq_no 는 기존 값 그대로 유지 (재할당 안 함).
 *     - 내부 번호 보존 + 외부 도면·기별명세서 등에서 번호 안 흔들림.
 *     - 같은 prefix 안 다른 시설과 표시 코드(S-005 등)가 우연히 같아질 수 있음 —
 *       owner 가 facility_code 수동 입력으로 정정 가능.
 *   접속함체가 아닌 종류로 바꾸면 closure_spec(함체 규격) 은 자동 제거.
 */
export async function updateFacilityClosureType(input: {
  project_id: string
  facility_id: string
  closure_type: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const projectId = String(input.project_id ?? '').trim()
  const facilityId = String(input.facility_id ?? '').trim()
  const newType = String(input.closure_type ?? '').trim()
  if (!projectId || !facilityId) return { ok: false, error: '대상이 올바르지 않습니다' }
  if (!isClosureType(newType)) return { ok: false, error: '시설 종류가 올바르지 않습니다' }

  const { supabase } = await requireMember()

  // 현재 closure_type 조회 — 변경 안 한 경우 빠르게 반환
  const { data: existing, error: readErr } = await supabase
    .from('relocation_facilities')
    .select('closure_type')
    .eq('id', facilityId)
    .eq('project_id', projectId)
    .maybeSingle()
  if (readErr) return { ok: false, error: '시설 조회 실패: ' + readErr.message }
  if (!existing) return { ok: false, error: '시설을 찾을 수 없습니다' }
  const prevType = (existing as { closure_type: ClosureType }).closure_type
  if (prevType === newType) return { ok: true }

  // 접속함체가 아닌 종류로 바꾸면 closure_spec 비움
  const update: {
    closure_type: ClosureType
    closure_spec?: null
  } = { closure_type: newType as ClosureType }
  if (CLOSURE_TYPE_CATEGORY[newType as ClosureType] !== '접속함체') {
    update.closure_spec = null
  }

  const { error } = await supabase
    .from('relocation_facilities')
    .update(update)
    .eq('id', facilityId)
    .eq('project_id', projectId)
  if (error) return { ok: false, error: '시설 종류 변경 실패: ' + error.message }

  revalidatePath(`/relocation/${projectId}`)
  return { ok: true }
}

/**
 * 시설 라벨 스타일 갱신 — 캔버스 상단 「서식」 툴바에서 호출.
 *   부분 갱신: 입력된 키만 덮어쓰고 나머지는 보존 (jsonb merge).
 *   value=null 로 들어온 키는 삭제 → 캔버스 기본값 복귀.
 */
export async function updateFacilityLabelStyle(input: {
  project_id: string
  facility_id: string
  style: {
    font_size_scale?: number | null
    color?: string | null
    font_family?: string | null
    bold?: boolean | null
    italic?: boolean | null
  }
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const projectId = String(input.project_id ?? '').trim()
  const facilityId = String(input.facility_id ?? '').trim()
  if (!projectId || !facilityId) return { ok: false, error: '대상이 올바르지 않습니다' }
  if (!input.style || typeof input.style !== 'object') {
    return { ok: false, error: '스타일이 없습니다' }
  }

  // 입력값 검증
  const VALID_FAMILIES = ['Pretendard', 'monospace', 'serif']
  const COLOR_RX = /^#[0-9a-fA-F]{3,8}$/
  for (const [k, v] of Object.entries(input.style)) {
    if (v === null || v === undefined) continue
    if (k === 'font_size_scale') {
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0.3 || v > 4) {
        return { ok: false, error: '글자 크기 배율은 0.3~4 사이여야 합니다' }
      }
    } else if (k === 'color') {
      if (typeof v !== 'string' || !COLOR_RX.test(v)) {
        return { ok: false, error: '색상이 올바르지 않습니다' }
      }
    } else if (k === 'font_family') {
      if (typeof v !== 'string' || !VALID_FAMILIES.includes(v)) {
        return { ok: false, error: '폰트가 올바르지 않습니다' }
      }
    } else if (k === 'bold' || k === 'italic') {
      if (typeof v !== 'boolean') {
        return { ok: false, error: `${k} 값이 올바르지 않습니다` }
      }
    }
  }

  const { supabase } = await requireMember()

  // 기존 jsonb merge
  const { data: row, error: readErr } = await supabase
    .from('relocation_facilities')
    .select('label_style')
    .eq('id', facilityId)
    .eq('project_id', projectId)
    .maybeSingle()
  if (readErr) return { ok: false, error: '라벨 스타일 조회 실패: ' + readErr.message }
  const existing = ((row?.label_style as Record<string, unknown>) ?? {}) as Record<string, unknown>
  const next: Record<string, unknown> = { ...existing }
  for (const [k, v] of Object.entries(input.style)) {
    if (v === null) delete next[k]
    else if (v !== undefined) next[k] = v
  }

  const { error } = await supabase
    .from('relocation_facilities')
    .update({ label_style: next })
    .eq('id', facilityId)
    .eq('project_id', projectId)
  if (error) return { ok: false, error: '라벨 스타일 저장 실패: ' + error.message }

  revalidatePath(`/relocation/${projectId}`)
  return { ok: true }
}
