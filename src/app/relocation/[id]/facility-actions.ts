'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  CLOSURE_TYPE_VALUES,
  isInternalNode,
  type ClosureType,
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

type FacilityFormParsed = {
  closure_type: ClosureType
  name: string
  install_address: string | null
  closure_spec: CableSpec | null
  parent_facility_id: string | null
  notes: string | null
  is_marked: boolean
}

function parseFacilityForm(formData: FormData): FacilityFormParsed | string {
  const closureTypeRaw = String(formData.get('closure_type') ?? '').trim()
  if (!isClosureType(closureTypeRaw)) return '시설 종류를 선택하세요.'
  const closure_type = closureTypeRaw

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return '시설 이름을 입력하세요.'
  if (name.length > 200) return '이름은 200자 이하로 입력하세요.'

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

  return {
    closure_type,
    name,
    install_address,
    closure_spec,
    parent_facility_id,
    notes,
    is_marked,
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


export async function createFacility(formData: FormData) {
  const projectId = String(formData.get('project_id') ?? '').trim()
  if (!projectId) redirect('/relocation?err=' + encodeURIComponent('프로젝트 id 가 없습니다'))

  const parsed = parseFacilityForm(formData)
  if (typeof parsed === 'string') {
    redirect(
      `/relocation/${projectId}?tab=facilities&err=` + encodeURIComponent(parsed),
    )
  }

  const { supabase } = await requireMember()

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
        install_address: parsed.install_address,
        closure_spec: parsed.closure_spec,
        parent_facility_id: parsed.parent_facility_id,
        is_marked: parsed.is_marked,
        notes: parsed.notes,
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
      install_address: parsed.install_address,
      closure_spec: parsed.closure_spec,
      parent_facility_id: parsed.parent_facility_id,
      is_marked: parsed.is_marked,
      notes: parsed.notes,
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

  const { supabase } = await requireMember()

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
          install_address: input.install_address ?? null,
          closure_spec: input.closure_spec ?? null,
          parent_facility_id: input.parent_facility_id ?? null,
          master_facility_id: input.master_facility_id ?? null,
          x_hint: Math.round(input.x),
          y_hint: Math.round(input.y),
          is_marked: false,
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
 * 캔버스 정보 패널에서 시설 기본 정보 수정 — 이름·함체 규격·비고.
 * redirect 안 함 — JSON 결과 반환 (패널 안에서 router.refresh 처리).
 */
export async function updateFacilityFromCanvas(input: {
  project_id: string
  id: string
  name: string
  closure_spec: CableSpec | null
  install_address: string | null
  notes: string | null
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

  const { supabase } = await requireMember()

  const { error } = await supabase
    .from('relocation_facilities')
    .update({
      name,
      closure_spec: input.closure_spec ?? null,
      install_address: installAddress,
      notes,
    })
    .eq('id', input.id)

  if (error) return { ok: false, error: '수정 실패: ' + error.message }

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

  const { supabase } = await requireMember()

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
          lat: input.lat,
          lng: input.lng,
          is_marked: false,
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
