'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  planAutoAssignments,
  type AutoAssignCable,
  type AutoAssignAssignment,
  type AutoAssignCircuit,
} from '@/lib/relocation-auto-assign'

// 지장이설 Step C-4 — 자동 코어 배정 server action.
//   종단(is_terminal)으로 표시된 코어 배정을 회선·세그먼트별로 묶어,
//   두 종단 사이 경유 케이블에 빈 코어를 자동 배정한다.
//   재실행 시 기존 자동 배정(is_auto_assigned=true)은 다시 계산하고,
//   사람이 입력·수정한 배정(is_auto_assigned=false)은 그대로 둔다.

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

export type AutoAssignSummary =
  | {
      ok: true
      assignedCount: number
      skippedCount: number
      insertedRows: number
      results: { label: string; status: 'assigned' | 'skipped'; detail: string }[]
    }
  | { ok: false; error: string }

export async function runAutoAssign(projectId: string): Promise<AutoAssignSummary> {
  if (!projectId) return { ok: false, error: '프로젝트 id 가 없습니다' }

  const { supabase } = await requireMember()

  // 1. 데이터 로드 — 케이블·코어배정·회선
  const { data: cRows, error: cErr } = await supabase
    .from('relocation_cables')
    .select('id, from_facility_id, to_facility_id, spec, status')
    .eq('project_id', projectId)
    .order('cable_code')
  if (cErr) return { ok: false, error: '케이블 조회 실패: ' + cErr.message }

  const { data: aRows, error: aErr } = await supabase
    .from('relocation_core_assignments')
    .select(
      'circuit_id, segment_idx, cable_id, core_range_start, core_range_end, lifecycle, is_terminal, is_auto_assigned',
    )
    .eq('project_id', projectId)
  if (aErr) return { ok: false, error: '코어 배정 조회 실패: ' + aErr.message }

  const { data: circRows, error: circErr } = await supabase
    .from('relocation_circuits')
    .select('id, circuit_id')
    .eq('project_id', projectId)
  if (circErr) return { ok: false, error: '회선 조회 실패: ' + circErr.message }

  const cables = (cRows ?? []) as AutoAssignCable[]
  const allAssignments = (aRows ?? []) as AutoAssignAssignment[]
  const circuits = (circRows ?? []) as AutoAssignCircuit[]

  if (!allAssignments.some((a) => a.is_terminal)) {
    return {
      ok: false,
      error:
        '종단으로 표시된 코어 배정이 없습니다. 회선의 양 끝 케이블을 종단으로 표시한 뒤 다시 실행하세요.',
    }
  }

  // 2. 자동 배정 row 는 제외하고 계획 수립
  const planInput = allAssignments.filter((a) => !a.is_auto_assigned)
  const plan = planAutoAssignments({ cables, circuits, assignments: planInput })

  // 3. 기존 자동 배정 row 삭제 (재계산)
  const { error: delErr } = await supabase
    .from('relocation_core_assignments')
    .delete()
    .eq('project_id', projectId)
    .eq('is_auto_assigned', true)
  if (delErr) {
    return { ok: false, error: '기존 자동 배정 삭제 실패: ' + delErr.message }
  }

  // 4. 새 자동 배정 일괄 insert
  let insertedRows = 0
  if (plan.inserts.length > 0) {
    const { error: insErr } = await supabase.from('relocation_core_assignments').insert(
      plan.inserts.map((p) => ({
        project_id: projectId,
        circuit_id: p.circuit_id,
        segment_idx: p.segment_idx,
        cable_id: p.cable_id,
        core_range_start: p.core_range_start,
        core_range_end: p.core_range_end,
        lifecycle: p.lifecycle,
        status: null,
        is_terminal: false,
        is_auto_assigned: true,
        notes: '자동 배정',
      })),
    )
    if (insErr) {
      const friendly =
        insErr.message.includes('exclude') || insErr.code === '23P01'
          ? '자동 배정 중 코어 범위 충돌이 발생했습니다. 기존 코어 배정을 확인해주세요.'
          : '자동 배정 저장 실패: ' + insErr.message
      return { ok: false, error: friendly }
    }
    insertedRows = plan.inserts.length
  }

  revalidatePath(`/relocation/${projectId}`)

  return {
    ok: true,
    assignedCount: plan.results.filter((r) => r.status === 'assigned').length,
    skippedCount: plan.results.filter((r) => r.status === 'skipped').length,
    insertedRows,
    results: plan.results,
  }
}
