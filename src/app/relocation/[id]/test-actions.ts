'use server'

// 지장이설 — 지도 테스트용 임의 시설 일괄 생성·삭제 (운영 환경에서도 사용 가능).
//
// 시설·케이블 notes 컬럼에 "[TEST]" 접두사를 박아 식별. 일괄 삭제는 이 마커로 필터.
//
// 시설 cascade 매트릭스 (마이그 확인):
//   splices · splitters · facility_tasks · facility_materials · phase_tasks → ON DELETE CASCADE
//   cables (from/to_facility_id) → NO cascade — 시설 삭제 전에 케이블 먼저 삭제
//   core_assignments (cable_id) → NO cascade — 케이블 삭제 전에 코어 먼저 삭제

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { CableSpec, ClosureType } from '@/lib/relocation'

const TEST_MARKER = '[TEST]'

// 시설 종류·개수 mix — 한 번 시드에 생성되는 시설 구성
const SEED_MIX: { type: ClosureType; count: number }[] = [
  { type: '국사', count: 1 },
  { type: '함체_가공형', count: 4 },
  { type: '함체_관로형', count: 3 },
  { type: '맨홀', count: 4 },
  { type: '가입자시설', count: 6 },
  { type: '중간접속형', count: 2 },
]

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

// 시드 중심 좌표 결정 — 기존 시설 평균 GPS, 없으면 시흥(미산로 62) 기본
async function decideSeedCenter(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
): Promise<{ lat: number; lng: number }> {
  const { data } = await supabase
    .from('relocation_facilities')
    .select('lat, lng')
    .eq('project_id', projectId)
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .limit(50)
  const rows = (data ?? []) as { lat: number | null; lng: number | null }[]
  const withGps = rows.filter(
    (r): r is { lat: number; lng: number } =>
      typeof r.lat === 'number' && typeof r.lng === 'number',
  )
  if (withGps.length === 0) {
    return { lat: 37.4242637, lng: 126.7929056 } // 시흥 미산로 62
  }
  let sumLat = 0
  let sumLng = 0
  for (const r of withGps) {
    sumLat += r.lat
    sumLng += r.lng
  }
  return { lat: sumLat / withGps.length, lng: sumLng / withGps.length }
}

// 중심 좌표 주위 임의 분산 (반경 ~400m). 위도 1° ≈ 111km
function randomOffsetLatLng(
  center: { lat: number; lng: number },
  radiusMeters: number,
): { lat: number; lng: number } {
  const angle = Math.random() * 2 * Math.PI
  const dist = Math.random() * radiusMeters
  const dLat = (dist * Math.cos(angle)) / 111000
  const dLng =
    (dist * Math.sin(angle)) /
    (111000 * Math.cos((center.lat * Math.PI) / 180))
  return { lat: center.lat + dLat, lng: center.lng + dLng }
}

// 시설 번호 next seq — facility-actions.ts 의 allocateNextFacilitySeq 와 동일 로직 (테스트 유틸 자체 보유).
async function allocateSeq(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  closureType: ClosureType,
): Promise<number> {
  const { data: row } = await supabase
    .from('relocation_facility_seq')
    .select('last_seq')
    .eq('project_id', projectId)
    .eq('closure_type', closureType)
    .maybeSingle()
  const currentSeq = (row as { last_seq: number } | null)?.last_seq ?? 0
  const nextSeq = currentSeq + 1
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


export async function seedTestFacilities(formData: FormData): Promise<void> {
  const projectId = String(formData.get('project_id') ?? '').trim()
  if (!projectId) {
    redirect('/relocation?err=' + encodeURIComponent('프로젝트 id 가 없습니다'))
  }

  const { supabase, me } = await requireMember()

  const center = await decideSeedCenter(supabase, projectId)

  // 1) 시설 일괄 생성
  const createdFacilities: { id: string; closureType: ClosureType }[] = []
  for (const entry of SEED_MIX) {
    for (let i = 0; i < entry.count; i++) {
      const pos = randomOffsetLatLng(center, 400)
      let seq: number
      try {
        seq = await allocateSeq(supabase, projectId, entry.type)
      } catch (e) {
        redirect(
          `/relocation/${projectId}?err=` +
            encodeURIComponent(
              '테스트 시드 실패: ' + (e instanceof Error ? e.message : String(e)),
            ),
        )
      }
      const { data: row, error } = await supabase
        .from('relocation_facilities')
        .insert({
          project_id: projectId,
          closure_type: entry.type,
          seq_no: seq,
          name: `테스트${entry.type}${seq}`,
          notes: `${TEST_MARKER} 테스트 자동 생성`,
          lat: pos.lat,
          lng: pos.lng,
          install_status: 'new',
          closure_spec:
            entry.type === '함체_가공형' || entry.type === '함체_관로형'
              ? '36C'
              : null,
          created_by: me.id,
        })
        .select('id')
        .single()
      if (error || !row) {
        redirect(
          `/relocation/${projectId}?err=` +
            encodeURIComponent('테스트 시설 생성 실패: ' + (error?.message ?? '')),
        )
      }
      createdFacilities.push({
        id: (row as { id: string }).id,
        closureType: entry.type,
      })
    }
  }

  // 2) 케이블 임의 연결 — 함체끼리 / 함체↔가입자 / 함체↔맨홀 등
  const closures = createdFacilities.filter((f) =>
    ['함체_가공형', '함체_관로형', '중간접속형'].includes(f.closureType),
  )
  const subscribers = createdFacilities.filter(
    (f) => f.closureType === '가입자시설',
  )
  const manholes = createdFacilities.filter((f) => f.closureType === '맨홀')
  const station = createdFacilities.find((f) => f.closureType === '국사')

  const cablePairs: { from: string; to: string; spec: CableSpec }[] = []
  if (station && closures.length > 0) {
    // 국사 → 함체 1~2개
    for (const c of closures.slice(0, 2)) {
      cablePairs.push({ from: station.id, to: c.id, spec: '144C' })
    }
  }
  // 함체 → 함체
  for (let i = 0; i < closures.length - 1; i++) {
    if (Math.random() < 0.6) {
      cablePairs.push({
        from: closures[i].id,
        to: closures[i + 1].id,
        spec: '72C',
      })
    }
  }
  // 함체 → 맨홀
  for (const m of manholes) {
    if (closures.length > 0) {
      const c = closures[Math.floor(Math.random() * closures.length)]
      cablePairs.push({ from: c.id, to: m.id, spec: '36C' })
    }
  }
  // 함체 → 가입자
  for (const s of subscribers) {
    if (closures.length > 0) {
      const c = closures[Math.floor(Math.random() * closures.length)]
      cablePairs.push({ from: c.id, to: s.id, spec: '12C' })
    }
  }

  let createdCableCount = 0
  for (const cp of cablePairs) {
    const { data: row, error } = await supabase
      .from('relocation_cables')
      .insert({
        project_id: projectId,
        from_facility_id: cp.from,
        to_facility_id: cp.to,
        spec: cp.spec,
        status: 'new',
        cable_code: `T-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        installation_type: '가공',
        notes: `${TEST_MARKER} 테스트 자동 생성`,
        created_by: me.id,
      })
      .select('id')
      .single()
    if (error || !row) {
      // 이미 만든 시설은 유지 — 케이블 실패만 skip
      continue
    }
    createdCableCount += 1
  }

  revalidatePath(`/relocation/${projectId}`)
  redirect(
    `/relocation/${projectId}?ok=` +
      encodeURIComponent(
        `테스트 시설 ${createdFacilities.length}개 · 케이블 ${createdCableCount}개 생성`,
      ),
  )
}


export async function clearTestFacilities(formData: FormData): Promise<void> {
  const projectId = String(formData.get('project_id') ?? '').trim()
  if (!projectId) {
    redirect('/relocation?err=' + encodeURIComponent('프로젝트 id 가 없습니다'))
  }

  const { supabase } = await requireMember()

  // 1) [TEST] 표시된 시설 id 모음
  const { data: tfRows, error: tfErr } = await supabase
    .from('relocation_facilities')
    .select('id')
    .eq('project_id', projectId)
    .like('notes', `${TEST_MARKER}%`)
  if (tfErr) {
    redirect(
      `/relocation/${projectId}?err=` +
        encodeURIComponent('테스트 시설 조회 실패: ' + tfErr.message),
    )
  }
  const testFacilityIds = (tfRows ?? []).map((r) => (r as { id: string }).id)

  if (testFacilityIds.length === 0) {
    redirect(
      `/relocation/${projectId}?ok=` +
        encodeURIComponent('삭제할 테스트 시설이 없습니다'),
    )
  }

  // 2) 영향 케이블 — 테스트 시설 양쪽 끝 케이블 + [TEST] 마커 케이블
  const { data: cableRows } = await supabase
    .from('relocation_cables')
    .select('id')
    .eq('project_id', projectId)
    .or(
      `from_facility_id.in.(${testFacilityIds.join(',')}),to_facility_id.in.(${testFacilityIds.join(',')}),notes.like.${TEST_MARKER}%`,
    )
  const testCableIds = (cableRows ?? []).map((r) => (r as { id: string }).id)

  // 3) 코어 배정 삭제 (cable_id IN test cables)
  if (testCableIds.length > 0) {
    const { error: caErr } = await supabase
      .from('relocation_core_assignments')
      .delete()
      .in('cable_id', testCableIds)
    if (caErr) {
      redirect(
        `/relocation/${projectId}?err=` +
          encodeURIComponent('코어 배정 삭제 실패: ' + caErr.message),
      )
    }
  }

  // 4) 케이블 삭제
  let deletedCableCount = 0
  if (testCableIds.length > 0) {
    const { error: cErr, count } = await supabase
      .from('relocation_cables')
      .delete({ count: 'exact' })
      .in('id', testCableIds)
    if (cErr) {
      redirect(
        `/relocation/${projectId}?err=` +
          encodeURIComponent('케이블 삭제 실패: ' + cErr.message),
      )
    }
    deletedCableCount = count ?? testCableIds.length
  }

  // 5) 시설 삭제 — splices/splitters/facility_tasks/facility_materials/phase_tasks 는 CASCADE
  const { error: fErr, count } = await supabase
    .from('relocation_facilities')
    .delete({ count: 'exact' })
    .in('id', testFacilityIds)
  if (fErr) {
    redirect(
      `/relocation/${projectId}?err=` +
        encodeURIComponent('시설 삭제 실패: ' + fErr.message),
    )
  }
  const deletedFacilityCount = count ?? testFacilityIds.length

  revalidatePath(`/relocation/${projectId}`)
  redirect(
    `/relocation/${projectId}?ok=` +
      encodeURIComponent(
        `테스트 시설 ${deletedFacilityCount}개 · 케이블 ${deletedCableCount}개 삭제`,
      ),
  )
}
