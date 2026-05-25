'use client'

import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { X, Save, Loader2, CheckCircle2, Pencil } from 'lucide-react'
import {
  addSubscriptionCoresFromCanvas,
  confirmDesignerCoresAsWorker,
  removeDesignerCoresOnCable,
} from './core-actions'
import { cableSpecCoreCount, type CableSpec } from '@/lib/relocation'

// 청약 카테고리 도식 모드 전용 — 케이블 위 floating 입력창.
//   케이블 선택 → 캔버스 위에 카드 띄움 → 사용 코어 입력 → Save.
//   server action 이 프로젝트의 청약ID + 가입자명으로 회선을 자동 생성/재사용 후
//   입력한 코어 번호 각각에 대해 core_assignment 1 행씩 생성.
//
// 입력 주체 (entered_role) — owner 결정 2026-05-25:
//   - designer = 설계자. 기별명세서·정산에 반영 안 됨 (계획 단계).
//   - worker   = 작업자. 기별명세서·정산에 반영 (실시공 결과).
//
// 선번 종류 (lifecycle) — owner 추가 2026-05-25:
//   - new        = 신설 선번. 케이블 위 라벨에 표시.
//   - preexisting= 기설 선번. 정보패널에서만 표시, 캔버스엔 안 보임.
//
// 작업자가 popover 를 열었을 때 이 케이블에 designer 신설 코어가 이미 있으면:
//   [✓ 사용 확정] — 그대로 사용. designer → worker 로 전환 (기별 반영 효과).
//   [✎ 변경]     — designer 입력 모두 삭제 후 새로 입력.

export type SubscriptionCablePopoverProps = {
  projectId: string
  cableId: string
  cableCode: string
  cableSpec: string
  // 이 케이블의 코어 배정 정보 — 기존 사용 코어 + 설계자 신설 코어 확인용
  cableAssignments: {
    core: number
    entered_role: 'designer' | 'worker'
    lifecycle: 'new' | 'preexisting'
  }[]
  // 현재 사용자의 기본 역할
  defaultRole: 'designer' | 'worker'
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
  onSaved,
  onClose,
}: SubscriptionCablePopoverProps) {
  const maxCore = cableSpecCoreCount(cableSpec as CableSpec) || 1
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  // 설계자가 「작업자용으로 저장」 체크하면 entered_role override 'worker'
  const [saveAsWorker, setSaveAsWorker] = useState(false)
  // 설계자만 기설/신설 선택. 작업자는 항상 신설.
  const [lifecycle, setLifecycle] = useState<'new' | 'preexisting'>('new')

  const usedCores = useMemo(
    () => cableAssignments.map((a) => a.core).sort((a, b) => a - b),
    [cableAssignments],
  )
  const usedSet = useMemo(() => new Set(usedCores), [usedCores])

  // 작업자가 popover 를 열었을 때 — 이 케이블의 designer 신설 코어 (사용확정/변경 대상)
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

  // 실제 저장 역할
  const effectiveRole: 'designer' | 'worker' =
    defaultRole === 'designer' && saveAsWorker ? 'worker' : defaultRole
  // 작업자는 항상 신설. 설계자만 기설 옵션 가능.
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

  // 색상 — 설계자(blue)·작업자(rose) 명확 구분
  const isDesigner = effectiveRole === 'designer'
  const borderColor = isDesigner ? 'border-blue-500' : 'border-rose-500'
  const headerBg = isDesigner ? 'bg-blue-50' : 'bg-rose-50'
  const titleColor = isDesigner ? 'text-blue-700' : 'text-rose-700'
  const focusRing = isDesigner
    ? 'focus:border-blue-500 focus:ring-blue-300'
    : 'focus:border-rose-500 focus:ring-rose-300'
  const saveBg = isDesigner ? 'bg-blue-600 hover:bg-blue-700' : 'bg-rose-600 hover:bg-rose-700'

  return (
    <div className={`w-full h-full overflow-hidden rounded-lg border-2 ${borderColor} bg-white shadow-2xl flex flex-col`}>
      <div className={`flex items-center justify-between border-b border-slate-200 ${headerBg} px-3 py-2 shrink-0`}>
        <div className="min-w-0">
          <p className={`text-sm font-extrabold ${titleColor}`}>
            사용 코어 입력
            <span className="ml-2 text-[11px] font-bold">
              ({isDesigner ? '설계자 · 기별 미반영' : '작업자 · 기별 반영'})
            </span>
          </p>
          <p className="text-xs font-semibold text-slate-700 truncate">
            {cableCode} · {cableSpec} (1~{maxCore})
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-slate-500 hover:text-slate-900 ml-2"
          aria-label="닫기"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5 space-y-2">
        {/* 작업자가 본 designer 신설 코어 — 사용확정/변경 액션 */}
        {showWorkerDecision && (
          <div className="rounded-md border-2 border-blue-400 bg-blue-50/70 p-2 space-y-1.5">
            <p className="text-xs font-bold text-blue-700">
              설계자 입력 신설 선번 발견:{' '}
              <span className="font-mono text-blue-900">
                {designerNewCores.join(', ')}
              </span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onWorkerConfirm}
                disabled={busy}
                className="inline-flex items-center justify-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-700 px-2 py-1.5 text-xs font-extrabold text-white disabled:bg-slate-300"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                사용 확정
              </button>
              <button
                type="button"
                onClick={onWorkerChange}
                disabled={busy}
                className="inline-flex items-center justify-center gap-1 rounded-md bg-amber-600 hover:bg-amber-700 px-2 py-1.5 text-xs font-extrabold text-white disabled:bg-slate-300"
              >
                <Pencil className="h-3.5 w-3.5" />
                변경
              </button>
            </div>
          </div>
        )}

        {/* 설계자 — 기설/신설 토글 */}
        {defaultRole === 'designer' && (
          <div className="flex items-center gap-1 rounded-md bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => setLifecycle('new')}
              disabled={busy}
              className={
                'flex-1 rounded px-2 py-1 text-xs font-bold ' +
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
                'flex-1 rounded px-2 py-1 text-xs font-bold ' +
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
          className={`w-full rounded-md border-2 border-slate-300 px-3 py-2 text-base font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 ${focusRing} disabled:bg-slate-100`}
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
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={saveAsWorker}
              onChange={(e) => setSaveAsWorker(e.target.checked)}
              disabled={busy}
              className="h-4 w-4 rounded border-slate-300"
            />
            <span className="text-xs font-semibold text-slate-700">
              작업자용으로 저장 (기별 반영)
            </span>
          </label>
        )}
        {usedCores.length > 0 && (
          <p className="text-xs font-medium text-slate-600">
            이미 사용:{' '}
            <span className="font-mono font-bold text-slate-900">{usedCores.join(', ')}</span>
          </p>
        )}
        {parsed.errors.length > 0 && (
          <p className="text-xs font-semibold text-rose-700">{parsed.errors[0]}</p>
        )}
        {duplicates.length > 0 && (
          <p className="text-xs font-semibold text-amber-700">
            중복(스킵 예정): <span className="font-mono font-bold">{duplicates.join(', ')}</span>
          </p>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={!valid || busy}
          className={`w-full inline-flex items-center justify-center gap-1.5 rounded-md ${saveBg} px-3 py-2 text-sm font-extrabold text-white disabled:bg-slate-300 disabled:cursor-not-allowed`}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          저장
        </button>
      </div>
    </div>
  )
}
