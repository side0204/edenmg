'use client'

import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { X, Save, Loader2 } from 'lucide-react'
import { addSubscriptionCoresFromCanvas } from './core-actions'
import { cableSpecCoreCount, type CableSpec } from '@/lib/relocation'

// 청약 카테고리 도식 모드 전용 — 케이블 위 floating 입력창.
//   케이블 선택 → 캔버스 위에 카드 띄움 → 사용 코어 입력 → Save.
//   server action 이 프로젝트의 청약ID + 가입자명으로 회선을 자동 생성/재사용 후
//   입력한 코어 번호 각각에 대해 core_assignment 1 행씩 생성.
//
// 입력 주체 (entered_role) — owner 결정 2026-05-25:
//   - designer = 설계자. 기별명세서·정산에 반영 안 됨 (계획 단계).
//   - worker   = 작업자. 기별명세서·정산에 반영 (실시공 결과).
//   기본값은 현재 로그인 사용자가 프로젝트 designer 면 'designer', 아니면 'worker'.
//   설계자는 popover 안에서 「작업자용으로 저장」 토글로 override 가능.

export type SubscriptionCablePopoverProps = {
  projectId: string
  cableId: string
  cableCode: string
  cableSpec: string
  // 이 케이블에 이미 배정된 코어 — 중복 입력 시 경고
  usedCores: number[]
  // 현재 사용자의 기본 역할 — 'designer'(프로젝트 designer 본인) / 'worker'(그 외)
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
  usedCores,
  defaultRole,
  onSaved,
  onClose,
}: SubscriptionCablePopoverProps) {
  const maxCore = cableSpecCoreCount(cableSpec as CableSpec) || 1
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  // 설계자가 「작업자용으로 저장」 체크하면 entered_role = 'worker' override
  const [saveAsWorker, setSaveAsWorker] = useState(false)
  const usedSet = useMemo(() => new Set(usedCores), [usedCores])

  const parsed = useMemo(() => parseCores(input, maxCore), [input, maxCore])
  const duplicates = parsed.cores.filter((c) => usedSet.has(c))
  const valid = parsed.cores.length > 0 && parsed.errors.length === 0

  // 실제 저장 역할 — 설계자 + saveAsWorker 토글 시 worker. 그 외 defaultRole.
  const effectiveRole: 'designer' | 'worker' =
    defaultRole === 'designer' && saveAsWorker ? 'worker' : defaultRole

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
    })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    const roleLabel = result.entered_role === 'designer' ? '설계자 입력' : '작업자 입력'
    if (result.skipped.length > 0) {
      toast.warning(
        `${roleLabel} ${result.created}개 / ${result.skipped.length}개 스킵: ` +
          result.skipped.map((s) => `${s.core}(${s.reason})`).join(', '),
      )
    } else {
      toast.success(`${roleLabel} 코어 ${result.created}개를 배정했습니다`)
    }
    setInput('')
    onSaved()
  }

  // 색상 — 설계자(blue)·작업자(rose) 명확 구분
  const isDesigner = effectiveRole === 'designer'
  const borderColor = isDesigner ? 'border-blue-500' : 'border-rose-500'
  const headerBg = isDesigner ? 'bg-blue-50' : 'bg-rose-50'
  const titleColor = isDesigner ? 'text-blue-700' : 'text-rose-700'
  const focusRing = isDesigner ? 'focus:border-blue-500 focus:ring-blue-300' : 'focus:border-rose-500 focus:ring-rose-300'
  const saveBg = isDesigner ? 'bg-blue-600 hover:bg-blue-700' : 'bg-rose-600 hover:bg-rose-700'

  return (
    <div className={`w-full h-full overflow-hidden rounded-lg border-2 ${borderColor} bg-white shadow-2xl`}>
      <div className={`flex items-center justify-between border-b border-slate-200 ${headerBg} px-3 py-2`}>
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
      <div className="px-3 py-2.5 space-y-2">
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
            <span className="font-mono font-bold text-slate-900">
              {usedCores.slice().sort((a, b) => a - b).join(', ')}
            </span>
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
