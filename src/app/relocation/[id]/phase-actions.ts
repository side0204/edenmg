'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  planPhases,
  rebalanceIntoPhases,
  buildSimultaneityGroups,
  type WorkUnit,
  type RebalanceBin,
} from '@/lib/relocation-phase-planner'
import {
  findCutoverCables,
  TIME_NEW_CLOSURE,
  type ClosureType,
} from '@/lib/relocation'

type SimCable = {
  from_facility_id: string
  to_facility_id: string
  status: string
}

/**
 * 시설별 작업시간 + 케이블 토폴로지 → 동시작업 그룹 단위.
 *   - 절체 대상 케이블로 묶인 시설은 같은 그룹 = 같은 차수.
 *   - units: 그룹을 하나의 패킹 단위로 (facilityId 자리에 그룹키).
 *   - membersByGroup: 그룹키 → 소속 시설(작업시간 > 0) 목록.
 *   - simultaneityOf: 시설 → 동시작업 그룹키 (그룹에 시설 2개 이상일 때만, 아니면 null).
 */
function buildGroupUnits(
  facilityMinutes: Map<string, number>,
  cables: SimCable[],
): {
  units: WorkUnit[]
  membersByGroup: Map<string, string[]>
  simultaneityOf: Map<string, string | null>
} {
  const allIds = new Set<string>()
  for (const c of cables) {
    allIds.add(c.from_facility_id)
    allIds.add(c.to_facility_id)
  }
  for (const id of facilityMinutes.keys()) allIds.add(id)

  const groupOf = buildSimultaneityGroups([...allIds], cables)

  const membersByGroup = new Map<string, string[]>()
  const minutesByGroup = new Map<string, number>()
  for (const [fid, min] of facilityMinutes) {
    if (min <= 0) continue
    const key = `g${groupOf.get(fid) ?? -1}`
    const arr = membersByGroup.get(key)
    if (arr) arr.push(fid)
    else membersByGroup.set(key, [fid])
    minutesByGroup.set(key, (minutesByGroup.get(key) ?? 0) + min)
  }

  const units: WorkUnit[] = [...minutesByGroup.entries()].map(([key, minutes]) => ({
    facilityId: key,
    minutes,
  }))

  const simultaneityOf = new Map<string, string | null>()
  for (const [key, members] of membersByGroup) {
    for (const fid of members) {
      simultaneityOf.set(fid, members.length >= 2 ? key : null)
    }
  }

  return { units, membersByGroup, simultaneityOf }
}

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

  // 1. 데이터 로드 — 케이블·시설·공종량·공종 마스터
  const { data: cRows, error: cErr } = await supabase
    .from('relocation_cables')
    .select('id, from_facility_id, to_facility_id, status')
    .eq('project_id', projectId)
  if (cErr) return { ok: false, error: '케이블 조회 실패: ' + cErr.message }

  const { data: fRows, error: fErr } = await supabase
    .from('relocation_facilities')
    .select('id, closure_type, install_status')
    .eq('project_id', projectId)
  if (fErr) return { ok: false, error: '시설 조회 실패: ' + fErr.message }

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
    id: string
    from_facility_id: string
    to_facility_id: string
    status: string
  }[]
  const facilities = (fRows ?? []) as {
    id: string
    closure_type: ClosureType
    install_status: string | null
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

  // 절단 절체 — 신설 접속함체 + 기설 케이블. 함체 신설(절단) +20분 (사양 § 2-5).
  const cutover = findCutoverCables(cables, facilities)
  for (const fid of cutover.facilityIds) {
    minutesByFacility.set(
      fid,
      (minutesByFacility.get(fid) ?? 0) + TIME_NEW_CLOSURE,
    )
  }

  const roundedMinutes = new Map<string, number>()
  for (const [fid, min] of minutesByFacility) {
    const r = Math.round(min)
    if (r > 0) roundedMinutes.set(fid, r)
  }
  if (roundedMinutes.size === 0) {
    return {
      ok: false,
      error:
        '공종량이 입력된 시설이 없습니다. 시설 정보 패널에서 공종·수량을 먼저 입력하세요.',
    }
  }

  // 3. 동시작업 그룹 단위로 차수 분할
  //    절체 대상 케이블로 묶인 시설들은 한 차수에서 분리되면 안 됨.
  const { units, membersByGroup, simultaneityOf } = buildGroupUnits(
    roundedMinutes,
    cables,
  )
  const plan = planPhases(units)

  // task_kind — 신설 케이블 연결 또는 기설 케이블 절단 절체 시설은 '함체신설_절단'
  const facilitiesWithNewCable = new Set<string>()
  for (const c of cables) {
    if (c.status === 'new') {
      facilitiesWithNewCable.add(c.from_facility_id)
      facilitiesWithNewCable.add(c.to_facility_id)
    }
  }
  for (const fid of cutover.facilityIds) facilitiesWithNewCable.add(fid)

  // 4. 기존 차수 삭제 (phase_tasks·task_pairs cascade)
  const { error: delErr } = await supabase
    .from('relocation_phases')
    .delete()
    .eq('project_id', projectId)
  if (delErr) return { ok: false, error: '기존 차수 삭제 실패: ' + delErr.message }

  // 5. 차수 + 차수별 작업 insert (그룹 → 소속 시설 전개)
  const totalFacilities = [...membersByGroup.values()].reduce(
    (acc, m) => acc + m.length,
    0,
  )
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

    const taskRows: Record<string, unknown>[] = []
    for (const groupKey of ph.unitFacilityIds) {
      for (const fid of membersByGroup.get(groupKey) ?? []) {
        taskRows.push({
          phase_id: phaseId,
          facility_id: fid,
          task_kind: facilitiesWithNewCable.has(fid) ? '함체신설_절단' : '기설접속',
          cores_continuous: 0,
          cores_noncontinuous: 0,
          estimated_minutes: roundedMinutes.get(fid) ?? 0,
          simultaneity_group: simultaneityOf.get(fid) ?? null,
        })
      }
    }
    const { error: tErr } = await supabase
      .from('relocation_phase_tasks')
      .insert(taskRows)
    if (tErr) return { ok: false, error: '차수 작업 저장 실패: ' + tErr.message }
  }

  revalidatePath(`/relocation/${projectId}`)

  return {
    ok: true,
    phaseCount: plan.phases.length,
    teams: plan.teams,
    totalMinutes: plan.totalMinutes,
    facilityCount: totalFacilities,
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

/** 차수별 시공 시간대(window_start~window_end) 변경. 용량 = 팀 수 × 시간대 길이. */
export async function updatePhaseWindow(
  projectId: string,
  phaseId: string,
  windowStart: string,
  windowEnd: string,
): Promise<SimpleResult> {
  if (!projectId || !phaseId) return { ok: false, error: '대상이 올바르지 않습니다' }
  const re = /^\d{2}:\d{2}$/
  if (!re.test(windowStart) || !re.test(windowEnd)) {
    return { ok: false, error: '시간 형식이 올바르지 않습니다 (HH:MM)' }
  }
  if (windowStart === windowEnd) {
    return { ok: false, error: '시작·종료 시각이 같을 수 없습니다' }
  }

  const { supabase } = await requireMember()

  const { error } = await supabase
    .from('relocation_phases')
    .update({ window_start: windowStart, window_end: windowEnd })
    .eq('id', phaseId)
  if (error) return { ok: false, error: '시간대 저장 실패: ' + error.message }

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
    .select('id, phase_no, required_teams, window_start, window_end')
    .eq('project_id', projectId)
    .order('phase_no')
  if (phErr) return { ok: false, error: '차수 조회 실패: ' + phErr.message }
  const phases = (phRows ?? []) as {
    id: string
    phase_no: number
    required_teams: number
    window_start: string
    window_end: string
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

  const { data: cRows, error: cErr } = await supabase
    .from('relocation_cables')
    .select('from_facility_id, to_facility_id, status')
    .eq('project_id', projectId)
  if (cErr) return { ok: false, error: '케이블 조회 실패: ' + cErr.message }
  const cables = (cRows ?? []) as SimCable[]

  // 시설별 작업시간·task_kind 수집
  const facilityMinutes = new Map<string, number>()
  const taskKindByFacility = new Map<string, string>()
  for (const t of tasks) {
    facilityMinutes.set(t.facility_id, t.estimated_minutes ?? 0)
    taskKindByFacility.set(t.facility_id, t.task_kind)
  }

  // 동시작업 그룹 단위로 차수별 팀 수(용량)에 맞춰 재패킹
  const { units, membersByGroup, simultaneityOf } = buildGroupUnits(
    facilityMinutes,
    cables,
  )
  const existing: RebalanceBin[] = phases.map((p) => ({
    teams: p.required_teams,
    windowStart: p.window_start,
    windowEnd: p.window_end,
  }))
  const packed = rebalanceIntoPhases(
    units.map((u) => ({ id: u.facilityId, minutes: u.minutes })),
    existing,
  )

  // 기존 차수 삭제 (phase_tasks cascade)
  const { error: delErr } = await supabase
    .from('relocation_phases')
    .delete()
    .eq('project_id', projectId)
  if (delErr) return { ok: false, error: '기존 차수 삭제 실패: ' + delErr.message }

  // 재생성 (그룹 → 소속 시설 전개)
  let phaseNo = 0
  for (const pp of packed) {
    phaseNo += 1
    const { data: phaseRow, error: pErr } = await supabase
      .from('relocation_phases')
      .insert({
        project_id: projectId,
        phase_no: phaseNo,
        required_teams: pp.teams,
        window_start: pp.windowStart,
        window_end: pp.windowEnd,
        estimated_minutes: pp.minutes,
        status: '계획',
      })
      .select('id')
      .single()
    if (pErr || !phaseRow) {
      return { ok: false, error: '차수 저장 실패: ' + (pErr?.message ?? '알 수 없음') }
    }
    const phaseId = (phaseRow as { id: string }).id

    const taskRows: Record<string, unknown>[] = []
    for (const groupKey of pp.unitIds) {
      for (const fid of membersByGroup.get(groupKey) ?? []) {
        taskRows.push({
          phase_id: phaseId,
          facility_id: fid,
          task_kind: taskKindByFacility.get(fid) ?? '기설접속',
          cores_continuous: 0,
          cores_noncontinuous: 0,
          estimated_minutes: facilityMinutes.get(fid) ?? 0,
          simultaneity_group: simultaneityOf.get(fid) ?? null,
        })
      }
    }
    const { error: tErr } = await supabase
      .from('relocation_phase_tasks')
      .insert(taskRows)
    if (tErr) return { ok: false, error: '차수 작업 저장 실패: ' + tErr.message }
  }

  revalidatePath(`/relocation/${projectId}`)
  return { ok: true, phaseCount: packed.length }
}
