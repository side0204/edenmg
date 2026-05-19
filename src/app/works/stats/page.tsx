import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BarChart3, ChevronLeft, Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  aggregateConnectionStats,
  buildStatsTable,
  type Aggregation,
} from '@/lib/connection-aggregate'
import { STATUS_COLOR, type WorkStatus } from '@/lib/work'
import { AggregationCard } from '../AggregationCard'
import { StatsTable } from './StatsTable'

type Dim = 'worker' | 'order' | 'work' | 'year' | 'month' | 'day'

const DIM_TABS: { key: Dim; label: string; defaultLimit: number }[] = [
  { key: 'worker', label: '작업자별', defaultLimit: 30 },
  { key: 'order', label: '공사번호별', defaultLimit: 30 },
  { key: 'work', label: '작업명별', defaultLimit: 30 },
  { key: 'year', label: '연별', defaultLimit: 0 }, // 전체
  { key: 'month', label: '월별', defaultLimit: 24 },
  { key: 'day', label: '일별', defaultLimit: 30 },
]

const DEFAULT_DIM: Dim = 'worker'
const LIMIT_OPTIONS = [10, 30, 100, 0] // 0 = 전체

type View = 'cards' | 'table'
type Metric = 'all' | 'tasks' | 'materials'

const METRIC_TABS: { key: Metric; label: string }[] = [
  { key: 'all', label: '전체 통계' },
  { key: 'tasks', label: '공종 통계' },
  { key: 'materials', label: '자재 통계' },
]

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{
    dim?: string
    from?: string
    to?: string
    limit?: string
    view?: string
    metric?: string
  }>
}) {
  const {
    dim: dimParam,
    from: fromParam,
    to: toParam,
    limit: limitParam,
    view: viewParam,
    metric: metricParam,
  } = await searchParams
  const dimEntry = DIM_TABS.find((t) => t.key === dimParam) ?? DIM_TABS.find((t) => t.key === DEFAULT_DIM)!
  const dim: Dim = dimEntry.key
  const view: View = viewParam === 'table' ? 'table' : 'cards'
  const metric: Metric =
    metricParam === 'tasks' ? 'tasks' : metricParam === 'materials' ? 'materials' : 'all'

  const from = fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? fromParam : null
  const to = toParam && /^\d{4}-\d{2}-\d{2}$/.test(toParam) ? toParam : null

  // limit: URL > defaultLimit. 0 또는 'all' 은 전체.
  const limitNum =
    limitParam === 'all'
      ? 0
      : limitParam !== undefined && Number.isFinite(parseInt(limitParam, 10))
        ? Math.max(0, parseInt(limitParam, 10))
        : dimEntry.defaultLimit

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, permission, can_view_stats, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | {
        id: string
        company_id: string
        permission: 'worker' | 'team_member' | 'team_leader' | 'admin'
        can_view_stats: boolean
        is_active: boolean
      }
    | null
  if (!me || !me.is_active) {
    redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  }

  // 통계 조회 권한:
  //   admin/ceo OR can_view_stats=true → 회사 전체
  //   그 외 → 본인이 작성한 일보 기반 통계만
  const isAdminLike = me.permission === 'admin'
  const canViewAll = isAdminLike || me.can_view_stats

  // 회사의 접속팀 작업만 — 자재·공종 통계는 접속일보 한정
  const { data: worksData } = await supabase
    .from('works')
    .select('id, name, order_id, status')
    .eq('company_id', me.company_id)
    .eq('worker_type', '접속팀')
  type WorkMeta = { id: string; name: string; order_id: string | null; status: string }
  const works = (worksData ?? []) as WorkMeta[]
  const workById = new Map<string, WorkMeta>(works.map((w) => [w.id, w]))

  // 그 작업들의 모든 접속일보 메타 (기간 필터 적용)
  type ReportMeta = {
    id: string
    work_id: string
    author_employee_id: string
    report_date: string
  }
  let reports: ReportMeta[] = []
  if (works.length > 0) {
    let q = supabase
      .from('connection_reports')
      .select('id, work_id, author_employee_id, report_date')
      .in(
        'work_id',
        works.map((w) => w.id),
      )
    if (from) q = q.gte('report_date', from)
    if (to) q = q.lte('report_date', to)
    if (!canViewAll) q = q.eq('author_employee_id', me.id)
    const { data: reportsData } = await q
    reports = (reportsData ?? []) as ReportMeta[]
  }
  const reportById = new Map(reports.map((r) => [r.id, r]))

  // 차원별 groupKey
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

  const reportIds = reports.map((r) => r.id)

  // 표 모드는 일보 단위 wide 표만 빌드. 차원/limit 무시 (메타로만 활용).
  const tableData =
    view === 'table'
      ? await buildStatsTable(
          supabase,
          reports,
          new Map(
            works.map((w) => [
              w.id,
              { name: w.name, order_id: w.order_id, status: w.status },
            ]),
          ),
        )
      : null

  const statsMap =
    view === 'cards'
      ? await aggregateConnectionStats(supabase, reportIds, getGroupKey)
      : new Map<string, Aggregation>()

  // 라벨 매핑
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

  // 그룹별 작업 상태 분포 — 같은 그룹에 속한 unique work 들의 status 카운트
  const workIdsByGroup = new Map<string, Set<string>>()
  for (const r of reports) {
    const gk = getGroupKey(r.id)
    if (gk == null) continue
    let s = workIdsByGroup.get(gk)
    if (!s) {
      s = new Set()
      workIdsByGroup.set(gk, s)
    }
    s.add(r.work_id)
  }

  // 정렬 + TOP N
  type GroupEntry = {
    key: string
    label: string
    aggregation: Aggregation
    statusCounts: { status: WorkStatus; count: number }[]
  }
  const allEntries: GroupEntry[] = Array.from(statsMap.entries()).map(([key, agg]) => {
    const wids = workIdsByGroup.get(key) ?? new Set<string>()
    const counts = new Map<WorkStatus, number>()
    for (const wid of wids) {
      const w = workById.get(wid)
      if (!w) continue
      counts.set(w.status as WorkStatus, (counts.get(w.status as WorkStatus) ?? 0) + 1)
    }
    return {
      key,
      label: labelByKey.get(key) ?? key,
      aggregation: agg,
      statusCounts: Array.from(counts.entries()).map(([status, count]) => ({ status, count })),
    }
  })
  const isTimeDim = dim === 'year' || dim === 'month' || dim === 'day'
  if (isTimeDim) {
    allEntries.sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0))
  } else {
    allEntries.sort((a, b) => b.aggregation.reportCount - a.aggregation.reportCount)
  }
  const entries = limitNum > 0 ? allEntries.slice(0, limitNum) : allEntries
  const truncated = allEntries.length > entries.length

  const maxReports = entries.reduce((m, e) => Math.max(m, e.aggregation.reportCount), 0)
  const totalReports = reports.length

  // URL 빌더
  const buildHref = (next: {
    dim?: Dim
    from?: string | null
    to?: string | null
    limit?: number
    view?: View
    metric?: Metric
  }) => {
    const params = new URLSearchParams()
    const fd = next.dim ?? dim
    const ffrom = next.from === undefined ? from : next.from
    const fto = next.to === undefined ? to : next.to
    const flimit = next.limit === undefined ? limitNum : next.limit
    const fview = next.view ?? view
    const fmetric = next.metric ?? metric
    if (fd !== DEFAULT_DIM) params.set('dim', fd)
    if (ffrom) params.set('from', ffrom)
    if (fto) params.set('to', fto)
    if (fview !== 'cards') params.set('view', fview)
    if (fmetric !== 'all') params.set('metric', fmetric)
    // 차원의 defaultLimit 와 다를 때만 URL 에 표시
    const defaultForDim = DIM_TABS.find((t) => t.key === fd)?.defaultLimit ?? 0
    if (flimit !== defaultForDim) {
      params.set('limit', flimit === 0 ? 'all' : String(flimit))
    }
    const qs = params.toString()
    return qs ? `/works/stats?${qs}` : '/works/stats'
  }

  const csvBaseParams = new URLSearchParams()
  csvBaseParams.set('dim', dim)
  if (from) csvBaseParams.set('from', from)
  if (to) csvBaseParams.set('to', to)
  if (limitNum > 0) csvBaseParams.set('limit', String(limitNum))
  if (metric !== 'all') csvBaseParams.set('metric', metric)

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
            접속팀 작업의 자재·공종 합계 · 접속일보 {totalReports}건
            {(from || to) && (
              <span className="ml-1">
                · 기간 {from ?? '처음'} ~ {to ?? '오늘'}
              </span>
            )}
          </p>
          {!canViewAll && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-800">
              본인 작성 일보 기준 통계입니다. 회사 전체 통계는 관리자에게 권한 요청.
            </div>
          )}
        </header>

        {/* 보기 모드 토글 */}
        <nav className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm">
          <Link
            href={buildHref({ view: 'cards' })}
            className={
              'flex-1 rounded-lg px-3 py-2 text-center font-medium transition-colors ' +
              (view === 'cards'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900')
            }
          >
            그룹 카드
          </Link>
          <Link
            href={buildHref({ view: 'table' })}
            className={
              'flex-1 rounded-lg px-3 py-2 text-center font-medium transition-colors ' +
              (view === 'table'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900')
            }
          >
            일보 표
          </Link>
        </nav>

        {/* metric 토글 — 전체 / 공종 / 자재 */}
        <nav className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm">
          {METRIC_TABS.map((t) => {
            const active = metric === t.key
            return (
              <Link
                key={t.key}
                href={buildHref({ metric: t.key })}
                className={
                  'flex-1 rounded-lg px-3 py-1.5 text-center font-medium transition-colors ' +
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

        {/* 차원 탭 — 카드 모드에서만 의미 */}
        {view === 'cards' && (
          <nav className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 text-sm">
            {DIM_TABS.map((t) => {
              const active = dim === t.key
              return (
                <Link
                  key={t.key}
                  href={buildHref({ dim: t.key, limit: t.defaultLimit })}
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
        )}

        {/* 기간 필터 폼 (GET — dim/limit 유지) */}
        <form method="get" className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
          <input type="hidden" name="dim" value={dim} />
          {limitNum !== dimEntry.defaultLimit && (
            <input type="hidden" name="limit" value={limitNum === 0 ? 'all' : String(limitNum)} />
          )}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <label className="block">
              <span className="block text-[10px] font-medium text-slate-500 uppercase">시작</span>
              <input
                type="date"
                name="from"
                defaultValue={from ?? ''}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
              />
            </label>
            <span className="pt-4 text-xs text-slate-400">~</span>
            <label className="block">
              <span className="block text-[10px] font-medium text-slate-500 uppercase">종료</span>
              <input
                type="date"
                name="to"
                defaultValue={to ?? ''}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="flex-1 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
            >
              기간 적용
            </button>
            {(from || to) && (
              <Link
                href={buildHref({ from: null, to: null })}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                기간 지우기
              </Link>
            )}
          </div>
        </form>

        {/* TOP N 토글 + CSV 다운로드 */}
        <div className="flex items-center justify-between gap-2">
          {view === 'cards' ? (
            <nav className="flex gap-1 rounded-md border border-slate-200 bg-white p-0.5 text-xs">
              {LIMIT_OPTIONS.map((n) => {
                const active = limitNum === n
                return (
                  <Link
                    key={n}
                    href={buildHref({ limit: n })}
                    className={
                      'rounded px-2 py-1 font-medium transition-colors ' +
                      (active
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-50')
                    }
                  >
                    {n === 0 ? '전체' : `TOP ${n}`}
                  </Link>
                )
              })}
            </nav>
          ) : (
            <span className="text-xs text-slate-500">일보 {tableData?.rows.length ?? 0}건</span>
          )}
          <div className="flex flex-wrap gap-1.5 justify-end">
            {view === 'cards' ? (
              <>
                {metric !== 'materials' && (
                  <a
                    href={`/api/reports/work-stats?type=tasks&${csvBaseParams.toString()}`}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    공종 CSV
                  </a>
                )}
                {metric !== 'tasks' && (
                  <a
                    href={`/api/reports/work-stats?type=materials&${csvBaseParams.toString()}`}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    자재 CSV
                  </a>
                )}
              </>
            ) : (
              <a
                href={`/api/reports/work-stats?type=table&${csvBaseParams.toString()}`}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" />
                일보 표 CSV
              </a>
            )}
          </div>
        </div>

        {view === 'cards' && truncated && (
          <p className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            {dimEntry.label} 그룹 {allEntries.length}개 중 상위 {entries.length}개만 표시. CSV
            다운로드는 동일하게 상위 {entries.length}개만 포함됩니다. 전체 보려면 「전체」 클릭.
          </p>
        )}

        <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-[11px]">
          <span className="font-semibold text-amber-800">⚠ 개인정보 포함</span>
          <span className="ml-1.5 text-amber-700/90">
            CSV 에 작업자명·일보 내용이 포함됩니다. 외부 유출 주의. (PIPA 의무)
          </span>
        </div>

        {view === 'table' && tableData ? (
          <StatsTable data={tableData} metric={metric} />
        ) : entries.length === 0 ? (
          <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center">
            <p className="text-sm text-slate-500">
              집계할 접속일보가 없습니다. 접속팀 작업 등록·일보 작성 후 다시 확인하세요.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {entries.map((entry, idx) => {
              const ratio = maxReports > 0 ? entry.aggregation.reportCount / maxReports : 0
              return (
                <li key={entry.key}>
                  <details className="group rounded-2xl bg-white border border-slate-200 overflow-hidden">
                    <summary className="cursor-pointer list-none p-4 hover:bg-slate-50">
                      <div className="flex items-start gap-3">
                        <span className="shrink-0 mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-slate-100 px-1.5 text-xs font-semibold text-slate-600 tabular-nums">
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold text-slate-900 truncate">{entry.label}</p>
                            <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                              {entry.aggregation.reportCount}건
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full bg-emerald-500"
                              style={{ width: `${Math.max(2, Math.round(ratio * 100))}%` }}
                            />
                          </div>
                          <p className="text-xs text-slate-500">
                            공종 {entry.aggregation.tasks.length}종 · 자재{' '}
                            {entry.aggregation.materials.length}종
                            <span className="ml-1.5 text-slate-400 group-open:hidden">· 펼치기 ▾</span>
                            <span className="ml-1.5 text-slate-400 hidden group-open:inline">· 접기 ▴</span>
                          </p>
                          {entry.statusCounts.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1">
                              {entry.statusCounts.map((sc) => (
                                <span
                                  key={sc.status}
                                  className={
                                    'inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ' +
                                    STATUS_COLOR[sc.status]
                                  }
                                >
                                  {sc.status}
                                  <span className="tabular-nums">{sc.count}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </summary>
                    <div className="border-t border-slate-100">
                      <AggregationCard
                        title="합계"
                        subtitle={entry.label}
                        aggregation={entry.aggregation}
                        showBars
                        metric={metric}
                      />
                    </div>
                  </details>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}
