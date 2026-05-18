'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, Plus, Search, X } from 'lucide-react'
import type { EmployeeOption } from '../requests/new/EmployeeCombobox'

/**
 * 작업 등록 시 여러 작업자 선택용 multi-select.
 * - 「+ 작업자 추가」 버튼 → 풀스크린 모달 검색 (EmployeeCombobox 패턴 재사용)
 * - 선택 시 리스트에 추가, 모달 닫힘
 * - 각 항목 X 버튼으로 제거
 * - hidden input `worker_ids` 에 선택된 id 들을 JSON 직렬화
 * - 모바일 ghost click 회피: 모달 닫는 backdrop 은 onPointerDown + preventDefault
 */
export function WorkersMultiSelect({
  name = 'worker_ids',
  candidates,
  initialSelected = [],
  placeholder = '이름·직급·팀·분야로 검색',
}: {
  name?: string
  candidates: EmployeeOption[]
  initialSelected?: EmployeeOption[]
  placeholder?: string
}) {
  const [selected, setSelected] = useState<EmployeeOption[]>(initialSelected)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // ghost click 차단: 모달 닫은 직후 잠시 (300ms) fixed overlay 로 click 흡수.
  // 한 페이지에 다른 모달(담당자 EmployeeCombobox) 트리거가 있을 때 좌표가 겹쳐
  // 모달이 다시 열리거나 다른 선택이 변경되는 안드로이드 크롬 ghost-click 버그 방어.
  const [ghostBlock, setGhostBlock] = useState(false)

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const closeWithBlock = () => {
    setOpen(false)
    setGhostBlock(true)
    setTimeout(() => setGhostBlock(false), 300)
  }

  const selectedIds = new Set(selected.map((s) => s.id))
  const q = query.trim().toLowerCase()
  const filtered = candidates
    .filter((c) => !selectedIds.has(c.id))
    .filter((c) => {
      if (!q) return true
      const hay = [c.name, c.position, c.team, c.work_type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })

  const onPick = (emp: EmployeeOption) => {
    setSelected((prev) => [...prev, emp])
    setQuery('')
    closeWithBlock()
  }

  const onRemove = (id: string) => {
    setSelected((prev) => prev.filter((s) => s.id !== id))
  }

  const openModal = () => {
    setQuery('')
    setOpen(true)
  }

  return (
    <>
      <input type="hidden" name={name} value={JSON.stringify(selected.map((s) => s.id))} />

      <div className="space-y-2">
        {selected.length === 0 ? (
          <p className="text-xs text-slate-500">
            아직 추가된 작업자가 없습니다. 「+ 작업자 추가」로 한 명씩 추가하세요.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {selected.map((s) => {
              const sub = [
                s.position,
                s.team ? `${s.team}팀` : null,
                s.work_type ? `${s.work_type}` : null,
              ]
                .filter(Boolean)
                .join(' · ')
              return (
                <li
                  key={s.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900 inline-flex items-center gap-1.5">
                      {s.name}
                      {s.work_type && (
                        <span className="inline-flex rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                          {s.work_type}
                        </span>
                      )}
                    </p>
                    {sub && <p className="text-[11px] text-slate-500 truncate">{sub}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(s.id)}
                    className="shrink-0 rounded p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                    aria-label="작업자 제거"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <button
          type="button"
          onClick={openModal}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:border-slate-900 hover:text-slate-900"
        >
          <span className="inline-flex items-center gap-1">
            <Plus className="h-4 w-4" />
            작업자 추가
          </span>
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/40">
          <div
            className="flex-1"
            onPointerDown={(e) => {
              e.preventDefault()
              closeWithBlock()
            }}
            aria-hidden
          />
          <div className="rounded-t-2xl bg-white shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
              <Search className="h-5 w-5 shrink-0 text-slate-400" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
                placeholder={placeholder}
                className="min-w-0 flex-1 bg-transparent text-base focus:outline-none"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => closeWithBlock()}
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
                    : selected.length === candidates.length
                      ? '모든 직원이 이미 추가되었습니다.'
                      : '추가할 수 있는 직원이 없습니다.'}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filtered.map((c) => {
                    const sub = [
                      c.position,
                      c.team ? `${c.team}팀` : null,
                      c.work_type ? `${c.work_type}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                    return (
                      <li key={c.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          onPointerDown={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            onPick(c)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              onPick(c)
                            }
                          }}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 active:bg-slate-100 cursor-pointer"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-base text-slate-900 inline-flex items-center gap-1.5">
                              {c.name}
                              {c.work_type && (
                                <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                  {c.work_type}
                                </span>
                              )}
                            </p>
                            {sub && (
                              <p className="mt-0.5 truncate text-xs text-slate-500">{sub}</p>
                            )}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ghost click 흡수 overlay — 모달 닫힌 직후 300ms 만 표시 */}
      {ghostBlock && (
        <div
          className="fixed inset-0 z-[60]"
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          aria-hidden
        />
      )}
    </>
  )
}
