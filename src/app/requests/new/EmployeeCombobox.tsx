'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'

export type EmployeeOption = {
  id: string
  name: string
  position: string | null
  team: string | null
  work_type: string | null
}

/**
 * 검색 가능한 직원 콤보박스. 모바일 SaaS 표준 패턴 — 풀스크린 모달 검색.
 *
 * - 트리거 탭 → 화면 전체를 덮는 모달 오버레이 + 검색 input + 결과 리스트
 * - 모바일 키보드와 dropdown 위치 충돌 회피, 클릭 영역 명확
 * - 선택 시 모달 닫힘, hidden input 에 id 저장
 * - 필수(required) 일 때 hidden input 의 native required 로 폼 검증
 */
export function EmployeeCombobox({
  candidates,
  name,
  required = false,
  placeholder = '이름·직급·팀으로 검색',
  emptyLabel = '일치하는 직원이 없습니다',
}: {
  candidates: EmployeeOption[]
  name: string
  required?: boolean
  placeholder?: string
  emptyLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<EmployeeOption | null>(null)

  // 모달 열린 동안 body 스크롤 잠금
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const q = query.trim().toLowerCase()
  const filtered = q
    ? candidates.filter((c) => {
        const hay = [c.name, c.position, c.team, c.work_type]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
    : candidates

  const selectedLabel = selected
    ? [selected.name, selected.position, selected.team ? `${selected.team}팀` : null]
        .filter(Boolean)
        .join(' · ')
    : ''

  const onPick = (emp: EmployeeOption) => {
    setSelected(emp)
    setQuery('')
    setOpen(false)
  }

  const onClear = () => {
    setSelected(null)
  }

  const openModal = () => {
    setQuery('')
    setOpen(true)
  }

  return (
    <>
      <input type="hidden" name={name} value={selected?.id ?? ''} required={required} />

      {selected ? (
        <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5">
          <button
            type="button"
            onClick={openModal}
            className="min-w-0 flex-1 text-left"
          >
            <p className="truncate text-base text-slate-900">{selectedLabel}</p>
          </button>
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 rounded p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label="선택 해제"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={openModal}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-left text-base text-slate-400"
        >
          <span>{placeholder}</span>
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/40">
          <div
            className="flex-1"
            onPointerDown={(e) => {
              e.preventDefault()
              setOpen(false)
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
                onPointerDown={(e) => {
                  e.preventDefault()
                  setOpen(false)
                }}
                className="shrink-0 rounded p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label="닫기"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">{emptyLabel}</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filtered.map((emp) => {
                    const sub = [emp.position, emp.team ? `${emp.team}팀` : null, emp.work_type]
                      .filter(Boolean)
                      .join(' · ')
                    return (
                      <li key={emp.id}>
                        <button
                          type="button"
                          onPointerDown={(e) => {
                            e.preventDefault()
                            onPick(emp)
                          }}
                          className="w-full px-4 py-3 text-left hover:bg-slate-50 active:bg-slate-100"
                        >
                          <span className="block text-base font-medium text-slate-900">
                            {emp.name}
                          </span>
                          {sub && (
                            <span className="mt-0.5 block text-sm text-slate-500">{sub}</span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
