// 지장이설 — 케이블 우선 정렬 알고리즘 (obstacle-aware).
//
// 도식 모드에서 「케이블이 V/H/대각선(45°)으로 깔끔하게」 보이도록 시설 위치를
// 케이블 각도에 맞춰 재배치. owner 요청 (2026-05-23):
//   "각 케이블이 수직,수평,대각으로 출발/진행/도착하고
//    수직,수평이 맞지 않을 경우 도착 시설물을 케이블에 맞게 이동하여 배치"
// 후속 요청:
//   "지도모드의 각도는 고려사항에서 제외해주고 방향만 고려해서 수직,수평,대각으로
//    임의 결정하고 다른 시설물(접속함체,케이블,설치장소 등)을 회피하는 구조로 해줘"
//
// 알고리즘 (obstacle-aware BFS):
//   1. 케이블 그래프 구성. degree(연결 케이블 수) 순으로 정렬.
//   2. degree 가 가장 높은 시설을 root 로 선택 (가장 「중심적」 시설 — 국사·허브함체).
//      root 위치는 그대로 유지.
//   3. BFS 로 root 에서 인접 시설을 차례로 방문. 각 자식 시설마다:
//      a. 부모→자식 자연 각도를 8 방위 (V/H 4 + 대각선 4) 중 후보 순서 결정
//         (V/H 가 자연각도에 가까우면 V/H 먼저, 그 다음 대각선)
//      b. 각 방위에 거리 적용해 후보 위치 계산
//      c. 그 위치가 기존 시설과 겹치는지 (반경 MIN_GAP) 체크
//      d. 부모→후보 직선이 다른 시설을 가로지르는지 체크
//      e. 두 체크 모두 통과한 첫 후보 위치에 시설 배치
//      f. 모든 방위가 막히면 거리를 늘려 다시 시도. 그래도 막히면 자연 각도로 폴백.
//   4. cycle edge (BFS tree 외 edge) 는 BFS 만으로는 정렬 안 됨 — refinement pass 추가.
//   5. Refinement: 각 cable 이 자신을 가장 가까운 V/H/45° 로 끌어당기는 회전 force.
//      30 회 반복. root 는 고정. 다른 시설과 너무 가까워지는 이동은 거부 (충돌 회피).
//
// 입력 — 시설 ID 목록, 케이블 양 끝 ID 목록, 현재 위치 Map.
// 출력 — { id, x, y }[] 배열 (변경된 시설만 반환).

type Position = { x: number; y: number }
type Facility = { id: string }
type Cable = { from_facility_id: string; to_facility_id: string }

export type SnapPosition = { id: string; x: number; y: number }

// V/H 4 방위 (수평/수직)
const CARDINAL_DIRS = [0, Math.PI / 2, Math.PI, -Math.PI / 2]
// 대각선 4 방위
const DIAGONAL_DIRS = [Math.PI / 4, (3 * Math.PI) / 4, -(3 * Math.PI) / 4, -Math.PI / 4]
// V/H 우선 — 자연 각도가 카디널에서 이 임계 이내면 V/H 후보 우선.
//   40° ≈ π × 40 / 180. owner 요청: V/H 가 가능하면 무조건 우선, 대각선은 진짜 45° 가까울 때만.
const CARDINAL_PREF_THRESHOLD = (Math.PI * 40) / 180
const MIN_DISTANCE = 110 // 자식 시설 최소 거리 (자연 거리가 너무 작을 때 폴백)
const MIN_FACILITY_GAP = 120 // 시설끼리 최소 간격 (이보다 가까우면 겹침)
const CABLE_CROSS_CLEARANCE = 55 // 케이블이 다른 시설 중심에서 이만큼 이내면 가로지름
const MAX_DISTANCE_MULT = 3.0 // 모든 방위 막히면 거리를 이 배까지 늘려가며 시도
const DISTANCE_GROWTH = 1.3 // 거리 증가 비율
const REFINE_ITERATIONS = 20
const REFINE_FORCE = 0.08 // 약한 force — tree edge 가 잘 흐트러지지 않게
const ALIGN_TOLERANCE = 0.02

// 두 각도 사이 원형 거리 (0 ~ π)
function angleDist(a: number, b: number): number {
  let d = Math.abs(a - b)
  if (d > Math.PI) d = 2 * Math.PI - d
  return d
}

// 8 방위를 자연 각도와 가까운 순으로 정렬 — V/H 우선 (자연각도가 35° 이내 카디널이면 카디널 먼저)
function preferredDirectionOrder(naturalAngle: number): number[] {
  const sortedCardinals = [...CARDINAL_DIRS].sort(
    (a, b) => angleDist(a, naturalAngle) - angleDist(b, naturalAngle),
  )
  const sortedDiagonals = [...DIAGONAL_DIRS].sort(
    (a, b) => angleDist(a, naturalAngle) - angleDist(b, naturalAngle),
  )
  // 가장 가까운 카디널 거리가 임계 이내면 카디널 우선, 아니면 가장 가까운 방위 (대각선 포함) 우선
  const closestCardinalDist = angleDist(sortedCardinals[0], naturalAngle)
  if (closestCardinalDist <= CARDINAL_PREF_THRESHOLD) {
    return [...sortedCardinals, ...sortedDiagonals]
  }
  // 자연 각도가 진짜 대각선 (35°~55°) 이면 그 대각선 우선, V/H 는 폴백
  return [...sortedDiagonals, ...sortedCardinals]
}

// 점이 기존 시설들과 충돌하는지 (반경 MIN_FACILITY_GAP 이내)
function isPositionOccupied(
  pos: Position,
  others: Position[],
  excludeIds?: Set<string>,
  positionIdMap?: Map<string, Position>,
): boolean {
  for (const other of others) {
    if (excludeIds && positionIdMap) {
      // Skip excluded positions (compare by reference)
      let skip = false
      for (const id of excludeIds) {
        if (positionIdMap.get(id) === other) {
          skip = true
          break
        }
      }
      if (skip) continue
    }
    if (Math.hypot(pos.x - other.x, pos.y - other.y) < MIN_FACILITY_GAP) return true
  }
  return false
}

// 점 → 선분 의 거리 + 선분 위 비율 t
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

// 부모→자식 직선이 다른 시설을 가로지르는가
function lineCrossesFacility(
  from: Position,
  to: Position,
  others: Position[],
  excludeIds: Set<string>,
  positionIdMap: Map<string, Position>,
): boolean {
  for (const other of others) {
    let skip = false
    for (const id of excludeIds) {
      if (positionIdMap.get(id) === other) {
        skip = true
        break
      }
    }
    if (skip) continue
    const { dist, t } = distPointToSegment(other, from, to)
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

  // degree 내림차순으로 root 후보 정렬
  const rootCandidates = facilities
    .filter((f) => initialPositions.has(f.id))
    .map((f) => ({ id: f.id, deg: adj.get(f.id)?.size ?? 0 }))
    .sort((a, b) => b.deg - a.deg)

  const newPositions = new Map<string, Position>()
  const visited = new Set<string>()
  const rootIds = new Set<string>()

  for (const root of rootCandidates) {
    if (visited.has(root.id)) continue
    const rootPos = initialPositions.get(root.id)
    if (!rootPos) continue

    newPositions.set(root.id, rootPos)
    visited.add(root.id)
    rootIds.add(root.id)
    const queue: string[] = [root.id]

    while (queue.length > 0) {
      const currId = queue.shift()!
      const currPos = newPositions.get(currId)!
      const neighbors = [...(adj.get(currId) ?? new Set())]

      // 같은 부모의 자식들을 「자연 각도」 순으로 처리해 같은 방위에 몰리는 걸 분산
      neighbors.sort((a, b) => {
        const pa = initialPositions.get(a)
        const pb = initialPositions.get(b)
        if (!pa || !pb) return 0
        return Math.atan2(pa.y - currPos.y, pa.x - currPos.x) -
          Math.atan2(pb.y - currPos.y, pb.x - currPos.x)
      })

      for (const nbrId of neighbors) {
        if (visited.has(nbrId)) continue
        const nbrInitial = initialPositions.get(nbrId)
        if (!nbrInitial) continue
        const parentInitial = initialPositions.get(currId)
        if (!parentInitial) continue

        // 자연 각도/거리는 「초기 위치 기준」 으로 계산 — 부모가 BFS 중 이동했어도
        //   사용자의 원래 의도(상대 방향)는 유지. 「가장 가까운 경로」 = 자연 거리 그대로.
        const dx = nbrInitial.x - parentInitial.x
        const dy = nbrInitial.y - parentInitial.y
        const naturalAngle = Math.atan2(dy, dx)
        const initialDist = Math.hypot(dx, dy)
        // 자연 거리가 너무 작으면 (시설 겹쳐 그려진 초기) 최소 거리 폴백
        const baseDistance = initialDist > MIN_DISTANCE ? initialDist : MIN_DISTANCE

        // 방위 후보 순서 결정 (V/H 우선)
        const dirOrder = preferredDirectionOrder(naturalAngle)

        // 후보 방위×거리 조합으로 충돌·가로지름 없는 위치 탐색
        const allPositions = [...newPositions.values()]
        const excludeFromCheck = new Set([currId, nbrId])
        let placed: Position | null = null

        outer: for (
          let distMult = 1.0;
          distMult <= MAX_DISTANCE_MULT;
          distMult *= DISTANCE_GROWTH
        ) {
          for (const dir of dirOrder) {
            const candidate = {
              x: currPos.x + Math.cos(dir) * baseDistance * distMult,
              y: currPos.y + Math.sin(dir) * baseDistance * distMult,
            }
            // 충돌 체크
            if (isPositionOccupied(candidate, allPositions, excludeFromCheck, newPositions)) continue
            // 케이블 가로지름 체크
            if (lineCrossesFacility(currPos, candidate, allPositions, excludeFromCheck, newPositions)) continue
            placed = candidate
            break outer
          }
        }

        if (!placed) {
          // 모든 방위 막힘 — 자연 각도로 폴백 (최소한 거리는 멀게)
          placed = {
            x: currPos.x + Math.cos(naturalAngle) * baseDistance * MAX_DISTANCE_MULT,
            y: currPos.y + Math.sin(naturalAngle) * baseDistance * MAX_DISTANCE_MULT,
          }
        }

        newPositions.set(nbrId, placed)
        visited.add(nbrId)
        queue.push(nbrId)
      }
    }
  }

  // ─── Refinement pass — cycle edge V/H/45° 정렬 ───────────────────────────
  for (let iter = 0; iter < REFINE_ITERATIONS; iter++) {
    const forces = new Map<string, { dx: number; dy: number }>()
    for (const f of facilities) forces.set(f.id, { dx: 0, dy: 0 })

    let totalDeviation = 0
    for (const c of cables) {
      const fromPos = newPositions.get(c.from_facility_id)
      const toPos = newPositions.get(c.to_facility_id)
      if (!fromPos || !toPos) continue

      const dx = toPos.x - fromPos.x
      const dy = toPos.y - fromPos.y
      const angle = Math.atan2(dy, dx)
      // refinement 도 V/H 우선 — preferredDirectionOrder 의 첫 후보로 snap
      const snapped = preferredDirectionOrder(angle)[0]
      let deviation = angle - snapped
      while (deviation > Math.PI) deviation -= 2 * Math.PI
      while (deviation < -Math.PI) deviation += 2 * Math.PI
      const absDev = Math.abs(deviation)
      if (absDev < ALIGN_TOLERANCE) continue
      totalDeviation += absDev

      const mid = { x: (fromPos.x + toPos.x) / 2, y: (fromPos.y + toPos.y) / 2 }
      const rotateAngle = -deviation * REFINE_FORCE
      const cosA = Math.cos(rotateAngle)
      const sinA = Math.sin(rotateAngle)

      const fdx = fromPos.x - mid.x
      const fdy = fromPos.y - mid.y
      const tdx = toPos.x - mid.x
      const tdy = toPos.y - mid.y
      const newFx = mid.x + fdx * cosA - fdy * sinA
      const newFy = mid.y + fdx * sinA + fdy * cosA
      const newTx = mid.x + tdx * cosA - tdy * sinA
      const newTy = mid.y + tdx * sinA + tdy * cosA

      const f1 = forces.get(c.from_facility_id)
      const f2 = forces.get(c.to_facility_id)
      if (f1) {
        f1.dx += newFx - fromPos.x
        f1.dy += newFy - fromPos.y
      }
      if (f2) {
        f2.dx += newTx - toPos.x
        f2.dy += newTy - toPos.y
      }
    }

    if (totalDeviation < ALIGN_TOLERANCE * cables.length) break

    // 충돌이 생기는 이동은 거부 — 다른 시설과 너무 가까워지면 그 만큼 이동 줄임
    let anyMoved = false
    for (const f of facilities) {
      if (rootIds.has(f.id)) continue
      const pos = newPositions.get(f.id)
      if (!pos) continue
      const force = forces.get(f.id)
      if (!force) continue
      if (Math.abs(force.dx) < 0.01 && Math.abs(force.dy) < 0.01) continue
      const newPos = { x: pos.x + force.dx, y: pos.y + force.dy }
      // 다른 시설과 충돌 체크
      let collides = false
      for (const [otherId, otherPos] of newPositions.entries()) {
        if (otherId === f.id) continue
        if (Math.hypot(newPos.x - otherPos.x, newPos.y - otherPos.y) < MIN_FACILITY_GAP * 0.7) {
          collides = true
          break
        }
      }
      if (collides) continue
      newPositions.set(f.id, newPos)
      anyMoved = true
    }
    if (!anyMoved) break
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
