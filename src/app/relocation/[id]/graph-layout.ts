// 케이블 그래프 기반 시설 자동 배치 (Phase 2, 2026-05-24)
//
// owner 보고: Phase 1 의 우측 상단 컴포넌트 케이블 겹침 + 시설 간격 부족.
// Phase 2 변경:
//   - 모든 컴포넌트가 자체 BFS 트리 배치 (Phase 1 의 단순 격자 폐기)
//   - 시설 수 기반 동적 radius — level 별 호(arc) 길이로 시설 도형 안 겹치게
//   - 컴포넌트들을 bbox 기반 horizontal packing (옆으로 배치, 가로 한계 시 아래 줄)
//
// 알고리즘 (컴포넌트 1개):
//   1. 허브 = degree 최대
//   2. BFS spanning tree
//   3. level 별 동심원 — radius 는 max(level 기본거리, 시설수 * MIN_ARC / 2π)
//   4. level 1 = 균등 분포, level 2+ = 부모 angle 주변 분산 (sibling 수에 비례)

const NODE_W = 110
const NODE_H = 90

// 시설 사이 최소 호 거리 (NODE_W + 마진). 시설 도형 + 라벨 영역 안 겹치게.
//   (2026-05-24 Phase 3) 220 → 240 — L자 candidate 의 crossings 0 보장.
const MIN_ARC_LEN = 240

// level 별 기본 ring 거리 (radius 누적).
//   (2026-05-24 Phase 3) 280 → 380 — 시설 사이 간격 확대.
//   owner 보고: ㄷ자 우회 path 의 마지막 V segment 가 시설 위쪽에서 꺾여 부자연.
//   간격 확대 시 L자 candidate (마지막 H 끝) 가 자연 선택 → 시설 좌·우 면 자연 도착.
const HUB_RING_GAP = 380 // level 0 → 1
const RING_GAP = 380 // 이후 level 사이

// 컴포넌트 사이 packing 간격
const COMPONENT_GAP = 150
const MAX_ROW_WIDTH = 4500 // 가로 한 줄 최대 폭
const PACK_ORIGIN_X = 100
const PACK_ORIGIN_Y = 100

// 자식 angle 분산 — sibling 사이 최소 각도
const MIN_ANGLE_BETWEEN_SIBLINGS = 0.35 // 약 20°
const MAX_CHILD_SPREAD = Math.PI / 2 // ±45° (전체 90°)

type Facility = { id: string }
type Cable = { from_facility_id: string; to_facility_id: string }

export type Position = { id: string; x: number; y: number }

type BBox = { minX: number; minY: number; maxX: number; maxY: number }

/**
 * 한 컴포넌트를 트리 배치 — center 기준 동심원.
 * @returns positions (절대 좌표, center 기준) + bbox
 */
function layoutComponent(
  comp: string[],
  adj: Map<string, Set<string>>,
  centerX: number,
  centerY: number,
): { positions: Map<string, Position>; bbox: BBox } {
  const positions = new Map<string, Position>()

  if (comp.length === 0) {
    return {
      positions,
      bbox: { minX: centerX, minY: centerY, maxX: centerX, maxY: centerY },
    }
  }

  // 단일 시설 — center 에 그대로
  if (comp.length === 1) {
    const id = comp[0]
    const x = centerX - NODE_W / 2
    const y = centerY - NODE_H / 2 + 10
    positions.set(id, { id, x, y })
    return {
      positions,
      bbox: { minX: x, minY: y, maxX: x + NODE_W, maxY: y + NODE_H },
    }
  }

  // 허브 = 컴포넌트 안 degree 최대
  let hubId = comp[0]
  let maxDeg = -1
  const compSet = new Set(comp)
  for (const id of comp) {
    let deg = 0
    for (const nb of adj.get(id) ?? []) {
      if (compSet.has(nb)) deg++
    }
    if (deg > maxDeg) {
      maxDeg = deg
      hubId = id
    }
  }

  // BFS spanning tree
  const level = new Map<string, number>()
  const parent = new Map<string, string | null>()
  level.set(hubId, 0)
  parent.set(hubId, null)
  const queue = [hubId]
  while (queue.length) {
    const cur = queue.shift()!
    const curLvl = level.get(cur)!
    for (const nb of adj.get(cur) ?? []) {
      if (!compSet.has(nb)) continue
      if (level.has(nb)) continue
      level.set(nb, curLvl + 1)
      parent.set(nb, cur)
      queue.push(nb)
    }
  }

  // 허브 배치
  positions.set(hubId, {
    id: hubId,
    x: centerX - NODE_W / 2,
    y: centerY - NODE_H / 2 + 10,
  })

  const angleMap = new Map<string, number>()
  angleMap.set(hubId, 0)

  // level 별 그룹핑
  const byLevel = new Map<number, string[]>()
  for (const [id, lvl] of level.entries()) {
    if (lvl === 0) continue
    if (!byLevel.has(lvl)) byLevel.set(lvl, [])
    byLevel.get(lvl)!.push(id)
  }

  const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b)

  for (const lvl of sortedLevels) {
    const ids = byLevel.get(lvl)!

    // angle 결정
    if (lvl === 1) {
      // 균등 분포 (위쪽 12시부터 시계 방향)
      const angleStep = (2 * Math.PI) / ids.length
      ids.forEach((id, i) => {
        angleMap.set(id, -Math.PI / 2 + i * angleStep)
      })
    } else {
      // 부모별 그룹핑 → 부모 angle 주변 분산. spread 는 sibling 수에 비례.
      const byParent = new Map<string, string[]>()
      for (const id of ids) {
        const p = parent.get(id) ?? hubId
        if (!byParent.has(p)) byParent.set(p, [])
        byParent.get(p)!.push(id)
      }
      for (const [p, children] of byParent.entries()) {
        const pAngle = angleMap.get(p) ?? 0
        if (children.length === 1) {
          angleMap.set(children[0], pAngle)
        } else {
          const required = (children.length - 1) * MIN_ANGLE_BETWEEN_SIBLINGS
          const spread = Math.min(MAX_CHILD_SPREAD, required)
          children.forEach((id, i) => {
            const offset = (i / (children.length - 1) - 0.5) * spread
            angleMap.set(id, pAngle + offset)
          })
        }
      }
    }

    // radius — 기본 ring 거리 vs 시설 수 * MIN_ARC / 2π 중 큰 값.
    //   시설 수 많으면 radius 동적 확대 → 호 거리 안전 확보.
    const baseRadius = lvl === 1 ? HUB_RING_GAP : HUB_RING_GAP + (lvl - 1) * RING_GAP
    const arcRadius = (ids.length * MIN_ARC_LEN) / (2 * Math.PI)
    const radius = Math.max(baseRadius, arcRadius)

    for (const id of ids) {
      const angle = angleMap.get(id) ?? 0
      const x = centerX + radius * Math.cos(angle) - NODE_W / 2
      const y = centerY + radius * Math.sin(angle) - NODE_H / 2 + 10
      positions.set(id, { id, x, y })
    }
  }

  // bbox 계산
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of positions.values()) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x + NODE_W > maxX) maxX = p.x + NODE_W
    if (p.y + NODE_H > maxY) maxY = p.y + NODE_H
  }

  return { positions, bbox: { minX, minY, maxX, maxY } }
}

/**
 * 케이블 그래프 기반으로 모든 시설 위치 재계산.
 * x_hint/y_hint 무시 — 완전 강제 재배치.
 * @returns Map<facilityId, Position>. 모든 시설 포함.
 */
export function graphAwareLayout(
  facilities: Facility[],
  cables: Cable[],
): Map<string, Position> {
  const result = new Map<string, Position>()
  if (facilities.length === 0) return result

  // 1. 인접 그래프
  const adj = new Map<string, Set<string>>()
  for (const f of facilities) adj.set(f.id, new Set())
  for (const c of cables) {
    const fromSet = adj.get(c.from_facility_id)
    const toSet = adj.get(c.to_facility_id)
    if (fromSet && toSet) {
      fromSet.add(c.to_facility_id)
      toSet.add(c.from_facility_id)
    }
  }

  // 2. 연결 컴포넌트 분리
  const visited = new Set<string>()
  const components: string[][] = []
  for (const f of facilities) {
    if (visited.has(f.id)) continue
    const comp: string[] = []
    const queue = [f.id]
    visited.add(f.id)
    while (queue.length) {
      const cur = queue.shift()!
      comp.push(cur)
      for (const nb of adj.get(cur) ?? []) {
        if (!visited.has(nb)) {
          visited.add(nb)
          queue.push(nb)
        }
      }
    }
    components.push(comp)
  }
  // 큰 컴포넌트부터 — 가운데 큰 영역 차지
  components.sort((a, b) => b.length - a.length)

  // 3. 각 컴포넌트별 트리 배치 + horizontal packing.
  //    임시 (0,0) center 로 배치 → bbox 측정 → 절대 좌표로 평행이동.
  let cursorX = PACK_ORIGIN_X
  let cursorY = PACK_ORIGIN_Y
  let rowMaxBottom = PACK_ORIGIN_Y
  let rowStartX = PACK_ORIGIN_X

  for (const comp of components) {
    // 일단 (0, 0) 기준으로 트리 배치 → bbox 측정
    const { positions: localPos, bbox: localBbox } = layoutComponent(
      comp,
      adj,
      0,
      0,
    )
    const width = localBbox.maxX - localBbox.minX
    const height = localBbox.maxY - localBbox.minY

    // 가로 한 줄 초과 시 다음 줄
    if (cursorX > rowStartX && cursorX + width > MAX_ROW_WIDTH) {
      cursorX = rowStartX
      cursorY = rowMaxBottom + COMPONENT_GAP
    }

    // 절대 좌표 = cursor + (localPos - localBbox.minXY)
    const dx = cursorX - localBbox.minX
    const dy = cursorY - localBbox.minY
    for (const [id, pos] of localPos.entries()) {
      result.set(id, { id, x: pos.x + dx, y: pos.y + dy })
    }

    cursorX += width + COMPONENT_GAP
    if (cursorY + height > rowMaxBottom) {
      rowMaxBottom = cursorY + height
    }
  }

  return result
}
