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

export const DEFAULT_WINDOW_START = '02:00'
export const DEFAULT_WINDOW_END = '05:00'

// 'HH:MM' 또는 'HH:MM:SS' → 그날 0시 기준 분
function timeToMin(t: string): number {
  const parts = t.split(':')
  return (Number(parts[0]) || 0) * 60 + (Number(parts[1]) || 0)
}

// 시간대 길이(분). 종료 ≤ 시작이면 자정을 넘는 것으로 본다 (예: 23:00~02:00).
export function windowMinutes(start: string, end: string): number {
  const s = timeToMin(start)
  let e = timeToMin(end)
  if (e <= s) e += 1440
  return e - s
}

// 두 시간대가 겹치는지 — 자정을 넘지 않는 야간 시간대 기준 단순 비교.
export function windowsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return (
    timeToMin(aStart) < timeToMin(bEnd) && timeToMin(bStart) < timeToMin(aEnd)
  )
}

export type PackUnit = {
  id: string // 차수 작업(phase_task) 식별자
  minutes: number
}

export type PackedPhase = {
  teams: number
  windowStart: string
  windowEnd: string
  unitIds: string[]
  minutes: number
  overCapacity: boolean
}

export type RebalanceBin = {
  teams: number
  windowStart: string
  windowEnd: string
}

/**
 * 작업 단위를 기존 차수(팀 수·시간대가 정해진)에 FFD 로 다시 채워 넣는다.
 * 차수 용량 = 팀 수 × 시간대 길이(분).
 *
 * @returns 비지 않은 차수만. 기존 차수에 다 안 들어가면 새 차수(기본 02~05시)를 뒤에 추가.
 */
export function rebalanceIntoPhases(
  units: PackUnit[],
  existing: RebalanceBin[],
): PackedPhase[] {
  const work = [...units].sort((a, b) => b.minutes - a.minutes)

  const bins = existing.map((b) => ({
    teams: b.teams,
    windowStart: b.windowStart,
    windowEnd: b.windowEnd,
    capacity: Math.max(1, b.teams) * windowMinutes(b.windowStart, b.windowEnd),
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
      windowStart: b.windowStart,
      windowEnd: b.windowEnd,
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
        windowStart: DEFAULT_WINDOW_START,
        windowEnd: DEFAULT_WINDOW_END,
        unitIds: ep.unitFacilityIds,
        minutes: ep.minutes,
        overCapacity: ep.overCapacity,
      })
    }
  }

  return result
}

// ── 동시작업 그룹 — 절체 시 같은 차수에 묶여야 하는 시설 ────────────────
//
// 절체(cutover)는 케이블 양끝 함체에서 동시에 작업해야 회선이 안 끊긴다.
// 기설이 아닌(절체 대상) 케이블로 연결된 시설들은 한 차수에서 분리되면 안 됨.
// union-find 로 연결 요소를 구해 시설 → 그룹 번호 맵을 반환한다.
export function buildSimultaneityGroups(
  facilityIds: string[],
  cables: { from_facility_id: string; to_facility_id: string; status: string }[],
): Map<string, number> {
  const parent = new Map<string, string>()
  for (const id of facilityIds) parent.set(id, id)

  function find(x: string): string {
    let r = x
    let p = parent.get(r)
    while (p !== undefined && p !== r) {
      r = p
      p = parent.get(r)
    }
    return r
  }

  for (const c of cables) {
    if (c.status === 'existing') continue
    const a = c.from_facility_id
    const b = c.to_facility_id
    if (!parent.has(a) || !parent.has(b)) continue
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }

  const groupOf = new Map<string, number>()
  const rootNum = new Map<string, number>()
  let next = 0
  for (const id of facilityIds) {
    const r = find(id)
    let g = rootNum.get(r)
    if (g === undefined) {
      g = next
      next += 1
      rootNum.set(r, g)
    }
    groupOf.set(id, g)
  }
  return groupOf
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
