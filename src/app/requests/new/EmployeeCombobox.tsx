'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'

export type EmployeeOption = {
  id: string
  name: string
  position: string | null
  team: string | null
  work_type: string | null
}

/**
 * 검색 가능한 직원 콤보박스. 모바일 친화 설계.
 *
 * - 입력 시 이름·직급·팀·분야 부분 매칭(대소문자 무시) 으로 후보 필터링
 * - 선택 시 hidden input 에 id 저장, 표시 input 에 이름·직급·팀 라벨
 * - 외부 클릭 시 자동 닫힘
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
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<EmployeeOption | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // 외부 클릭 시 닫음
  useEffect(() => {
    const onDocPointer = (e: Event) => {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocPointer)
    document.addEventListener('touchstart', onDocPointer)
    return () => {
      document.removeEventListener('mousedown', onDocPointer)
      document.removeEventListener('touchstart', onDocPointer)
    }
  }, [])

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

  const onSelect = (emp: EmployeeOption) => {
    setSelected(emp)
    setQuery('')
    setOpen(false)
  }

  const onClear = () => {
    setSelected(null)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      <input type="hidden" name={name} value={selected?.id ?? ''} required={required} />

      {selected ? (
        <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-base text-slate-900">{selectedLabel}</p>
          </div>
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
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.currentTarget.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 pr-9 text-base focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
            aria-label={open ? '닫기' : '열기'}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      )}

      {open && !selected && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-sm text-slate-500">{emptyLabel}</p>
          ) : (
            <ul className="max-h-72 divide-y divide-slate-100 overflow-auto">
              {filtered.map((emp) => {
                const sub = [emp.position, emp.team ? `${emp.team}팀` : null, emp.work_type]
                  .filter(Boolean)
                  .join(' · ')
                return (
                  <li key={emp.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(emp)}
                      className="block w-full px-3 py-2.5 text-left text-sm hover:bg-slate-50 active:bg-slate-100"
                    >
                      <p className="font-medium text-slate-900">{emp.name}</p>
                      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
