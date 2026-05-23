'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  X,
  Trash2,
  Save,
  TriangleAlert,
  ChevronLeft,
  ChevronRight,
  Flag,
  Plus,
  RefreshCw,
} from 'lucide-react'
import {
  CABLE_STATUS_VALUES,
  CABLE_STATUS_LABEL,
  CABLE_INSTALLATION_TYPE_VALUES,
  CORE_LIFECYCLE_VALUES,
  CORE_LIFECYCLE_LABEL,
  CIRCUIT_KIND_VALUES,
  CIRCUIT_KIND_LABEL,
  cableSpecCoreCount,
  isCircuitDiverse,
  haversineMeters,
  type CableStatus,
  type CableInstallationType,
  type CoreLifecycle,
  type CircuitKind,
} from '@/lib/relocation'
import { CABLE_SPEC_VALUES, type CableSpec } from '@/lib/connection'
import { updateCableFromCanvas, deleteCableFromCanvas } from './cable-actions'
import {
  addCoreAssignmentFromCanvas,
  bulkAddCoresFromCanvas,
  removeCoreAssignmentFromCanvas,
} from './core-actions'
import SpliceMapModal from './SpliceMapModal'

// 케이블 정보 패널 — 캔버스에서 케이블 클릭 시 우측에 표시.
// 규격·상태·설치구분·전체거리 수정 + 경로점(전주명·구간거리) 입력 + 거리 검증 + 삭제.
//
// 정산 거리 모델:
//   경로 = 시작시설 → wp1 → wp2 → ... → wpN → 도착시설  (구간 N+1 개)
//   wp[i].dist = 직전 점(시작시설 또는 wp[i-1]) → wp[i] 구간 거리
//   endDistance = 마지막 wp(또는 wp 없으면 시작시설) → 도착시설 구간 거리
//   구간 합 = Σ wp.dist + endDistance  →  total_length 와 비교

export type CablePanelData = {
  id: string
  cable_code: string
  spec: CableSpec
  status: CableStatus
  installation_type: CableInstallationType | null
  total_length: number | null
  end_distance: number | null
}

export type CablePanelWaypoint = {
  x: number
  y: number
  lat?: number | null
  lng?: number | null
  pole_name?: string | null
  dist?: number | null
}

// 회선·코어 인라인 입력용 (워크플로우 3단계)
export type CablePanelCircuit = {
  id: string
  circuit_id: string
  subscriber_name: string | null
  kind: string
}

export type CablePanelAssignment = {
  id: string
  circuit_id: string | null
  segment_idx: number
  core_range_start: number
  core_range_end: number
  lifecycle: CoreLifecycle
  is_terminal: boolean
}

export default function CableInfoPanel({
  projectId,
  cable,
  fromName,
  toName,
  fromLat,
  fromLng,
  toLat,
  toLng,
  waypoints,
  waypointColumn,
  circuits,
  assignments,
  onClose,
  onSaved,
  onCoreChanged,
  collapsed,
  onToggleCollapse,
}: {
  projectId: string
  cable: CablePanelData
  fromName: string
  toName: string
  // 시작·도착 시설 GPS — 경로점으로 경로 변경 시 거리 재계산용
  fromLat: number | null
  fromLng: number | null
  toLat: number | null
  toLng: number | null
  waypoints: CablePanelWaypoint[]
  // 경로점 저장 컬럼 — 도식 모드 'waypoints' · 지도 모드 'map_waypoints'
  waypointColumn: 'waypoints' | 'map_waypoints'
  circuits: CablePanelCircuit[]
  assignments: CablePanelAssignment[]
  onClose: () => void
  onSaved: () => void
  onCoreChanged: () => void
  collapsed: boolean
  onToggleCollapse: () => void
}) {
  const [cableCode, setCableCode] = useState<string>(cable.cable_code)
  const [spec, setSpec] = useState<CableSpec>(cable.spec)
  const [status, setStatus] = useState<CableStatus>(cable.status)
  const [installationType, setInstallationType] = useState<string>(
    cable.installation_type ?? '',
  )
  const [totalLength, setTotalLength] = useState<string>(
    cable.total_length != null ? String(cable.total_length) : '',
  )
  const [endDistance, setEndDistance] = useState<string>(
    cable.end_distance != null ? String(cable.end_distance) : '',
  )
  // 경로점별 전주명·구간거리 (waypoints 와 같은 순서)
  const [poleNames, setPoleNames] = useState<string[]>(
    waypoints.map((w) => w.pole_name ?? ''),
  )
  const [dists, setDists] = useState<string[]>(
    waypoints.map((w) => (w.dist != null ? String(w.dist) : '')),
  )
  const [submitting, setSubmitting] = useState(false)

  const parseNum = (s: string): number | null => {
    const t = s.trim()
    if (!t) return null
    const n = Number(t)
    return Number.isFinite(n) && n >= 0 ? n : null
  }

  // 구간 거리 합계 — Σ wp.dist + endDistance
  const segmentSum =
    dists.reduce((acc, d) => acc + (parseNum(d) ?? 0), 0) + (parseNum(endDistance) ?? 0)
  const totalNum = parseNum(totalLength)
  const mismatch = totalNum != null && Math.abs(segmentSum - totalNum) > 0.001

  // 기설 케이블 거리는 기별명세서 정산(포설)에 반영 금지 — 함체 간 거리 파악·검색용.
  const isExisting = status === 'existing'

  // 지도 경로 거리 재계산 가능 여부 — 시작·도착 시설 + 모든 경로점에 GPS 좌표가 있어야.
  const canRecalc =
    fromLat != null &&
    fromLng != null &&
    toLat != null &&
    toLng != null &&
    waypoints.every((w) => w.lat != null && w.lng != null)

  // 경로점으로 경로를 바꾼 뒤, 지도상 실제 경로 거리로 전체거리·구간거리를 다시 채운다.
  //   수동 입력값을 덮어쓰므로 설계자가 「재계산」 버튼을 눌렀을 때만 동작 (자동 X).
  function onRecalcFromRoute() {
    if (!canRecalc) {
      toast.error('지도에 배치된 케이블만 경로 거리를 재계산할 수 있습니다')
      return
    }
    // 경로 점 = 시작시설 → 경로점들 → 도착시설
    const pts = [
      { lat: fromLat as number, lng: fromLng as number },
      ...waypoints.map((w) => ({ lat: w.lat as number, lng: w.lng as number })),
      { lat: toLat as number, lng: toLng as number },
    ]
    // 구간별 거리 (pts.length - 1 개) — 앞 N개는 경로점 구간, 마지막 1개는 도착 구간
    const segs: number[] = []
    for (let i = 0; i < pts.length - 1; i++) {
      segs.push(haversineMeters(pts[i], pts[i + 1]))
    }
    const round = (n: number) => Math.round(n)
    setDists(segs.slice(0, waypoints.length).map((s) => String(round(s))))
    setEndDistance(String(round(segs[segs.length - 1] ?? 0)))
    setTotalLength(String(round(segs.reduce((a, b) => a + b, 0))))
    toast.success('지도 경로 거리로 재계산했습니다. 확인 후 저장하세요.')
  }

  async function onSave() {
    if (submitting) return
    const trimmedCode = cableCode.trim()
    if (!trimmedCode) {
      toast.error('케이블 ID 는 비울 수 없습니다')
      return
    }
    setSubmitting(true)
    const result = await updateCableFromCanvas({
      project_id: projectId,
      cable_id: cable.id,
      cable_code: trimmedCode,
      spec,
      status,
      installation_type: installationType || null,
      total_length: parseNum(totalLength),
      end_distance: parseNum(endDistance),
      waypoint_column: waypointColumn,
      waypoints: waypoints.map((w, i) => ({
        x: w.x,
        y: w.y,
        // 지도 모드 경로점의 GPS 좌표 보존 — 패널에서 전주명·거리만 수정해도 유지
        lat: w.lat ?? null,
        lng: w.lng ?? null,
        pole_name: poleNames[i]?.trim() || null,
        dist: parseNum(dists[i] ?? ''),
      })),
    })
    setSubmitting(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success('케이블 정보를 저장했습니다')
    onSaved()
  }

  async function onDelete() {
    if (submitting) return
    if (
      !confirm(
        `케이블 ${cable.cable_code} 을(를) 삭제하시겠습니까?\n경로·거리 정보도 함께 삭제됩니다.`,
      )
    ) {
      return
    }
    setSubmitting(true)
    const result = await deleteCableFromCanvas(projectId, cable.id)
    setSubmitting(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success('케이블을 삭제했습니다')
    onSaved()
  }

  // 접힘 — 얇은 세로 스트립. 캔버스 작업 공간 확보용.
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapse}
        title="케이블 정보 펼치기"
        className="w-9 shrink-0 h-full border-l border-slate-300 bg-white flex flex-col items-center gap-2 py-2 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="text-[11px] font-bold [writing-mode:vertical-rl]">
          케이블 정보
        </span>
      </button>
    )
  }

  return (
    <div className="w-72 shrink-0 min-h-0 overflow-y-auto border-l border-slate-300 bg-white">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-3 py-2 flex items-center justify-between">
        <span className="text-sm font-bold text-slate-900">케이블 정보</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onDelete}
            disabled={submitting}
            title="케이블 삭제"
            className="inline-flex items-center gap-0.5 rounded-md border border-rose-300 px-1.5 py-0.5 text-[11px] font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            삭제
          </button>
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

      <div className="p-3 space-y-3">
        {/* 구간 + 케이블 ID 편집 */}
        <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600 space-y-1">
          <div>
            <label className="block text-[10px] font-medium text-slate-500">
              케이블 ID
            </label>
            <input
              type="text"
              value={cableCode}
              onChange={(e) => setCableCode(e.target.value)}
              maxLength={100}
              placeholder="LGU+ 제공 ID 또는 NEW-XXXX-NNNNNN"
              className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-mono text-slate-800"
            />
            {cableCode.trim() !== cable.cable_code && (
              <p className="mt-0.5 text-[10px] text-amber-700">
                저장 시 ID 가 변경됩니다 (기존: {cable.cable_code})
              </p>
            )}
          </div>
          <p className="pt-0.5">
            {fromName} <span className="text-slate-400">→</span> {toName}
          </p>
        </div>

        {/* 회선·코어 배정 — 케이블 선택 시 스크롤 없이 바로 입력 (패널 상단 배치) */}
        <CoreAssignSection
          projectId={projectId}
          cable={cable}
          circuits={circuits}
          assignments={assignments}
          onChanged={onCoreChanged}
        />

        {/* 기본 정보 */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] font-medium text-slate-600">규격</label>
            <select
              value={spec}
              onChange={(e) => setSpec(e.target.value as CableSpec)}
              className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
            >
              {CABLE_SPEC_VALUES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600">상태</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as CableStatus)}
              className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
            >
              {CABLE_STATUS_VALUES.map((s) => (
                <option key={s} value={s}>
                  {CABLE_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-600">설치 구분</label>
          <select
            value={installationType}
            onChange={(e) => setInstallationType(e.target.value)}
            className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
          >
            <option value="">(미지정)</option>
            {CABLE_INSTALLATION_TYPE_VALUES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-600">
            케이블 전체거리 (m){' '}
            {isExisting ? (
              <span className="text-blue-600">— 함체 간 거리 (검색용)</span>
            ) : (
              <span className="text-slate-500">— 정산 기준 (포설)</span>
            )}
          </label>
          <input
            type="number"
            min={0}
            step="0.1"
            value={totalLength}
            onChange={(e) => setTotalLength(e.target.value)}
            placeholder={isExisting ? '함체 간 케이블 거리' : '실제 포설 케이블 길이'}
            className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
          />
          {canRecalc && (
            <div className="mt-1">
              <button
                type="button"
                onClick={onRecalcFromRoute}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className="h-3 w-3" />
                지도 경로 거리로 재계산
              </button>
              <p className="mt-0.5 text-[10px] text-slate-400 leading-tight">
                경로점을 옮겨 경로를 바꿨을 때 누르세요. 전체거리·구간거리를 지도
                거리로 다시 채웁니다. 수동 입력값을 유지하려면 누르지 마세요.
              </p>
            </div>
          )}
          {isExisting && (
            <p className="mt-0.5 text-[10px] text-blue-600">
              기설 케이블 거리는 기별명세서 정산에 반영되지 않습니다. 함체 간 거리
              파악·검색용입니다.
            </p>
          )}
        </div>

        {/* 경로점 거리 — 정산용 */}
        <div className="border-t border-slate-200 pt-2">
          <p className="text-[11px] font-bold text-slate-700 mb-1">
            경로점 거리 {isExisting ? '(함체 간 거리)' : '(기별명세서)'}
          </p>
          <div className="space-y-1 text-[11px]">
            {/* 시작 시설 */}
            <p className="text-slate-500">
              시작 · <span className="text-slate-700">{fromName}</span>
            </p>

            {waypoints.length === 0 ? (
              /* 경로점 없음 — 구간 1개 (시작→도착) = endDistance */
              <DistanceRow
                label="시작 → 도착 구간"
                value={endDistance}
                onChange={setEndDistance}
              />
            ) : (
              <>
                {waypoints.map((_, i) => (
                  <div key={i} className="space-y-1">
                    <DistanceRow
                      label={`구간 ${i + 1}`}
                      value={dists[i] ?? ''}
                      onChange={(v) =>
                        setDists((prev) => prev.map((d, j) => (j === i ? v : d)))
                      }
                    />
                    <div className="flex items-center gap-1 pl-2">
                      <span className="text-slate-400">●</span>
                      <span className="text-slate-500">경로점 {i + 1}</span>
                      <input
                        type="text"
                        value={poleNames[i] ?? ''}
                        onChange={(e) =>
                          setPoleNames((prev) =>
                            prev.map((p, j) => (j === i ? e.target.value : p)),
                          )
                        }
                        placeholder="전주명 (전주면 입력)"
                        maxLength={100}
                        className="flex-1 rounded-md border border-slate-300 px-1.5 py-0.5 text-[11px]"
                      />
                    </div>
                  </div>
                ))}
                <DistanceRow
                  label={`구간 ${waypoints.length + 1} (마지막)`}
                  value={endDistance}
                  onChange={setEndDistance}
                />
              </>
            )}

            {/* 도착 시설 */}
            <p className="text-slate-500">
              도착 · <span className="text-slate-700">{toName}</span>
            </p>
          </div>

          {/* 합계 검증 */}
          <div className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px]">
            <p className="text-slate-600">
              구간 합계:{' '}
              <span className="font-semibold text-slate-900">
                {segmentSum.toLocaleString()} m
              </span>
            </p>
            {totalNum != null && (
              <p className="text-slate-600">
                전체거리:{' '}
                <span className="font-semibold text-slate-900">
                  {totalNum.toLocaleString()} m
                </span>
              </p>
            )}
            {mismatch && (
              <div className="mt-1 flex items-start gap-1 text-amber-700">
                <TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-px" />
                <div>
                  <p>
                    구간 합계와 전체거리가 {Math.abs(segmentSum - (totalNum ?? 0)).toLocaleString()} m
                    차이납니다.
                  </p>
                  <button
                    type="button"
                    onClick={() => setTotalLength(String(segmentSum))}
                    className="mt-0.5 underline hover:text-amber-900"
                  >
                    전체거리를 합계({segmentSum.toLocaleString()} m)로 맞추기
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 액션 */}
        <div className="border-t border-slate-200 pt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={submitting}
            className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1 text-[11px] font-medium text-white hover:bg-slate-800 disabled:bg-slate-300"
          >
            <Save className="h-3.5 w-3.5" />
            {submitting ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}


function DistanceRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-1.5 pl-2">
      <span className="text-slate-400">↓</span>
      <span className="text-slate-500 shrink-0">{label}</span>
      <input
        type="number"
        min={0}
        step="0.1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="m"
        className="w-16 rounded-md border border-slate-300 px-1.5 py-0.5 text-[11px]"
      />
      <span className="text-slate-400">m</span>
    </div>
  )
}


// 회선·코어 배정 — 케이블 정보 패널 안의 인라인 입력 폼 (워크플로우 3단계).
// 종단으로 표시한 케이블에 회선·사용코어를 입력한다.
//   - 단일 모드: 회선 1개 + 코어 1개 직접 지정
//   - 일괄 모드: 회선번호 콤마 구분 입력 → 빈 코어 오름차순 자동 배정
//   - 선번장: 전체 코어맵 + 회선의 코어 번호를 다른 빈 코어로 변경
function CoreAssignSection({
  projectId,
  cable,
  circuits,
  assignments,
  onChanged,
}: {
  projectId: string
  cable: CablePanelData
  circuits: CablePanelCircuit[]
  assignments: CablePanelAssignment[]
  onChanged: () => void
}) {
  const cableId = cable.id
  const coreCount = cableSpecCoreCount(cable.spec)
  const [adding, setAdding] = useState(false)
  const [showSpliceMap, setShowSpliceMap] = useState(false)
  const [mode, setMode] = useState<'single' | 'bulk'>('single')
  // 단일 모드
  const [circuitMode, setCircuitMode] = useState('') // '' 미지정 | 'NEW' 새 회선 | circuit id
  const [newCircuitNo, setNewCircuitNo] = useState('')
  const [newCircuitKind, setNewCircuitKind] = useState<CircuitKind>('1코어')
  const [newCircuitLocation, setNewCircuitLocation] = useState('')
  const [coreNo, setCoreNo] = useState('')
  // 일괄 모드 — 회선번호 콤마 구분 + 옵션 한꺼번에
  const [bulkCircuits, setBulkCircuits] = useState('')
  const [bulkKind, setBulkKind] = useState<CircuitKind>('1코어')
  const [bulkLocation, setBulkLocation] = useState('')
  // 공통 옵션
  const [lifecycle, setLifecycle] = useState<CoreLifecycle>('new')
  const [segmentIdx, setSegmentIdx] = useState('0')
  const [isTerminal, setIsTerminal] = useState(true)
  const [busy, setBusy] = useState(false)

  const circuitMap = new Map(circuits.map((c) => [c.id, c]))
  const usedCount = assignments.length
  const freeCount = Math.max(0, coreCount - usedCount)

  // 일괄 모드 미리보기 — 입력값 정제 후 몇 개 회선이 어느 코어에 들어갈지 표시
  const bulkPreview = (() => {
    if (mode !== 'bulk') return null
    const raw = Array.from(
      new Set(bulkCircuits.split(',').map((s) => s.trim()).filter((s) => s.length > 0)),
    )
    const usedSet = new Set(assignments.map((a) => a.core_range_start))
    const free: number[] = []
    for (let i = 1; i <= coreCount; i++) if (!usedSet.has(i)) free.push(i)
    return { raw, free, fits: raw.length <= free.length }
  })()

  function circuitLabel(id: string | null): string {
    if (!id) return '미지정 회선'
    const c = circuitMap.get(id)
    if (!c) return '(삭제된 회선)'
    return c.subscriber_name ? `${c.circuit_id} · ${c.subscriber_name}` : c.circuit_id
  }

  function resetForm() {
    setMode('single')
    setCircuitMode('')
    setNewCircuitNo('')
    setNewCircuitKind('1코어')
    setNewCircuitLocation('')
    setCoreNo('')
    setBulkCircuits('')
    setBulkKind('1코어')
    setBulkLocation('')
    setLifecycle('new')
    setSegmentIdx('0')
    setIsTerminal(true)
  }

  async function onAddSingle() {
    if (busy) return
    const core = Number.parseInt(coreNo, 10)
    if (!Number.isFinite(core) || core < 1) {
      toast.error('코어 번호를 입력하세요')
      return
    }
    if (core > coreCount) {
      toast.error(`코어 번호는 1 ~ ${coreCount} 범위여야 합니다 (${cable.spec})`)
      return
    }
    if (circuitMode === 'NEW' && !newCircuitNo.trim()) {
      toast.error('새 회선번호를 입력하세요')
      return
    }
    setBusy(true)
    const result = await addCoreAssignmentFromCanvas({
      project_id: projectId,
      cable_id: cableId,
      circuit_id: circuitMode && circuitMode !== 'NEW' ? circuitMode : null,
      new_circuit:
        circuitMode === 'NEW'
          ? {
              circuit_id: newCircuitNo.trim(),
              kind: newCircuitKind,
              subscriber_name: newCircuitLocation.trim() || null,
            }
          : null,
      segment_idx: Number.parseInt(segmentIdx, 10) || 0,
      core_no: core,
      lifecycle,
      is_terminal: isTerminal,
    })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success('회선·코어를 배정했습니다')
    resetForm()
    setAdding(false)
    onChanged()
  }

  async function onAddBulk() {
    if (busy) return
    const numbers = bulkCircuits.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
    if (numbers.length === 0) {
      toast.error('회선번호를 콤마(,)로 구분해 입력하세요')
      return
    }
    setBusy(true)
    const result = await bulkAddCoresFromCanvas({
      project_id: projectId,
      cable_id: cableId,
      cable_core_count: coreCount,
      circuit_numbers: numbers,
      kind: bulkKind,
      subscriber_name: bulkLocation.trim() || null,
      lifecycle,
      is_terminal: isTerminal,
      segment_idx: Number.parseInt(segmentIdx, 10) || 0,
    })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    if (result.skipped.length > 0) {
      toast.warning(
        `${result.created}건 배정 / ${result.skipped.length}건 실패: ${result.skipped
          .map((s) => `${s.circuit}(${s.reason})`)
          .join(', ')}`,
      )
    } else {
      toast.success(`${result.created}개 회선을 일괄 배정했습니다`)
    }
    resetForm()
    setAdding(false)
    onChanged()
  }

  async function onRemove(id: string) {
    if (busy) return
    setBusy(true)
    const result = await removeCoreAssignmentFromCanvas(projectId, id)
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success('코어 배정을 삭제했습니다')
    onChanged()
  }

  return (
    <div className="rounded-lg border border-teal-300 bg-teal-50/60 p-2.5">
      <div className="flex items-center justify-between flex-wrap gap-1">
        <p className="text-xs font-bold text-teal-800">
          회선·코어 배정 ({usedCount}/{coreCount})
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowSpliceMap(true)}
            className="inline-flex items-center gap-0.5 rounded-md border border-teal-400 bg-white px-1.5 py-0.5 text-[10px] font-medium text-teal-800 hover:bg-teal-50"
          >
            선번장
          </button>
          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-0.5 rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-slate-800"
            >
              <Plus className="h-3 w-3" />
              추가
            </button>
          )}
        </div>
      </div>

      {/* 기존 배정 목록 */}
      {assignments.length > 0 ? (
        <ul className="mt-1.5 space-y-1">
          {assignments.map((a) => (
            <li
              key={a.id}
              className="flex items-start justify-between gap-1.5 rounded-md border border-slate-200 px-2 py-1"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-mono text-slate-800 flex items-center gap-1 flex-wrap">
                  코어 {a.core_range_start}
                  {a.core_range_end !== a.core_range_start ? `~${a.core_range_end}` : ''}
                  {a.is_terminal && (
                    <span className="inline-flex items-center gap-0.5 rounded border border-blue-300 bg-blue-50 px-1 text-[9px] font-medium text-blue-700">
                      <Flag className="h-2 w-2" />
                      종단
                    </span>
                  )}
                </p>
                <p className="text-[10px] text-slate-500 truncate">
                  {circuitLabel(a.circuit_id)} · {CORE_LIFECYCLE_LABEL[a.lifecycle]}
                  {a.segment_idx > 0 ? ` · 세그 ${a.segment_idx}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemove(a.id)}
                disabled={busy}
                title="배정 삭제"
                className="shrink-0 text-slate-400 hover:text-rose-600 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        !adding && (
          <p className="mt-1.5 text-[10px] text-slate-400 italic">
            이 케이블에 배정된 회선·코어가 없습니다.
          </p>
        )
      )}

      {/* 추가 폼 */}
      {adding && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2 space-y-2">
          {/* 모드 토글 — 단일 / 일괄 */}
          <div className="flex items-center gap-1 rounded-md bg-slate-200/60 p-0.5">
            <button
              type="button"
              onClick={() => setMode('single')}
              className={
                'flex-1 rounded px-2 py-0.5 text-[10px] font-medium ' +
                (mode === 'single'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700')
              }
            >
              단일
            </button>
            <button
              type="button"
              onClick={() => setMode('bulk')}
              className={
                'flex-1 rounded px-2 py-0.5 text-[10px] font-medium ' +
                (mode === 'bulk'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700')
              }
            >
              일괄 (콤마)
            </button>
          </div>

          {mode === 'single' ? (
            <>
              <div>
                <label className="block text-[10px] font-medium text-slate-600">회선</label>
                <select
                  value={circuitMode}
                  onChange={(e) => setCircuitMode(e.target.value)}
                  className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-[11px] bg-white"
                >
                  <option value="">(미지정)</option>
                  {circuits.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.circuit_id}
                      {c.subscriber_name ? ` · ${c.subscriber_name}` : ''}
                      {isCircuitDiverse(c.kind as CircuitKind) ? ' [이원화]' : ''}
                    </option>
                  ))}
                  <option value="NEW">+ 새 회선 입력</option>
                </select>
              </div>

              {circuitMode === 'NEW' && (
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label className="block text-[10px] font-medium text-slate-600">
                      회선번호
                    </label>
                    <input
                      type="text"
                      value={newCircuitNo}
                      onChange={(e) => setNewCircuitNo(e.target.value)}
                      placeholder="예: 5572607"
                      maxLength={100}
                      className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-slate-600">종류</label>
                    <select
                      value={newCircuitKind}
                      onChange={(e) => setNewCircuitKind(e.target.value as CircuitKind)}
                      className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-[11px] bg-white"
                    >
                      {CIRCUIT_KIND_VALUES.map((k) => (
                        <option key={k} value={k}>
                          {CIRCUIT_KIND_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-medium text-slate-600">
                      설치장소
                    </label>
                    <input
                      type="text"
                      value={newCircuitLocation}
                      onChange={(e) => setNewCircuitLocation(e.target.value)}
                      placeholder="가입자 설치장소명 (선택)"
                      maxLength={200}
                      className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-[11px]"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-medium text-slate-600">
                  코어 번호 (1 ~ {coreCount})
                </label>
                <input
                  type="number"
                  min={1}
                  max={coreCount}
                  value={coreNo}
                  onChange={(e) => setCoreNo(e.target.value)}
                  placeholder="이 케이블에서 회선이 쓰는 코어 1개"
                  className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-[11px]"
                />
                <p className="mt-0.5 text-[9px] text-slate-400 leading-tight">
                  2코어·이원화 회선은 코어마다 한 번씩 나눠 배정하세요.
                </p>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-[10px] font-medium text-slate-600">
                  회선번호 (콤마 구분)
                </label>
                <textarea
                  value={bulkCircuits}
                  onChange={(e) => setBulkCircuits(e.target.value)}
                  placeholder="예: 5572607, 5572608, 5572609"
                  rows={3}
                  className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-[11px] font-mono"
                />
                <p className="mt-0.5 text-[9px] text-slate-400 leading-tight">
                  콤마(,)로 구분된 회선번호를 한 번에 입력하세요. 빈 코어 중 작은
                  번호부터 오름차순 자동 배정됩니다. 이미 있는 회선번호는 재사용.
                </p>
                {bulkPreview && bulkPreview.raw.length > 0 && (
                  <div
                    className={
                      'mt-1 rounded-md border px-2 py-1 text-[10px] ' +
                      (bulkPreview.fits
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                        : 'border-rose-300 bg-rose-50 text-rose-800')
                    }
                  >
                    {bulkPreview.fits ? (
                      <>
                        <span className="font-medium">
                          {bulkPreview.raw.length}개 회선 → 코어{' '}
                          {bulkPreview.free
                            .slice(0, bulkPreview.raw.length)
                            .join(', ')}
                        </span>
                      </>
                    ) : (
                      <>
                        빈 코어 부족: 회선 {bulkPreview.raw.length}개 vs 빈 코어{' '}
                        {bulkPreview.free.length}개
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="block text-[10px] font-medium text-slate-600">
                    종류 (일괄 적용)
                  </label>
                  <select
                    value={bulkKind}
                    onChange={(e) => setBulkKind(e.target.value as CircuitKind)}
                    className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-[11px] bg-white"
                  >
                    {CIRCUIT_KIND_VALUES.map((k) => (
                      <option key={k} value={k}>
                        {CIRCUIT_KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-600">
                    설치장소 (일괄 · 선택)
                  </label>
                  <input
                    type="text"
                    value={bulkLocation}
                    onChange={(e) => setBulkLocation(e.target.value)}
                    placeholder="공통일 때만 입력"
                    maxLength={200}
                    className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-[11px]"
                  />
                </div>
              </div>
              <p className="text-[9px] text-slate-400 leading-tight">
                일괄 입력은 새 회선번호 전용입니다. 기존 회선번호가 섞여 있으면
                기존 회선은 재사용되고 종류·설치장소 입력은 무시됩니다.
              </p>
            </>
          )}

          {/* 공통 옵션 — 구분·세그먼트·종단 */}
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label className="block text-[10px] font-medium text-slate-600">구분</label>
              <select
                value={lifecycle}
                onChange={(e) => setLifecycle(e.target.value as CoreLifecycle)}
                className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-[11px] bg-white"
              >
                {CORE_LIFECYCLE_VALUES.map((l) => (
                  <option key={l} value={l}>
                    {CORE_LIFECYCLE_LABEL[l]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-600">세그먼트</label>
              <input
                type="number"
                min={0}
                max={9}
                value={segmentIdx}
                onChange={(e) => setSegmentIdx(e.target.value)}
                className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-[11px]"
              />
            </div>
          </div>

          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={isTerminal}
              onChange={(e) => setIsTerminal(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
            />
            <span className="text-[11px] font-medium text-slate-700 inline-flex items-center gap-0.5">
              <Flag className="h-3 w-3 text-blue-600" />
              종단 (회선의 끝)
            </span>
          </label>
          <p className="text-[9px] text-slate-400 leading-tight">
            회선의 출발/도착점이면 체크. 자동 경로 탐색의 입력이 됩니다.
          </p>

          <div className="flex items-center justify-between gap-1.5 pt-0.5 text-[10px] text-slate-500">
            <span>빈 코어 {freeCount}개</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setAdding(false)
                  resetForm()
                }}
                className="rounded-md border border-slate-300 px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-white"
              >
                취소
              </button>
              <button
                type="button"
                onClick={mode === 'single' ? onAddSingle : onAddBulk}
                disabled={busy}
                className="inline-flex items-center gap-0.5 rounded-md bg-slate-900 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-slate-800 disabled:bg-slate-300"
              >
                <Plus className="h-3 w-3" />
                {busy ? '배정 중...' : mode === 'single' ? '배정' : '일괄 배정'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 선번장 모달 */}
      {showSpliceMap && (
        <SpliceMapModal
          projectId={projectId}
          cableId={cableId}
          cableCode={cable.cable_code}
          coreCount={coreCount}
          circuits={circuits}
          assignments={assignments}
          onClose={() => setShowSpliceMap(false)}
          onChanged={onChanged}
        />
      )}
    </div>
  )
}
