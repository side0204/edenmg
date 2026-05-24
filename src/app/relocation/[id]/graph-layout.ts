// 케이블 그래프 기반 시설 자동 배치 (Phase 1, 2026-05-24)
//
// owner: "C-048 좌상단 빈공간으로 가면 해결" — 기존 카테고리 격자 배치는 케이블 연결
// 무시. 그래프 기반 배치는 연결된 시설끼리 가까이 모으고, 케이블 cross 가 자연 감소.
//
// 알고리즘:
//   1. 인접 그래프 빌드 — 케이블 = 엣지
//   2. 연결 컴포넌트 분리 (큰 순서대로 정렬)
//   3. 메인 컴포넌트: 허브(degree 최대) 가운데 → BFS spanning tree → level 별 동심원
//   4. 자식 시설은 부모 angle 주변에 분산 (sibling 끼리 angleStep)
//   5. 다른 컴포넌트: 메인 외곽 격자에 배치
//
// 한계 (Phase 2 후속):
//   - cross 최소화는 BFS spanning tree 의 자연 분포에 의존 (정밀 최적화 X)
//   - 같은 level 시설이 많으면 자식들 겹침 가능 → spread 좁힘
//   - sibling 수에 따른 spread 동적 조정만 1차 휴리스틱

const NODE_W = 110
const NODE_H = 90
const CENTER_X = 800
const CENTER_Y = 500
const RING_GAP = 240 // 인접 level 사이 거리
const HUB_RING_GAP = 220 // 허브 → level 1 (가까이)
const OUTER_STEP = 150 // 다른 컴포넌트 외곽 격자 간격

type Facility = { id: string }
type Cable = { from_facility_id: string; to_facility_id: string }

export type Position = { id: string; x: number; y: number }

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
  components.sort((a, b) => b.length - a.length)

  // 3. 메인 컴포넌트 — 허브(degree 최대) + BFS level
  const mainComp = components[0]
  if (mainComp.length === 0) return result

  let hubId = mainComp[0]
  let maxDeg = -1
  for (const id of mainComp) {
    const deg = adj.get(id)?.size ?? 0
    if (deg > maxDeg) {
      maxDeg = deg
      hubId = id
    }
  }

  const level = new Map<string, number>()
  const parent = new Map<string, string | null>()
  level.set(hubId, 0)
  parent.set(hubId, null)
  const bfsQueue = [hubId]
  while (bfsQueue.length) {
    const cur = bfsQueue.shift()!
    const curLvl = level.get(cur)!
    for (const nb of adj.get(cur) ?? []) {
      if (!level.has(nb)) {
        level.set(nb, curLvl + 1)
        parent.set(nb, cur)
        bfsQueue.push(nb)
      }
    }
  }

  // 4. level 별 배치 — 허브 가운데, level N = 동심원
  result.set(hubId, {
    id: hubId,
    x: CENTER_X - NODE_W / 2,
    y: CENTER_Y - NODE_H / 2 + 10,
  })

  const angleMap = new Map<string, number>()
  angleMap.set(hubId, 0)

  const byLevel = new Map<number, string[]>()
  for (const [id, lvl] of level.entries()) {
    if (lvl === 0) continue
    if (!byLevel.has(lvl)) byLevel.set(lvl, [])
    byLevel.get(lvl)!.push(id)
  }

  const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b)
  for (const lvl of sortedLevels) {
    const ids = byLevel.get(lvl)!

    if (lvl === 1) {
      // level 1: 허브 주변 균등 분포. 시작 각도 -π/2 (위쪽 12시 방향).
      const angleStep = (2 * Math.PI) / ids.length
      ids.forEach((id, i) => {
        angleMap.set(id, -Math.PI / 2 + i * angleStep)
      })
    } else {
      // level 2+: 부모별 그룹핑 → 부모 angle 주변에 분산
      const byParent = new Map<string, string[]>()
      for (const id of ids) {
        const p = parent.get(id) ?? hubId
        if (!byParent.has(p)) byParent.set(p, [])
        byParent.get(p)!.push(id)
      }
      // 자식 spread: sibling 수에 비례. 최대 ±60°.
      for (const [p, children] of byParent.entries()) {
        const pAngle = angleMap.get(p) ?? 0
        const spread = Math.min(Math.PI / 3, (children.length - 1) * 0.25)
        if (children.length === 1) {
          angleMap.set(children[0], pAngle)
        } else {
          children.forEach((id, i) => {
            const offset = (i / (children.length - 1) - 0.5) * spread * 2
            angleMap.set(id, pAngle + offset)
          })
        }
      }
    }

    // 좌표 계산 (level 1 은 HUB_RING_GAP, 이후는 RING_GAP 누적)
    const radius = HUB_RING_GAP + (lvl - 1) * RING_GAP
    for (const id of ids) {
      const angle = angleMap.get(id) ?? 0
      const x = CENTER_X + radius * Math.cos(angle) - NODE_W / 2
      const y = CENTER_Y + radius * Math.sin(angle) - NODE_H / 2 + 10
      result.set(id, { id, x, y })
    }
  }

  // 5. 다른 컴포넌트 — 메인 외곽 우측에 세로 격자
  const maxLvl = sortedLevels[sortedLevels.length - 1] ?? 0
  const outerR = HUB_RING_GAP + maxLvl * RING_GAP + 100
  let nextOuterX = CENTER_X + outerR
  let nextOuterY = CENTER_Y - outerR
  for (let ci = 1; ci < components.length; ci++) {
    for (const id of components[ci]) {
      result.set(id, { id, x: nextOuterX, y: nextOuterY })
      nextOuterY += OUTER_STEP
      if (nextOuterY > CENTER_Y + outerR) {
        nextOuterY = CENTER_Y - outerR
        nextOuterX += OUTER_STEP
      }
    }
  }

  return result
}
