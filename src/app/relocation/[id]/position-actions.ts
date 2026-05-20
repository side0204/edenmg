'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// 시설 캔버스 좌표(x_hint, y_hint) 일괄 저장 — 드래그 종료 후 호출.
// 권한: 회사 직원 누구나 (RLS 회사 스코프).

type PositionUpdate = { id: string; x: number; y: number }

/**
 * 한 프로젝트의 시설 위치 일괄 저장.
 * 클라이언트가 JSON 으로 전송 (server action 의 FormData 단점 우회).
 */
export async function saveNodePositions(
  projectId: string,
  positions: PositionUpdate[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: '로그인이 필요합니다' }

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; is_active: boolean } | null
  if (!me || !me.is_active) return { ok: false, error: '계정이 활성 상태가 아닙니다' }

  // 입력 검증
  if (!projectId || positions.length === 0) {
    return { ok: false, error: '저장할 위치가 없습니다' }
  }
  for (const p of positions) {
    if (!p.id || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      return { ok: false, error: '위치 데이터가 올바르지 않습니다' }
    }
  }

  // 일괄 업데이트 — row 별 update (Supabase 의 bulk update 는 단일 컬럼만 가능해서 loop)
  for (const p of positions) {
    const { error } = await supabase
      .from('relocation_facilities')
      .update({ x_hint: Math.round(p.x), y_hint: Math.round(p.y) })
      .eq('id', p.id)
      .eq('project_id', projectId) // RLS 보강
    if (error) {
      return { ok: false, error: `위치 저장 실패: ${error.message}` }
    }
  }

  revalidatePath(`/relocation/${projectId}`)
  return { ok: true }
}


type Waypoint = {
  x: number
  y: number
  // 지도 모드에서 편집한 경로점의 GPS 좌표 (도식 모드는 x/y 만 사용)
  lat?: number | null
  lng?: number | null
  pole_name?: string | null
  dist?: number | null
}

/**
 * 한 케이블의 중간 경로 waypoint 일괄 저장 — 드래그·추가·삭제 후 호출.
 * 시작·종료점은 시설 위치에서 derive 하므로 저장 안 함 — 중간점만.
 * pole_name(전주명)·dist(구간거리)도 함께 보존.
 */
export async function saveCableWaypoints(
  projectId: string,
  cableId: string,
  waypoints: Waypoint[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: '로그인이 필요합니다' }

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; is_active: boolean } | null
  if (!me || !me.is_active) return { ok: false, error: '계정이 활성 상태가 아닙니다' }

  if (!projectId || !cableId) {
    return { ok: false, error: '케이블 정보가 없습니다' }
  }
  if (waypoints.length > 200) {
    return { ok: false, error: '경로점이 너무 많습니다 (최대 200개)' }
  }
  for (const w of waypoints) {
    if (!Number.isFinite(w.x) || !Number.isFinite(w.y)) {
      return { ok: false, error: '경로점 좌표가 올바르지 않습니다' }
    }
  }

  const clean = waypoints.map((w) => ({
    x: Math.round(w.x),
    y: Math.round(w.y),
    lat: typeof w.lat === 'number' && Number.isFinite(w.lat) ? w.lat : null,
    lng: typeof w.lng === 'number' && Number.isFinite(w.lng) ? w.lng : null,
    pole_name: w.pole_name ? String(w.pole_name).slice(0, 100) : null,
    dist: typeof w.dist === 'number' && Number.isFinite(w.dist) ? w.dist : null,
  }))

  const { error } = await supabase
    .from('relocation_cables')
    .update({ waypoints: clean })
    .eq('id', cableId)
    .eq('project_id', projectId) // RLS 보강
  if (error) {
    return { ok: false, error: `경로 저장 실패: ${error.message}` }
  }

  revalidatePath(`/relocation/${projectId}`)
  return { ok: true }
}
