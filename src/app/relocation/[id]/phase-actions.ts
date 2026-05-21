'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  planPhases,
  rebalanceIntoPhases,
  type WorkUnit,
} from '@/lib/relocation-phase-planner'

// 지장이설 Step D-2 — 차수 자동 분할 server action.
//   시설별 공종량(relocation_facility_tasks) 합계를 작업시간으로 보고
//   FFD 빈패킹으로 차수(relocation_phases)를 나눈다.
//   재실행 시 기존 차수를 모두 지우고 다시 계산 (phase_tasks·task_pairs cascade 삭제).

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

export type PhasePlanSummary =
  | {
      ok: true
      phaseCount: number
      teams: number
      totalMinutes: number
      facilityCount: number
    }
  | { ok: false; error: string }

export async function runPhasePlanning(projectId: string): Promise<PhasePlanSummary> {
  if (!projectId) return { ok: false, error: '프로젝트 id 가 없습니다' }

  const { supabase, me } = await requireMember()

  // 1. 데이터 로드 — 케이블·공종량·공종 마스터
  const { data: cRows, error: cErr } = await supabase
    .from('relocation_cables')
    .select('from_facility_id, to_facility_id, status')
    .eq('project_id', projectId)
  if (cErr) return { ok: false, error: '케이블 조회 실패: ' + cErr.message }

  const { data: ftRows, error: ftErr } = await supabase
    .from('relocation_facility_tasks')
    .select('facility_id, task_type_id, quantity')
    .eq('project_id', projectId)
  if (ftErr) return { ok: false, error: '공종량 조회 실패: ' + ftErr.message }

  const { data: ttRows, error: ttErr } = await supabase
    .from('relocation_task_type_master')
    .select('id, standard_minutes_per_unit')
    .eq('company_id', me.company_id)
  if (ttErr) return { ok: false, error: '공종 마스터 조회 실패: ' + ttErr.message }

  const cables = (cRows ?? []) as {
    from_facility_id: string
    to_facility_id: string
    status: string
  }[]
  const facilityTasks = (ftRows ?? []) as {
    facility_id: string
    task_type_id: string
    quantity: number
  }[]
  const taskTypes = (ttRows ?? []) as {
    id: string
    standard_minutes_per_unit: number
  }[]

  // 2. 시설별 작업시간 = Σ(표준시간 × 수량)
  const minutesPerUnit = new Map(
    taskTypes.map((t) => [t.id, Number(t.standard_minutes_per_unit) || 0]),
  )
  const minutesByFacility = new Map<string, number>()
  for (const ft of facilityTasks) {
    const add = (minutesPerUnit.get(ft.task_type_id) ?? 0) * (ft.quantity || 0)
    minutesByFacility.set(
      ft.facility_id,
      (minutesByFacility.get(ft.facility_id) ?? 0) + add,
    )
  }

  const units: WorkUnit[] = [...minutesByFacility.entries()]
    .map(([facilityId, minutes]) => ({ facilityId, minutes: Math.round(minutes) }))
    .filter((u) => u.minutes > 0)

  if (units.length === 0) {
    return {
      ok: false,
      error:
        '공종량이 입력된 시설이 없습니다. 시설 정보 패널에서 공종·수량을 먼저 입력하세요.',
    }
  }

  // 3. 차수 분할 계산
  const plan = planPhases(units)

  // task_kind — 신설 케이블이 연결된 시설은 '함체신설_절단', 그 외 '기설접속'
  const facilitiesWithNewCable = new Set<string>()
  for (const c of cables) {
    if (c.status === 'new') {
      facilitiesWithNewCable.add(c.from_facility_id)
      facilitiesWithNewCable.add(c.to_facility_id)
    }
  }

  // 4. 기존 차수 삭제 (phase_tasks·task_pairs cascade)
  const { error: delErr } = await supabase
    .from('relocation_phases')
    .delete()
    .eq('project_id', projectId)
  if (delErr) return { ok: false, error: '기존 차수 삭제 실패: ' + delErr.message }

  // 5. 차수 + 차수별 작업 insert
  let phaseNo = 0
  for (const ph of plan.phases) {
    phaseNo += 1
    const { data: phaseRow, error: pErr } = await supabase
      .from('relocation_phases')
      .insert({
        project_id: projectId,
        phase_no: phaseNo,
        required_teams: plan.teams,
        estimated_minutes: ph.minutes,
        status: '계획',
      })
      .select('id')
      .single()
    if (pErr || !phaseRow) {
      return { ok: false, error: '차수 저장 실패: ' + (pErr?.message ?? '알 수 없음') }
    }
    const phaseId = (phaseRow as { id: string }).id

    const { error: tErr } = await supabase.from('relocation_phase_tasks').insert(
      ph.unitFacilityIds.map((facilityId) => ({
        phase_id: phaseId,
        facility_id: facilityId,
        task_kind: facilitiesWithNewCable.has(facilityId)
          ? '함체신설_절단'
          : '기설접속',
        cores_continuous: 0,
        cores_noncontinuous: 0,
        estimated_minutes: minutesByFacility.get(facilityId) ?? 0,
      })),
    )
    if (tErr) return { ok: false, error: '차수 작업 저장 실패: ' + tErr.message }
  }

  revalidatePath(`/relocation/${projectId}`)

  return {
    ok: true,
    phaseCount: plan.phases.length,
    teams: plan.teams,
    totalMinutes: plan.totalMinutes,
    facilityCount: units.length,
  }
}


// ── 차수 재조정 — 차수별 투입 팀 확인 + 재배치 ──────────────────────────

type SimpleResult = { ok: true } | { ok: false; error: string }

/** 한 차수의 estimated_minutes 를 소속 작업 합계로 다시 계산. */
async function recomputePhaseMinutes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  phaseId: string,
): Promise<void> {
  const { data } = await supabase
    .from('relocation_phase_tasks')
    .select('estimated_minutes')
    .eq('phase_id', phaseId)
  const sum = ((data ?? []) as { estimated_minutes: number | null }[]).reduce(
    (acc, r) => acc + (r.estimated_minutes ?? 0),
    0,
  )
  await supabase
    .from('relocation_phases')
    .update({ estimated_minutes: sum })
    .eq('id', phaseId)
}

/** 차수별 투입 가능 팀 수 변경 (1~4). 작업은 옮기지 않음 — 용량만 바뀜. */
export async function updatePhaseTeams(
  projectId: string,
  phaseId: string,
  teams: number,
): Promise<SimpleResult> {
  if (!projectId || !phaseId) return { ok: false, error: '대상이 올바르지 않습니다' }
  const t = Math.trunc(teams)
  if (!Number.isFinite(t) || t < 1 || t > 4) {
    return { ok: false, error: '팀 수는 1~4 사이여야 합니다' }
  }

  const { supabase } = await requireMember()

  const { error } = await supabase
    .from('relocation_phases')
    .update({ required_teams: t })
    .eq('id', phaseId)
  if (error) return { ok: false, error: '팀 수 저장 실패: ' + error.message }

  revalidatePath(`/relocation/${projectId}`)
  return { ok: true }
}

/** 차수 작업을 다른 차수로 수동 이동. 양쪽 차수 작업시간 재계산. */
export async function movePhaseTask(
  projectId: string,
  taskId: string,
  targetPhaseId: string,
): Promise<SimpleResult> {
  if (!projectId || !taskId || !targetPhaseId) {
    return { ok: false, error: '대상이 올바르지 않습니다' }
  }

  const { supabase } = await requireMember()

  const { data: cur } = await supabase
    .from('relocation_phase_tasks')
    .select('phase_id')
    .eq('id', taskId)
    .maybeSingle()
  const oldPhaseId = (cur as { phase_id: string } | null)?.phase_id ?? null
  if (oldPhaseId === targetPhaseId) return { ok: true }

  const { error } = await supabase
    .from('relocation_phase_tasks')
    .update({ phase_id: targetPhaseId })
    .eq('id', taskId)
  if (error) return { ok: false, error: '이동 실패: ' + error.message }

  if (oldPhaseId) await recomputePhaseMinutes(supabase, oldPhaseId)
  await recomputePhaseMinutes(supabase, targetPhaseId)

  revalidatePath(`/relocation/${projectId}`)
  return { ok: true }
}

/** 빈 차수 삭제 + 차수 번호 재정렬. 작업이 있으면 거부. */
export async function deletePhase(
  projectId: string,
  phaseId: string,
): Promise<SimpleResult> {
  if (!projectId || !phaseId) return { ok: false, error: '대상이 올바르지 않습니다' }

  const { supabase } = await requireMember()

  const { count } = await supabase
    .from('relocation_phase_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('phase_id', phaseId)
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: '작업이 있는 차수는 삭제할 수 없습니다. 작업을 다른 차수로 옮긴 뒤 삭제하세요.',
    }
  }

  const { error } = await supabase.from('relocation_phases').delete().eq('id', phaseId)
  if (error) return { ok: false, error: '삭제 실패: ' + error.message }

  // 번호 재정렬 — 오름차순 처리라 unique 충돌 없음
  const { data: rest } = await supabase
    .from('relocation_phases')
    .select('id, phase_no')
    .eq('project_id', projectId)
    .order('phase_no')
  let n = 0
  for (const p of (rest ?? []) as { id: string; phase_no: number }[]) {
    n += 1
    if (p.phase_no !== n) {
      await supabase.from('relocation_phases').update({ phase_no: n }).eq('id', p.id)
    }
  }

  revalidatePath(`/relocation/${projectId}`)
  return { ok: true }
}

export type RebalanceSummary =
  | { ok: true; phaseCount: number }
  | { ok: false; error: string }

/**
 * 차수 재조정 — 차수별로 설정된 팀 수(= 용량)에 맞춰 작업을 다시 배치.
 * 기존 차수를 모두 지우고, 같은 팀 수 프로필로 다시 만들어 FFD 재패킹.
 * 한 차수에 다 못 들어가면 새 차수를 뒤에 추가. 빈 차수는 사라짐.
 */
export async function rebalancePhases(projectId: string): Promise<RebalanceSummary> {
  if (!projectId) return { ok: false, error: '프로젝트 id 가 없습니다' }

  const { supabase } = await requireMember()

  const { data: phRows, error: phErr } = await supabase
    .from('relocation_phases')
    .select('id, phase_no, required_teams')
    .eq('project_id', projectId)
    .order('phase_no')
  if (phErr) return { ok: false, error: '차수 조회 실패: ' + phErr.message }
  const phases = (phRows ?? []) as {
    id: string
    phase_no: number
    required_teams: number
  }[]
  if (phases.length === 0) {
    return { ok: false, error: '먼저 「차수 자동 분할」을 실행하세요' }
  }

  const { data: ptRows, error: ptErr } = await supabase
    .from('relocation_phase_tasks')
    .select('facility_id, task_kind, estimated_minutes')
    .in(
      'phase_id',
      phases.map((p) => p.id),
    )
  if (ptErr) return { ok: false, error: '차수 작업 조회 실패: ' + ptErr.message }
  const tasks = (ptRows ?? []) as {
    facility_id: string
    task_kind: string
    estimated_minutes: number | null
  }[]
  if (tasks.length === 0) {
    return { ok: false, error: '차수에 배정된 작업이 없습니다' }
  }

  // 작업을 차수별 팀 수(용량)에 맞춰 재패킹
  const existingTeams = phases.map((p) => p.required_teams)
  const items = tasks.map((t, i) => ({
    id: String(i),
    minutes: t.estimated_minutes ?? 0,
  }))
  const packed = rebalanceIntoPhases(items, existingTeams)

  // 기존 차수 삭제 (phase_tasks cascade)
  const { error: delErr } = await supabase
    .from('relocation_phases')
    .delete()
    .eq('project_id', projectId)
  if (delErr) return { ok: false, error: '기존 차수 삭제 실패: ' + delErr.message }

  // 재생성
  let phaseNo = 0
  for (const pp of packed) {
    phaseNo += 1
    const { data: phaseRow, error: pErr } = await supabase
      .from('relocation_phases')
      .insert({
        project_id: projectId,
        phase_no: phaseNo,
        required_teams: pp.teams,
        estimated_minutes: pp.minutes,
        status: '계획',
      })
      .select('id')
      .single()
    if (pErr || !phaseRow) {
      return { ok: false, error: '차수 저장 실패: ' + (pErr?.message ?? '알 수 없음') }
    }
    const phaseId = (phaseRow as { id: string }).id

    const { error: tErr } = await supabase.from('relocation_phase_tasks').insert(
      pp.unitIds.map((idx) => {
        const t = tasks[Number(idx)]
        return {
          phase_id: phaseId,
          facility_id: t.facility_id,
          task_kind: t.task_kind,
          cores_continuous: 0,
          cores_noncontinuous: 0,
          estimated_minutes: t.estimated_minutes ?? 0,
        }
      }),
    )
    if (tErr) return { ok: false, error: '차수 작업 저장 실패: ' + tErr.message }
  }

  revalidatePath(`/relocation/${projectId}`)
  return { ok: true, phaseCount: packed.length }
}
