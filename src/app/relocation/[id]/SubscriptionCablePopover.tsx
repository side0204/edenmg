'use client'

import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { X, Save, Loader2 } from 'lucide-react'
import { addSubscriptionCoresFromCanvas } from './core-actions'
import { cableSpecCoreCount, type CableSpec } from '@/lib/relocation'

// 청약 카테고리 도식 모드 전용 — 케이블 위 floating 입력창.
//   케이블 선택 → 캔버스 위에 작은 카드 띄움 → 사용 코어 입력 → Save.
//   server action 이 프로젝트의 청약ID + 가입자명으로 회선을 자동 생성/재사용 후
//   입력한 코어 번호 각각에 대해 core_assignment 1 행씩 생성.

export type SubscriptionCablePopoverProps = {
  projectId: string
  cableId: string
  cableCode: string
  cableSpec: string
  // 이 케이블에 이미 배정된 코어 번호 — 중복 입력 시 빨강 경고
  usedCores: number[]
  onSaved: () => void
  onClose: () => void
}

// 사용자 입력 "1,2,3" 또는 "1-3" → 정수 배열
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
  // 중복 제거 + 정렬
  return { cores: Array.from(new Set(cores)).sort((a, b) => a - b), errors }
}

export default function SubscriptionCablePopover({
  projectId,
  cableId,
  cableCode,
  cableSpec,
  usedCores,
  onSaved,
  onClose,
}: SubscriptionCablePopoverProps) {
  // cableSpec 은 DB enum 이라 런타임에 CableSpec 보장 — cast 안전.
  const maxCore = cableSpecCoreCount(cableSpec as CableSpec) || 1
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const usedSet = useMemo(() => new Set(usedCores), [usedCores])

  const parsed = useMemo(() => parseCores(input, maxCore), [input, maxCore])
  const duplicates = parsed.cores.filter((c) => usedSet.has(c))
  const valid = parsed.cores.length > 0 && parsed.errors.length === 0

  async function onSave() {
    if (!valid || busy) return
    // 이미 사용 중인 코어는 빼고 보냄 — server action 에서 한 번 더 detect 하지만 깔끔하게 전처리
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
    })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    if (result.skipped.length > 0) {
      toast.warning(
        `${result.created}개 배정 / ${result.skipped.length}개 스킵: ` +
          result.skipped.map((s) => `${s.core}(${s.reason})`).join(', '),
      )
    } else {
      toast.success(`사용 코어 ${result.created}개를 배정했습니다`)
    }
    setInput('')
    onSaved()
  }

  return (
    <div className="w-full h-full overflow-hidden rounded-lg border-2 border-rose-500 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-200 bg-rose-50/60 px-2 py-1">
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-rose-700 truncate">
            사용 코어 입력
          </p>
          <p className="text-[10px] text-slate-500 truncate">
            {cableCode} · {cableSpec} (1~{maxCore})
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-slate-400 hover:text-slate-900"
          aria-label="닫기"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="px-2 py-1.5 space-y-1.5">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="예: 1,2,3 또는 1-3"
          autoFocus
          disabled={busy}
          className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs font-mono focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-300 disabled:bg-slate-100"
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
        {usedCores.length > 0 && (
          <p className="text-[10px] text-slate-500">
            이미 사용:{' '}
            <span className="font-mono">{usedCores.slice().sort((a, b) => a - b).join(', ')}</span>
          </p>
        )}
        {parsed.errors.length > 0 && (
          <p className="text-[10px] text-rose-600">{parsed.errors[0]}</p>
        )}
        {duplicates.length > 0 && (
          <p className="text-[10px] text-amber-700">
            중복(스킵 예정): <span className="font-mono">{duplicates.join(', ')}</span>
          </p>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={!valid || busy}
          className="w-full inline-flex items-center justify-center gap-1 rounded-md bg-rose-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-rose-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Save className="h-3 w-3" />
          )}
          저장
        </button>
      </div>
    </div>
  )
}
