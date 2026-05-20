'use client'

import { useMemo, useRef, useState, useEffect } from 'react'
import {
  Crosshair,
  TriangleAlert,
  ArrowLeftRight,
  Route,
  MapPin,
  X,
  ChevronLeft,
  ChevronRight,
  Cable as CableIcon,
  Radio,
} from 'lucide-react'
import {
  formatFacilityCode,
  type ClosureType,
  type CableStatus,
} from '@/lib/relocation'
import { useHighlight } from './HighlightContext'

// 고장점 검색 패널 — 캔버스 우측 컬럼. 너비 조절 가능.
//   선택 흐름: 시설물 → 그 시설물에 연결된 케이블 → 케이블의 코어선번별 회선.
//   고장점은 「회선(코어)연결」 기준 — 회선의 코어 배정이 segment_idx 순으로
//   이루는 케이블 체인이 실제 경로 (OTDR 빛이 가는 길).
// 읽기 전용 계산 — 서버 액션·DB 변경 없음.

export type FaultSearchFacility = {
  id: string
  closure_type: ClosureType
  seq_no: number
  name: string
}

export type FaultSearchCable = {
  id: string
  from_facility_id: string
  to_facility_id: string
  cable_code: string
  spec: string
  status: CableStatus
  total_length: number | null
  end_distance: number | null
  waypoints: { pole_name?: string | null; dist?: number | null }[]
}

export type FaultSearchCircuit = {
  id: string
  circuit_id: string
  subscriber_name: string | null
  kind: string
}

export type FaultSearchAssignment = {
  circuit_id: string | null
  segment_idx: number
  cable_id: string
  core_range_start: number
  core_range_end: number
}

export const FAULT_PANEL_MIN_WIDTH = 260
export const FAULT_PANEL_MAX_WIDTH = 680

function fmtM(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 })
}

function poleLabel(p: string | null | undefined): string {
  const t = (p ?? '').trim()
  return t ? `전주 ${t}` : '경로점'
}

function coreLabel(s: number, e: number): string {
  return s === e ? `${s}번` : `${s}-${e}번`
}

// 케이블을 fromId 시설에서 출발해 traverse 할 때의 구간 목록.
type Seg = { dist: number | null; toLabel: string; toIsFacility: boolean }

function orientedSegments(
  cable: FaultSearchCable,
  fromId: string,
  facLabel: (id: string) => string,
): Seg[] {
  const wps = cable.waypoints ?? []
  const forward = cable.from_facility_id === fromId
  const otherId = forward ? cable.to_facility_id : cable.from_facility_id

  const canonicalDists: (number | null)[] = [
    ...wps.map((w) => (typeof w.dist === 'number' ? w.dist : null)),
    typeof cable.end_distance === 'number' ? cable.end_distance : null,
  ]
  const granular = wps.length > 0 && canonicalDists.every((d) => d != null)

  if (!granular) {
    return [
      { dist: cable.total_length ?? null, toLabel: facLabel(otherId), toIsFacility: true },
    ]
  }

  const N = wps.length
  if (forward) {
    return canonicalDists.map((d, i) => ({
      dist: d,
      toLabel: i < N ? poleLabel(wps[i].pole_name) : facLabel(cable.to_facility_id),
      toIsFacility: i >= N,
    }))
  }
  const segs: Seg[] = []
  for (let k = 0; k <= N; k++) {
    segs.push({
      dist: canonicalDists[N - k],
      toLabel:
        k < N ? poleLabel(wps[N - 1 - k].pole_name) : facLabel(cable.from_facility_id),
      toIsFacility: k >= N,
    })
  }
  return segs
}

type RawLeg = {
  cable: FaultSearchCable
  fromId: string
  toId: string
  coreStart: number
  coreEnd: number
}

// 회선의 코어 배정 → 케이블 체인 + 시설 경로 (segment_idx 순서).
function buildCircuitPath(
  assignments: FaultSearchAssignment[],
  cableById: Map<string, FaultSearchCable>,
): { legs: RawLeg[]; facilityIds: string[] } | { error: string } {
  const sorted = [...assignments].sort((a, b) => a.segment_idx - b.segment_idx)
  const steps = sorted
    .map((a) => {
      const cable = cableById.get(a.cable_id)
      return cable
        ? { cable, coreStart: a.core_range_start, coreEnd: a.core_range_end }
        : null
    })
    .filter(
      (s): s is { cable: FaultSearchCable; coreStart: number; coreEnd: number } => !!s,
    )

  if (steps.length === 0) return { error: '이 회선에 연결된 케이블이 없습니다' }

  if (steps.length === 1) {
    const s = steps[0]
    return {
      legs: [
        {
          cable: s.cable,
          fromId: s.cable.from_facility_id,
          toId: s.cable.to_facility_id,
          coreStart: s.coreStart,
          coreEnd: s.coreEnd,
        },
      ],
      facilityIds: [s.cable.from_facility_id, s.cable.to_facility_id],
    }
  }

  const ends0 = [steps[0].cable.from_facility_id, steps[0].cable.to_facility_id]
  const ends1 = [steps[1].cable.from_facility_id, steps[1].cable.to_facility_id]
  const shared01 = ends0.find((f) => ends1.includes(f))
  if (!shared01) {
    return { error: '회선의 케이블들이 서로 이어지지 않습니다 (코어 배정 확인)' }
  }
  let prev = ends0[0] === shared01 ? ends0[1] : ends0[0]

  const facilityIds: string[] = [prev]
  const legs: RawLeg[] = []
  for (const s of steps) {
    let next: string
    if (s.cable.from_facility_id === prev) next = s.cable.to_facility_id
    else if (s.cable.to_facility_id === prev) next = s.cable.from_facility_id
    else return { error: '회선 경로가 끊겨 있습니다 (세그먼트 순서·코어 배정 확인)' }
    legs.push({
      cable: s.cable,
      fromId: prev,
      toId: next,
      coreStart: s.coreStart,
      coreEnd: s.coreEnd,
    })
    facilityIds.push(next)
    prev = next
  }
  return { legs, facilityIds }
}

type FaultResult =
  | { kind: 'inputError'; message: string }
  | {
      kind: 'found'
      cableCode: string
      cableId: string
      cableSpec: string
      canonicalFraction: number
      legFrom: string
      legTo: string
      segFrom: string
      segFromIsFacility: boolean
      segTo: string
      distFromLegStart: number
      offsetInSeg: number
      measured: number
    }
  | { kind: 'atEnd'; label: string; cum: number }
  | { kind: 'tooLong'; total: number; over: number }
  | { kind: 'incomplete'; cableCode: string; atLabel: string; cum: number }

export default function FaultSearchPanel({
  facilities,
  cables,
  circuits,
  assignments,
  facilityId,
  cableId,
  circuitId,
  onPickFacility,
  onPickCable,
  onPickCircuit,
  width,
  onResize,
  onClose,
  collapsed,
  onToggleCollapse,
}: {
  facilities: FaultSearchFacility[]
  cables: FaultSearchCable[]
  circuits: FaultSearchCircuit[]
  assignments: FaultSearchAssignment[]
  facilityId: string
  cableId: string
  circuitId: string
  onPickFacility: (id: string) => void
  onPickCable: (id: string) => void
  onPickCircuit: (id: string) => void
  width: number
  onResize: (w: number) => void
  onClose: () => void
  collapsed: boolean
  onToggleCollapse: () => void
}) {
  const [measured, setMeasured] = useState('')
  const [fromEnd, setFromEnd] = useState(false)

  const facById = useMemo(() => new Map(facilities.map((f) => [f.id, f])), [facilities])
  const facLabel = useMemo(
    () => (id: string) => {
      const f = facById.get(id)
      return f
        ? `${formatFacilityCode(f.closure_type, f.seq_no)} ${f.name}`
        : '(알 수 없음)'
    },
    [facById],
  )
  const facCode = useMemo(
    () => (id: string) => {
      const f = facById.get(id)
      return f ? formatFacilityCode(f.closure_type, f.seq_no) : '?'
    },
    [facById],
  )

  const cableById = useMemo(() => new Map(cables.map((c) => [c.id, c])), [cables])
  const circuitById = useMemo(
    () => new Map(circuits.map((c) => [c.id, c])),
    [circuits],
  )

  const facOptions = useMemo(
    () =>
      [...facilities].sort((a, b) =>
        formatFacilityCode(a.closure_type, a.seq_no).localeCompare(
          formatFacilityCode(b.closure_type, b.seq_no),
        ),
      ),
    [facilities],
  )

  // ② 시설물에 연결된 케이블
  const cablesOfFacility = useMemo(() => {
    if (!facilityId) return []
    return cables
      .filter(
        (c) => c.from_facility_id === facilityId || c.to_facility_id === facilityId,
      )
      .sort((a, b) => a.cable_code.localeCompare(b.cable_code))
  }, [facilityId, cables])

  // ③ 케이블에 입력된 코어선번별 회선
  const circuitsOnCable = useMemo(() => {
    if (!cableId) return []
    return assignments
      .filter((a) => a.cable_id === cableId && a.circuit_id)
      .map((a) => {
        const circuit = circuitById.get(a.circuit_id as string)
        return circuit ? { a, circuit } : null
      })
      .filter(
        (x): x is { a: FaultSearchAssignment; circuit: FaultSearchCircuit } => !!x,
      )
      .sort((x, y) => x.a.core_range_start - y.a.core_range_start)
  }, [cableId, assignments, circuitById])

  // 회선의 코어 경로·거리
  const route = useMemo(() => {
    if (!circuitId) return null
    const circAssignments = assignments.filter((a) => a.circuit_id === circuitId)
    if (circAssignments.length === 0) {
      return { error: '이 회선에 코어 배정이 없습니다' as const }
    }
    const built = buildCircuitPath(circAssignments, cableById)
    if ('error' in built) return { error: built.error }

    const rawLegs = fromEnd
      ? [...built.legs].reverse().map((l) => ({ ...l, fromId: l.toId, toId: l.fromId }))
      : built.legs
    const facilityIds = fromEnd ? [...built.facilityIds].reverse() : built.facilityIds

    const legs = rawLegs.map((l) => {
      const segs = orientedSegments(l.cable, l.fromId, facLabel)
      const known = segs.every((s) => s.dist != null)
      const dist = known ? segs.reduce((a, s) => a + (s.dist ?? 0), 0) : null
      return { ...l, segs, dist }
    })
    const allKnown = legs.every((l) => l.dist != null)
    const total = allKnown ? legs.reduce((a, l) => a + (l.dist ?? 0), 0) : null

    const cumByFacility: (number | null)[] = [0]
    let running = 0
    let broke = false
    for (const l of legs) {
      if (broke || l.dist == null) {
        broke = true
        cumByFacility.push(null)
      } else {
        running += l.dist
        cumByFacility.push(running)
      }
    }

    return {
      legs,
      facilityIds,
      cableIds: legs.map((l) => l.cable.id),
      allKnown,
      total,
      cumByFacility,
    }
  }, [circuitId, assignments, cableById, facLabel, fromEnd])

  // 고장점 위치 추정
  const fault = useMemo<FaultResult | null>(() => {
    if (!route || 'error' in route) return null
    const t = measured.trim()
    if (!t) return null
    const D = Number(t)
    if (!Number.isFinite(D) || D < 0) {
      return { kind: 'inputError', message: '측정 거리를 0 이상의 숫자로 입력하세요' }
    }

    let cum = 0
    for (const leg of route.legs) {
      const legStartCum = cum
      let fromLabel = facLabel(leg.fromId)
      let fromIsFacility = true
      for (const seg of leg.segs) {
        if (seg.dist == null) {
          return {
            kind: 'incomplete',
            cableCode: leg.cable.cable_code,
            atLabel: fromLabel,
            cum,
          }
        }
        if (D >= cum && D < cum + seg.dist) {
          const legTotal =
            leg.dist ?? leg.segs.reduce((a, s) => a + (s.dist ?? 0), 0)
          const frac =
            legTotal > 0 ? Math.min(1, Math.max(0, (D - legStartCum) / legTotal)) : 0
          const canonicalFraction =
            leg.fromId === leg.cable.from_facility_id ? frac : 1 - frac
          return {
            kind: 'found',
            cableCode: leg.cable.cable_code,
            cableId: leg.cable.id,
            cableSpec: leg.cable.spec,
            canonicalFraction,
            legFrom: facLabel(leg.fromId),
            legTo: facLabel(leg.toId),
            segFrom: fromLabel,
            segFromIsFacility: fromIsFacility,
            segTo: seg.toLabel,
            distFromLegStart: D - legStartCum,
            offsetInSeg: D - cum,
            measured: D,
          }
        }
        cum += seg.dist
        fromLabel = seg.toLabel
        fromIsFacility = seg.toIsFacility
      }
    }
    if (Math.abs(D - cum) < 0.001) {
      const lastId = route.facilityIds[route.facilityIds.length - 1]
      return { kind: 'atEnd', label: facLabel(lastId), cum }
    }
    return { kind: 'tooLong', total: cum, over: D - cum }
  }, [route, measured, facLabel])

  // 캔버스 하이라이트 — 회선 경로(완성 시) 또는 선택 진행 중 케이블·시설
  const { setHighlight } = useHighlight()
  useEffect(() => {
    if (route && !('error' in route)) {
      setHighlight({
        facilityIds: route.facilityIds,
        cableIds: route.cableIds,
        fault:
          fault && fault.kind === 'found'
            ? { cableId: fault.cableId, fraction: fault.canonicalFraction }
            : null,
      })
    } else if (cableId) {
      const c = cableById.get(cableId)
      setHighlight(
        c
          ? {
              facilityIds: [c.from_facility_id, c.to_facility_id],
              cableIds: [cableId],
              fault: null,
            }
          : null,
      )
    } else if (facilityId) {
      setHighlight({ facilityIds: [facilityId], cableIds: [], fault: null })
    } else {
      setHighlight(null)
    }
  }, [route, fault, cableId, facilityId, cableById, setHighlight])
  useEffect(() => () => setHighlight(null), [setHighlight])

  // 너비 조절 — 좌측 가장자리 드래그
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null)
  function onResizeDown(e: React.PointerEvent<HTMLDivElement>) {
    resizeRef.current = { startX: e.clientX, startWidth: width }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onResizeMove(e: React.PointerEvent<HTMLDivElement>) {
    const r = resizeRef.current
    if (!r) return
    onResize(
      Math.max(
        FAULT_PANEL_MIN_WIDTH,
        Math.min(FAULT_PANEL_MAX_WIDTH, r.startWidth + (r.startX - e.clientX)),
      ),
    )
  }
  function onResizeUp() {
    resizeRef.current = null
  }

  // ===== 접힘 — 얇은 세로 스트립 =====
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapse}
        title="고장점 검색 펼치기"
        className="w-9 shrink-0 h-full border-l border-slate-300 bg-white flex flex-col items-center gap-2 py-2 text-violet-600 hover:bg-slate-50"
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="text-[11px] font-bold [writing-mode:vertical-rl]">
          고장점 검색
        </span>
      </button>
    )
  }

  return (
    <div
      style={{ width: `${width}px` }}
      className="shrink-0 h-full relative bg-white border-l border-slate-300 flex flex-col"
    >
      {/* 너비 조절 핸들 */}
      <div
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        title="패널 너비 조절 — 좌우로 드래그"
        className="absolute left-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-violet-400/50 z-20"
      />

      <div className="bg-white border-b border-slate-200 px-3 py-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
          <Crosshair className="h-4 w-4 text-violet-600" />
          고장점 검색
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleCollapse}
            title="패널 접기"
            className="text-slate-400 hover:text-slate-900"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="닫기"
            className="text-slate-400 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <p className="text-[11px] text-slate-500 leading-relaxed">
          시설물 → 케이블 → 코어선번(회선) 순으로 선택하면 그 회선의 코어 경로를 따라
          고장점을 찾습니다. 캔버스에서 시설물·케이블을 직접 클릭해도 됩니다.
        </p>

        {/* ① 시설물 */}
        <div>
          <label className="flex items-center gap-1 text-[11px] font-bold text-slate-700">
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-violet-600 text-white text-[9px]">
              1
            </span>
            시설물
          </label>
          <select
            value={facilityId}
            onChange={(e) => onPickFacility(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
          >
            <option value="">시설물 선택…</option>
            {facOptions.map((f) => (
              <option key={f.id} value={f.id}>
                {formatFacilityCode(f.closure_type, f.seq_no)} {f.name}
              </option>
            ))}
          </select>
        </div>

        {/* ② 케이블 */}
        {facilityId && (
          <div>
            <label className="flex items-center gap-1 text-[11px] font-bold text-slate-700">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-violet-600 text-white text-[9px]">
                2
              </span>
              케이블 ({cablesOfFacility.length})
            </label>
            {cablesOfFacility.length === 0 ? (
              <p className="mt-1 text-[11px] text-slate-400">
                이 시설물에 연결된 케이블이 없습니다.
              </p>
            ) : (
              <div className="mt-1 space-y-1">
                {cablesOfFacility.map((c) => {
                  const otherId =
                    c.from_facility_id === facilityId
                      ? c.to_facility_id
                      : c.from_facility_id
                  const active = c.id === cableId
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onPickCable(c.id)}
                      className={
                        'w-full text-left rounded-md border px-2 py-1 text-[11px] ' +
                        (active
                          ? 'border-violet-500 bg-violet-50'
                          : 'border-slate-200 hover:bg-slate-50')
                      }
                    >
                      <span className="flex items-center gap-1">
                        <CableIcon className="h-3 w-3 text-slate-400 shrink-0" />
                        <span className="font-mono font-medium text-slate-800">
                          {c.cable_code}
                        </span>
                        <span className="text-slate-400">{c.spec}</span>
                      </span>
                      <span className="text-[10px] text-slate-500">
                        → {facCode(otherId)}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ③ 회선 (코어선번) */}
        {cableId && (
          <div>
            <label className="flex items-center gap-1 text-[11px] font-bold text-slate-700">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-violet-600 text-white text-[9px]">
                3
              </span>
              회선 — 코어선번 ({circuitsOnCable.length})
            </label>
            {circuitsOnCable.length === 0 ? (
              <p className="mt-1 text-[11px] text-slate-400">
                이 케이블에 입력된 코어선번(회선)이 없습니다.
              </p>
            ) : (
              <div className="mt-1 space-y-1 max-h-52 overflow-y-auto">
                {circuitsOnCable.map(({ a, circuit }) => {
                  const active = circuit.id === circuitId
                  return (
                    <button
                      key={`${circuit.id}-${a.core_range_start}`}
                      type="button"
                      onClick={() => onPickCircuit(circuit.id)}
                      className={
                        'w-full text-left rounded-md border px-2 py-1 text-[11px] ' +
                        (active
                          ? 'border-violet-500 bg-violet-50'
                          : 'border-slate-200 hover:bg-slate-50')
                      }
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-600 shrink-0">
                          코어 {coreLabel(a.core_range_start, a.core_range_end)}
                        </span>
                        <Radio className="h-3 w-3 text-violet-500 shrink-0" />
                        <span className="font-medium text-slate-800 truncate">
                          {circuit.circuit_id}
                        </span>
                      </span>
                      {circuit.subscriber_name && (
                        <span className="text-[10px] text-slate-500">
                          {circuit.subscriber_name}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* 경로 결과 */}
        {route && 'error' in route && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
            {route.error}
          </div>
        )}

        {route && !('error' in route) && (
          <div className="rounded-lg border border-slate-200 p-2.5 space-y-2">
            <p className="flex items-center gap-1 text-[11px] font-bold text-slate-700">
              <Route className="h-3.5 w-3.5" />
              회선 경로
            </p>
            <div className="flex flex-wrap items-center gap-1">
              {route.facilityIds.map((fid, i) => (
                <span key={`${fid}-${i}`} className="flex items-center gap-1">
                  {i > 0 && <span className="text-slate-300 text-[10px]">→</span>}
                  <span className="inline-flex flex-col items-center">
                    <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      {facCode(fid)}
                    </span>
                    <span className="mt-0.5 text-[9px] font-mono text-slate-400">
                      {route.cumByFacility[i] == null
                        ? '· · ·'
                        : `${fmtM(route.cumByFacility[i] as number)}m`}
                    </span>
                  </span>
                </span>
              ))}
            </div>
            <div className="rounded bg-slate-50 px-2 py-1.5">
              {route.total != null ? (
                <p className="text-xs text-slate-700">
                  총 거리{' '}
                  <span className="text-base font-bold text-slate-900">
                    {fmtM(route.total)}
                  </span>{' '}
                  m
                </p>
              ) : (
                <p className="flex items-start gap-1 text-[10px] text-amber-700">
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-px" />
                  일부 구간 거리 미입력으로 총 거리를 산출할 수 없습니다.
                </p>
              )}
            </div>
            <ul className="space-y-1">
              {route.legs.map((leg, i) => (
                <li
                  key={i}
                  className="flex items-center gap-1.5 rounded border border-slate-100 px-2 py-1 text-[10px]"
                >
                  <span className="font-mono text-slate-500 shrink-0">
                    {facCode(leg.fromId)}→{facCode(leg.toId)}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-slate-500">
                    {leg.cable.spec} · 코어 {coreLabel(leg.coreStart, leg.coreEnd)}
                  </span>
                  <span className="shrink-0 font-semibold text-slate-900">
                    {leg.dist != null ? `${fmtM(leg.dist)}m` : '미입력'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 측정 거리 + 고장점 */}
        {route && !('error' in route) && (
          <div className="rounded-lg border border-slate-200 p-2.5 space-y-2">
            <p className="flex items-center gap-1 text-[11px] font-bold text-slate-700">
              <Crosshair className="h-3.5 w-3.5" />
              고장점 위치
            </p>

            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="text-slate-500">측정 시작:</span>
              <span className="font-semibold text-slate-800">
                {facCode(route.facilityIds[0])}
              </span>
              <button
                type="button"
                onClick={() => setFromEnd((v) => !v)}
                title="측정 기준 끝 바꾸기"
                className="inline-flex items-center gap-0.5 rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-50"
              >
                <ArrowLeftRight className="h-3 w-3" />
                반대 끝
              </button>
            </div>

            <div>
              <label className="block text-[10px] font-medium text-slate-500">
                측정 거리 (m) — OTDR 측정값
              </label>
              <input
                type="number"
                min={0}
                step="0.1"
                value={measured}
                onChange={(e) => setMeasured(e.target.value)}
                placeholder="예: 1250"
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>

            {fault?.kind === 'inputError' && (
              <div className="rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
                {fault.message}
              </div>
            )}

            {fault?.kind === 'found' && (
              <div className="rounded-lg border border-blue-300 bg-blue-50 p-2.5 space-y-1">
                <p className="flex items-center gap-1 text-xs font-bold text-blue-900">
                  <MapPin className="h-3.5 w-3.5" />
                  고장점 추정 위치
                </p>
                <p className="text-xs text-blue-900">
                  케이블{' '}
                  <span className="font-mono font-semibold">{fault.cableCode}</span>{' '}
                  <span className="text-blue-700">({fault.cableSpec})</span>
                </p>
                <p className="text-xs text-blue-900">
                  <span className="font-semibold">{fault.legFrom}</span>
                  <span className="mx-1 text-blue-400">~</span>
                  <span className="font-semibold">{fault.legTo}</span> 구간
                </p>
                <p className="text-xs text-blue-900">
                  → <span className="font-semibold">{fault.legFrom}</span> 에서 약{' '}
                  <span className="text-sm font-bold">
                    {fmtM(fault.distFromLegStart)}
                  </span>{' '}
                  m 지점
                </p>
                {!fault.segFromIsFacility && (
                  <p className="text-[11px] text-blue-700">
                    ({fault.segFrom} 에서 약 {fmtM(fault.offsetInSeg)} m ·{' '}
                    {fault.segTo} 방향)
                  </p>
                )}
              </div>
            )}

            {fault?.kind === 'atEnd' && (
              <div className="rounded border border-blue-300 bg-blue-50 p-2 text-xs text-blue-900">
                측정 거리가 경로 끝{' '}
                <span className="font-semibold">{fault.label}</span> 와 일치합니다.
              </div>
            )}

            {fault?.kind === 'tooLong' && (
              <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                측정 거리가 회선 총거리({fmtM(fault.total)} m)보다 {fmtM(fault.over)} m
                깁니다. 측정 기준 끝을 바꾸거나 측정값을 확인하세요.
              </div>
            )}

            {fault?.kind === 'incomplete' && (
              <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                케이블 <span className="font-mono">{fault.cableCode}</span> 의 구간
                거리가 입력되지 않아 정밀 위치를 산출할 수 없습니다. 고장점은{' '}
                <span className="font-semibold">{fault.atLabel}</span> (약{' '}
                {fmtM(fault.cum)} m) 이후 구간입니다.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
