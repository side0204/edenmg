// 지장이설 — 케이블 우선 정렬 알고리즘.
//
// 도식 모드에서 「케이블이 V/H/대각선(45°)으로 깔끔하게」 보이도록 시설 위치를
// 케이블 각도에 맞춰 재배치. owner 요청 (2026-05-23):
//   "각 케이블이 수직,수평,대각으로 출발/진행/도착하고
//    수직,수평이 맞지 않을 경우 도착 시설물을 케이블에 맞게 이동하여 배치"
//
// 알고리즘 (BFS-snap):
//   1. 케이블 그래프 구성. degree(연결 케이블 수) 순으로 정렬.
//   2. degree 가 가장 높은 시설을 root 로 선택 (가장 「중심적」 시설 — 국사·허브함체).
//      root 위치는 그대로 유지.
//   3. BFS 로 root 에서 인접 시설을 차례로 방문 — 부모 → 자식 방향각을 가장 가까운 45° 단위로 snap.
//      거리는 원래 거리 유지. 자식의 새 위치 = 부모 위치 + (snapped_angle, distance) 극좌표.
//   4. 케이블 그래프의 spanning tree edge 는 모두 V/H/대각선 (8 방위 ±0°). 사이클 edge 는 일부 어긋남.
//   5. 케이블이 없는 고립 시설은 원래 위치 유지.
//
// 다중 연결 컴포넌트는 각각 자체 root 부터 BFS. (서로 떨어진 작업 영역 분리)
//
// 입력 — 시설 ID 목록, 케이블 양 끝 ID 목록, 현재 위치 Map.
// 출력 — { id, x, y }[] 배열 (변경된 시설만 반환 — 절약).

type Position = { x: number; y: number }
type Facility = { id: string }
type Cable = { from_facility_id: string; to_facility_id: string }

export type SnapPosition = { id: string; x: number; y: number }

const SNAP_STEP = Math.PI / 4 // 45°
const DEFAULT_DISTANCE = 130 // 거리가 0 인 경우 폴백

export function snapPositionsToCableDirections(
  facilities: Facility[],
  cables: Cable[],
  initialPositions: Map<string, Position>,
): SnapPosition[] {
  // 인접 그래프 + degree
  const adj = new Map<string, Set<string>>()
  for (const c of cables) {
    if (c.from_facility_id === c.to_facility_id) continue // self-loop 무시
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

  for (const root of rootCandidates) {
    if (visited.has(root.id)) continue
    const rootPos = initialPositions.get(root.id)
    if (!rootPos) continue

    // root 는 원래 위치 그대로
    newPositions.set(root.id, rootPos)
    visited.add(root.id)
    const queue: string[] = [root.id]

    while (queue.length > 0) {
      const currId = queue.shift()!
      const currPos = newPositions.get(currId)!
      const neighbors = adj.get(currId) ?? new Set()

      for (const nbrId of neighbors) {
        if (visited.has(nbrId)) continue
        const nbrInitial = initialPositions.get(nbrId)
        if (!nbrInitial) continue

        // 부모→자식 자연 각도 — 자식의 「현재」 위치 기준이 아니라 「초기」 위치 기준으로 계산
        //   (BFS 중 부모가 이미 snap 됐어도, 자식의 의도된 방향은 초기 배치에서 파생)
        const dx = nbrInitial.x - currPos.x
        const dy = nbrInitial.y - currPos.y
        const angle = Math.atan2(dy, dx)

        // 가장 가까운 45° 로 snap
        const snappedAngle = Math.round(angle / SNAP_STEP) * SNAP_STEP

        // 거리는 원래 거리 유지 (시설 사이 간격 보존)
        const distance = Math.hypot(dx, dy) || DEFAULT_DISTANCE

        newPositions.set(nbrId, {
          x: currPos.x + Math.cos(snappedAngle) * distance,
          y: currPos.y + Math.sin(snappedAngle) * distance,
        })
        visited.add(nbrId)
        queue.push(nbrId)
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
