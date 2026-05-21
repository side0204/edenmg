// 지장이설 차수 자동 분할 — 순수 알고리즘 (서버 액션에서 사용).
//
// 사양: docs/RELOCATION_DESIGN_PLAN.md § 6-3
//   차수(phase) = 새벽 02~05시 시공 단위. 한 차수 가용 시간 = 팀 수 × 180분.
//   시설별 작업시간(공종량 합계)을 받아 차수로 나눈다.
//
// v1 범위: 시설 단위 FFD(First-Fit-Decreasing) 빈패킹 + 팀 수 자동 결정.
//   - 작업시간 = 시설의 공종량(relocation_facility_tasks) 합계
//   - 동시작업 페어링(simultaneity)·의존성 DAG·task_pairs 는 후속
//     (splice 입력 흐름이 갖춰진 뒤. § 6-3 step 3·4·9)

export const SHIFT_MINUTES = 180 // 02:00 ~ 05:00
export const MAX_TEAMS = 4
export const MIN_TEAMS = 2

export type WorkUnit = {
  facilityId: string
  minutes: number
}

export type PlannedPhase = {
  unitFacilityIds: string[]
  minutes: number
  overCapacity: boolean // 단일 시설이 4팀 가용시간(720분)을 초과
}

export type PhasePlan = {
  teams: number
  capacityMinutes: number // teams × 180
  phases: PlannedPhase[]
  totalMinutes: number
}

/**
 * 시설 작업시간 목록을 차수로 분할.
 *
 * 1. 가장 큰 시설이 들어갈 최소 팀 수(2~4) 결정
 * 2. 차수 가용 = 팀 수 × 180분
 * 3. 작업시간 내림차순으로 FFD 빈패킹 — 들어갈 차수가 없으면 새 차수
 */
export function planPhases(units: WorkUnit[]): PhasePlan {
  const work = units
    .filter((u) => u.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)

  if (work.length === 0) {
    return { teams: MIN_TEAMS, capacityMinutes: MIN_TEAMS * SHIFT_MINUTES, phases: [], totalMinutes: 0 }
  }

  // 가장 큰 시설이 한 차수에 들어갈 최소 팀 수
  const maxUnit = work[0].minutes
  let teams = MIN_TEAMS
  while (teams < MAX_TEAMS && maxUnit > teams * SHIFT_MINUTES) {
    teams += 1
  }
  const capacityMinutes = teams * SHIFT_MINUTES

  // FFD 빈패킹
  const phases: PlannedPhase[] = []
  for (const u of work) {
    let placed = false
    for (const ph of phases) {
      if (ph.minutes + u.minutes <= capacityMinutes) {
        ph.unitFacilityIds.push(u.facilityId)
        ph.minutes += u.minutes
        placed = true
        break
      }
    }
    if (!placed) {
      phases.push({
        unitFacilityIds: [u.facilityId],
        minutes: u.minutes,
        overCapacity: u.minutes > capacityMinutes,
      })
    }
  }

  return {
    teams,
    capacityMinutes,
    phases,
    totalMinutes: work.reduce((acc, u) => acc + u.minutes, 0),
  }
}

// ── 차수 재조정 — 차수별 팀 수(용량)를 존중한 재패킹 ────────────────────
//
// 자동 분할 후 실제 시공 시, 차수마다 투입 가능한 팀 수가 다를 수 있다.
// 설계자가 차수별 팀 수를 조정하면 그 용량에 맞춰 작업을 다시 배치한다.

export type PackUnit = {
  id: string // 차수 작업(phase_task) 식별자
  minutes: number
}

export type PackedPhase = {
  teams: number
  unitIds: string[]
  minutes: number
  overCapacity: boolean
}

/**
 * 작업 단위를 기존 차수(팀 수가 정해진)에 FFD 로 다시 채워 넣는다.
 *
 * @param units        재배치할 작업 단위
 * @param existingTeams 기존 차수들의 팀 수 (차수 번호 순)
 * @returns 비지 않은 차수만. 기존 차수에 다 안 들어가면 새 차수를 뒤에 추가.
 */
export function rebalanceIntoPhases(
  units: PackUnit[],
  existingTeams: number[],
): PackedPhase[] {
  const work = [...units].sort((a, b) => b.minutes - a.minutes)

  const bins = existingTeams.map((teams) => ({
    teams,
    capacity: Math.max(1, teams) * SHIFT_MINUTES,
    ids: [] as string[],
    minutes: 0,
  }))

  const leftover: PackUnit[] = []
  for (const u of work) {
    let placed = false
    for (const bin of bins) {
      if (bin.minutes + u.minutes <= bin.capacity) {
        bin.ids.push(u.id)
        bin.minutes += u.minutes
        placed = true
        break
      }
    }
    if (!placed) leftover.push(u)
  }

  const result: PackedPhase[] = bins
    .filter((b) => b.ids.length > 0)
    .map((b) => ({
      teams: b.teams,
      unitIds: b.ids,
      minutes: b.minutes,
      overCapacity: b.minutes > b.capacity,
    }))

  // 기존 차수에 못 들어간 작업 → 새 차수로 (planPhases 가 팀 수 자동 결정)
  if (leftover.length > 0) {
    const extra = planPhases(
      leftover.map((l) => ({ facilityId: l.id, minutes: l.minutes })),
    )
    for (const ep of extra.phases) {
      result.push({
        teams: extra.teams,
        unitIds: ep.unitFacilityIds,
        minutes: ep.minutes,
        overCapacity: ep.overCapacity,
      })
    }
  }

  return result
}

// 분 → 'H시간 M분' 표시
export function formatMinutes(min: number): string {
  if (min <= 0) return '0분'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}분`
  if (m === 0) return `${h}시간`
  return `${h}시간 ${m}분`
}
