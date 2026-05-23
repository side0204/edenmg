'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { X, ArrowRight, Flag } from 'lucide-react'
import {
  CORE_LIFECYCLE_LABEL,
  CORE_LIFECYCLE_VALUES,
  type CoreLifecycle,
} from '@/lib/relocation'
import {
  moveCoreAssignmentFromCanvas,
  swapCoreAssignmentsFromCanvas,
  shiftInsertCoreFromCanvas,
  updateCoreLifecycleFromCanvas,
} from './core-actions'
import type { CablePanelCircuit, CablePanelAssignment } from './CableInfoPanel'

type ColKey = 'core' | 'circuit' | 'lifecycle' | 'terminal' | 'action'

// 컬럼 폭 기본값 (px). 사용자가 드래그로 변경 가능.
const COL_DEFAULTS: Record<ColKey, number> = {
  core: 56,
  circuit: 220,
  lifecycle: 80,
  terminal: 56,
  action: 200,
}

const COL_MIN: Record<ColKey, number> = {
  core: 40,
  circuit: 80,
  lifecycle: 50,
  terminal: 40,
  action: 140,
}

// 선번장 — 케이블의 전체 코어(1~N)를 표로 보여주고, 각 회선의 코어 번호를
// 빈 코어로 옮길 수 있게 한다. 다른 케이블로의 이동은 미지원 (같은 케이블 안만).

export default function SpliceMapModal({
  projectId,
  cableId,
  cableCode,
  coreCount,
  circuits,
  assignments,
  onClose,
  onChanged,
}: {
  projectId: string
  cableId: string
  cableCode: string
  coreCount: number
  circuits: CablePanelCircuit[]
  assignments: CablePanelAssignment[]
  onClose: () => void
  onChanged: () => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [colWidths, setColWidths] = useState<Record<ColKey, number>>(COL_DEFAULTS)
  // 드래그 상태: 시작 X 좌표·시작 폭·대상 컬럼
  const dragRef = useRef<{ key: ColKey; startX: number; startW: number } | null>(
    null,
  )

  // 컬럼 폭 드래그 — th 우측 핸들 onPointerDown → window pointermove · pointerup.
  function onResizeStart(e: React.PointerEvent, key: ColKey) {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = {
      key,
      startX: e.clientX,
      startW: colWidths[key],
    }
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const dx = ev.clientX - d.startX
      const next = Math.max(COL_MIN[d.key], d.startW + dx)
      setColWidths((prev) => ({ ...prev, [d.key]: next }))
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // 부모(CableInfoPanel) 가 overflow-y-auto · 캔버스 fullscreen z-40 안에 있어,
  // 같은 트리에 모달을 두면 stacking context 에 갇혀 안 보일 수 있다.
  // document.body 에 portal 로 mount 해 어떤 stacking 도 우회.
  useEffect(() => {
    setMounted(true)
    // 모달 열려 있을 때 ESC 로 닫기
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    // body 스크롤 잠금
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const circuitMap = new Map(circuits.map((c) => [c.id, c]))

  // 코어 번호 → 배정 매핑. start = end 단일 코어 모델이라 start 하나만 본다.
  // 같은 코어에 여러 행이 있을 일은 없지만(exclusion constraint), 만약 있으면 첫 행만.
  const byCore = new Map<number, CablePanelAssignment>()
  for (const a of assignments) {
    if (a.core_range_start >= 1 && a.core_range_start <= coreCount) {
      if (!byCore.has(a.core_range_start)) byCore.set(a.core_range_start, a)
    }
  }
  const used = new Set(byCore.keys())
  const freeCores: number[] = []
  for (let i = 1; i <= coreCount; i++) if (!used.has(i)) freeCores.push(i)

  function circuitLabel(id: string | null): string {
    if (!id) return '미지정'
    const c = circuitMap.get(id)
    if (!c) return '(삭제됨)'
    return c.subscriber_name ? `${c.circuit_id} · ${c.subscriber_name}` : c.circuit_id
  }

  async function onMove(assignmentId: string, newCore: number) {
    if (busy) return
    setBusy(true)
    const result = await moveCoreAssignmentFromCanvas({
      project_id: projectId,
      assignment_id: assignmentId,
      new_core_no: newCore,
    })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(`코어 ${newCore} 로 변경했습니다`)
    setEditingId(null)
    onChanged()
  }

  // 구분(lifecycle) 인라인 변경 — select onChange 즉시 server action.
  async function onLifecycleChange(assignmentId: string, next: CoreLifecycle) {
    if (busy) return
    setBusy(true)
    const result = await updateCoreLifecycleFromCanvas({
      project_id: projectId,
      assignment_id: assignmentId,
      lifecycle: next,
    })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(`${CORE_LIFECYCLE_LABEL[next]} 로 변경했습니다`)
    onChanged()
  }

  // 사용 중 코어와 swap — 두 회선의 코어 번호를 서로 교체.
  async function onSwap(aId: string, bId: string, aCore: number, bCore: number) {
    if (busy) return
    setBusy(true)
    const result = await swapCoreAssignmentsFromCanvas({
      project_id: projectId,
      a_id: aId,
      b_id: bId,
    })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(`코어 ${aCore} ↔ ${bCore} 교체했습니다`)
    setEditingId(null)
    onChanged()
  }

  // 코어 끼워넣기(shift) — A 를 N 으로 옮기고, N 부터 연속 사용 중 row 들을 한 칸씩 뒤로.
  async function onShiftInsert(aId: string, aCore: number, newCore: number) {
    if (busy) return
    setBusy(true)
    const result = await shiftInsertCoreFromCanvas({
      project_id: projectId,
      assignment_id: aId,
      new_core_no: newCore,
      cable_core_count: coreCount,
    })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(`코어 ${aCore} → ${newCore} 끼워넣었습니다`)
    setEditingId(null)
    onChanged()
  }

  if (!mounted) return null

  // document.body portal — 부모 stacking 우회. z-index 100 으로 sonner toast(보통 50~80)보다 높이.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-slate-900/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[85vh] bg-white rounded-xl shadow-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">선번장</h2>
            <p className="text-xs text-slate-500 font-mono">
              {cableCode} · 총 {coreCount} 코어 · 사용 {used.size} · 빈 {freeCores.length}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 코어 목록 — 가로 스크롤 허용 (사용자가 컬럼 폭을 넓게 늘릴 수 있게) */}
        <div className="flex-1 overflow-auto">
          <table
            className="text-xs table-fixed"
            style={{
              width:
                colWidths.core +
                colWidths.circuit +
                colWidths.lifecycle +
                colWidths.terminal +
                colWidths.action,
            }}
          >
            <colgroup>
              <col style={{ width: colWidths.core }} />
              <col style={{ width: colWidths.circuit }} />
              <col style={{ width: colWidths.lifecycle }} />
              <col style={{ width: colWidths.terminal }} />
              <col style={{ width: colWidths.action }} />
            </colgroup>
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-slate-600">
                <ResizableTh label="코어" colKey="core" onResizeStart={onResizeStart} />
                <ResizableTh label="회선" colKey="circuit" onResizeStart={onResizeStart} />
                <ResizableTh label="구분" colKey="lifecycle" onResizeStart={onResizeStart} />
                <ResizableTh label="종단" colKey="terminal" onResizeStart={onResizeStart} />
                <ResizableTh
                  label="코어 변경"
                  colKey="action"
                  onResizeStart={onResizeStart}
                  align="right"
                  noHandle
                />
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: coreCount }, (_, i) => {
                const coreNo = i + 1
                const a = byCore.get(coreNo)
                const isEditing = a && editingId === a.id
                return (
                  <tr key={coreNo} className="border-b border-slate-100">
                    <td className="px-3 py-2 font-mono text-slate-700 truncate">
                      {coreNo}
                    </td>
                    <td className="px-3 py-2 truncate">
                      {a ? (
                        <span className="text-slate-800" title={circuitLabel(a.circuit_id)}>
                          {circuitLabel(a.circuit_id)}
                        </span>
                      ) : (
                        <span className="text-slate-300 italic">(빈)</span>
                      )}
                    </td>
                    <td className="px-3 py-2 truncate">
                      {a ? (
                        <select
                          value={a.lifecycle}
                          onChange={(e) =>
                            onLifecycleChange(a.id, e.target.value as CoreLifecycle)
                          }
                          disabled={busy}
                          title="구분 변경"
                          className="w-full rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px] text-slate-700 disabled:opacity-50"
                        >
                          {CORE_LIFECYCLE_VALUES.map((l) => (
                            <option key={l} value={l}>
                              {CORE_LIFECYCLE_LABEL[l]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {a?.is_terminal ? (
                        <span className="inline-flex items-center gap-0.5 text-blue-700">
                          <Flag className="h-3 w-3" />
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {a ? (
                        isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <select
                              autoFocus
                              defaultValue=""
                              onChange={(e) => {
                                const raw = e.target.value
                                if (!raw) return
                                // value 형식: "<core>:<action>" — action = move | swap | shift
                                const [coreStr, action] = raw.split(':')
                                const v = Number.parseInt(coreStr, 10)
                                if (!Number.isFinite(v) || v < 1) return
                                if (v === a.core_range_start) return
                                if (action === 'move') {
                                  onMove(a.id, v)
                                  return
                                }
                                const occupant = byCore.get(v)
                                if (!occupant) return
                                if (action === 'swap') {
                                  const okSwap = confirm(
                                    `코어 ${a.core_range_start} (${circuitLabel(
                                      a.circuit_id,
                                    )}) ↔ 코어 ${v} (${circuitLabel(
                                      occupant.circuit_id,
                                    )}) 를 서로 교체할까요?`,
                                  )
                                  if (!okSwap) return
                                  onSwap(a.id, occupant.id, a.core_range_start, v)
                                  return
                                }
                                if (action === 'shift') {
                                  const okShift = confirm(
                                    `코어 ${a.core_range_start} 을 코어 ${v} 자리로 끼워넣을까요?\n` +
                                      `코어 ${v} 부터 연속 사용 중인 회선들이 한 칸씩 뒤로 밀립니다.`,
                                  )
                                  if (!okShift) return
                                  onShiftInsert(a.id, a.core_range_start, v)
                                  return
                                }
                              }}
                              disabled={busy}
                              className="rounded-md border border-slate-300 px-1.5 py-0.5 text-[11px] bg-white max-w-[220px]"
                            >
                              <option value="" disabled>
                                옮길 코어 선택
                              </option>
                              {Array.from({ length: coreCount }, (_, i) => {
                                const n = i + 1
                                if (n === a.core_range_start) return null
                                const occ = byCore.get(n)
                                if (!occ) {
                                  return (
                                    <option key={`${n}:move`} value={`${n}:move`}>
                                      코어 {n} · 빈 (이동)
                                    </option>
                                  )
                                }
                                // 사용 중 코어 → 교체 / 끼워넣기 두 옵션 모두 노출
                                const label = circuitLabel(occ.circuit_id)
                                return (
                                  <optgroup
                                    key={`g${n}`}
                                    label={`코어 ${n} · ${label}`}
                                  >
                                    <option value={`${n}:swap`}>↔ 교체</option>
                                    <option value={`${n}:shift`}>→ 끼워넣기</option>
                                  </optgroup>
                                )
                              })}
                            </select>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              disabled={busy}
                              className="rounded-md px-1.5 py-0.5 text-[11px] text-slate-500 hover:bg-slate-100"
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditingId(a.id)}
                            disabled={busy || coreCount <= 1}
                            title="코어 변경 (빈 코어 이동 또는 다른 회선과 교체)"
                            className="inline-flex items-center gap-0.5 rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <ArrowRight className="h-3 w-3" />
                            변경
                          </button>
                        )
                      ) : (
                        <span className="text-slate-300 text-[11px]">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* 푸터 */}
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
          코어 변경은 같은 케이블 안에서만 가능합니다. 다른 케이블로 이동하려면 기존
          배정을 삭제 후 새로 추가하세요.
        </div>
      </div>
    </div>,
    document.body,
  )
}


// 컬럼 헤더 + 우측 드래그 핸들. noHandle 이면 핸들 미렌더 (마지막 컬럼).
function ResizableTh({
  label,
  colKey,
  onResizeStart,
  align,
  noHandle,
}: {
  label: string
  colKey: ColKey
  onResizeStart: (e: React.PointerEvent, key: ColKey) => void
  align?: 'left' | 'right'
  noHandle?: boolean
}) {
  return (
    <th
      className={
        'relative px-3 py-2 font-medium select-none ' +
        (align === 'right' ? 'text-right' : 'text-left')
      }
    >
      <span className="block truncate">{label}</span>
      {!noHandle && (
        <span
          onPointerDown={(e) => onResizeStart(e, colKey)}
          title="드래그하여 폭 조절"
          className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-slate-300/70 active:bg-slate-400/70"
          style={{ touchAction: 'none' }}
        />
      )}
    </th>
  )
}
