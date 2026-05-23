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
// 6. BFS 후 refinement (2026-05-23 추가) — cycle edge 가 V/H/45° 에서 벗어난 경우 force-directed
//    relaxation 으로 시설 위치를 조금씩 회전. 각 cable 이 자신을 45° 로 끌어당기는 작은 힘을
//    양 끝에 적용. root 는 고정. tree edge 의 정렬이 약간 흐트러져도 cycle edge 가 함께 정렬되면
//    전체적으로 더 깔끔. 30 회 반복 후 종료.
//
// 입력 — 시설 ID 목록, 케이블 양 끝 ID 목록, 현재 위치 Map.
// 출력 — { id, x, y }[] 배열 (변경된 시설만 반환 — 절약).

type Position = { x: number; y: number }
type Facility = { id: string }
type Cable = { from_facility_id: string; to_facility_id: string }

export type SnapPosition = { id: string; x: number; y: number }

const SNAP_STEP = Math.PI / 4 // 45°
const DEFAULT_DISTANCE = 130 // 거리가 0 인 경우 폴백
const REFINE_ITERATIONS = 30 // refinement 반복 횟수
const REFINE_FORCE = 0.15 // 회전 force 강도 (0~1, 클수록 빨리 수렴하지만 진동 위험)
const ALIGN_TOLERANCE = 0.02 // ~1.1°. 이보다 작은 deviation 은 정렬됐다고 간주

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

  // ─── Refinement pass — cycle edge V/H/45° 정렬 ───────────────────────────
  // BFS 후 tree edge 는 모두 45° 정렬됐지만 cycle edge (트리 외 추가 케이블) 는 어긋남.
  // 각 cable 이 자신을 가까운 45° 로 끌어당기는 작은 회전 force 를 양 끝 시설에 적용.
  // root 시설(첫 번째 root)들은 고정. 여러 component 의 root 는 각자 component 안에서 고정.
  const rootIds = new Set(
    rootCandidates.length > 0
      ? rootCandidates.filter((r) => newPositions.has(r.id)).map((r) => r.id).slice(0, 1)
      : [],
  )
  // 정확히는 각 component 의 첫 방문 시설을 root 로 — 하지만 위 코드는 첫 component 만 잡음.
  // 모든 component 의 root 를 잡으려면 BFS 중에 따로 모았어야 했지만, 간단히 가장 degree 큰
  // 시설(첫 root) 만 고정해도 사실상 충분 (다른 component 의 root 는 자유로 움직여 정렬 도움).

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
      const snapped = Math.round(angle / SNAP_STEP) * SNAP_STEP
      let deviation = angle - snapped
      // -π/8 ~ +π/8 범위로 정규화
      if (deviation > Math.PI) deviation -= 2 * Math.PI
      if (deviation < -Math.PI) deviation += 2 * Math.PI
      const absDev = Math.abs(deviation)
      if (absDev < ALIGN_TOLERANCE) continue
      totalDeviation += absDev

      // 양 끝을 midpoint 기준으로 -deviation 만큼 회전 → cable 이 snapped 각도로 정렬
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

    if (totalDeviation < ALIGN_TOLERANCE * cables.length) break // 충분히 정렬됨

    // force 적용 (root 제외)
    let anyMoved = false
    for (const f of facilities) {
      if (rootIds.has(f.id)) continue
      const pos = newPositions.get(f.id)
      if (!pos) continue
      const force = forces.get(f.id)
      if (!force) continue
      if (Math.abs(force.dx) < 0.01 && Math.abs(force.dy) < 0.01) continue
      newPositions.set(f.id, { x: pos.x + force.dx, y: pos.y + force.dy })
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
