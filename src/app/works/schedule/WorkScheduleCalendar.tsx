'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ScheduleChangeRequestModal from './ScheduleChangeRequestModal'

// 작업 캘린더 — 월 grid + 작업 이벤트 bar.
//   owner 2026-05-26.
//   이벤트 클릭 → 일정변경 요청 모달.
//   본인이 배정된 작업만 변경 요청 가능 (assignee 또는 work_assignments 에 본인 포함).

export type CalendarRequest = {
  id: string
  requested_by_name: string
  requested_start: string | null
  requested_end: string | null
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  responded_by_name: string | null
  responded_at: string | null
  response_note: string | null
  created_at: string
}

export type CalendarWork = {
  id: string
  name: string
  status: string
  start_date: string | null
  end_date: string | null
  isSubscription: boolean
  assignee_name: string | null
  assignee_employee_id: string | null
  worker_names: string[]
  worker_ids: string[]
  requests: CalendarRequest[]
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function parseDate(s: string | null): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function fmt(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}
function sameYM(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

export default function WorkScheduleCalendar({
  year,
  month,
  works,
  myEmployeeId,
  myName,
  linkage,
}: {
  year: number
  month: number // 1-12
  works: CalendarWork[]
  myEmployeeId: string
  myName: string
  linkage: 'all' | 'subscription' | 'other'
}) {
  const router = useRouter()
  const [openWork, setOpenWork] = useState<CalendarWork | null>(null)
  const [pendingNotice, setPendingNotice] = useState(false)

  const monthStart = useMemo(() => new Date(year, month - 1, 1), [year, month])

  const cells = useMemo<Date[]>(() => {
    const first = new Date(year, month - 1, 1)
    const dow = first.getDay()
    const gridStart = new Date(year, month - 1, 1 - dow)
    const arr: Date[] = []
    for (let i = 0; i < 42; i += 1) {
      arr.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i))
    }
    return arr
  }, [year, month])

  // 각 cell day 에 어떤 작업이 걸리는지 매핑 — 작업 별 (startDate, endDate) 가 그 day 를 포함
  const worksByDay = useMemo(() => {
    const m = new Map<string, CalendarWork[]>()
    for (const w of works) {
      const s = parseDate(w.start_date)
      const e = parseDate(w.end_date) ?? s
      if (!s || !e) continue
      const sT = Math.min(s.getTime(), e.getTime())
      const eT = Math.max(s.getTime(), e.getTime())
      for (const d of cells) {
        const dt = d.getTime()
        if (dt >= sT && dt <= eT) {
          const key = fmt(d)
          if (!m.has(key)) m.set(key, [])
          m.get(key)!.push(w)
        }
      }
    }
    return m
  }, [works, cells])

  function navMonth(delta: number) {
    const newDate = new Date(year, month - 1 + delta, 1)
    const ym = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`
    router.push(`/works/schedule?linkage=${linkage}&month=${ym}`)
  }

  const monthLabel = `${year}년 ${month}월`
  const today = new Date()

  function statusColor(w: CalendarWork): string {
    // 청약 → 에메랄드, 그 외 → 블루. 상태에 따라 진하기 살짝 변형
    const base = w.isSubscription ? 'emerald' : 'blue'
    if (w.status === '완료') return `bg-${base}-200 text-${base}-800 border-${base}-300`
    if (w.status === '취소') return 'bg-slate-100 text-slate-500 border-slate-300 line-through'
    return `bg-${base}-500 text-white border-${base}-700`
  }
  // 위 동적 클래스는 tailwind 가 인식 못 함 → 명시 매핑
  function statusClasses(w: CalendarWork): string {
    if (w.status === '취소') return 'bg-slate-100 text-slate-500 border-slate-300 line-through'
    if (w.isSubscription) {
      return w.status === '완료'
        ? 'bg-emerald-200 text-emerald-800 border-emerald-300'
        : 'bg-emerald-500 text-white border-emerald-700'
    } else {
      return w.status === '완료'
        ? 'bg-blue-200 text-blue-800 border-blue-300'
        : 'bg-blue-500 text-white border-blue-700'
    }
  }

  function canRequestChange(w: CalendarWork): boolean {
    if (w.assignee_employee_id === myEmployeeId) return true
    if (w.worker_ids.includes(myEmployeeId)) return true
    return false
  }

  function onClickWork(w: CalendarWork) {
    if (!canRequestChange(w)) {
      // 표시만 — 본인 작업이 아니면 변경 요청 불가 안내
      setPendingNotice(true)
      window.setTimeout(() => setPendingNotice(false), 2500)
      return
    }
    setOpenWork(w)
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <button
          type="button"
          onClick={() => navMonth(-1)}
          className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
        >
          ◀ 이전 달
        </button>
        <span className="font-bold text-slate-800 text-lg">{monthLabel}</span>
        <button
          type="button"
          onClick={() => navMonth(1)}
          className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
        >
          다음 달 ▶
        </button>
      </div>
      {pendingNotice && (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
          이 작업은 본인 배정이 아니라 일정 변경을 요청할 수 없습니다.
        </div>
      )}
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={
              'py-1.5 ' +
              (i === 0 ? 'text-rose-600' : i === 6 ? 'text-sky-600' : 'text-slate-700')
            }
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, idx) => {
          const inMonth = sameYM(d, monthStart)
          const isToday =
            d.getFullYear() === today.getFullYear() &&
            d.getMonth() === today.getMonth() &&
            d.getDate() === today.getDate()
          const key = fmt(d)
          const dayWorks = worksByDay.get(key) ?? []
          return (
            <div
              key={idx}
              className={
                'border-b border-r border-slate-200 p-1 min-h-[112px] ' +
                (inMonth ? 'bg-white' : 'bg-slate-50/50') +
                ((idx + 1) % 7 === 0 ? ' border-r-0' : '')
              }
            >
              <div className="flex items-center justify-between">
                <span
                  className={
                    'text-xs font-semibold ' +
                    (!inMonth
                      ? 'text-slate-300'
                      : d.getDay() === 0
                        ? 'text-rose-600'
                        : d.getDay() === 6
                          ? 'text-sky-600'
                          : 'text-slate-600')
                  }
                >
                  {d.getDate()}
                </span>
                {isToday && (
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-500" />
                )}
              </div>
              <div className="mt-1 space-y-0.5">
                {dayWorks.slice(0, 4).map((w) => {
                  const pendingCnt = w.requests.filter((r) => r.status === 'pending').length
                  return (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => onClickWork(w)}
                      className={
                        'block w-full truncate rounded border px-1.5 py-0.5 text-left text-[10px] font-medium ' +
                        statusClasses(w)
                      }
                      title={
                        `${w.name}\n` +
                        `${w.assignee_name ? '담당: ' + w.assignee_name : ''}` +
                        `${w.worker_names.length > 0 ? '\n작업자: ' + w.worker_names.join(', ') : ''}` +
                        `${pendingCnt > 0 ? '\n일정변경 대기 ' + pendingCnt + '건' : ''}`
                      }
                    >
                      {pendingCnt > 0 && (
                        <span className="mr-0.5 inline-block rounded bg-amber-300 px-0.5 text-[9px] font-bold text-amber-900">
                          !{pendingCnt}
                        </span>
                      )}
                      {w.name}
                    </button>
                  )
                })}
                {dayWorks.length > 4 && (
                  <span className="text-[9px] text-slate-400">+{dayWorks.length - 4}건</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="border-t border-slate-200 px-3 py-2 text-[11px] text-slate-500 flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />
          청약작업
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-500" />
          그 외 작업
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-300" />
          일정변경 대기
        </span>
        <Link
          href="/works"
          className="ml-auto rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-50"
        >
          작업 목록으로
        </Link>
      </div>
      {openWork && (
        <ScheduleChangeRequestModal
          work={openWork}
          myName={myName}
          onClose={() => setOpenWork(null)}
          onRequested={() => {
            setOpenWork(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
