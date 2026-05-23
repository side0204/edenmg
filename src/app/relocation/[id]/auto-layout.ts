// 자동 레이아웃 — x_hint/y_hint 가 없는 시설을 배치하기 위한 grid 알고리즘.
// 외부 라이브러리 없이.
//
// 배치 룰 (TB = top→bottom, 기본):
//   0행: 국사 (5종)
//   1행: 접속함체 (5종)
//   2행: 설치장소 (맨홀·창고·일반설치장소 등)
//   3행: 국사 내부 (MOFD·OJC·국사내장비)
//   4행: 가입자시설
//   5행: 모바일국소
//   6행: RN/IJP/광MUX
//
// 같은 행 안에서는 seq_no 순서대로 좌→우.
//
// 방향 (TB ↔ LR) 자동 결정 (Phase 1, 2026-05-23):
//   시설들의 GPS bounding box 의 동서(EW) vs 남북(NS) 거리 비교.
//   EW 가 NS 보다 1.2 배 이상 크면 LR (가로 펼침: 카테고리가 열·seq_no 가 행)
//   그 외 TB (기존: 카테고리가 행·seq_no 가 열)
//   GPS 가 충분치 않으면 TB 기본값.

import { CLOSURE_TYPE_CATEGORY, type ClosureType } from '@/lib/relocation'

type Node = {
  id: string
  closure_type: ClosureType
  seq_no: number
  x_hint: number | null
  y_hint: number | null
  lat?: number | null
  lng?: number | null
}

type Position = { id: string; x: number; y: number }

export type LayoutOrientation = 'TB' | 'LR'

// 카테고리 기반 행(또는 열) 분류 — 신규 21 종 시설도 자동 분류됨.
function rankForType(t: ClosureType): number {
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

// 노드 슬롯 = 정사각형 110x90. 도형(원·사각)은 슬롯 중앙에 그리고, 라벨은 아래.
// (Phase 5 fix A, 2026-05-23) — 시설명 라벨이 길어 90px 슬롯에서 옆 노드와 겹쳐, 폭/간격 확대.
const NODE_WIDTH = 110
const NODE_HEIGHT = 90
const COL_GAP = 40
const ROW_HEIGHT = 130
// LR 방향에서 세로 간격은 NODE_HEIGHT + 간격 (라벨이 노드 아래로 빠지므로 여유).
const LR_COL_WIDTH = 190 // 카테고리 열 사이 거리
const LR_ROW_HEIGHT = 110 // seq_no 행 사이 거리
const ORIGIN_X = 50
const ORIGIN_Y = 30

const ORIENTATION_RATIO_THRESHOLD = 1.2 // EW/NS 비가 이 이상이면 LR

// Phase 4 (2026-05-23) — 한 카테고리 시설이 많을 때 줄바꿈.
//   TB: 한 행에 MAX_PER_ROW 초과하면 sub-row 로 내려감.
//   LR: 한 열에 MAX_PER_COL 초과하면 sub-column 으로 옆 이동.
const MAX_PER_ROW = 12 // TB 한 행 최대 시설 수
const MAX_PER_COL = 8 // LR 한 열 최대 시설 수
const SUBROW_HEIGHT = ROW_HEIGHT // sub-row 도 같은 높이 유지 (시설 사이 띄움)
const SUBCOL_WIDTH = LR_COL_WIDTH // sub-column 도 같은 폭

// rank(카테고리 인덱스) 의 범위 — rowForType 이 반환하는 값들
const RANK_MIN = 0
const RANK_MAX = 6

/**
 * 시설들의 GPS 분포로 도식 방향 결정.
 *   - EW(동서) 거리가 NS(남북) 의 1.2배 이상이면 LR
 *   - 그 외는 TB
 *   - GPS 가 2개 미만이면 TB 기본
 *
 * deterministic — 같은 데이터면 모든 디자이너가 동일 방향. realtime 동기화 OK.
 */
export function decideOrientation(nodes: Node[]): LayoutOrientation {
  const withGps = nodes.filter(
    (n): n is Node & { lat: number; lng: number } =>
      typeof n.lat === 'number' &&
      typeof n.lng === 'number' &&
      Number.isFinite(n.lat) &&
      Number.isFinite(n.lng),
  )
  if (withGps.length < 2) return 'TB'

  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  for (const n of withGps) {
    if (n.lat < minLat) minLat = n.lat
    if (n.lat > maxLat) maxLat = n.lat
    if (n.lng < minLng) minLng = n.lng
    if (n.lng > maxLng) maxLng = n.lng
  }
  const latRange = maxLat - minLat
  const lngRange = maxLng - minLng
  const avgLat = (minLat + maxLat) / 2
  // 위도 1° ≈ 111km, 경도 1° ≈ 111km × cos(위도)
  const nsKm = latRange * 111
  const ewKm = lngRange * 111 * Math.cos((avgLat * Math.PI) / 180)
  if (nsKm <= 0.0001) return 'LR' // 시설이 일직선 동서로
  return ewKm / nsKm >= ORIENTATION_RATIO_THRESHOLD ? 'LR' : 'TB'
}

/**
 * 모든 노드에 대해 (x, y) 를 반환.
 * x_hint/y_hint 가 있는 노드는 그대로, 없는 노드는 orientation 에 따라 자동 배치.
 *
 * @param nodes 시설 목록
 * @param orientation 'TB' (기본) 또는 'LR'. 생략 시 decideOrientation 으로 자동.
 */
export function autoLayoutPositions(
  nodes: Node[],
  orientation?: LayoutOrientation,
): Map<string, Position> {
  const dir = orientation ?? decideOrientation(nodes)
  const result = new Map<string, Position>()

  // 카테고리(rank) 별 분류 — 자동 배치 대상만
  const buckets = new Map<number, Node[]>()
  for (const n of nodes) {
    if (n.x_hint != null && n.y_hint != null) {
      result.set(n.id, { id: n.id, x: n.x_hint, y: n.y_hint })
      continue
    }
    const rank = rankForType(n.closure_type)
    if (!buckets.has(rank)) buckets.set(rank, [])
    buckets.get(rank)!.push(n)
  }

  // Phase 5 fix B (2026-05-23) — 같은 카테고리(rank) 안에서도 closure_type 이 다르면
  //   사이에 1슬롯 간격을 두고 시각적으로 구분. 예: 접속함체 rank 안의
  //   함체_가공형 그룹 / 함체_관로형 그룹 / 중간접속형 그룹이 한 덩어리로 안 보이도록.
  const sortedBuckets = new Map<number, { node: Node; positionIdx: number }[]>()
  for (const [rank, items] of buckets.entries()) {
    items.sort((a, b) => {
      if (a.closure_type !== b.closure_type)
        return a.closure_type.localeCompare(b.closure_type)
      return a.seq_no - b.seq_no
    })
    const positioned: { node: Node; positionIdx: number }[] = []
    let prevType: ClosureType | null = null
    let idx = 0
    for (const item of items) {
      if (prevType !== null && prevType !== item.closure_type) idx += 1 // 그룹 사이 1슬롯 gap
      positioned.push({ node: item, positionIdx: idx })
      prevType = item.closure_type
      idx += 1
    }
    sortedBuckets.set(rank, positioned)
  }

  // Phase 4 — 각 카테고리가 사용하는 sub-row 수를 먼저 계산해, 다음 카테고리의 시작
  //   좌표를 누적해서 잡는다. 한 카테고리가 줄바꿈 후에도 다음 카테고리와 안 겹침.
  //   fix B 의 group gap 도 positionIdx 에 이미 반영돼 있어 maxIdx 기준으로 계산.
  const subCountByRank = new Map<number, number>()
  for (const [rank, positioned] of sortedBuckets.entries()) {
    const max = dir === 'TB' ? MAX_PER_ROW : MAX_PER_COL
    const maxIdx =
      positioned.length > 0 ? positioned[positioned.length - 1].positionIdx : 0
    subCountByRank.set(rank, Math.max(1, Math.ceil((maxIdx + 1) / max)))
  }
  // 누적 오프셋 — RANK_MIN 부터 순서대로
  const offsetByRank = new Map<number, number>()
  let cumulative = 0
  for (let r = RANK_MIN; r <= RANK_MAX; r++) {
    offsetByRank.set(r, cumulative)
    cumulative += subCountByRank.get(r) ?? 1
  }

  // 각 카테고리에서 (closure_type+seq_no) 정렬 + 그룹 gap 반영된 positionIdx 로 배치
  for (const [rank, positioned] of sortedBuckets.entries()) {
    const rankOffset = offsetByRank.get(rank) ?? 0
    for (const { node: n, positionIdx: i } of positioned) {
      if (dir === 'TB') {
        // 카테고리 = 행(y) · seq_no = 열(x) · 12개 초과 시 sub-row 로 내려감
        const col = i % MAX_PER_ROW
        const subRow = Math.floor(i / MAX_PER_ROW)
        const x = ORIGIN_X + col * (NODE_WIDTH + COL_GAP)
        const y = ORIGIN_Y + (rankOffset + subRow) * SUBROW_HEIGHT
        result.set(n.id, { id: n.id, x, y })
      } else {
        // LR: 카테고리 = 열(x) · seq_no = 행(y) · 8개 초과 시 sub-column 으로 옆 이동
        const row = i % MAX_PER_COL
        const subCol = Math.floor(i / MAX_PER_COL)
        const x = ORIGIN_X + (rankOffset + subCol) * SUBCOL_WIDTH
        const y = ORIGIN_Y + row * LR_ROW_HEIGHT
        result.set(n.id, { id: n.id, x, y })
      }
    }
  }

  return result
}

export const NODE_SIZE = {
  width: NODE_WIDTH,
  height: NODE_HEIGHT,
}
