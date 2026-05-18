import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BarChart3, ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { aggregateConnectionStats, type Aggregation } from '@/lib/connection-aggregate'
import { AggregationCard } from '../AggregationCard'

type Dim = 'worker' | 'order' | 'work' | 'year' | 'month' | 'day'

const DIM_TABS: { key: Dim; label: string }[] = [
  { key: 'worker', label: '작업자별' },
  { key: 'order', label: '공사번호별' },
  { key: 'work', label: '작업명별' },
  { key: 'year', label: '연별' },
  { key: 'month', label: '월별' },
  { key: 'day', label: '일별' },
]

const DEFAULT_DIM: Dim = 'worker'

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ dim?: string }>
}) {
  const { dim: dimParam } = await searchParams
  const dim: Dim = (DIM_TABS.find((t) => t.key === dimParam)?.key ?? DEFAULT_DIM) as Dim

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, permission, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | {
        id: string
        company_id: string
        permission: 'worker' | 'foreman' | 'admin' | 'ceo'
        is_active: boolean
      }
    | null
  if (!me || !me.is_active) {
    redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  }

  // 회사의 접속팀 작업만 — 자재·공종 통계는 접속일보 한정
  const { data: worksData } = await supabase
    .from('works')
    .select('id, name, order_id')
    .eq('company_id', me.company_id)
    .eq('worker_type', '접속팀')
  type WorkMeta = { id: string; name: string; order_id: string | null }
  const works = (worksData ?? []) as WorkMeta[]
  const workById = new Map<string, WorkMeta>(works.map((w) => [w.id, w]))

  // 그 작업들의 모든 접속일보 메타
  let reports: { id: string; work_id: string; author_employee_id: string; report_date: string }[] = []
  if (works.length > 0) {
    const { data: reportsData } = await supabase
      .from('connection_reports')
      .select('id, work_id, author_employee_id, report_date')
      .in(
        'work_id',
        works.map((w) => w.id),
      )
    reports = (reportsData ?? []) as typeof reports
  }
  const reportById = new Map(reports.map((r) => [r.id, r]))

  // 차원별 groupKey 함수
  let getGroupKey: (reportId: string) => string | null
  switch (dim) {
    case 'worker':
      getGroupKey = (rid) => reportById.get(rid)?.author_employee_id ?? null
      break
    case 'order':
      getGroupKey = (rid) => {
        const r = reportById.get(rid)
        if (!r) return null
        const w = workById.get(r.work_id)
        if (!w) return null
        return w.order_id ?? '__NO_ORDER__'
      }
      break
    case 'work':
      getGroupKey = (rid) => reportById.get(rid)?.work_id ?? null
      break
    case 'year':
      getGroupKey = (rid) => reportById.get(rid)?.report_date.slice(0, 4) ?? null
      break
    case 'month':
      getGroupKey = (rid) => reportById.get(rid)?.report_date.slice(0, 7) ?? null
      break
    case 'day':
      getGroupKey = (rid) => reportById.get(rid)?.report_date ?? null
      break
  }

  // 집계
  const reportIds = reports.map((r) => r.id)
  const statsMap = await aggregateConnectionStats(supabase, reportIds, getGroupKey)

  // 라벨 매핑 (worker → name, order/work → 자체값)
  const labelByKey = new Map<string, string>()
  if (dim === 'worker') {
    const workerIds = Array.from(statsMap.keys())
    if (workerIds.length > 0) {
      const { data: emps } = await supabase
        .from('employees')
        .select('id, name, position, team')
        .in('id', workerIds)
      for (const e of (emps ?? []) as {
        id: string
        name: string
        position: string | null
        team: string | null
      }[]) {
        const sub = [e.position, e.team ? `${e.team}팀` : null].filter(Boolean).join(' · ')
        labelByKey.set(e.id, sub ? `${e.name} (${sub})` : e.name)
      }
    }
  } else if (dim === 'work') {
    for (const w of works) labelByKey.set(w.id, w.name)
  } else if (dim === 'order') {
    for (const key of statsMap.keys()) {
      labelByKey.set(key, key === '__NO_ORDER__' ? '(공사번호 없음)' : key)
    }
  } else {
    for (const key of statsMap.keys()) labelByKey.set(key, key)
  }

  // 그룹 정렬: 시간 차원은 최근 → 과거 (내림차순), 그 외는 reportCount 내림차순
  type GroupEntry = { key: string; label: string; aggregation: Aggregation }
  const entries: GroupEntry[] = Array.from(statsMap.entries()).map(([key, agg]) => ({
    key,
    label: labelByKey.get(key) ?? key,
    aggregation: agg,
  }))
  const isTimeDim = dim === 'year' || dim === 'month' || dim === 'day'
  if (isTimeDim) {
    entries.sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0))
  } else {
    entries.sort((a, b) => b.aggregation.reportCount - a.aggregation.reportCount)
  }

  const totalReports = reports.length

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <header>
          <Link
            href="/works"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
            작업 관리
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight inline-flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-slate-400" />
            작업 통계
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            접속팀 작업의 자재·공종 합계 · 회사 전체 접속일보 {totalReports}건 기준
          </p>
        </header>

        {/* 차원 탭 — 가로 스크롤 */}
        <nav className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 text-sm">
          {DIM_TABS.map((t) => {
            const active = dim === t.key
            return (
              <Link
                key={t.key}
                href={`/works/stats?dim=${t.key}`}
                className={
                  'shrink-0 rounded-lg px-3 py-1.5 font-medium transition-colors ' +
                  (active
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900')
                }
              >
                {t.label}
              </Link>
            )
          })}
        </nav>

        {entries.length === 0 ? (
          <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center">
            <p className="text-sm text-slate-500">
              집계할 접속일보가 없습니다. 접속팀 작업이 등록되고 일보가 작성되면 통계가 표시됩니다.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {entries.map((entry) => (
              <li key={entry.key}>
                <details className="group rounded-2xl bg-white border border-slate-200 overflow-hidden">
                  <summary className="cursor-pointer list-none p-4 hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900 truncate">{entry.label}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          접속일보 {entry.aggregation.reportCount}건 ·{' '}
                          공종 {entry.aggregation.tasks.length}종 ·{' '}
                          자재 {entry.aggregation.materials.length}종
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-slate-400 group-open:hidden">펼치기 ▾</span>
                      <span className="shrink-0 text-xs text-slate-400 hidden group-open:inline">접기 ▴</span>
                    </div>
                  </summary>
                  <div className="border-t border-slate-100">
                    <AggregationCard
                      title="합계"
                      subtitle={entry.label}
                      aggregation={entry.aggregation}
                    />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
