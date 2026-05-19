'use client'

import Link from 'next/link'
import { useState } from 'react'
import { CheckCircle2, ListTodo, RotateCcw } from 'lucide-react'
import {
  startDailyChecks,
  closeDailyChecksBulk,
} from './works/daily-check-actions'

export type PendingWorkRow = {
  workId: string
  name: string
  category: string
  subcategory: string | null
  status: '예정' | '진행중' | string
  orderId: string | null
}

export type ActiveCheckRow = {
  checkId: string
  workId: string
  workName: string
  workCategory: string
  workSubcategory: string | null
  orderId: string | null
  createdAt: string
}

export type ClosedCheckRow = {
  checkId: string
  workId: string
  workName: string
  decision: '완료' | '이월'
  closedAt: string | null
}

export default function TodayWorksCard({
  pendingWorks,
  activeChecks,
  closedChecks,
}: {
  pendingWorks: PendingWorkRow[]
  activeChecks: ActiveCheckRow[]
  closedChecks: ClosedCheckRow[]
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [decisions, setDecisions] = useState<Record<string, '완료' | '이월'>>({})
  const [showClosed, setShowClosed] = useState(false)

  const hasAny = pendingWorks.length + activeChecks.length + closedChecks.length > 0
  if (!hasAny) return null

  function toggle(workId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(workId)) next.delete(workId)
      else next.add(workId)
      return next
    })
  }

  function setDecision(checkId: string, dec: '완료' | '이월') {
    setDecisions((prev) => ({ ...prev, [checkId]: dec }))
  }

  const closingCount = Object.keys(decisions).length

  return (
    <section className="rounded-2xl bg-white shadow-sm border border-slate-200 dark:bg-slate-900 dark:border-slate-800 p-6 space-y-4">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 tracking-tight dark:text-slate-300">
        <ListTodo className="h-5 w-5 text-slate-400" />
        오늘 작업
        {activeChecks.length > 0 && (
          <span className="ml-auto inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-0.5">
            진행 {activeChecks.length}
          </span>
        )}
      </h2>

      {/* 진행 중 — 오늘 시작했고 아직 마감 안 함 */}
      {activeChecks.length > 0 && (
        <form action={closeDailyChecksBulk} className="space-y-2">
          <p className="text-xs font-medium text-slate-500">진행 중 — 마감 결정</p>
          <ul className="space-y-2">
            {activeChecks.map((c) => {
              const dec = decisions[c.checkId]
              return (
                <li
                  key={c.checkId}
                  className="rounded-lg border border-slate-200 p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/works/${c.workId}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {c.workName}
                      </Link>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {c.workCategory}
                        {c.workSubcategory ? ` · ${c.workSubcategory}` : ''}
                        {c.orderId ? ` · ${c.orderId}` : ''}
                      </p>
                    </div>
                  </div>
                  <input type="hidden" name="id" value={c.checkId} />
                  <input type="hidden" name="decision" value={dec ?? ''} />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDecision(c.checkId, '완료')}
                      className={
                        'flex-1 rounded-md border px-3 py-2 text-sm font-medium ' +
                        (dec === '완료'
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')
                      }
                    >
                      <CheckCircle2 className="inline h-4 w-4 mr-1" />본인 분 완료
                    </button>
                    <button
                      type="button"
                      onClick={() => setDecision(c.checkId, '이월')}
                      className={
                        'flex-1 rounded-md border px-3 py-2 text-sm font-medium ' +
                        (dec === '이월'
                          ? 'border-amber-500 bg-amber-50 text-amber-700'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')
                      }
                    >
                      <RotateCcw className="inline h-4 w-4 mr-1" />내일 이어서
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
          <button
            type="submit"
            disabled={closingCount === 0}
            className="w-full rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-slate-700 px-4 py-3 text-base font-bold text-white text-center disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            {closingCount > 0 ? `${closingCount}건 마감하기 →` : '결정 선택 후 마감'}
          </button>
          <p className="text-[11px] text-slate-500">
            「본인 분 완료」 는 본인만 끝. 작업 자체 완료 확정은 담당자가 작업 상세에서 별도 처리.
          </p>
        </form>
      )}

      {/* 오늘 추가 시작 */}
      {pendingWorks.length > 0 && (
        <form action={startDailyChecks} className="space-y-2 border-t border-slate-100 pt-4">
          <p className="text-xs font-medium text-slate-500">
            {activeChecks.length > 0 ? '추가로 오늘 시작할 작업' : '오늘 시작할 작업 선택'}
          </p>
          <ul className="space-y-2">
            {pendingWorks.map((w) => {
              const checked = selected.has(w.workId)
              return (
                <li key={w.workId}>
                  <label
                    className={
                      'flex items-start gap-3 rounded-lg border p-3 cursor-pointer ' +
                      (checked
                        ? 'border-emerald-500 bg-emerald-50/60'
                        : 'border-slate-200 hover:border-slate-400')
                    }
                  >
                    <input
                      type="checkbox"
                      name="work_ids"
                      value={w.workId}
                      checked={checked}
                      onChange={() => toggle(w.workId)}
                      className="mt-0.5 h-5 w-5 rounded border-slate-300"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">{w.name}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {w.category}
                        {w.subcategory ? ` · ${w.subcategory}` : ''}
                        {w.orderId ? ` · ${w.orderId}` : ''}
                        {w.status === '예정' && (
                          <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                            예정
                          </span>
                        )}
                      </p>
                    </div>
                  </label>
                </li>
              )
            })}
          </ul>
          <button
            type="submit"
            disabled={selected.size === 0}
            className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 px-4 py-3 text-base font-bold text-white text-center disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            {selected.size > 0 ? `${selected.size}건 시작하기 →` : '작업 선택'}
          </button>
        </form>
      )}

      {/* 오늘 마감 완료 (접힌 채로) */}
      {closedChecks.length > 0 && (
        <div className="border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            className="flex items-center justify-between w-full text-xs text-slate-500 hover:text-slate-700"
          >
            <span>오늘 마감한 작업 {closedChecks.length}건</span>
            <span>{showClosed ? '접기' : '펼치기'}</span>
          </button>
          {showClosed && (
            <ul className="mt-2 space-y-1.5">
              {closedChecks.map((c) => (
                <li
                  key={c.checkId}
                  className="flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded bg-slate-50"
                >
                  <Link href={`/works/${c.workId}`} className="text-slate-700 truncate hover:underline">
                    {c.workName}
                  </Link>
                  <span
                    className={
                      'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ' +
                      (c.decision === '완료'
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-amber-100 text-amber-700')
                    }
                  >
                    {c.decision}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
