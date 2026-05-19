// 자동 레이아웃 — x_hint/y_hint 가 없는 시설을 배치하기 위한 간단한 grid 알고리즘.
// 외부 라이브러리 없이. C1 단계 — 정밀 레이아웃은 추후 dagre 등 도입 검토.
//
// 배치 룰 (위 → 아래):
//   1행: 국사 (S-)
//   2행: 함체 (B-)
//   3행: 맨홀 (H-)
//   4행: MOFD / OJC / 국사내장비 (M-/O-/E-)
//   5행: 가입자시설 (C-)
//
// 같은 행 안에서는 seq_no 순서대로 좌→우.

import type { ClosureType } from '@/lib/relocation'

type Node = {
  id: string
  closure_type: ClosureType
  seq_no: number
  x_hint: number | null
  y_hint: number | null
}

type Position = { id: string; x: number; y: number }

const ROW_BY_TYPE: Record<ClosureType, number> = {
  국사: 0,
  함체_가공형: 1,
  함체_관로형: 1,
  맨홀: 2,
  MOFD: 3,
  OJC: 3,
  국사내장비: 3,
  가입자시설: 4,
}

// 노드 슬롯 = 정사각형 80x80. 도형(원·사각)은 슬롯 중앙에 그리고, 라벨은 아래.
const NODE_WIDTH = 90
const NODE_HEIGHT = 90
const COL_GAP = 20
const ROW_HEIGHT = 130
const ORIGIN_X = 50
const ORIGIN_Y = 30

/**
 * 모든 노드에 대해 (x, y) 를 반환.
 * x_hint/y_hint 가 있는 노드는 그대로, 없는 노드는 자동 배치.
 */
export function autoLayoutPositions(nodes: Node[]): Map<string, Position> {
  const result = new Map<string, Position>()

  // 행별 분류 (자동 배치 대상만)
  const rows = new Map<number, Node[]>()
  for (const n of nodes) {
    if (n.x_hint != null && n.y_hint != null) {
      result.set(n.id, { id: n.id, x: n.x_hint, y: n.y_hint })
      continue
    }
    const row = ROW_BY_TYPE[n.closure_type]
    if (!rows.has(row)) rows.set(row, [])
    rows.get(row)!.push(n)
  }

  // 각 행에서 seq_no 정렬 후 좌→우 배치
  for (const [row, items] of rows.entries()) {
    items.sort((a, b) => a.seq_no - b.seq_no)
    items.forEach((n, i) => {
      const x = ORIGIN_X + i * (NODE_WIDTH + COL_GAP)
      const y = ORIGIN_Y + row * ROW_HEIGHT
      result.set(n.id, { id: n.id, x, y })
    })
  }

  return result
}

export const NODE_SIZE = {
  width: NODE_WIDTH,
  height: NODE_HEIGHT,
}
