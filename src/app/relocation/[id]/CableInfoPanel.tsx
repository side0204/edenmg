'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { X, Trash2, Save, TriangleAlert, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  CABLE_STATUS_VALUES,
  CABLE_STATUS_LABEL,
  CABLE_INSTALLATION_TYPE_VALUES,
  type CableStatus,
  type CableInstallationType,
} from '@/lib/relocation'
import { CABLE_SPEC_VALUES, type CableSpec } from '@/lib/connection'
import { updateCableFromCanvas, deleteCableFromCanvas } from './cable-actions'

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
  pole_name?: string | null
  dist?: number | null
}

export default function CableInfoPanel({
  projectId,
  cable,
  fromName,
  toName,
  waypoints,
  onClose,
  onSaved,
  collapsed,
  onToggleCollapse,
}: {
  projectId: string
  cable: CablePanelData
  fromName: string
  toName: string
  waypoints: CablePanelWaypoint[]
  onClose: () => void
  onSaved: () => void
  collapsed: boolean
  onToggleCollapse: () => void
}) {
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

  async function onSave() {
    if (submitting) return
    setSubmitting(true)
    const result = await updateCableFromCanvas({
      project_id: projectId,
      cable_id: cable.id,
      spec,
      status,
      installation_type: installationType || null,
      total_length: parseNum(totalLength),
      end_distance: parseNum(endDistance),
      waypoints: waypoints.map((w, i) => ({
        x: w.x,
        y: w.y,
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
    <div className="w-72 shrink-0 h-full overflow-y-auto border-l border-slate-300 bg-white">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-3 py-2 flex items-center justify-between">
        <span className="text-sm font-bold text-slate-900">케이블 정보</span>
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

      <div className="p-3 space-y-3">
        {/* 구간 */}
        <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600">
          <p className="font-mono text-slate-700">{cable.cable_code}</p>
          <p className="mt-0.5">
            {fromName} <span className="text-slate-400">→</span> {toName}
          </p>
        </div>

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
        <div className="border-t border-slate-200 pt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onDelete}
            disabled={submitting}
            className="inline-flex items-center gap-1 rounded-md border border-rose-300 px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            케이블 삭제
          </button>
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
