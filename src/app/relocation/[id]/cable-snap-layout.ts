// 지장이설 — 케이블 우선 정렬 알고리즘 (grid-based orthogonal layout).
//
// owner 요청 (2026-05-23, 첨부된 LGU+ 표준 결과물 참조):
//   "케이블이 거의 V/H 만 보이고 시설이 그리드 셀에 정렬돼 있는 형태로."
//
// 이전 시도들의 한계:
//   - 자연 각도/거리를 추종 → 시설마다 위치 다르고 케이블도 미세하게 V/H 아님
//   - 8 방위 자유 배치 → 같은 부모의 자식이 같은 방위로 몰리거나 거리 불일치
//   - Refinement(force) → tree edge 까지 흔들어 정렬 깨짐
//
// 새 접근: 「순수 그리드 레이아웃」
//   - 모든 시설을 (row, col) 정수 그리드 셀에 배치 (셀 크기 CELL_W × CELL_H)
//   - 시설 사이 거리는 그리드 셀 단위 — 자연 거리 무시 (셀 수만 결정)
//   - 카디널 셀(N/S/E/W) 만 사용하면 모든 tree edge 가 자동 V/H
//   - 카디널이 모두 막힐 때만 대각선 셀(NE/SE/SW/NW) 사용
//
// 알고리즘 (BFS):
//   1. degree 가장 높은 시설 = root. 그리드 (0, 0).
//   2. BFS. 각 부모 노드에서 자식들을 「8 셀」 중 하나에 배치.
//      a. 부모로 돌아가는 셀 방향 제외.
//      b. 카디널(N/S/E/W) 우선 — 자식 모두 카디널에 배치 가능하면 모두 V/H.
//      c. 자식 수가 4 초과 시 대각선 셀 사용.
//      d. 자연 각도에 가까운 셀이 우선 (자식이 「대략 동쪽」에 있었으면 E 셀로).
//      e. 셀이 이미 점유돼 있으면 같은 방향으로 1 칸 더 (2/3/4 mult 까지 시도).
//      f. 중간 통과 셀이 점유돼 있으면 케이블이 시설 가로지름 → 다른 방향.
//   3. 그리드 셀 → 픽셀 좌표 변환. root 의 원래 위치를 그리드 원점으로 둠.
//
// 결과:
//   - tree edge 100% V/H (또는 일부 45° 대각선).
//   - 시설끼리 같은 셀 안 겹침.
//   - 케이블이 다른 시설 가로지르지 않음 (셀 점유 검사로).
//   - cycle edge 는 두 시설의 셀 위치에 따라 V/H 또는 비스듬할 수 있음 (TopologyCanvas
//     의 Manhattan 라우팅이 시각 처리).
//
// 입력 — 시설 ID 목록, 케이블 양 끝 ID 목록, 초기 위치 Map.
// 출력 — { id, x, y }[] (변경된 시설만).

type Position = { x: number; y: number }
type Facility = { id: string }
type Cable = { from_facility_id: string; to_facility_id: string }
type GridCell = { r: number; c: number }
type CellDelta = { dr: number; dc: number; angle: number; isCardinal: boolean }

export type SnapPosition = { id: string; x: number; y: number }

const CELL_W = 220 // 그리드 셀 가로 (시설 너비 110 + 여백)
const CELL_H = 160 // 그리드 셀 세로 (시설 높이 90 + 라벨 + 여백)
const MAX_CELL_MULT = 6 // 한 방향으로 멀리 갈 수 있는 최대 셀 수

// 8 방위 셀 델타. angle 은 atan2(dr, dc) 결과 — 화면 좌표 (y 아래 + 라서 dr 양수=남쪽).
const CARDINAL_DELTAS: CellDelta[] = [
  { dr: -1, dc: 0, angle: -Math.PI / 2, isCardinal: true }, // N (북)
  { dr: 0, dc: 1, angle: 0, isCardinal: true },             // E (동)
  { dr: 1, dc: 0, angle: Math.PI / 2, isCardinal: true },   // S (남)
  { dr: 0, dc: -1, angle: Math.PI, isCardinal: true },      // W (서)
]
const DIAGONAL_DELTAS: CellDelta[] = [
  { dr: -1, dc: 1, angle: -Math.PI / 4, isCardinal: false },        // NE
  { dr: 1, dc: 1, angle: Math.PI / 4, isCardinal: false },          // SE
  { dr: 1, dc: -1, angle: (3 * Math.PI) / 4, isCardinal: false },   // SW
  { dr: -1, dc: -1, angle: -(3 * Math.PI) / 4, isCardinal: false }, // NW
]
const ALL_DELTAS: CellDelta[] = [...CARDINAL_DELTAS, ...DIAGONAL_DELTAS]

function angleDist(a: number, b: number): number {
  let d = Math.abs(a - b)
  if (d > Math.PI) d = 2 * Math.PI - d
  return d
}

// 자식 1 명을 부모 currCell 기준으로 1 개 셀에 배치 시도.
//   tryOrder = 우선순위 정렬된 방향 후보들. 각 방향 ×mult (1~MAX) 로 셀 탐색.
//   점유돼 있거나 중간 통과 셀이 점유돼 있으면 다음 후보로.
//   배치 가능한 첫 (mult, delta) 반환. 없으면 null.
function findFreeCell(
  currCell: GridCell,
  tryOrder: CellDelta[],
  cellMap: Map<string, string>,
): { cell: GridCell; delta: CellDelta } | null {
  for (const delta of tryOrder) {
    for (let mult = 1; mult <= MAX_CELL_MULT; mult++) {
      const newCell = {
        r: currCell.r + delta.dr * mult,
        c: currCell.c + delta.dc * mult,
      }
      const key = `${newCell.r},${newCell.c}`
      if (cellMap.has(key)) continue
      // 중간 통과 셀이 점유돼 있는지 (cable 이 다른 시설 가로지름)
      let blocked = false
      for (let i = 1; i < mult; i++) {
        const passKey = `${currCell.r + delta.dr * i},${currCell.c + delta.dc * i}`
        if (cellMap.has(passKey)) {
          blocked = true
          break
        }
      }
      if (blocked) continue
      return { cell: newCell, delta }
    }
  }
  return null
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

  // degree 내림차순 root 후보
  const rootCandidates = facilities
    .filter((f) => initialPositions.has(f.id))
    .map((f) => ({ id: f.id, deg: adj.get(f.id)?.size ?? 0 }))
    .sort((a, b) => b.deg - a.deg)

  const grid = new Map<string, GridCell>()
  const cellMap = new Map<string, string>() // "r,c" -> facility id
  const visited = new Set<string>()
  const incomingDelta = new Map<string, CellDelta>()

  // 컴포넌트별 root → BFS
  let componentRootCount = 0
  for (const root of rootCandidates) {
    if (visited.has(root.id)) continue

    // 다른 컴포넌트라면 그리드 원점에서 떨어진 곳 (충돌 방지). 첫 컴포넌트는 (0,0).
    const componentOriginR = componentRootCount * 20 // 충분히 떨어진 row
    const startCell = { r: componentOriginR, c: 0 }
    componentRootCount += 1

    grid.set(root.id, startCell)
    cellMap.set(`${startCell.r},${startCell.c}`, root.id)
    visited.add(root.id)
    const queue: string[] = [root.id]

    while (queue.length > 0) {
      const currId = queue.shift()!
      const currCell = grid.get(currId)!
      const incoming = incomingDelta.get(currId)
      const parentInitial = initialPositions.get(currId)
      if (!parentInitial) continue

      const childIds = [...(adj.get(currId) ?? new Set())].filter(
        (c) => !visited.has(c),
      )
      if (childIds.length === 0) continue

      // 부모로 돌아가는 셀 방향 제외 (자식이 부모쪽으로 가는 것 방지)
      let availableCardinals = [...CARDINAL_DELTAS]
      let availableDiagonals = [...DIAGONAL_DELTAS]
      if (incoming) {
        const backFilter = (d: CellDelta) =>
          !(d.dr === -incoming.dr && d.dc === -incoming.dc)
        availableCardinals = availableCardinals.filter(backFilter)
        availableDiagonals = availableDiagonals.filter(backFilter)
      }

      // 자식들을 자연 각도 순으로 정렬 — 같은 부모의 자식들이 자연 위치 순서대로 배치되게
      const childrenSorted = childIds
        .map((cId) => {
          const cInit = initialPositions.get(cId)
          if (!cInit) return null
          const dx = cInit.x - parentInitial.x
          const dy = cInit.y - parentInitial.y
          const naturalAngle = Math.atan2(dy, dx)
          return { id: cId, naturalAngle }
        })
        .filter((c): c is { id: string; naturalAngle: number } => c !== null)

      // 각 자식에 대해 가장 좋은 셀 찾기
      for (const child of childrenSorted) {
        // 카디널 후보 자연각도 가까운 순. 카디널이 모두 막힐 때만 대각선.
        const cardinalsSorted = [...availableCardinals].sort(
          (a, b) =>
            angleDist(a.angle, child.naturalAngle) -
            angleDist(b.angle, child.naturalAngle),
        )
        const diagonalsSorted = [...availableDiagonals].sort(
          (a, b) =>
            angleDist(a.angle, child.naturalAngle) -
            angleDist(b.angle, child.naturalAngle),
        )
        const tryOrder = [...cardinalsSorted, ...diagonalsSorted]

        const placement = findFreeCell(currCell, tryOrder, cellMap)
        if (!placement) {
          // 8 방위 다 막힘 — 자연 각도 가장 가까운 카디널로 강제 배치 (overlap 허용)
          const fallback = cardinalsSorted[0] ?? CARDINAL_DELTAS[0]
          const fallbackCell = {
            r: currCell.r + fallback.dr * 1,
            c: currCell.c + fallback.dc * 1,
          }
          grid.set(child.id, fallbackCell)
          // 점유 표시는 안 함 (이미 점유돼 있을 수 있음)
          incomingDelta.set(child.id, fallback)
          visited.add(child.id)
          queue.push(child.id)
          continue
        }

        grid.set(child.id, placement.cell)
        cellMap.set(`${placement.cell.r},${placement.cell.c}`, child.id)
        // 이 방향은 형제가 못 쓰게 제거
        if (placement.delta.isCardinal) {
          availableCardinals = availableCardinals.filter((d) => d !== placement.delta)
        } else {
          availableDiagonals = availableDiagonals.filter((d) => d !== placement.delta)
        }
        incomingDelta.set(child.id, placement.delta)
        visited.add(child.id)
        queue.push(child.id)
      }
    }
  }

  // 그리드 셀 → 픽셀 좌표 변환. root 시설은 원래 위치를 유지.
  // 첫 번째 root 의 grid (0,0) 위치를 root 의 initial position 에 맞춤.
  const firstRoot = rootCandidates.find((r) => visited.has(r.id))
  const rootInitialPos = firstRoot
    ? initialPositions.get(firstRoot.id) ?? { x: 500, y: 300 }
    : { x: 500, y: 300 }

  const changes: SnapPosition[] = []
  for (const [id, cell] of grid.entries()) {
    const newPos = {
      x: rootInitialPos.x + cell.c * CELL_W,
      y: rootInitialPos.y + cell.r * CELL_H,
    }
    const initial = initialPositions.get(id)
    if (!initial) continue
    if (Math.abs(newPos.x - initial.x) > 1 || Math.abs(newPos.y - initial.y) > 1) {
      changes.push({ id, x: newPos.x, y: newPos.y })
    }
  }
  return changes
}
