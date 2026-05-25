'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Plus, Search, X } from 'lucide-react'

/**
 * 청약 프로젝트 — 외선·접속 작업자 멀티 picker.
 *
 *  - 후보: 회사 직원 중 해당 work_type ('외선팀' / '접속팀') 인 활성 직원
 *  - 트리거 「+ 작업자 추가」 → 풀스크린 모달 + 검색 input
 *  - 항목 탭 = 토글, 「완료」 버튼으로 모달 닫음
 *  - hidden input name 에 JSON array of employee ids 저장 (server 가 파싱)
 *  - WorkersMultiSelect 와 달리 worker_type 은 fixed (이 picker 가 어느 리스트인지로 결정)
 *  - 모바일 안전 패턴: 모달 항상 mount + hidden 토글 (unmount 시 state 리셋 회피)
 */

export type RelocationWorkerCandidate = {
  id: string
  name: string
  position: string | null
  team: string | null
  work_type: string | null
}

export function RelocationWorkerPicker({
  name,
  candidates,
  initialIds = [],
  label,
  emptyHint = '아직 추가된 작업자가 없습니다.',
}: {
  name: string
  candidates: RelocationWorkerCandidate[]
  initialIds?: string[]
  /** picker 라벨 (외선 / 접속) */
  label: string
  emptyHint?: string
}) {
  const candidateById = useMemo(
    () => new Map(candidates.map((c) => [c.id, c])),
    [candidates],
  )
  const initial = useMemo(
    () =>
      initialIds
        .map((id) => candidateById.get(id))
        .filter((c): c is RelocationWorkerCandidate => !!c),
    [initialIds, candidateById],
  )

  const [selected, setSelected] = useState<RelocationWorkerCandidate[]>(initial)
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

  const q = query.trim().toLowerCase()
  const filtered = candidates.filter((c) => {
    if (!q) return true
    const hay = [c.name, c.position, c.team, c.work_type]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })

  const onToggle = (c: RelocationWorkerCandidate) => {
    setSelected((prev) =>
      prev.some((s) => s.id === c.id)
        ? prev.filter((s) => s.id !== c.id)
        : [...prev, c],
    )
  }

  const onRemove = (id: string) => {
    setSelected((prev) => prev.filter((s) => s.id !== id))
  }

  // server 가 parseIdArray 로 받음
  const payload = JSON.stringify(selected.map((s) => s.id))

  return (
    <>
      <input type="hidden" name={name} value={payload} />

      <div className="space-y-1.5">
        {selected.length === 0 ? (
          <p className="text-xs text-slate-500 lg:text-[10px]">{emptyHint}</p>
        ) : (
          <ul className="flex flex-wrap gap-1">
            {selected.map((s) => {
              const sub = [s.position, s.team ? `${s.team}팀` : null]
                .filter(Boolean)
                .join(' · ')
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onRemove(s.id)}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs lg:text-[11px] text-slate-700 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700"
                    title={sub || undefined}
                  >
                    {s.name}
                    <X className="h-3 w-3" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <button
          type="button"
          onClick={() => {
            setQuery('')
            setOpen(true)
          }}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 bg-white px-2 py-1 text-xs lg:text-[11px] text-slate-600 hover:border-slate-900 hover:text-slate-900"
        >
          <Plus className="h-3.5 w-3.5" />
          {label} 작업자 추가
        </button>
      </div>

      {/* 모달 — 항상 mount, hidden 토글 */}
      <div
        className={
          'fixed inset-0 z-50 flex flex-col bg-black/40 ' +
          (open ? '' : 'hidden pointer-events-none')
        }
      >
        <button
          type="button"
          className="flex-1"
          onClick={() => setOpen(false)}
          aria-label="닫기"
        />
        <div className="rounded-t-2xl bg-white shadow-xl max-h-[85vh] flex flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
            <p className="text-xs text-slate-500">
              {label} 작업자 선택 · 추가됨{' '}
              <span className="font-semibold text-slate-900 tabular-nums">
                {selected.length}
              </span>
              명
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
            >
              완료
            </button>
          </div>

          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
            <Search className="h-5 w-5 shrink-0 text-slate-400" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              placeholder="이름·직급·팀으로 검색"
              className="min-w-0 flex-1 bg-transparent text-base focus:outline-none"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="shrink-0 rounded p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              aria-label="닫기"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                {q
                  ? '일치하는 직원이 없습니다.'
                  : `${label} 직원이 없습니다. 직원관리에서 직무를 「${label}팀」 으로 설정해주세요.`}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filtered.map((c) => {
                  const isSel = selectedIds.has(c.id)
                  const sub = [c.position, c.team ? `${c.team}팀` : null]
                    .filter(Boolean)
                    .join(' · ')
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => onToggle(c)}
                        aria-pressed={isSel}
                        className={
                          'flex w-full items-center gap-3 px-4 py-3 text-left ' +
                          (isSel
                            ? 'bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200'
                            : 'hover:bg-slate-50 active:bg-slate-100')
                        }
                      >
                        <span
                          className={
                            'shrink-0 flex h-5 w-5 items-center justify-center rounded border ' +
                            (isSel
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'border-slate-300 bg-white')
                          }
                        >
                          {isSel && <Check className="h-3.5 w-3.5" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base text-slate-900">{c.name}</p>
                          {sub && (
                            <p className="mt-0.5 truncate text-xs text-slate-500">{sub}</p>
                          )}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
