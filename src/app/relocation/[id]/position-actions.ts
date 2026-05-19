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
