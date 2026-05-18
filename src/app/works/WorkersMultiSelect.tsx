'use client'

import { useEffect, useState } from 'react'
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react'
import type { EmployeeOption } from '../requests/new/EmployeeCombobox'

/**
 * 작업 등록 시 여러 작업자 선택용 multi-select.
 *
 * 핵심 패턴 (모바일 ghost-click 안전):
 *  - 「+ 작업자 추가」 → 풀스크린 모달
 *  - 모달의 직원 항목은 toggle 동작 (이미 추가된 직원이면 제거, 아니면 추가)
 *  - 추가 후 리스트에서 항목을 제거하지 않음 → 화면 reorder 안 됨 → 손가락 위치의
 *    항목이 바뀌지 않아 ghost click 으로 다른 직원이 잘못 선택되는 일 없음
 *  - 모달이 자동으로 닫히지 않음. 사용자가 「완료」 또는 X 로 명시 종료
 *  - 모달 상단에 추가된 직원 칩 리스트 표시 — 사용자가 모달 안에서 즉시 확인 가능
 *
 * hidden input `worker_ids` 에 선택된 id 들을 JSON 배열로 직렬화.
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
    setTimeout(() => setGhostBlock(false), 500)
  }

  const selectedIdSet = new Set(selected.map((s) => s.id))
  const q = query.trim().toLowerCase()
  // 중요: filtered 에서 selected 항목을 제거하지 않는다.
  // → 항목 위치가 바뀌지 않아 ghost click 안전. 이미 선택된 항목은 체크 표시.
  const filtered = candidates.filter((c) => {
    if (!q) return true
    const hay = [c.name, c.position, c.team, c.work_type]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })

  const onToggle = (emp: EmployeeOption) => {
    setSelected((prev) => {
      if (prev.some((s) => s.id === emp.id)) {
        return prev.filter((s) => s.id !== emp.id)
      }
      return [...prev, emp]
    })
  }

  const onRemove = (id: string) => {
    setSelected((prev) => prev.filter((s) => s.id !== id))
  }

  const openModal = () => {
    setQuery('')
    setOpen(true)
  }

  const noWorkTypeCount = candidates.filter((c) => !c.work_type).length

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
                s.work_type ? `${s.work_type} 분야` : null,
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
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
              <p className="text-xs text-slate-500">
                추가됨{' '}
                <span className="font-semibold text-slate-900 tabular-nums">
                  {selected.length}
                </span>
                명 · 직원을 탭하면 추가, 다시 탭하면 제거
              </p>
              <button
                type="button"
                onClick={() => closeWithBlock()}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
              >
                완료
              </button>
            </div>

            {/* 추가된 직원 칩 리스트 — 모달 안에서 즉시 확인 + 빠른 제거 */}
            {selected.length > 0 && (
              <div className="border-b border-slate-100 bg-slate-50 px-3 py-2">
                <ul className="flex flex-wrap gap-1">
                  {selected.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => onRemove(s.id)}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700"
                      >
                        {s.name}
                        {s.work_type && (
                          <span className="text-[10px] text-slate-500">· {s.work_type}</span>
                        )}
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

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

            {noWorkTypeCount > 0 && (
              <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-[11px] text-amber-800">
                ※ 분야(접속/외선/공무) 미지정 직원 {noWorkTypeCount}명. 「관리 → 직원 관리」에서
                분야를 설정하면 여기에 배지로 표시됩니다.
              </p>
            )}

            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">
                  {q ? '일치하는 직원이 없습니다.' : '등록된 직원이 없습니다.'}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filtered.map((c) => {
                    const isSel = selectedIdSet.has(c.id)
                    const sub = [
                      c.position,
                      c.team ? `${c.team}팀` : null,
                      c.work_type ? `${c.work_type} 분야` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                    return (
                      <li key={c.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          aria-pressed={isSel}
                          onPointerDown={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            onToggle(c)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              onToggle(c)
                            }
                          }}
                          className={
                            'flex w-full items-center gap-3 px-4 py-3 text-left cursor-pointer ' +
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
                            <p className="truncate text-base text-slate-900 inline-flex items-center gap-1.5">
                              {c.name}
                              {c.work_type && (
                                <span
                                  className={
                                    'inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-medium ' +
                                    workTypeBadgeClass(c.work_type)
                                  }
                                >
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

      {/* ghost click 흡수 overlay — 모달 닫힌 직후 500ms */}
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

function workTypeBadgeClass(workType: string): string {
  if (workType === '접속') return 'border-blue-200 bg-blue-50 text-blue-700'
  if (workType === '외선') return 'border-orange-200 bg-orange-50 text-orange-700'
  if (workType === '공무') return 'border-violet-200 bg-violet-50 text-violet-700'
  return 'border-slate-200 bg-slate-50 text-slate-600'
}
