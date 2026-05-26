'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { Calendar as CalendarIcon, X, Check, Loader2 } from 'lucide-react'
import { setProjectWorkRequestRange } from '../../actions'

// 작업요청일 인라인 셀 (owner 2026-05-26).
//   - 클릭하면 캘린더 팝업.
//   - 단일 일자: 셀 하나 클릭.
//   - 기간: 시작 셀에서 마우스 다운 → 다른 셀로 드래그 → 마우스 업 (드래그 동안 양쪽 강조).
//   - 「지우기」 버튼으로 null 저장.
//   - 좌/우 화살표로 월 이동.
//
// DB: relocation_projects.work_request_start / work_request_end (date). 마이그 0083.

export type WorkRequestCellProps = {
  projectId: string
  start: string | null // 'YYYY-MM-DD'
  end: string | null
}

function parseDate(s: string | null): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function isBetween(d: Date, a: Date, b: Date): boolean {
  const t = d.getTime()
  const lo = Math.min(a.getTime(), b.getTime())
  const hi = Math.max(a.getTime(), b.getTime())
  return t >= lo && t <= hi
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export default function WorkRequestCell({ projectId, start, end }: WorkRequestCellProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  // 표시 월 — popup 열 때마다 기존 값 기준
  const initialMonth = useMemo(() => {
    const d = parseDate(start) ?? new Date()
    return startOfMonth(d)
  }, [start])
  const [viewMonth, setViewMonth] = useState<Date>(initialMonth)
  // 드래그 진행 중인 임시 selection
  type Sel = { a: Date; b: Date } | null
  const [pending, setPending] = useState<Sel>(null)
  const dragRef = useRef<{ anchor: Date } | null>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  // 외부 클릭 닫기
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!popupRef.current) return
      if (!popupRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    // 약간 지연 — 트리거 버튼 자체 클릭이 곧바로 닫지 않도록
    const id = window.setTimeout(() => document.addEventListener('mousedown', onDoc), 0)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('mousedown', onDoc)
    }
  }, [open])

  // open 할 때 month 동기화
  useEffect(() => {
    if (open) {
      const d = parseDate(start) ?? new Date()
      setViewMonth(startOfMonth(d))
      setPending(null)
    }
  }, [open, start])

  const startD = parseDate(start)
  const endD = parseDate(end)

  // 표시 문자열
  const display = (() => {
    if (!start && !end) return ''
    if (start && end && start !== end) return `${start.slice(5)} ~ ${end.slice(5)}`
    return (start ?? end ?? '').slice(5)
  })()

  // 캘린더 month grid — 6주(42 cells)
  const cells = useMemo<Date[]>(() => {
    const first = startOfMonth(viewMonth)
    const firstDow = first.getDay()
    const startGrid = new Date(first.getFullYear(), first.getMonth(), 1 - firstDow)
    const arr: Date[] = []
    for (let i = 0; i < 42; i += 1) {
      arr.push(new Date(startGrid.getFullYear(), startGrid.getMonth(), startGrid.getDate() + i))
    }
    return arr
  }, [viewMonth])

  function isHighlighted(d: Date): { active: boolean; isStart: boolean; isEnd: boolean } {
    let a: Date | null = null
    let b: Date | null = null
    if (pending) {
      a = pending.a
      b = pending.b
    } else if (startD && endD) {
      a = startD
      b = endD
    } else if (startD) {
      a = b = startD
    }
    if (!a || !b) return { active: false, isStart: false, isEnd: false }
    if (!isBetween(d, a, b)) return { active: false, isStart: false, isEnd: false }
    const lo = a.getTime() <= b.getTime() ? a : b
    const hi = a.getTime() <= b.getTime() ? b : a
    return {
      active: true,
      isStart: isSameDay(d, lo),
      isEnd: isSameDay(d, hi),
    }
  }

  async function commit(s: Date | null, e: Date | null) {
    setBusy(true)
    const result = await setProjectWorkRequestRange({
      project_id: projectId,
      start: s ? formatDate(s) : null,
      end: e ? formatDate(e) : null,
    })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success('작업요청일을 저장했습니다')
    setOpen(false)
  }

  function onCellPointerDown(d: Date, ev: React.PointerEvent) {
    if (busy) return
    ev.preventDefault()
    dragRef.current = { anchor: d }
    setPending({ a: d, b: d })
    try {
      ev.currentTarget.setPointerCapture(ev.pointerId)
    } catch {}
  }
  function onCellPointerEnter(d: Date) {
    if (!dragRef.current) return
    setPending({ a: dragRef.current.anchor, b: d })
  }
  function onCellPointerUp() {
    if (!dragRef.current) return
    const p = pending
    dragRef.current = null
    if (!p) return
    const lo = p.a.getTime() <= p.b.getTime() ? p.a : p.b
    const hi = p.a.getTime() <= p.b.getTime() ? p.b : p.a
    void commit(lo, hi)
  }

  const monthLabel = `${viewMonth.getFullYear()}년 ${viewMonth.getMonth() + 1}월`

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        disabled={busy}
        className={
          'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium ' +
          (display
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-50')
        }
        title="작업요청일 — 클릭하여 캘린더 열기"
      >
        <CalendarIcon className="h-3 w-3" />
        {display || '설정'}
      </button>
      {open && (
        <div
          ref={popupRef}
          className="absolute left-0 top-full mt-1 z-30 w-[260px] rounded-lg border border-slate-300 bg-white p-2 shadow-xl text-[12px]"
          onPointerUp={onCellPointerUp}
        >
          <div className="flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={() => setViewMonth((m) => addMonths(m, -1))}
              className="rounded p-1 hover:bg-slate-100 text-slate-600"
              title="이전 달"
            >
              ◀
            </button>
            <span className="font-bold text-slate-800">{monthLabel}</span>
            <button
              type="button"
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
              className="rounded p-1 hover:bg-slate-100 text-slate-600"
              title="다음 달"
            >
              ▶
            </button>
          </div>
          <div className="mt-1 grid grid-cols-7 gap-0.5 text-center">
            {WEEKDAYS.map((w, i) => (
              <span
                key={w}
                className={
                  'text-[10px] font-semibold ' +
                  (i === 0 ? 'text-rose-500' : i === 6 ? 'text-sky-500' : 'text-slate-500')
                }
              >
                {w}
              </span>
            ))}
            {cells.map((d, i) => {
              const inMonth = d.getMonth() === viewMonth.getMonth()
              const { active, isStart, isEnd } = isHighlighted(d)
              const dow = d.getDay()
              return (
                <button
                  key={i}
                  type="button"
                  onPointerDown={(e) => onCellPointerDown(d, e)}
                  onPointerEnter={() => onCellPointerEnter(d)}
                  className={
                    'h-7 rounded text-[11px] tabular-nums select-none ' +
                    (!inMonth ? 'text-slate-300 ' : '') +
                    (active
                      ? 'bg-emerald-500 text-white font-bold ' +
                        (isStart && isEnd ? 'rounded' : isStart ? 'rounded-l' : isEnd ? 'rounded-r' : 'rounded-none')
                      : inMonth
                        ? dow === 0
                          ? 'text-rose-600 hover:bg-slate-100'
                          : dow === 6
                            ? 'text-sky-600 hover:bg-slate-100'
                            : 'text-slate-700 hover:bg-slate-100'
                        : 'hover:bg-slate-50')
                  }
                  style={{ touchAction: 'none' }}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>
          <div className="mt-2 flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={() => void commit(null, null)}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              title="작업요청일 지우기"
            >
              <X className="h-3 w-3" />
              지우기
            </button>
            <div className="flex items-center gap-1">
              {busy && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Check className="h-3 w-3" />
                닫기
              </button>
            </div>
          </div>
          <p className="mt-1 text-[10px] text-slate-400">
            셀 클릭=단일·드래그=기간
          </p>
        </div>
      )}
    </span>
  )
}
