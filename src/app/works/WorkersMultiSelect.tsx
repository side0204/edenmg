'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react'
import type { EmployeeOption } from '../requests/new/EmployeeCombobox'
import { WORKER_TYPE_VALUES, type WorkWorkerType } from '@/lib/work'

/**
 * 작업 등록 시 다중 작업자 선택 + 작업자별 worker_type 지정.
 *
 * 핵심 패턴:
 *  - 「+ 작업자 추가」 → 풀스크린 모달, 항목 onClick (표준 탭), toggle 동작
 *  - 항목이 list 에서 사라지지 않음 (체크 표시만) → 위치 변동 없음, ghost-tap 없음
 *  - 추가된 작업자 카드 옆에 worker_type select (작업의 worker_type 이 default)
 *  - 모달 자동 닫기 안 함, 「완료」 버튼으로만 닫음
 *  - hidden input `worker_ids` 값: JSON 객체 배열
 *      [{ id, worker_type, worker_type_custom? }]
 */
type SelectedWorker = {
  id: string
  name: string
  position: string | null
  team: string | null
  work_type: string | null
  worker_type: WorkWorkerType
  worker_type_custom: string | null
}

export function WorkersMultiSelect({
  name = 'worker_ids',
  candidates,
  initialSelected = [],
  defaultWorkerType,
  placeholder = '이름·직급·팀·분야로 검색',
}: {
  name?: string
  candidates: EmployeeOption[]
  initialSelected?: SelectedWorker[]
  /** 작업의 worker_type — 신규 추가 시 default */
  defaultWorkerType?: WorkWorkerType | null
  placeholder?: string
}) {
  const [selected, setSelected] = useState<SelectedWorker[]>(initialSelected)
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

  const selectedIdSet = useMemo(() => new Set(selected.map((s) => s.id)), [selected])
  const q = query.trim().toLowerCase()
  const filtered = candidates.filter((c) => {
    if (!q) return true
    const hay = [c.name, c.position, c.team, c.work_type]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })

  // 추가 시 default worker_type:
  //   1) 작업의 worker_type (props)
  //   2) 직원의 work_type(분야) 매핑 (공무→기타, 외선→외선팀, 접속→접속팀)
  //   3) '기타'
  const computeDefaultWorkerType = (emp: EmployeeOption): WorkWorkerType => {
    if (defaultWorkerType) return defaultWorkerType
    if (emp.work_type === '접속') return '접속팀'
    if (emp.work_type === '외선') return '외선팀'
    return '기타'
  }

  const onToggle = (emp: EmployeeOption) => {
    setSelected((prev) => {
      if (prev.some((s) => s.id === emp.id)) {
        return prev.filter((s) => s.id !== emp.id)
      }
      return [
        ...prev,
        {
          id: emp.id,
          name: emp.name,
          position: emp.position,
          team: emp.team,
          work_type: emp.work_type,
          worker_type: computeDefaultWorkerType(emp),
          worker_type_custom: null,
        },
      ]
    })
  }

  const onRemove = (id: string) => {
    setSelected((prev) => prev.filter((s) => s.id !== id))
  }

  const updateWorkerType = (id: string, wt: WorkWorkerType) => {
    setSelected((prev) =>
      prev.map((s) => (s.id === id ? { ...s, worker_type: wt, worker_type_custom: null } : s)),
    )
  }

  const updateWorkerTypeCustom = (id: string, value: string) => {
    setSelected((prev) =>
      prev.map((s) => (s.id === id ? { ...s, worker_type_custom: value } : s)),
    )
  }

  const openModal = () => {
    setQuery('')
    setOpen(true)
  }

  // hidden input payload — server 가 파싱
  const payload = JSON.stringify(
    selected.map((s) => ({
      id: s.id,
      worker_type: s.worker_type,
      worker_type_custom:
        s.worker_type === '기타' ? (s.worker_type_custom?.trim() || null) : null,
    })),
  )

  return (
    <>
      <input type="hidden" name={name} value={payload} />

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
                  className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900 inline-flex items-center gap-1.5">
                        {s.name}
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
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {WORKER_TYPE_VALUES.map((wt) => {
                      const active = s.worker_type === wt
                      return (
                        <button
                          type="button"
                          key={wt}
                          onClick={() => updateWorkerType(s.id, wt)}
                          className={
                            'rounded-md px-2 py-1.5 text-xs font-medium border transition-colors ' +
                            (active
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-700 border-slate-300 hover:border-slate-900')
                          }
                        >
                          {wt}
                        </button>
                      )
                    })}
                  </div>
                  {s.worker_type === '기타' && (
                    <input
                      value={s.worker_type_custom ?? ''}
                      onChange={(e) => updateWorkerTypeCustom(s.id, e.currentTarget.value)}
                      placeholder="구분명 직접 입력"
                      maxLength={30}
                      className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                    />
                  )}
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
          <button
            type="button"
            className="flex-1"
            onClick={() => setOpen(false)}
            aria-label="닫기"
          />
          <div className="rounded-t-2xl bg-white shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
              <p className="text-xs text-slate-500">
                추가됨{' '}
                <span className="font-semibold text-slate-900 tabular-nums">
                  {selected.length}
                </span>
                명 · 직원을 탭하면 추가/제거
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
              >
                완료
              </button>
            </div>

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
                        <span className="text-[10px] text-slate-500">· {s.worker_type}</span>
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

function workTypeBadgeClass(workType: string): string {
  if (workType === '접속') return 'border-blue-200 bg-blue-50 text-blue-700'
  if (workType === '외선') return 'border-orange-200 bg-orange-50 text-orange-700'
  if (workType === '공무') return 'border-violet-200 bg-violet-50 text-violet-700'
  return 'border-slate-200 bg-slate-50 text-slate-600'
}
