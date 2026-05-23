// 지장이설 — 케이블 우선 정렬 알고리즘 (sibling-aware tree layout).
//
// owner 요청 (2026-05-23):
//   "가장 가까운 경로(거리·꺾임 최소)로 탐색, 시설물 출발/도착을 V/H/45° 로 하고
//    다른 시설물과 케이블이 교차하면 도착 시설물(나중 그려진)을 이동."
//
// 핵심 아이디어 (이전 시도들에서 학습):
//   - 자연 각도 그대로 snap 하면 같은 부모의 자식들이 같은 방위로 몰려 cable 겹침.
//   - Refinement(force-directed) 는 tree edge 까지 흔들어 V/H 정렬을 깸.
//   → 부모의 자식들에 8 방위를 「겹치지 않게」 배정. 한 자식 = 한 방위.
//
// 알고리즘 (sibling-aware BFS):
//   1. 케이블 그래프 구성. degree 가장 높은 시설을 root (위치 유지).
//   2. BFS. 각 부모 노드에서:
//      a. 자식 후보 = 미방문 인접 시설들
//      b. 「부모 → 자기 방향」(incoming) 의 반대 방향은 후보에서 제외 (자식이 부모쪽으로 가는 것 방지)
//      c. 자식 N 명에게 8 방위 중 N 개 선택 — 헝가리안식 매칭 (cost = V/H 우선 + 자연각도 근접)
//      d. 각 자식: 부모 위치에서 선택된 방위로 거리(자연 거리 또는 MIN_DISTANCE)만큼 이동
//      e. 충돌 시 거리 늘려가며 재시도
//   3. 동일 사이클 안의 「뒤로 가는 edge」 는 BFS tree 외 (cycle edge). 위치 조정 없음 —
//      TopologyCanvas 의 Manhattan 라우팅(Phase 2.5)과 장애물 우회(Phase 3) 가 시각 처리.
//
// Refinement(force-directed) 단계는 제거 — tree edge V/H 정렬 보장이 더 중요.
//
// 입력 — 시설 ID 목록, 케이블 양 끝 ID 목록, 현재 위치 Map.
// 출력 — { id, x, y }[] (변경된 시설만).

type Position = { x: number; y: number }
type Facility = { id: string }
type Cable = { from_facility_id: string; to_facility_id: string }

export type SnapPosition = { id: string; x: number; y: number }

// 8 방위 — V/H 4 + 대각선 4
const CARDINAL_DIRS = [0, Math.PI / 2, Math.PI, -Math.PI / 2]
const DIAGONAL_DIRS = [Math.PI / 4, (3 * Math.PI) / 4, -(3 * Math.PI) / 4, -Math.PI / 4]
const ALL_DIRS = [...CARDINAL_DIRS, ...DIAGONAL_DIRS]

const MIN_DISTANCE = 150 // 기본 자식 배치 거리 (자연 거리가 더 크면 자연 거리 사용)
const MIN_FACILITY_GAP = 120 // 시설끼리 최소 간격
const CABLE_CROSS_CLEARANCE = 55 // 케이블이 다른 시설 중심에서 이 거리 안이면 가로지름
const MAX_DISTANCE_MULT = 2.5 // 충돌 시 거리 늘리는 한계
const DISTANCE_GROWTH = 1.3
// V/H 선호도 (비용 식에서 카디널 가산점) — 자연각도와 무관하게 카디널이 우선됨
const CARDINAL_BONUS = 0.45

function angleDist(a: number, b: number): number {
  let d = Math.abs(a - b)
  if (d > Math.PI) d = 2 * Math.PI - d
  return d
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI
  while (a < -Math.PI) a += 2 * Math.PI
  return a
}

function isCardinal(dir: number): boolean {
  return CARDINAL_DIRS.some((c) => Math.abs(wrapAngle(c - dir)) < 0.01)
}

// 한 방위에 자식을 배치할 때의 비용 — 자연각도에서 떨어진 정도. 카디널(V/H) 은 보너스로 비용 감소.
function dirCost(dir: number, naturalAngle: number): number {
  const dist = angleDist(dir, naturalAngle)
  const bonus = isCardinal(dir) ? -CARDINAL_BONUS : 0
  return dist + bonus
}

// 헝가리안 (greedy 근사) — N 자식을 8 방위 중 N 개에 배정. 전체 cost 최소화.
//   완벽한 헝가리안 알고리즘 대신 greedy: 가장 cost 낮은 (자식,방위) 짝을 차례로 확정.
//   8 방위, 자식 수 N≤8 가정 (큰 경우 자연각도 따라 일부 중복 허용).
function assignChildrenToDirections(
  children: { id: string; naturalAngle: number }[],
  availableDirs: number[],
): Map<string, number> {
  const result = new Map<string, number>()
  const remainingChildren = new Set(children.map((c) => c.id))
  const remainingDirs = new Set(availableDirs)
  const childNatural = new Map(children.map((c) => [c.id, c.naturalAngle]))

  // 모든 (자식, 방위) 쌍의 cost 계산
  while (remainingChildren.size > 0 && remainingDirs.size > 0) {
    let bestPair: { cId: string; dir: number; cost: number } | null = null
    for (const cId of remainingChildren) {
      const nat = childNatural.get(cId)!
      for (const dir of remainingDirs) {
        const cost = dirCost(dir, nat)
        if (!bestPair || cost < bestPair.cost) {
          bestPair = { cId, dir, cost }
        }
      }
    }
    if (!bestPair) break
    result.set(bestPair.cId, bestPair.dir)
    remainingChildren.delete(bestPair.cId)
    remainingDirs.delete(bestPair.dir)
  }

  // 자식이 8 명 초과해서 방위가 모자라는 경우 — 자연각도 가장 가까운 방위로 배정 (중복 허용)
  for (const cId of remainingChildren) {
    const nat = childNatural.get(cId)!
    let bestDir = ALL_DIRS[0]
    let bestCost = Infinity
    for (const dir of ALL_DIRS) {
      const cost = dirCost(dir, nat)
      if (cost < bestCost) {
        bestCost = cost
        bestDir = dir
      }
    }
    result.set(cId, bestDir)
  }

  return result
}

function distPointToSegment(
  p: Position,
  a: Position,
  b: Position,
): { dist: number; t: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 0.01) return { dist: Math.hypot(p.x - a.x, p.y - a.y), t: 0 }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const cx = a.x + t * dx
  const cy = a.y + t * dy
  return { dist: Math.hypot(p.x - cx, p.y - cy), t }
}

function isPositionOccupied(
  pos: Position,
  others: { id: string; pos: Position }[],
  excludeIds: Set<string>,
): boolean {
  for (const { id, pos: p } of others) {
    if (excludeIds.has(id)) continue
    if (Math.hypot(pos.x - p.x, pos.y - p.y) < MIN_FACILITY_GAP) return true
  }
  return false
}

function lineCrossesFacility(
  from: Position,
  to: Position,
  others: { id: string; pos: Position }[],
  excludeIds: Set<string>,
): boolean {
  for (const { id, pos } of others) {
    if (excludeIds.has(id)) continue
    const { dist, t } = distPointToSegment(pos, from, to)
    if (t > 0.1 && t < 0.9 && dist < CABLE_CROSS_CLEARANCE) return true
  }
  return false
}

export function snapPositionsToCableDirections(
  facilities: Facility[],
  cables: Cable[],
  initialPositions: Map<string, Position>,
): SnapPosition[] {
  // 인접 그래프
  const adj = new Map<string, Set<string>>()
  for (const c of cables) {
    if (c.from_facility_id === c.to_facility_id) continue
    if (!adj.has(c.from_facility_id)) adj.set(c.from_facility_id, new Set())
    if (!adj.has(c.to_facility_id)) adj.set(c.to_facility_id, new Set())
    adj.get(c.from_facility_id)!.add(c.to_facility_id)
    adj.get(c.to_facility_id)!.add(c.from_facility_id)
  }

  // degree 내림차순으로 root 후보
  const rootCandidates = facilities
    .filter((f) => initialPositions.has(f.id))
    .map((f) => ({ id: f.id, deg: adj.get(f.id)?.size ?? 0 }))
    .sort((a, b) => b.deg - a.deg)

  const newPositions = new Map<string, Position>()
  const visited = new Set<string>()
  const incomingDir = new Map<string, number>() // 부모→자기 방향

  for (const root of rootCandidates) {
    if (visited.has(root.id)) continue
    const rootPos = initialPositions.get(root.id)
    if (!rootPos) continue

    newPositions.set(root.id, rootPos)
    visited.add(root.id)
    const queue: string[] = [root.id]

    while (queue.length > 0) {
      const currId = queue.shift()!
      const currPos = newPositions.get(currId)!
      const parentInitial = initialPositions.get(currId)
      if (!parentInitial) continue

      // 자식 후보 — 미방문 인접 시설
      const childIds = [...(adj.get(currId) ?? new Set())].filter((c) => !visited.has(c))
      if (childIds.length === 0) continue

      // 부모로 돌아가는 방향 제외
      const incoming = incomingDir.get(currId)
      let availableDirs = [...ALL_DIRS]
      if (incoming !== undefined) {
        const backDir = wrapAngle(incoming + Math.PI)
        availableDirs = availableDirs.filter((d) => angleDist(d, backDir) > 0.1)
      }

      // 자식들 자연각도 계산 — 초기 위치 기준 (사용자 원래 의도 유지)
      const childrenWithAngles = childIds
        .map((cId) => {
          const cInit = initialPositions.get(cId)
          if (!cInit) return null
          const dx = cInit.x - parentInitial.x
          const dy = cInit.y - parentInitial.y
          const naturalAngle = Math.atan2(dy, dx)
          const initialDist = Math.hypot(dx, dy)
          return { id: cId, naturalAngle, initialDist }
        })
        .filter((c): c is { id: string; naturalAngle: number; initialDist: number } => c !== null)

      // 헝가리안 (greedy 근사) 으로 자식 → 방위 배정
      const dirAssign = assignChildrenToDirections(
        childrenWithAngles.map((c) => ({ id: c.id, naturalAngle: c.naturalAngle })),
        availableDirs,
      )

      // 각 자식을 배정된 방위에 배치
      const placedEntries: { id: string; pos: Position }[] = [...newPositions.entries()].map(
        ([id, pos]) => ({ id, pos }),
      )

      for (const child of childrenWithAngles) {
        const dir = dirAssign.get(child.id)
        if (dir === undefined) continue

        // 거리 — 자연 거리 우선, 최소 MIN_DISTANCE
        const baseDist = Math.max(MIN_DISTANCE, child.initialDist || MIN_DISTANCE)
        const excludeIds = new Set([currId, child.id])

        let placed: Position | null = null
        for (
          let distMult = 1.0;
          distMult <= MAX_DISTANCE_MULT;
          distMult *= DISTANCE_GROWTH
        ) {
          const candidate = {
            x: currPos.x + Math.cos(dir) * baseDist * distMult,
            y: currPos.y + Math.sin(dir) * baseDist * distMult,
          }
          if (isPositionOccupied(candidate, placedEntries, excludeIds)) continue
          if (lineCrossesFacility(currPos, candidate, placedEntries, excludeIds)) continue
          placed = candidate
          break
        }
        if (!placed) {
          // 폴백 — 거리 최대로 배치
          placed = {
            x: currPos.x + Math.cos(dir) * baseDist * MAX_DISTANCE_MULT,
            y: currPos.y + Math.sin(dir) * baseDist * MAX_DISTANCE_MULT,
          }
        }

        newPositions.set(child.id, placed)
        placedEntries.push({ id: child.id, pos: placed })
        incomingDir.set(child.id, dir)
        visited.add(child.id)
        queue.push(child.id)
      }
    }
  }

  // 변경된 시설만 반환 (1px 이상 차이)
  const changes: SnapPosition[] = []
  for (const [id, pos] of newPositions.entries()) {
    const initial = initialPositions.get(id)
    if (!initial) continue
    if (Math.abs(pos.x - initial.x) > 1 || Math.abs(pos.y - initial.y) > 1) {
      changes.push({ id, x: pos.x, y: pos.y })
    }
  }
  return changes
}
