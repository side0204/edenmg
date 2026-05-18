import { createClient } from '@/lib/supabase/server'
import {
  aggregateConnectionStats,
  buildStatsTable,
  type Aggregation,
} from '@/lib/connection-aggregate'
import { buildCsv, csvResponse } from '@/lib/csv'

type Dim = 'worker' | 'order' | 'work' | 'year' | 'month' | 'day'
type Type = 'tasks' | 'materials' | 'table'

const DIM_LABEL: Record<Dim, string> = {
  worker: '작업자별',
  order: '공사번호별',
  work: '작업명별',
  year: '연별',
  month: '월별',
  day: '일별',
}

const DEFAULT_LIMIT_BY_DIM: Record<Dim, number> = {
  worker: 30,
  order: 30,
  work: 30,
  year: 0,
  month: 24,
  day: 30,
}

/**
 * GET /api/reports/work-stats?dim=&type=&from=&to=&limit=
 * - dim    : worker | order | work | year | month | day
 * - type   : tasks | materials (CSV 모드)
 * - from   : YYYY-MM-DD (선택)
 * - to     : YYYY-MM-DD (선택)
 * - limit  : 정수 N (TOP N) 또는 'all'. 미지정 시 차원별 기본값.
 *
 * 권한: 로그인 + 활성 직원. 회사 스코프 RLS 자동 적용. 별도 admin 제한 없음.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const dim = (
    ['worker', 'order', 'work', 'year', 'month', 'day'].includes(url.searchParams.get('dim') ?? '')
      ? url.searchParams.get('dim')
      : 'worker'
  ) as Dim
  const typeRaw = url.searchParams.get('type')
  const type: Type =
    typeRaw === 'materials' ? 'materials' : typeRaw === 'table' ? 'table' : 'tasks'
  const metricRaw = url.searchParams.get('metric')
  const metric: 'all' | 'tasks' | 'materials' =
    metricRaw === 'tasks' ? 'tasks' : metricRaw === 'materials' ? 'materials' : 'all'
  const fromRaw = url.searchParams.get('from')
  const toRaw = url.searchParams.get('to')
  const from = fromRaw && /^\d{4}-\d{2}-\d{2}$/.test(fromRaw) ? fromRaw : null
  const to = toRaw && /^\d{4}-\d{2}-\d{2}$/.test(toRaw) ? toRaw : null
  const limitRaw = url.searchParams.get('limit')
  let limit = DEFAULT_LIMIT_BY_DIM[dim]
  if (limitRaw === 'all') limit = 0
  else if (limitRaw !== null && Number.isFinite(parseInt(limitRaw, 10))) {
    limit = Math.max(0, parseInt(limitRaw, 10))
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, permission, can_view_stats, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | {
        id: string
        company_id: string
        permission: 'worker' | 'foreman' | 'admin' | 'ceo'
        can_view_stats: boolean
        is_active: boolean
      }
    | null
  if (!me || !me.is_active) return new Response('Forbidden', { status: 403 })
  const canViewAll =
    me.permission === 'admin' || me.permission === 'ceo' || me.can_view_stats

  // 회사의 접속팀 작업
  const { data: worksData } = await supabase
    .from('works')
    .select('id, name, order_id, status')
    .eq('company_id', me.company_id)
    .eq('worker_type', '접속팀')
  type WorkMeta = { id: string; name: string; order_id: string | null; status: string }
  const works = (worksData ?? []) as WorkMeta[]
  const workById = new Map<string, WorkMeta>(works.map((w) => [w.id, w]))

  // 일보 fetch (기간 필터)
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

  // ===== type=table — 일보 단위 wide CSV =====
  if (type === 'table') {
    const tableData = await buildStatsTable(
      supabase,
      reports,
      new Map(
        works.map((w) => [
          w.id,
          { name: w.name, order_id: w.order_id, status: w.status },
        ]),
      ),
    )
    const showTasks = metric === 'all' || metric === 'tasks'
    const showMaterials = metric === 'all' || metric === 'materials'
    const taskCols = showTasks ? tableData.taskColumns : []
    const matCols = showMaterials ? tableData.materialColumns : []
    const headers = [
      '일자',
      '작업자',
      '공사번호',
      '작업명',
      '상태',
      ...taskCols.map((c) => c.label),
      ...matCols.map((c) => {
        const parts = [c.name]
        if (c.spec) parts.push(`(${c.spec})`)
        if (c.unit) parts.push(c.unit)
        return parts.join(' ')
      }),
    ]
    const rowsCsv: unknown[][] = tableData.rows.map((r) => [
      r.date,
      r.workerName,
      r.orderId ?? '',
      r.workName,
      r.workStatus,
      ...taskCols.map((c) => r.taskCounts.get(c.key) ?? ''),
      ...matCols.map((c) => r.materialQtys.get(c.key) ?? ''),
    ])
    if (tableData.rows.length > 0) {
      rowsCsv.push([
        '합계',
        '',
        '',
        `(${tableData.rows.length}건)`,
        '',
        ...taskCols.map((c) => c.totalCount),
        ...matCols.map((c) => c.totalQuantity),
      ])
    }
    const body = buildCsv(headers, rowsCsv)
    const periodSuffix = from || to ? `_${from ?? ''}_${to ?? ''}` : ''
    const metricSuffix =
      metric === 'tasks' ? '_공종만' : metric === 'materials' ? '_자재만' : ''
    const filename = `작업통계_일보표${metricSuffix}${periodSuffix}.csv`
    return csvResponse(body, filename)
  }

  // groupKey
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
  const statsMap = await aggregateConnectionStats(supabase, reportIds, getGroupKey)

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

  // 정렬 + slice
  type Entry = { key: string; label: string; aggregation: Aggregation }
  const allEntries: Entry[] = Array.from(statsMap.entries()).map(([key, agg]) => ({
    key,
    label: labelByKey.get(key) ?? key,
    aggregation: agg,
  }))
  const isTimeDim = dim === 'year' || dim === 'month' || dim === 'day'
  if (isTimeDim) {
    allEntries.sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0))
  } else {
    allEntries.sort((a, b) => b.aggregation.reportCount - a.aggregation.reportCount)
  }
  const entries = limit > 0 ? allEntries.slice(0, limit) : allEntries

  // CSV 빌드 — 그룹×항목 long 형태
  const headers =
    type === 'tasks'
      ? ['차원', '그룹키', '그룹명', '일보건수', '공종', '합계수량', '비고']
      : ['차원', '그룹키', '그룹명', '일보건수', '자재명', '규격', '단위', '합계수량', '구분']

  const rows: unknown[][] = []
  for (const e of entries) {
    if (type === 'tasks') {
      if (e.aggregation.tasks.length === 0) {
        rows.push([DIM_LABEL[dim], e.key, e.label, e.aggregation.reportCount, '', '', '공종 없음'])
      } else {
        for (const t of e.aggregation.tasks) {
          rows.push([
            DIM_LABEL[dim],
            e.key,
            e.label,
            e.aggregation.reportCount,
            t.label,
            t.totalCount,
            t.task_type === '기타' ? '기타' : '',
          ])
        }
      }
    } else {
      if (e.aggregation.materials.length === 0) {
        rows.push([DIM_LABEL[dim], e.key, e.label, e.aggregation.reportCount, '', '', '', '', '자재 없음'])
      } else {
        for (const m of e.aggregation.materials) {
          rows.push([
            DIM_LABEL[dim],
            e.key,
            e.label,
            e.aggregation.reportCount,
            m.name,
            m.spec ?? '',
            m.unit ?? '',
            m.totalQuantity,
            m.isCustom ? '직접입력' : '마스터',
          ])
        }
      }
    }
  }

  const body = buildCsv(headers, rows)
  const periodSuffix = from || to ? `_${from ?? ''}_${to ?? ''}` : ''
  const typeSuffix = type === 'tasks' ? '공종' : '자재'
  const filename = `작업통계_${DIM_LABEL[dim]}_${typeSuffix}${periodSuffix}.csv`
  return csvResponse(body, filename)
}
