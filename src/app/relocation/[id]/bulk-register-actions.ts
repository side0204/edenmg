'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  CLOSURE_TYPE_VALUES,
  type ClosureType,
} from '@/lib/relocation'
import { CABLE_SPEC_VALUES, type CableSpec } from '@/lib/connection'

// 공사설계 시설물 일괄등록 — 서버 액션.
//   클라이언트가 파싱한 결과를 받아 트랜잭션처럼 처리:
//     1) 함체들을 계산된 좌표(positions)에 일괄 생성
//     2) 케이블 from/to 시설명을 「이번 일괄에 추가된 함체」 + 「기존 시설」 에서 매칭
//        - 둘 다 매칭되면 relocation_cables 에 insert (real)
//        - 하나라도 매칭 실패하면 relocation_pending_cables 에 insert
//   ⚠️ 'use server' 파일은 async function 만 export — 타입·상수는 별도 파일.

type BulkClosure = {
  closure_spec: string | null
  facility_code: string | null
  closure_type: string
  name: string
  x: number
  y: number
  // 지도 모드 — 컨테이너 픽셀을 카카오 projection 으로 변환한 GPS 좌표.
  //   둘 다 저장하면 도식/지도 어느 모드에서도 같은 시설이 그대로 표시됨.
  lat?: number | null
  lng?: number | null
}

type BulkCable = {
  spec: string
  cable_code: string | null
  installation_type: string | null
  from_name: string
  to_name: string
}

type BulkResult =
  | {
      ok: true
      createdClosures: number
      createdCables: number
      pendingCables: number
      // 되돌리기용 — 이번 실행이 만든 행 id
      createdFacilityIds: string[]
      createdCableIds: string[]
      createdPendingCableIds: string[]
    }
  | { ok: false; error: string }

function isClosureType(v: string): v is ClosureType {
  return (CLOSURE_TYPE_VALUES as readonly string[]).includes(v)
}
function isCableSpec(v: string): v is CableSpec {
  return (CABLE_SPEC_VALUES as readonly string[]).includes(v)
}

async function requireMember() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: '로그인이 필요합니다' }
  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | { id: string; company_id: string; is_active: boolean }
    | null
  if (!me || !me.is_active)
    return { ok: false as const, error: '계정이 활성 상태가 아닙니다' }
  return { ok: true as const, supabase, me }
}

// 단일 시설 번호 카운터 갱신 — facility-actions.ts 의 allocateNextFacilitySeq 로직 미러
//   (race 안전망: 일괄 등록 시에는 같은 closure_type 끼리 순차적으로 +1)
async function allocateSeqsForType(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  closureType: string,
  count: number,
): Promise<number[]> {
  // 현재 last_seq 읽기
  const { data: row } = await supabase
    .from('relocation_facility_seq')
    .select('last_seq')
    .eq('project_id', projectId)
    .eq('closure_type', closureType)
    .maybeSingle()

  const currentSeq = (row as { last_seq: number } | null)?.last_seq ?? 0
  const seqs: number[] = []
  for (let i = 0; i < count; i++) seqs.push(currentSeq + 1 + i)

  // 카운터 갱신
  const { error } = await supabase
    .from('relocation_facility_seq')
    .upsert({
      project_id: projectId,
      closure_type: closureType,
      last_seq: currentSeq + count,
    })
  if (error) throw new Error('번호 카운터 갱신 실패: ' + error.message)

  return seqs
}


export async function bulkRegisterFromCanvas(input: {
  project_id: string
  closures: BulkClosure[]
  cables: BulkCable[]
}): Promise<BulkResult> {
  if (!input.project_id) return { ok: false, error: '프로젝트 id 가 없습니다' }
  if (input.closures.length === 0 && input.cables.length === 0) {
    return { ok: false, error: '등록할 항목이 없습니다' }
  }

  const auth = await requireMember()
  if (!auth.ok) return auth
  const { supabase, me } = auth

  // 1) 함체 일괄 생성
  //    closure_type 별로 그룹핑해 seq 일괄 할당
  const byType = new Map<string, BulkClosure[]>()
  for (const c of input.closures) {
    if (!isClosureType(c.closure_type)) {
      return { ok: false, error: `함체 종류 인식 불가: ${c.closure_type}` }
    }
    const arr = byType.get(c.closure_type) ?? []
    arr.push(c)
    byType.set(c.closure_type, arr)
  }

  // 새로 생성된 함체 — { 이름 → id } 매핑 (이번 일괄 안 케이블 매칭용)
  const newClosureIdByName = new Map<string, string>()
  const newClosureIdByFacilityCode = new Map<string, string>()
  let createdClosures = 0
  const createdFacilityIds: string[] = []
  const createdCableIds: string[] = []
  const createdPendingCableIds: string[] = []

  for (const [closureType, list] of byType) {
    const seqs = await allocateSeqsForType(supabase, input.project_id, closureType, list.length)
    const rows = list.map((c, idx) => ({
      project_id: input.project_id,
      closure_type: closureType,
      seq_no: seqs[idx],
      name: c.name,
      facility_code: c.facility_code,
      closure_spec: c.closure_spec && isCableSpec(c.closure_spec) ? c.closure_spec : null,
      x_hint: Math.round(c.x),
      y_hint: Math.round(c.y),
      lat: typeof c.lat === 'number' && Number.isFinite(c.lat) ? c.lat : null,
      lng: typeof c.lng === 'number' && Number.isFinite(c.lng) ? c.lng : null,
      install_status: 'new',
      created_by: me.id,
    }))
    const { data: inserted, error } = await supabase
      .from('relocation_facilities')
      .insert(rows)
      .select('id, name, facility_code')
    if (error) {
      return {
        ok: false,
        error: `${closureType} 일괄 생성 실패: ${error.message}`,
      }
    }
    const insRows = (inserted ?? []) as Array<{
      id: string
      name: string
      facility_code: string | null
    }>
    createdClosures += insRows.length
    for (const r of insRows) {
      createdFacilityIds.push(r.id)
      if (r.name) newClosureIdByName.set(r.name, r.id)
      if (r.facility_code) newClosureIdByFacilityCode.set(r.facility_code, r.id)
    }
  }

  // 2) 케이블 from/to 매칭 — 신규 함체 + 기존 시설 모두 찾기
  //    기존 시설은 같은 project 안 모든 시설 한 번에 fetch
  let createdCables = 0
  let pendingCables = 0
  if (input.cables.length > 0) {
    const { data: existing } = await supabase
      .from('relocation_facilities')
      .select('id, name, facility_code')
      .eq('project_id', input.project_id)
    type Fac = {
      id: string
      name: string
      facility_code: string | null
    }
    const existRows = (existing ?? []) as Fac[]
    const existingByName = new Map<string, string>()
    const existingByFacilityCode = new Map<string, string>()
    for (const f of existRows) {
      if (f.name) existingByName.set(f.name, f.id)
      if (f.facility_code) existingByFacilityCode.set(f.facility_code, f.id)
    }

    function resolveFacility(token: string): string | null {
      // 우선순위: 신규 추가된 함체 → 기존 시설. 매칭 키: 이름 → facility_code
      return (
        newClosureIdByName.get(token) ??
        existingByName.get(token) ??
        newClosureIdByFacilityCode.get(token) ??
        existingByFacilityCode.get(token) ??
        null
      )
    }

    const realInsertRows: Array<{
      project_id: string
      from_facility_id: string
      to_facility_id: string
      spec: string
      status: string
      cable_code: string
      installation_type: string | null
      created_by: string
    }> = []
    const pendingInsertRows: Array<{
      project_id: string
      cable_code: string | null
      spec: string
      installation_type: string | null
      expected_from: string
      expected_to: string
      created_by: string
    }> = []

    // 케이블 cable_code 자동 부여 안 함 — 일괄 입력은 cable_code 가 명시되어야 (LGU+ ID).
    //   없으면 신설(new) 로 가정해 자동 부여 한 번에 — race 회피 위해 시퀀스 할당
    let autoCounter = 0
    let autoBase = 0
    let needAuto = input.cables.filter((c) => !c.cable_code).length
    if (needAuto > 0) {
      const { data: row } = await supabase
        .from('relocation_cable_seq')
        .select('last_seq')
        .eq('project_id', input.project_id)
        .maybeSingle()
      autoBase = (row as { last_seq: number } | null)?.last_seq ?? 0
      await supabase
        .from('relocation_cable_seq')
        .upsert({ project_id: input.project_id, last_seq: autoBase + needAuto })
    }

    for (const c of input.cables) {
      if (!isCableSpec(c.spec)) {
        // 파서가 이미 검증했지만 안전망
        continue
      }
      const fromId = resolveFacility(c.from_name)
      const toId = resolveFacility(c.to_name)
      let cableCode = c.cable_code
      if (!cableCode) {
        autoCounter += 1
        cableCode = `NEW-${String(autoBase + autoCounter).padStart(6, '0')}`
      }

      if (fromId && toId && fromId !== toId) {
        realInsertRows.push({
          project_id: input.project_id,
          from_facility_id: fromId,
          to_facility_id: toId,
          spec: c.spec,
          status: 'new',
          cable_code: cableCode,
          installation_type: c.installation_type,
          created_by: me.id,
        })
      } else {
        pendingInsertRows.push({
          project_id: input.project_id,
          cable_code: c.cable_code, // 자동 코드 X — 사용자가 입력한 것만 보관
          spec: c.spec,
          installation_type: c.installation_type,
          expected_from: c.from_name,
          expected_to: c.to_name,
          created_by: me.id,
        })
      }
    }

    if (realInsertRows.length > 0) {
      const { data: insCables, error } = await supabase
        .from('relocation_cables')
        .insert(realInsertRows)
        .select('id')
      if (error) {
        return {
          ok: false,
          error: `케이블 생성 실패: ${error.message} (함체 ${createdClosures}개는 등록됨)`,
        }
      }
      createdCables = realInsertRows.length
      for (const r of (insCables ?? []) as Array<{ id: string }>) {
        createdCableIds.push(r.id)
      }
    }
    if (pendingInsertRows.length > 0) {
      const { data: insPending, error } = await supabase
        .from('relocation_pending_cables')
        .insert(pendingInsertRows)
        .select('id')
      if (error) {
        return {
          ok: false,
          error: `미연결 케이블 저장 실패: ${error.message}`,
        }
      }
      pendingCables = pendingInsertRows.length
      for (const r of (insPending ?? []) as Array<{ id: string }>) {
        createdPendingCableIds.push(r.id)
      }
    }
  }

  revalidatePath(`/relocation/${input.project_id}`)
  return {
    ok: true,
    createdClosures,
    createdCables,
    pendingCables,
    createdFacilityIds,
    createdCableIds,
    createdPendingCableIds,
  }
}


// 일괄등록 되돌리기 — 직전 실행이 만든 시설/케이블/미연결 케이블 일괄 삭제.
//   클라이언트가 응답으로 받은 id 목록을 그대로 전달.
//   회사 스코프 검증 후 삭제.
export async function undoBulkRegister(input: {
  project_id: string
  facility_ids: string[]
  cable_ids: string[]
  pending_cable_ids: string[]
}): Promise<
  | {
      ok: true
      removedFacilities: number
      removedCables: number
      removedPending: number
    }
  | { ok: false; error: string }
> {
  if (!input.project_id) return { ok: false, error: '프로젝트 id 가 없습니다' }

  const auth = await requireMember()
  if (!auth.ok) return auth
  const { supabase, me } = auth

  // 프로젝트 회사 스코프 검증
  const { data: proj } = await supabase
    .from('relocation_projects')
    .select('company_id')
    .eq('id', input.project_id)
    .maybeSingle()
  if (
    !proj ||
    (proj as { company_id: string }).company_id !== me.company_id
  ) {
    return { ok: false, error: '권한이 없습니다' }
  }

  let removedFacilities = 0
  let removedCables = 0
  let removedPending = 0

  // 케이블 먼저 삭제 (시설 삭제하면 FK CASCADE 로 사라지지만, count 정확히 보려면 명시)
  if (input.cable_ids.length > 0) {
    const { count } = await supabase
      .from('relocation_cables')
      .delete({ count: 'exact' })
      .eq('project_id', input.project_id)
      .in('id', input.cable_ids)
    removedCables = count ?? 0
  }
  if (input.facility_ids.length > 0) {
    const { count } = await supabase
      .from('relocation_facilities')
      .delete({ count: 'exact' })
      .eq('project_id', input.project_id)
      .in('id', input.facility_ids)
    removedFacilities = count ?? 0
  }
  if (input.pending_cable_ids.length > 0) {
    const { count } = await supabase
      .from('relocation_pending_cables')
      .delete({ count: 'exact' })
      .eq('project_id', input.project_id)
      .in('id', input.pending_cable_ids)
    removedPending = count ?? 0
  }

  revalidatePath(`/relocation/${input.project_id}`)
  return { ok: true, removedFacilities, removedCables, removedPending }
}


// 미연결 케이블을 실제 케이블로 변환 — 사용자가 시설 2 개 선택 후 호출.
export async function resolvePendingCable(input: {
  project_id: string
  pending_id: string
  from_facility_id: string
  to_facility_id: string
}): Promise<{ ok: true; cable_id: string } | { ok: false; error: string }> {
  if (!input.project_id || !input.pending_id) {
    return { ok: false, error: '잘못된 요청' }
  }
  if (
    !input.from_facility_id ||
    !input.to_facility_id ||
    input.from_facility_id === input.to_facility_id
  ) {
    return { ok: false, error: '서로 다른 시설 2 개를 선택하세요' }
  }

  const auth = await requireMember()
  if (!auth.ok) return auth
  const { supabase, me } = auth

  // pending row 조회
  const { data: pRow } = await supabase
    .from('relocation_pending_cables')
    .select('id, project_id, cable_code, spec, installation_type')
    .eq('id', input.pending_id)
    .maybeSingle()
  const pending = pRow as
    | {
        id: string
        project_id: string
        cable_code: string | null
        spec: string
        installation_type: string | null
      }
    | null
  if (!pending || pending.project_id !== input.project_id) {
    return { ok: false, error: '미연결 케이블을 찾을 수 없습니다' }
  }

  // cable_code 가 비어있으면 자동 부여
  let cableCode = pending.cable_code
  if (!cableCode) {
    const { data: row } = await supabase
      .from('relocation_cable_seq')
      .select('last_seq')
      .eq('project_id', input.project_id)
      .maybeSingle()
    const last = (row as { last_seq: number } | null)?.last_seq ?? 0
    cableCode = `NEW-${String(last + 1).padStart(6, '0')}`
    await supabase
      .from('relocation_cable_seq')
      .upsert({ project_id: input.project_id, last_seq: last + 1 })
  }

  const { data: inserted, error: insErr } = await supabase
    .from('relocation_cables')
    .insert({
      project_id: input.project_id,
      from_facility_id: input.from_facility_id,
      to_facility_id: input.to_facility_id,
      spec: pending.spec,
      status: 'new',
      cable_code: cableCode,
      installation_type: pending.installation_type,
      created_by: me.id,
    })
    .select('id')
    .maybeSingle()
  if (insErr || !inserted) {
    return { ok: false, error: '케이블 생성 실패: ' + (insErr?.message ?? '알 수 없음') }
  }

  // pending row 삭제
  await supabase
    .from('relocation_pending_cables')
    .delete()
    .eq('id', input.pending_id)

  revalidatePath(`/relocation/${input.project_id}`)
  return { ok: true, cable_id: (inserted as { id: string }).id }
}


// 미연결 케이블 단순 삭제 (연결 안 하고 폐기)
export async function deletePendingCable(input: {
  project_id: string
  pending_id: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.project_id || !input.pending_id) {
    return { ok: false, error: '잘못된 요청' }
  }
  const auth = await requireMember()
  if (!auth.ok) return auth
  const { supabase } = auth

  const { error } = await supabase
    .from('relocation_pending_cables')
    .delete()
    .eq('id', input.pending_id)
    .eq('project_id', input.project_id)
  if (error) return { ok: false, error: '삭제 실패: ' + error.message }

  revalidatePath(`/relocation/${input.project_id}`)
  return { ok: true }
}
