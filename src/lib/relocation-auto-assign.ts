// 지장이설 자동 코어 배정 — 순수 알고리즘 (서버 액션에서 사용).
//
// 사양: docs/RELOCATION_DESIGN_PLAN.md § 6-1 + CLAUDE.md Step C-4
//   설계자가 종단(is_terminal)으로 표시한 코어 배정 = 회선의 양 끝.
//   한 회선·세그먼트의 종단은 양 끝 케이블 2개에 분포한다
//   (1코어 회선 = 케이블당 1행, 2코어 회선 = 케이블당 2행).
//   케이블 그래프 BFS 로 두 종단 케이블 사이 경유 케이블을 찾아,
//   각 경유 케이블에 빈 코어(가장 작은 번호)를 회선 코어 수만큼 배정한다.
//   코어 배정 1행 = 코어 1개.

import type { CoreLifecycle } from './relocation'

export type AutoAssignCable = {
  id: string
  from_facility_id: string
  to_facility_id: string
  spec: string
  status: string // 'existing' | 'relocating' | 'new' | 'removing'
}

export type AutoAssignAssignment = {
  circuit_id: string | null
  segment_idx: number
  cable_id: string
  core_range_start: number
  core_range_end: number
  lifecycle: CoreLifecycle
  is_terminal: boolean
  is_auto_assigned: boolean
}

export type AutoAssignCircuit = {
  id: string
  circuit_id: string // 표시용 회선번호
}

export type PlannedAssignment = {
  circuit_id: string
  segment_idx: number
  cable_id: string
  core_range_start: number
  core_range_end: number
  lifecycle: CoreLifecycle
}

export type AutoAssignResultItem = {
  label: string // 회선번호 (+ 세그먼트)
  status: 'assigned' | 'skipped'
  detail: string
}

export type AutoAssignPlan = {
  inserts: PlannedAssignment[]
  results: AutoAssignResultItem[]
}

// 케이블 규격 문자열에서 코어 수 추출 ('144C' → 144, '1C(드랍)' → 1)
export function cableSpecCoreCount(spec: string): number {
  const m = spec.match(/(\d+)/)
  return m ? Number.parseInt(m[1], 10) : 0
}

/**
 * 케이블 그래프 BFS — 두 케이블을 잇는 최단 케이블 경로.
 * 케이블끼리는 시설을 공유하면 인접. 결과는 [t1, ...경유, t2] 순서.
 * 경로가 없으면 null. t1 === t2 면 [t1].
 */
export function findCablePath(
  t1: string,
  t2: string,
  cables: AutoAssignCable[],
): string[] | null {
  if (t1 === t2) return [t1]

  const cableById = new Map(cables.map((c) => [c.id, c]))
  if (!cableById.has(t1) || !cableById.has(t2)) return null

  // 시설 → 그 시설에 닿는 케이블 목록
  const cablesAtFacility = new Map<string, string[]>()
  for (const c of cables) {
    for (const f of [c.from_facility_id, c.to_facility_id]) {
      const arr = cablesAtFacility.get(f)
      if (arr) arr.push(c.id)
      else cablesAtFacility.set(f, [c.id])
    }
  }

  const prev = new Map<string, string | null>([[t1, null]])
  const queue: string[] = [t1]
  while (queue.length > 0) {
    const cur = queue.shift() as string
    if (cur === t2) {
      const path: string[] = []
      let n: string | null = cur
      while (n) {
        path.push(n)
        n = prev.get(n) ?? null
      }
      return path.reverse()
    }
    const curCable = cableById.get(cur)
    if (!curCable) continue
    for (const f of [curCable.from_facility_id, curCable.to_facility_id]) {
      for (const nb of cablesAtFacility.get(f) ?? []) {
        if (!prev.has(nb)) {
          prev.set(nb, cur)
          queue.push(nb)
        }
      }
    }
  }
  return null
}

/**
 * 점유된 코어 범위들을 피해 폭 1짜리 빈 코어를 `count` 개 찾는다 (작은 번호 우선).
 * 코어 배정 1행 = 코어 1개 모델이라 각 코어를 개별로 반환. 부족하면 null.
 */
export function findFreeCores(
  occupied: { start: number; end: number }[],
  count: number,
  maxCores: number,
): number[] | null {
  const cores: number[] = []
  for (let c = 1; c <= maxCores && cores.length < count; c += 1) {
    const clash = occupied.some((o) => c >= o.start && c <= o.end)
    if (!clash) cores.push(c)
  }
  return cores.length === count ? cores : null
}

/**
 * 자동 코어 배정 계획 수립 (순수 함수 — DB 접근 없음).
 *
 * @param input.assignments 자동(is_auto_assigned) row 를 제외한 배정 목록
 *   (종단·사람 입력·기설 preexisting 만 포함). 자동 row 는 호출 측에서 제거 후 전달.
 */
export function planAutoAssignments(input: {
  cables: AutoAssignCable[]
  circuits: AutoAssignCircuit[]
  assignments: AutoAssignAssignment[]
}): AutoAssignPlan {
  const { cables, circuits, assignments } = input
  const cableById = new Map(cables.map((c) => [c.id, c]))
  const circuitById = new Map(circuits.map((c) => [c.id, c]))

  // 케이블별 점유 범위 — 모든 배정 (preexisting·종단·사람 입력)
  const occupiedByCable = new Map<string, { start: number; end: number }[]>()
  function occ(cableId: string): { start: number; end: number }[] {
    let arr = occupiedByCable.get(cableId)
    if (!arr) {
      arr = []
      occupiedByCable.set(cableId, arr)
    }
    return arr
  }
  for (const a of assignments) {
    occ(a.cable_id).push({ start: a.core_range_start, end: a.core_range_end })
  }

  // 이미 (회선·세그먼트)가 배정된 케이블 — 사람 입력 경유 배정 보존용
  const assignedCableKey = new Set<string>()
  for (const a of assignments) {
    if (a.circuit_id) {
      assignedCableKey.add(`${a.circuit_id}|${a.segment_idx}|${a.cable_id}`)
    }
  }

  // 종단 grouping — (circuit_id, segment_idx)
  const terminalGroups = new Map<string, AutoAssignAssignment[]>()
  for (const a of assignments) {
    if (!a.is_terminal || !a.circuit_id) continue
    const key = `${a.circuit_id}|${a.segment_idx}`
    const arr = terminalGroups.get(key)
    if (arr) arr.push(a)
    else terminalGroups.set(key, [a])
  }

  const inserts: PlannedAssignment[] = []
  const results: AutoAssignResultItem[] = []

  for (const key of [...terminalGroups.keys()].sort()) {
    const group = terminalGroups.get(key) as AutoAssignAssignment[]
    const sep = key.lastIndexOf('|')
    const circuitDbId = key.slice(0, sep)
    const segment = Number.parseInt(key.slice(sep + 1), 10)
    const circuit = circuitById.get(circuitDbId)
    const label =
      (circuit ? circuit.circuit_id : '(삭제된 회선)') +
      (segment > 0 ? ` · 세그먼트 ${segment}` : '')

    // 종단을 케이블별로 묶기 — 양 끝 케이블 2개여야 함
    const byCable = new Map<string, AutoAssignAssignment[]>()
    for (const t of group) {
      const arr = byCable.get(t.cable_id)
      if (arr) arr.push(t)
      else byCable.set(t.cable_id, [t])
    }
    const terminalCableIds = [...byCable.keys()]

    if (terminalCableIds.length !== 2) {
      results.push({
        label,
        status: 'skipped',
        detail:
          terminalCableIds.length < 2
            ? '종단이 한 케이블에만 표시됨 — 회선 양 끝 2개 케이블을 종단으로 표시하세요'
            : `종단이 ${terminalCableIds.length}개 케이블에 표시됨 — 양 끝 2개 케이블이어야 합니다`,
      })
      continue
    }

    const [t1, t2] = terminalCableIds
    const coreCount = (byCable.get(t1) as AutoAssignAssignment[]).length
    const t2Count = (byCable.get(t2) as AutoAssignAssignment[]).length
    if (coreCount !== t2Count) {
      results.push({
        label,
        status: 'skipped',
        detail: `양 끝 종단 코어 수가 다릅니다 (${coreCount} vs ${t2Count})`,
      })
      continue
    }

    // 경로 탐색 — 철거(removing) 케이블은 경유로 쓰지 않음 (종단 케이블은 허용)
    const graphCables = cables.filter(
      (c) => c.status !== 'removing' || c.id === t1 || c.id === t2,
    )
    const path = findCablePath(t1, t2, graphCables)
    if (!path) {
      results.push({
        label,
        status: 'skipped',
        detail: '두 종단을 잇는 케이블 경로를 찾을 수 없습니다',
      })
      continue
    }

    const intermediates = path.slice(1, -1)
    if (intermediates.length === 0) {
      results.push({
        label,
        status: 'assigned',
        detail: '경유 케이블 없음 — 두 종단이 바로 연결됨',
      })
      continue
    }

    // lifecycle — 종단들이 모두 같으면 그 값, 다르면 신설로
    const lifecycles = new Set(group.map((t) => t.lifecycle))
    const lifecycle: CoreLifecycle =
      lifecycles.size === 1 ? ([...lifecycles][0] as CoreLifecycle) : 'new'

    // 경유 케이블마다 빈 코어 coreCount 개 — 하나라도 실패하면 이 회선 전체 건너뜀
    const planned: PlannedAssignment[] = []
    let failReason: string | null = null
    for (const cid of intermediates) {
      // 사람이 이미 이 회선·세그먼트를 배정한 케이블이면 보존 (건너뜀)
      if (assignedCableKey.has(`${circuitDbId}|${segment}|${cid}`)) continue
      const cable = cableById.get(cid)
      if (!cable) {
        failReason = '경로상 케이블 정보가 누락되었습니다'
        break
      }
      const maxCores = cableSpecCoreCount(cable.spec)
      if (maxCores < coreCount) {
        failReason = `${cable.spec} 케이블이 코어 ${coreCount}개를 담기엔 작습니다`
        break
      }
      const cores = findFreeCores(occ(cid), coreCount, maxCores)
      if (!cores) {
        failReason = `${cable.spec} 케이블에 빈 코어 ${coreCount}개가 없습니다`
        break
      }
      for (const core of cores) {
        planned.push({
          circuit_id: circuitDbId,
          segment_idx: segment,
          cable_id: cid,
          core_range_start: core,
          core_range_end: core,
          lifecycle,
        })
        // 메모리 점유 갱신 — 같은 실행 안 다음 회선이 피하도록
        occ(cid).push({ start: core, end: core })
      }
    }

    if (failReason) {
      results.push({ label, status: 'skipped', detail: failReason })
      continue
    }

    inserts.push(...planned)
    const cableCount = new Set(planned.map((p) => p.cable_id)).size
    results.push({
      label,
      status: 'assigned',
      detail:
        planned.length > 0
          ? `경유 케이블 ${cableCount}개에 코어 ${coreCount}개씩 배정 (총 ${planned.length}행)`
          : '경유 케이블이 이미 모두 배정되어 있습니다',
    })
  }

  return { inserts, results }
}
