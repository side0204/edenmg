// 지장이설 자동 검증 — 순수 룰 엔진 (서버 컴포넌트에서 사용).
//
// 사양: docs/RELOCATION_DESIGN_PLAN.md § 6-2 (검증 룰 12개)
//   설계 데이터(시설·케이블·회선·코어배정·접속·스플리터·공종)를 받아
//   위반 항목을 빨강(red)·노랑(yellow)으로 산출한다.
//
// 구현 룰: C1·C2·C3·S1·R1·D1·D2·T1
//   O1(코어 중복)·E1(기설 보존)은 DB exclusion constraint 가 강제 → 검증 탭 안내문으로 표시.
//   U1·U2(유니트·여장판 최적화)는 스플라이스 입력 흐름이 갖춰진 뒤 후속.

import {
  CLOSURE_SPEC_META,
  CLOSURE_RECOMMENDED_FROM_CABLE,
  CLOSURE_TYPE_CATEGORY,
  formatFacilityCode,
  isCircuitDiverse,
  type ClosureType,
  type CircuitKind,
} from './relocation'
import { cableSpecCoreCount } from './relocation-auto-assign'
import type { CableSpec } from './connection'

export type VFacility = {
  id: string
  closure_type: ClosureType
  seq_no: number
  name: string
  closure_spec: CableSpec | null
}

export type VCable = {
  id: string
  from_facility_id: string
  to_facility_id: string
  spec: CableSpec
  status: string
  cable_code: string
}

export type VCircuit = {
  id: string
  circuit_id: string
  kind: CircuitKind
}

export type VAssignment = {
  circuit_id: string | null
  segment_idx: number
  cable_id: string
}

export type VSplice = {
  facility_id: string
}

export type VSplitter = {
  facility_id: string
  input_a_cable_id: string | null
  input_b_cable_id: string | null
}

export type VFacilityTask = {
  facility_id: string
}

export type Severity = 'red' | 'yellow'

export type VerifyFinding = {
  rule: string // 'C1' 등
  severity: Severity
  title: string
  detail: string
  target: string // 시설·케이블·회선 라벨
}

export type VerifyResult = {
  findings: VerifyFinding[]
  redCount: number
  yellowCount: number
}

export type VerifyInput = {
  facilities: VFacility[]
  cables: VCable[]
  circuits: VCircuit[]
  assignments: VAssignment[]
  splices: VSplice[]
  splitters: VSplitter[]
  facilityTasks: VFacilityTask[]
}

function facilityLabel(f: VFacility): string {
  return `${formatFacilityCode(f.closure_type, f.seq_no)} ${f.name}`
}

function isClosure(f: VFacility): boolean {
  return CLOSURE_TYPE_CATEGORY[f.closure_type] === '접속함체'
}

export function runVerification(input: VerifyInput): VerifyResult {
  const { facilities, cables, circuits, assignments, splices, splitters, facilityTasks } =
    input

  const facilityById = new Map(facilities.map((f) => [f.id, f]))
  const cableById = new Map(cables.map((c) => [c.id, c]))

  // 시설별 연결 케이블
  const cablesByFacility = new Map<string, VCable[]>()
  for (const c of cables) {
    for (const fid of [c.from_facility_id, c.to_facility_id]) {
      const arr = cablesByFacility.get(fid)
      if (arr) arr.push(c)
      else cablesByFacility.set(fid, [c])
    }
  }

  // 시설별 접속(splice) 수
  const spliceCountByFacility = new Map<string, number>()
  for (const s of splices) {
    spliceCountByFacility.set(
      s.facility_id,
      (spliceCountByFacility.get(s.facility_id) ?? 0) + 1,
    )
  }

  const facilitiesWithTasks = new Set(facilityTasks.map((t) => t.facility_id))

  const findings: VerifyFinding[] = []
  const closures = facilities.filter(isClosure)

  // ── C1 — 함체 연결 케이블 수 ≤ 한도 (빨강) ───────────────────────────
  for (const f of closures) {
    if (!f.closure_spec) continue
    const meta = CLOSURE_SPEC_META[f.closure_spec]
    if (!meta) continue
    const cnt = cablesByFacility.get(f.id)?.length ?? 0
    if (cnt > meta.maxCables) {
      findings.push({
        rule: 'C1',
        severity: 'red',
        title: '함체 연결 케이블 수 초과',
        detail: `케이블 ${cnt}조 연결 — ${f.closure_spec} 함체 한도 ${meta.maxCables}조. 함체 분할이 필요합니다.`,
        target: facilityLabel(f),
      })
    }
  }

  // ── C2 — 함체 접속 코어수 ≤ 한도 (빨강) ──────────────────────────────
  for (const f of closures) {
    if (!f.closure_spec) continue
    const meta = CLOSURE_SPEC_META[f.closure_spec]
    if (!meta) continue
    const cnt = spliceCountByFacility.get(f.id) ?? 0
    if (cnt > meta.maxSpliceCores) {
      findings.push({
        rule: 'C2',
        severity: 'red',
        title: '함체 접속 코어수 초과',
        detail: `접속 ${cnt}코어 — ${f.closure_spec} 함체 한도 ${meta.maxSpliceCores}코어. 함체 규격 상향이 필요합니다.`,
        target: facilityLabel(f),
      })
    }
  }

  // ── C3 — 함체 신설 분기 ≤ 4 (노랑·정보) ──────────────────────────────
  for (const f of closures) {
    const newCables = (cablesByFacility.get(f.id) ?? []).filter(
      (c) => c.status === 'new',
    )
    if (newCables.length > 4) {
      findings.push({
        rule: 'C3',
        severity: 'yellow',
        title: '함체 신설 분기 4조 초과',
        detail: `신설 케이블 ${newCables.length}조 — 4조 초과는 설계자 판단이 필요합니다.`,
        target: facilityLabel(f),
      })
    }
  }

  // ── S1 — 함체 규격 ≥ 케이블 규격 한 단계 위 (노랑) ───────────────────
  for (const f of closures) {
    if (!f.closure_spec) continue
    const closureRank = cableSpecCoreCount(f.closure_spec)
    let worst: { cableSpec: CableSpec; rec: CableSpec } | null = null
    for (const c of cablesByFacility.get(f.id) ?? []) {
      const rec = CLOSURE_RECOMMENDED_FROM_CABLE[c.spec]
      if (!rec) continue
      if (closureRank < cableSpecCoreCount(rec)) {
        if (!worst || cableSpecCoreCount(c.spec) > cableSpecCoreCount(worst.cableSpec)) {
          worst = { cableSpec: c.spec, rec }
        }
      }
    }
    if (worst) {
      findings.push({
        rule: 'S1',
        severity: 'yellow',
        title: '함체 규격이 케이블보다 작음',
        detail: `${worst.cableSpec} 케이블이 연결됨 — ${worst.rec} 이상 함체를 권장합니다 (현재 ${f.closure_spec}).`,
        target: facilityLabel(f),
      })
    }
  }

  // ── R1 — RN 스플리터 입력 2코어가 다른 케이블 (빨강·다이버시티) ──────
  for (const sp of splitters) {
    if (
      sp.input_a_cable_id &&
      sp.input_b_cable_id &&
      sp.input_a_cable_id === sp.input_b_cable_id
    ) {
      const f = facilityById.get(sp.facility_id)
      findings.push({
        rule: 'R1',
        severity: 'red',
        title: 'RN 스플리터 입력 다이버시티 위반',
        detail:
          '입력 2코어가 같은 케이블을 씁니다 — 서로 다른 케이블·다른 함체 경로여야 합니다.',
        target: f ? facilityLabel(f) : '(삭제된 시설)',
      })
    }
  }

  // ── D1·D2 — 이원화 회선 두 세그먼트 분리 (빨강) ──────────────────────
  for (const circuit of circuits) {
    if (!isCircuitDiverse(circuit.kind)) continue
    const segCables: Record<number, Set<string>> = { 0: new Set(), 1: new Set() }
    for (const a of assignments) {
      if (a.circuit_id !== circuit.id) continue
      if (a.segment_idx === 0 || a.segment_idx === 1) {
        segCables[a.segment_idx].add(a.cable_id)
      }
    }
    if (segCables[0].size === 0 || segCables[1].size === 0) continue

    // D1 — 같은 케이블 공유
    const sharedCables = [...segCables[0]].filter((id) => segCables[1].has(id))
    if (sharedCables.length > 0) {
      const codes = sharedCables
        .map((id) => cableById.get(id)?.cable_code ?? '?')
        .join(', ')
      findings.push({
        rule: 'D1',
        severity: 'red',
        title: '이원화 회선이 같은 케이블 사용',
        detail: `세그먼트 0·1 이 같은 케이블(${codes})을 공유합니다 — 이원화는 케이블이 분리되어야 합니다.`,
        target: `회선 ${circuit.circuit_id}`,
      })
    }

    // D2 — 통과 함체 교집합
    const segClosures = (seg: number): Set<string> => {
      const set = new Set<string>()
      for (const cid of segCables[seg]) {
        const c = cableById.get(cid)
        if (!c) continue
        for (const fid of [c.from_facility_id, c.to_facility_id]) {
          const f = facilityById.get(fid)
          if (f && isClosure(f)) set.add(fid)
        }
      }
      return set
    }
    const clo0 = segClosures(0)
    const clo1 = segClosures(1)
    const sharedClosures = [...clo0].filter((id) => clo1.has(id))
    if (sharedClosures.length > 0) {
      const names = sharedClosures
        .map((id) => {
          const f = facilityById.get(id)
          return f ? facilityLabel(f) : '?'
        })
        .join(', ')
      findings.push({
        rule: 'D2',
        severity: 'red',
        title: '이원화 회선이 같은 함체 통과',
        detail: `세그먼트 0·1 이 같은 함체(${names})를 통과합니다 — 이원화는 함체 경로가 분리되어야 합니다.`,
        target: `회선 ${circuit.circuit_id}`,
      })
    }
  }

  // ── T1 — 작업 발생 함체에 공종 수량 입력됨 (노랑) ────────────────────
  for (const f of closures) {
    const connected = cablesByFacility.get(f.id) ?? []
    const hasWork =
      connected.some((c) => c.status === 'new' || c.status === 'relocating') ||
      (spliceCountByFacility.get(f.id) ?? 0) > 0
    if (hasWork && !facilitiesWithTasks.has(f.id)) {
      findings.push({
        rule: 'T1',
        severity: 'yellow',
        title: '공종 수량 미입력',
        detail:
          '작업이 발생하는 함체인데 공종 수량이 없습니다 — 차수 시간 산출이 부정확해집니다.',
        target: facilityLabel(f),
      })
    }
  }

  // 정렬 — 빨강 먼저, 그 안에서 룰 코드순
  const sevRank: Record<Severity, number> = { red: 0, yellow: 1 }
  findings.sort(
    (a, b) => sevRank[a.severity] - sevRank[b.severity] || a.rule.localeCompare(b.rule),
  )

  return {
    findings,
    redCount: findings.filter((f) => f.severity === 'red').length,
    yellowCount: findings.filter((f) => f.severity === 'yellow').length,
  }
}
