'use client'

import { useState, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { X, Save, Loader2, CheckCircle2, Pencil, GripHorizontal, Plus } from 'lucide-react'
import {
  addSubscriptionCoresFromCanvas,
  confirmDesignerCoresAsWorker,
  removeDesignerCoresOnCable,
} from './core-actions'
import { cableSpecCoreCount, type CableSpec } from '@/lib/relocation'

// 청약 카테고리 도식 모드 전용 — 케이블 위 floating 입력창.
//
// owner 결정 2026-05-25:
//   - designer = 설계자. 기별 미반영.
//   - worker   = 작업자. 기별 반영.
//   - 신설(new) = 케이블 라벨에 표시 / 기설(preexisting) = 정보패널만.
//   - 작업자가 popover 열면 설계자 신설 코어 발견 시 사용확정/변경 액션 노출.
//   - popover 는 헤더 드래그로 이동 가능 (입력된 선번을 가리지 않도록).

export type SubscriptionCablePopoverProps = {
  projectId: string
  cableId: string
  cableCode: string
  cableSpec: string
  cableAssignments: {
    core: number
    entered_role: 'designer' | 'worker'
    lifecycle: 'new' | 'preexisting'
  }[]
  defaultRole: 'designer' | 'worker'
  // SVG viewport unit per client pixel — 드래그 거리 보정용. 1 = SVG zoom 100%
  svgScale: number
  // 다방향 입력 — owner 2026-05-26. 같은 케이블에 여러 박스 동시 노출.
  //   directionIndex: 1-based 순번 (헤더에 "방향 1/N" 표시)
  //   totalDirections: 현재 같은 케이블에 열린 박스 수
  //   canAddDirection: 16개 미만이면 true
  //   onAddDirection: 「+ 방향추가」 클릭 — 부모가 박스 한 개 추가
  directionIndex: number
  totalDirections: number
  canAddDirection: boolean
  onAddDirection: () => void
  onSaved: () => void
  onClose: () => void
}

function parseCores(input: string, maxCore: number): { cores: number[]; errors: string[] } {
  const errors: string[] = []
  const cores: number[] = []
  if (!input.trim()) return { cores, errors }
  const tokens = input.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
  for (const token of tokens) {
    if (token.includes('-') || token.includes('~')) {
      const sep = token.includes('-') ? '-' : '~'
      const [a, b] = token.split(sep).map((s) => s.trim())
      const start = Number.parseInt(a, 10)
      const end = Number.parseInt(b, 10)
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) {
        errors.push(`"${token}" 형식이 올바르지 않습니다 (예: 1-3)`)
        continue
      }
      if (end > maxCore) {
        errors.push(`"${token}" 가 케이블 최대 코어(${maxCore})를 초과합니다`)
        continue
      }
      for (let i = start; i <= end; i++) cores.push(i)
    } else {
      const n = Number.parseInt(token, 10)
      if (!Number.isFinite(n) || n < 1) {
        errors.push(`"${token}" 형식이 올바르지 않습니다`)
        continue
      }
      if (n > maxCore) {
        errors.push(`코어 ${n} 가 케이블 최대 코어(${maxCore})를 초과합니다`)
        continue
      }
      cores.push(n)
    }
  }
  return { cores: Array.from(new Set(cores)).sort((a, b) => a - b), errors }
}

export default function SubscriptionCablePopover({
  projectId,
  cableId,
  cableCode,
  cableSpec,
  cableAssignments,
  defaultRole,
  svgScale,
  directionIndex,
  totalDirections,
  canAddDirection,
  onAddDirection,
  onSaved,
  onClose,
}: SubscriptionCablePopoverProps) {
  const maxCore = cableSpecCoreCount(cableSpec as CableSpec) || 1
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [saveAsWorker, setSaveAsWorker] = useState(false)
  const [lifecycle, setLifecycle] = useState<'new' | 'preexisting'>('new')

  // 드래그 — popover 가 입력된 선번 라벨을 가리지 않도록 사용자가 옮길 수 있게.
  //   foreignObject 안의 HTML 이라 CSS transform 으로 이동. delta 는 client px 에
  //   svgScale 을 곱해 SVG unit 으로 변환 → foreignObject CSS px 와 일치.
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{
    startX: number
    startY: number
    baseX: number
    baseY: number
    scale: number
  } | null>(null)

  function onHeaderPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: offset.x,
      baseY: offset.y,
      scale: svgScale || 1,
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {}
  }
  function onHeaderPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    if (!d) return
    setOffset({
      x: d.baseX + (e.clientX - d.startX) * d.scale,
      y: d.baseY + (e.clientY - d.startY) * d.scale,
    })
  }
  function onHeaderPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}
  }

  const usedCores = useMemo(
    () => cableAssignments.map((a) => a.core).sort((a, b) => a - b),
    [cableAssignments],
  )
  const usedSet = useMemo(() => new Set(usedCores), [usedCores])

  const designerNewCores = useMemo(
    () =>
      cableAssignments
        .filter((a) => a.entered_role === 'designer' && a.lifecycle === 'new')
        .map((a) => a.core)
        .sort((a, b) => a - b),
    [cableAssignments],
  )
  const showWorkerDecision = defaultRole === 'worker' && designerNewCores.length > 0

  const parsed = useMemo(() => parseCores(input, maxCore), [input, maxCore])
  const duplicates = parsed.cores.filter((c) => usedSet.has(c))
  const valid = parsed.cores.length > 0 && parsed.errors.length === 0

  const effectiveRole: 'designer' | 'worker' =
    defaultRole === 'designer' && saveAsWorker ? 'worker' : defaultRole
  const effectiveLifecycle: 'new' | 'preexisting' =
    defaultRole === 'designer' ? lifecycle : 'new'

  async function onSave() {
    if (!valid || busy) return
    const toSubmit = parsed.cores.filter((c) => !usedSet.has(c))
    if (toSubmit.length === 0) {
      toast.info('이미 모두 배정된 코어입니다')
      return
    }
    setBusy(true)
    const result = await addSubscriptionCoresFromCanvas({
      project_id: projectId,
      cable_id: cableId,
      core_numbers: toSubmit,
      entered_role: effectiveRole,
      lifecycle: effectiveLifecycle,
    })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    const roleLabel = result.entered_role === 'designer' ? '설계자' : '작업자'
    const lifecycleLabel = result.lifecycle === 'preexisting' ? '기설' : '신설'
    if (result.skipped.length > 0) {
      toast.warning(
        `${roleLabel} ${lifecycleLabel} ${result.created}개 / 스킵 ${result.skipped.length}개`,
      )
    } else {
      toast.success(`${roleLabel} ${lifecycleLabel} 코어 ${result.created}개 배정`)
    }
    setInput('')
    onSaved()
  }

  async function onWorkerConfirm() {
    if (busy) return
    setBusy(true)
    const result = await confirmDesignerCoresAsWorker({
      project_id: projectId,
      cable_id: cableId,
    })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(`${result.updated}개 코어를 작업자 사용으로 확정했습니다`)
    onSaved()
  }

  async function onWorkerChange() {
    if (busy) return
    if (!confirm('설계자가 입력한 신설 선번을 모두 삭제한 후 새로 입력합니다. 진행할까요?')) {
      return
    }
    setBusy(true)
    const result = await removeDesignerCoresOnCable({
      project_id: projectId,
      cable_id: cableId,
    })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(`설계자 입력 ${result.removed}개 삭제 — 새로 입력하세요`)
    onSaved()
  }

  const isDesigner = effectiveRole === 'designer'
  const borderColor = isDesigner ? 'border-blue-500' : 'border-rose-500'
  const headerBg = isDesigner ? 'bg-blue-50' : 'bg-rose-50'
  const titleColor = isDesigner ? 'text-blue-700' : 'text-rose-700'
  const focusRing = isDesigner
    ? 'focus:border-blue-500 focus:ring-blue-300'
    : 'focus:border-rose-500 focus:ring-rose-300'
  const saveBg = isDesigner ? 'bg-blue-600 hover:bg-blue-700' : 'bg-rose-600 hover:bg-rose-700'

  return (
    <div
      style={{
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        width: '100%',
        height: '100%',
      }}
    >
      <div
        className={`w-full h-full overflow-hidden rounded-xl border-[3px] ${borderColor} bg-white shadow-2xl flex flex-col`}
      >
        {/* 헤더 — 드래그 핸들 */}
        <div
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={onHeaderPointerUp}
          onPointerCancel={onHeaderPointerUp}
          className={`flex items-center justify-between border-b border-slate-200 ${headerBg} px-4 py-3 shrink-0`}
          style={{ cursor: 'move', touchAction: 'none' }}
        >
          <div className="min-w-0 flex items-center gap-2">
            <GripHorizontal className="h-5 w-5 text-slate-400 shrink-0" />
            <div className="min-w-0">
              <p className={`text-2xl font-extrabold ${titleColor} leading-tight`}>
                사용 코어 입력
                {totalDirections > 1 && (
                  <span className="ml-2 text-lg font-bold">
                    방향 {directionIndex}/{totalDirections}
                  </span>
                )}
                <span className="ml-2 text-lg font-bold">
                  ({isDesigner ? '설계자 · 기별 미반영' : '작업자 · 기별 반영'})
                </span>
              </p>
              <p className="text-lg font-semibold text-slate-700 truncate">
                {cableCode} · {cableSpec} (1~{maxCore})
              </p>
            </div>
          </div>
          <div className="shrink-0 ml-2 flex items-center gap-1">
            {/* 방향추가 — 같은 케이블에 박스 한 개 더 띄움. 16 도달 시 비활성.
                헤더 안에 두어 첫 박스 / 추가 박스 어디서나 한 손에 닿게.
                onPointerDown stopPropagation 으로 드래그 트리거 차단. */}
            <button
              type="button"
              onClick={onAddDirection}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={!canAddDirection}
              className="inline-flex items-center gap-1 rounded-md border-2 border-slate-300 bg-white px-2 py-1.5 text-base font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              title={
                canAddDirection
                  ? '같은 케이블에 입력 박스 추가 (최대 16)'
                  : '최대 16방향까지 추가 가능합니다'
              }
            >
              <Plus className="h-4 w-4" />
              방향추가
            </button>
            <button
              type="button"
              onClick={onClose}
              onPointerDown={(e) => e.stopPropagation()}
              className="text-slate-500 hover:text-slate-900 px-1"
              aria-label="닫기"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
          {showWorkerDecision && (
            <div className="rounded-md border-2 border-blue-400 bg-blue-50/70 p-3 space-y-2">
              <p className="text-lg font-bold text-blue-700">
                설계자 입력 신설 선번:{' '}
                <span className="font-mono text-blue-900">{designerNewCores.join(', ')}</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onWorkerConfirm}
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 px-3 py-2.5 text-lg font-extrabold text-white disabled:bg-slate-300"
                >
                  <CheckCircle2 className="h-5 w-5" />
                  사용 확정
                </button>
                <button
                  type="button"
                  onClick={onWorkerChange}
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-amber-600 hover:bg-amber-700 px-3 py-2.5 text-lg font-extrabold text-white disabled:bg-slate-300"
                >
                  <Pencil className="h-5 w-5" />
                  변경
                </button>
              </div>
            </div>
          )}

          {defaultRole === 'designer' && (
            <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setLifecycle('new')}
                disabled={busy}
                className={
                  'flex-1 rounded px-3 py-2 text-lg font-bold ' +
                  (lifecycle === 'new'
                    ? 'bg-white text-blue-700 shadow'
                    : 'text-slate-500')
                }
              >
                신설 선번 (케이블 표시)
              </button>
              <button
                type="button"
                onClick={() => setLifecycle('preexisting')}
                disabled={busy}
                className={
                  'flex-1 rounded px-3 py-2 text-lg font-bold ' +
                  (lifecycle === 'preexisting'
                    ? 'bg-white text-slate-700 shadow'
                    : 'text-slate-500')
                }
              >
                기설 선번 (정보패널만)
              </button>
            </div>
          )}

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="예: 1,2,3 또는 1-3"
            autoFocus
            disabled={busy}
            className={`w-full rounded-md border-2 border-slate-300 px-3 py-2.5 text-2xl font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 ${focusRing} disabled:bg-slate-100`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && valid) {
                e.preventDefault()
                void onSave()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
              }
            }}
          />
          {defaultRole === 'designer' && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={saveAsWorker}
                onChange={(e) => setSaveAsWorker(e.target.checked)}
                disabled={busy}
                className="h-5 w-5 rounded border-slate-300"
              />
              <span className="text-lg font-semibold text-slate-700">
                작업자용으로 저장 (기별 반영)
              </span>
            </label>
          )}
          {usedCores.length > 0 && (
            <p className="text-lg font-medium text-slate-600">
              이미 사용:{' '}
              <span className="font-mono font-bold text-slate-900">{usedCores.join(', ')}</span>
            </p>
          )}
          {parsed.errors.length > 0 && (
            <p className="text-lg font-semibold text-rose-700">{parsed.errors[0]}</p>
          )}
          {duplicates.length > 0 && (
            <p className="text-lg font-semibold text-amber-700">
              중복(스킵 예정):{' '}
              <span className="font-mono font-bold">{duplicates.join(', ')}</span>
            </p>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={!valid || busy}
            className={`w-full inline-flex items-center justify-center gap-2 rounded-md ${saveBg} px-4 py-3 text-xl font-extrabold text-white disabled:bg-slate-300 disabled:cursor-not-allowed`}
          >
            {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Save className="h-6 w-6" />}
            저장
          </button>
        </div>
      </div>
    </div>
  )
}
