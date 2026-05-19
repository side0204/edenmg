'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { formatNewCableCode } from '@/lib/relocation'

// 테스트 데이터 시드 — 빈 프로젝트에 실제와 유사한 미니 시나리오 채워넣기.
// 실제 구현 (LGU+ 엑셀 임포트) 들어가면 제거 예정.
//
// 시나리오: 필동 일대 — 국사 1, 함체 2, 맨홀 1, 가입자 3, 케이블 6, 회선 4.

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


export async function seedTestData(formData: FormData) {
  const projectId = String(formData.get('project_id') ?? '').trim()
  if (!projectId) redirect('/relocation?err=' + encodeURIComponent('프로젝트 id 가 없습니다'))

  const { supabase } = await requireMember()

  // 이미 데이터가 있으면 시드 차단
  const { count: existingFacilities } = await supabase
    .from('relocation_facilities')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)
  if ((existingFacilities ?? 0) > 0) {
    redirect(
      `/relocation/${projectId}?err=` +
        encodeURIComponent('이미 시설 데이터가 있습니다. 빈 프로젝트에서만 시드 가능'),
    )
  }

  // ===== 1. 시설 등록 =====================================================
  // closure_type 별 seq_no 1 부터 부여. facility_seq 카운터도 함께 갱신.
  type FacilitySeed = {
    key: string                                  // 내부 참조용 키
    closure_type:
      | '국사'
      | '함체_가공형'
      | '함체_관로형'
      | '맨홀'
      | '가입자시설'
    name: string
    install_address?: string
    closure_spec?: '12C' | '36C' | '72C' | '144C' | '288C'
  }

  const facilitySeeds: FacilitySeed[] = [
    { key: 'station',  closure_type: '국사',         name: '필동간이국사' },
    { key: 'box1',     closure_type: '함체_가공형',  name: '0025A 79M3#1',  closure_spec: '144C' },
    { key: 'box2',     closure_type: '함체_가공형',  name: '0025A 79M3#2',  closure_spec: '144C' },
    { key: 'manhole1', closure_type: '맨홀',         name: '0025A 79M2#1' },
    { key: 'sub1',     closure_type: '가입자시설',   name: '필동 충무영상센터', install_address: '서울 중구 필동2가 100' },
    { key: 'sub2',     closure_type: '가입자시설',   name: '거봉빌딩 옥상',      install_address: '서울 중구 필동1가 50' },
    { key: 'sub3',     closure_type: '가입자시설',   name: '매일경제TV B1F',    install_address: '서울 중구 필동3가 30' },
  ]

  // 종류별 seq 카운터
  const seqByType = new Map<string, number>()

  const facilityRows = facilitySeeds.map((s) => {
    const next = (seqByType.get(s.closure_type) ?? 0) + 1
    seqByType.set(s.closure_type, next)
    return {
      project_id: projectId,
      closure_type: s.closure_type,
      seq_no: next,
      name: s.name,
      install_address: s.install_address ?? null,
      closure_spec: s.closure_spec ?? null,
    }
  })

  const { data: insertedFacilities, error: fErr } = await supabase
    .from('relocation_facilities')
    .insert(facilityRows)
    .select('id, closure_type, seq_no, name')

  if (fErr || !insertedFacilities) {
    redirect(
      `/relocation/${projectId}?err=` +
        encodeURIComponent('시설 시드 실패: ' + (fErr?.message ?? '알 수 없음')),
    )
  }

  // facility_seq 카운터 upsert (종류별 last_seq)
  const seqRows = [...seqByType.entries()].map(([closure_type, last_seq]) => ({
    project_id: projectId,
    closure_type,
    last_seq,
  }))
  await supabase.from('relocation_facility_seq').upsert(seqRows)

  // key → id 매핑
  const facIdByKey = new Map<string, string>()
  for (let i = 0; i < facilitySeeds.length; i++) {
    facIdByKey.set(facilitySeeds[i].key, insertedFacilities[i].id)
  }


  // ===== 2. 케이블 등록 ===================================================
  type CableSeed = {
    from: string
    to: string
    spec: '1C(드랍)' | '2C(드랍)' | '12C' | '72C' | '144C' | '288C'
    status: 'existing' | 'new'
    cable_code?: string                         // 비우면 자동 생성
    route_type?: '가공' | '지중' | '관로'
  }

  const cableSeeds: CableSeed[] = [
    // 기설 케이블 (LGU+ 제공 코드 시뮬레이션)
    { from: 'station', to: 'box1',     spec: '288C', status: 'existing', cable_code: 'C1종로중구23',     route_type: '관로' },
    { from: 'box1',    to: 'manhole1', spec: '72C',  status: 'existing', cable_code: 'C1종로중구23-3',   route_type: '관로' },
    { from: 'box1',    to: 'box2',     spec: '144C', status: 'existing', cable_code: 'C1필동B-001-B-002', route_type: '가공' },
    // 신설 케이블 (자동 cable_code 사용)
    { from: 'box2',    to: 'sub1',     spec: '1C(드랍)', status: 'new', route_type: '가공' },
    { from: 'box2',    to: 'sub2',     spec: '2C(드랍)', status: 'new', route_type: '가공' },
    { from: 'box2',    to: 'sub3',     spec: '2C(드랍)', status: 'new', route_type: '가공' },
  ]

  // 신설 케이블 cable_seq 카운터
  let cableSeq = 0

  const cableRows = cableSeeds.map((c) => {
    let code = c.cable_code
    if (!code) {
      cableSeq += 1
      code = formatNewCableCode(projectId, cableSeq)
    }
    return {
      project_id: projectId,
      from_facility_id: facIdByKey.get(c.from)!,
      to_facility_id: facIdByKey.get(c.to)!,
      spec: c.spec,
      status: c.status,
      cable_code: code,
      route_type: c.route_type ?? null,
    }
  })

  const { error: cErr } = await supabase.from('relocation_cables').insert(cableRows)
  if (cErr) {
    redirect(
      `/relocation/${projectId}?err=` +
        encodeURIComponent('케이블 시드 실패: ' + cErr.message),
    )
  }

  // cable_seq 카운터 upsert
  if (cableSeq > 0) {
    await supabase
      .from('relocation_cable_seq')
      .upsert({ project_id: projectId, last_seq: cableSeq })
  }


  // ===== 3. 회선 등록 =====================================================
  type CircuitSeed = {
    circuit_id: string
    subscriber_name: string
    kind: '1코어' | '2코어' | '이원화_1코어씩' | '이원화_2코어씩'
    status: 'OK' | 'ER'
  }

  const circuitSeeds: CircuitSeed[] = [
    { circuit_id: '5632751', subscriber_name: '필동 충무영상센터', kind: '1코어',          status: 'OK' },
    { circuit_id: '5680650', subscriber_name: '거봉빌딩 옥상',     kind: '2코어',          status: 'OK' },
    { circuit_id: '5572607', subscriber_name: '매일경제TV B1F',    kind: '이원화_1코어씩', status: 'OK' },
    { circuit_id: '149653',  subscriber_name: '(주)에이엑스비',     kind: '1코어',          status: 'ER' },
  ]

  const circuitRows = circuitSeeds.map((c) => ({
    project_id: projectId,
    circuit_id: c.circuit_id,
    subscriber_name: c.subscriber_name,
    kind: c.kind,
    status: c.status,
  }))

  const { error: cirErr } = await supabase.from('relocation_circuits').insert(circuitRows)
  if (cirErr) {
    redirect(
      `/relocation/${projectId}?err=` +
        encodeURIComponent('회선 시드 실패: ' + cirErr.message),
    )
  }

  revalidatePath(`/relocation/${projectId}`)
  redirect(
    `/relocation/${projectId}?tab=facilities&ok=` +
      encodeURIComponent(
        `테스트 데이터 채움: 시설 ${facilitySeeds.length}개 · 케이블 ${cableSeeds.length}개 · 회선 ${circuitSeeds.length}개`,
      ),
  )
}
