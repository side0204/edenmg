// 자동 레이아웃 — x_hint/y_hint 가 없는 시설을 배치하기 위한 간단한 grid 알고리즘.
// 외부 라이브러리 없이. C1 단계 — 정밀 레이아웃은 추후 dagre 등 도입 검토.
//
// 배치 룰 (위 → 아래):
//   0행: 국사 (5종 + 국사내부 없음)
//   1행: 접속함체 (5종)
//   2행: 설치장소 (맨홀·창고·일반설치장소 등)
//   3행: 국사 내부 (MOFD·OJC·국사내장비)
//   4행: 가입자시설
//   5행: 모바일국소
//   6행: RN/IJP/광MUX
//
// 같은 행 안에서는 seq_no 순서대로 좌→우.

import { CLOSURE_TYPE_CATEGORY, type ClosureType } from '@/lib/relocation'

type Node = {
  id: string
  closure_type: ClosureType
  seq_no: number
  x_hint: number | null
  y_hint: number | null
}

type Position = { id: string; x: number; y: number }

// 카테고리 기반 행 분류 — 신규 21 종 시설도 자동 분류됨.
function rowForType(t: ClosureType): number {
  // 국사 내부 (MOFD/OJC/국사내장비) 는 별도 행
  if (t === 'MOFD' || t === 'OJC' || t === '국사내장비') return 3
  // 가입자시설은 별도 행
  if (t === '가입자시설') return 4
  const cat = CLOSURE_TYPE_CATEGORY[t]
  switch (cat) {
    case '국사': return 0
    case '접속함체': return 1
    case '설치장소': return 2
    case '모바일국소': return 5
    case 'RN_IJP_광MUX': return 6
  }
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
    const row = rowForType(n.closure_type)
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
