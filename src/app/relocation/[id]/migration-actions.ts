'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// 이전(migration) 워크플로우 server actions.
//
// 사양: docs/RELOCATION_DESIGN_PLAN.md § 2-7 (v0.9).
//
// 워크플로우:
//   ① 사용자가 케이블 탭에서 옛 케이블의 status 를 'removing' / 'relocating' 으로 마킹
//   ② 이전 탭에서 영향 회선 자동 추출 (옛 케이블의 core_assignments 의 circuit_id 들)
//   ③ 옛 케이블 + 새 케이블 + 회선 다중선택 → migration audit row + circuit rows insert
//
// 자동 코어 배정은 Step D 에서 별도 구현. 본 액션은 audit 만 기록.

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


/**
 * 이전 작업 등록.
 *
 * FormData:
 *   - project_id      : 프로젝트 UUID
 *   - from_cable_id   : 옛 케이블 UUID
 *   - to_cable_id     : 새 케이블 UUID
 *   - circuit_keys[]  : '{circuit_id}|{segment_idx}' 형식 다중. 영향 회선 체크박스 값
 *   - notes           : 비고 (선택)
 *
 * relocation_migrations 1행 + relocation_migration_circuits N행 insert.
 */
export async function createMigration(formData: FormData) {
  const projectId = String(formData.get('project_id') ?? '').trim()
  if (!projectId) redirect('/relocation?err=' + encodeURIComponent('프로젝트 id 가 없습니다'))

  const fromCableId = String(formData.get('from_cable_id') ?? '').trim()
  if (!fromCableId) {
    redirect(
      `/relocation/${projectId}?tab=migrations&err=` +
        encodeURIComponent('옛 케이블을 선택하세요'),
    )
  }

  const toCableId = String(formData.get('to_cable_id') ?? '').trim()
  if (!toCableId) {
    redirect(
      `/relocation/${projectId}?tab=migrations&err=` +
        encodeURIComponent('새 케이블을 선택하세요'),
    )
  }

  if (fromCableId === toCableId) {
    redirect(
      `/relocation/${projectId}?tab=migrations&err=` +
        encodeURIComponent('옛 케이블과 새 케이블이 같을 수 없습니다'),
    )
  }

  // circuit_keys[] — '{circuit_id}|{segment_idx}' 다중
  const rawKeys = formData.getAll('circuit_keys').map((v) => String(v).trim()).filter(Boolean)
  if (rawKeys.length === 0) {
    redirect(
      `/relocation/${projectId}?tab=migrations&err=` +
        encodeURIComponent('옮길 회선을 1건 이상 선택하세요'),
    )
  }

  // 파싱 + 중복 제거
  type CircuitPick = { circuit_id: string; segment_idx: number }
  const seen = new Set<string>()
  const picks: CircuitPick[] = []
  for (const key of rawKeys) {
    if (seen.has(key)) continue
    seen.add(key)
    const [circuitId, segStr] = key.split('|')
    if (!circuitId) continue
    const seg = Number.parseInt(segStr ?? '0', 10)
    if (!Number.isFinite(seg) || seg < 0 || seg > 9) continue
    picks.push({ circuit_id: circuitId, segment_idx: seg })
  }
  if (picks.length === 0) {
    redirect(
      `/relocation/${projectId}?tab=migrations&err=` +
        encodeURIComponent('회선 선택이 올바르지 않습니다'),
    )
  }

  const notes = String(formData.get('notes') ?? '').trim() || null

  const { supabase, me } = await requireMember()

  // 1. migration 행 insert
  const { data: migRow, error: migErr } = await supabase
    .from('relocation_migrations')
    .insert({
      project_id: projectId,
      from_cable_id: fromCableId,
      to_cable_id: toCableId,
      notes,
      created_by: me.id,
    })
    .select('id')
    .maybeSingle()

  if (migErr || !migRow) {
    const friendly =
      migErr?.message.includes('unique') || migErr?.code === '23505'
        ? '이 옛 케이블 → 새 케이블 조합으로 이미 이전 이력이 등록되어 있습니다'
        : '이전 등록 실패: ' + (migErr?.message ?? '알 수 없음')
    redirect(
      `/relocation/${projectId}?tab=migrations&err=` + encodeURIComponent(friendly),
    )
  }

  // 2. migration_circuits 행 bulk insert
  const circuitRows = picks.map((p) => ({
    migration_id: (migRow as { id: string }).id,
    circuit_id: p.circuit_id,
    segment_idx: p.segment_idx,
  }))

  const { error: circErr } = await supabase
    .from('relocation_migration_circuits')
    .insert(circuitRows)

  if (circErr) {
    // 롤백 — migration 행 삭제 (cascade 로 자식 row 도)
    await supabase
      .from('relocation_migrations')
      .delete()
      .eq('id', (migRow as { id: string }).id)
    redirect(
      `/relocation/${projectId}?tab=migrations&err=` +
        encodeURIComponent('회선 매핑 실패: ' + circErr.message),
    )
  }

  revalidatePath(`/relocation/${projectId}`)
  redirect(
    `/relocation/${projectId}?tab=migrations&ok=` +
      encodeURIComponent(`회선 ${picks.length}건 이전 등록 완료`),
  )
}


/**
 * 이전 작업 삭제 — relocation_migrations 행 삭제.
 * cascade 로 relocation_migration_circuits 도 함께 삭제됨.
 *
 * 주의: core_assignments 는 별개. 자동 배정 결과를 되돌리려면 코어배정 탭에서 직접 정리.
 */
export async function deleteMigration(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  const projectId = String(formData.get('project_id') ?? '').trim()
  if (!id || !projectId) redirect('/relocation?err=' + encodeURIComponent('id 가 없습니다'))

  const { supabase } = await requireMember()

  const { error } = await supabase.from('relocation_migrations').delete().eq('id', id)
  if (error) {
    redirect(
      `/relocation/${projectId}?tab=migrations&err=` +
        encodeURIComponent('삭제 실패: ' + error.message),
    )
  }

  revalidatePath(`/relocation/${projectId}`)
  redirect(
    `/relocation/${projectId}?tab=migrations&ok=` +
      encodeURIComponent('이전 이력을 삭제했습니다'),
  )
}
