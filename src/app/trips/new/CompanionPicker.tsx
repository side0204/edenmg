'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Plus, Search, X } from 'lucide-react'
import { MAX_COMPANIONS } from '@/lib/trips'

/**
 * 동행인 멀티 picker (최대 4명).
 *  - 트리거 「동행 추가」 → 풀스크린 모달 + 검색
 *  - 항목 탭(onClick) = 토글, 「완료」 로 닫음. onPointerDown 금지 — 스크롤 시작 터치가 선택으로 잡힘
 *  - hidden input `companion_ids` 에 JSON id 배열
 *  - 모바일 안전 패턴: 모달 항상 mount + hidden 토글 (unmount 시 state 리셋 회피)
 */
export type CompanionCandidate = {
  id: string
  name: string
  position: string | null
  team: string | null
  work_type: string | null
}

export function CompanionPicker({
  candidates,
  initialIds = [],
}: {
  candidates: CompanionCandidate[]
  initialIds?: string[]
}) {
  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates])
  const [selected, setSelected] = useState<CompanionCandidate[]>(() =>
    initialIds.map((id) => byId.get(id)).filter((c): c is CompanionCandidate => !!c),
  )
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected])
  const full = selected.length >= MAX_COMPANIONS

  const q = query.trim().toLowerCase()
  const filtered = candidates.filter((c) => {
    if (!q) return true
    return [c.name, c.position, c.team, c.work_type].filter(Boolean).join(' ').toLowerCase().includes(q)
  })

  const toggle = (c: CompanionCandidate) => {
    setSelected((prev) => {
      if (prev.some((s) => s.id === c.id)) return prev.filter((s) => s.id !== c.id)
      if (prev.length >= MAX_COMPANIONS) return prev
      return [...prev, c]
    })
  }

  return (
    <>
      <input type="hidden" name="companion_ids" value={JSON.stringify(selected.map((s) => s.id))} />

      <div className="flex flex-wrap gap-2">
        {selected.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSelected((prev) => prev.filter((x) => x.id !== s.id))}
            className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-2 text-[13px] font-medium text-white"
            title="탭하여 제거"
          >
            {s.name}
            <X className="h-3.5 w-3.5" />
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setQuery('')
            setOpen(true)
          }}
          disabled={full}
          className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-[13px] font-medium text-slate-600 ring-1 ring-slate-300 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
          동행 추가
        </button>
      </div>
      <p className="text-xs text-slate-500">
        {selected.length} / {MAX_COMPANIONS} · 최대 {MAX_COMPANIONS}명. 동행인 홈에도 「외근 중 (동승)」 으로 표시됩니다.
      </p>

      {/* 모달 — 항상 mount, hidden 토글 */}
      <div className={'fixed inset-0 z-50 flex flex-col bg-black/40 ' + (open ? '' : 'hidden pointer-events-none')}>
        <button type="button" className="flex-1" onClick={() => setOpen(false)} aria-label="닫기" />
        <div className="flex max-h-[85vh] flex-col rounded-t-2xl bg-white shadow-xl">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
            <p className="text-xs text-slate-500">
              동행인 선택 · {selected.length}/{MAX_COMPANIONS}
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
            >
              완료
            </button>
          </div>
          <div className="px-4 py-2">
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 shadow-[inset_0_0_0_1px_#e2e8f0]">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
                placeholder="이름·직급·팀으로 검색"
                className="w-full bg-transparent text-base outline-none placeholder:text-slate-400"
              />
            </div>
          </div>
          <ul className="flex-1 overflow-y-auto px-2 pb-[env(safe-area-inset-bottom)]">
            {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">검색 결과가 없습니다.</li>}
            {filtered.map((c) => {
              const on = selectedIds.has(c.id)
              const disabled = !on && full
              const sub = [c.position, c.team ? `${c.team}팀` : null, c.work_type].filter(Boolean).join(' · ')
              return (
                <li key={c.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-disabled={disabled}
                    // onClick (표준 탭) — onPointerDown 은 스크롤하려고 누르는 순간에도 토글돼 오선택 발생.
                    // 모달이 닫히지 않는 토글 UI 라 ghost click 걱정 없음 (WorkersMultiSelect 와 동일).
                    onClick={() => {
                      if (!disabled) toggle(c)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        if (!disabled) toggle(c)
                      }
                    }}
                    className={
                      'flex items-center justify-between gap-3 rounded-xl px-3 py-3 select-none ' +
                      (on ? 'bg-emerald-50' : disabled ? 'opacity-40' : 'hover:bg-slate-50 active:bg-slate-100')
                    }
                  >
                    <div className="min-w-0">
                      <p className="text-base font-medium text-slate-900">{c.name}</p>
                      {sub && <p className="text-xs text-slate-500">{sub}</p>}
                    </div>
                    <div
                      className={
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full ' +
                        (on ? 'bg-emerald-600 text-white' : 'ring-1 ring-slate-300')
                      }
                    >
                      {on && <Check className="h-4 w-4" />}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </>
  )
}
