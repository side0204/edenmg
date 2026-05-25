import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Cable, CheckCircle2, ChevronLeft, FileText, ListTodo, Pencil, Plus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  DAILY_CHECK_COLOR,
  REPORT_STATUS_COLOR,
  STATUS_COLOR,
  formatWorkLabel,
  formatWorkPeriod,
  formatWorkerType,
  reportLabel,
  todayInSeoul,
  type DailyCheckDecision,
  type WorkCategory,
  type WorkReportProgress,
  type WorkReportStatus,
  type WorkStatus,
  type WorkSubcategory,
  type WorkWorkerType,
} from '@/lib/work'
import { aggregateConnectionTotals } from '@/lib/connection-aggregate'
import { AggregationCard } from '../AggregationCard'
import { InstructionsBanner } from '../InstructionsBanner'
import { assignEmployee, unassignEmployee } from '../actions'
import { confirmWorkComplete } from '../daily-check-actions'

type WorkRow = {
  id: string
  company_id: string
  name: string
  client: string | null
  address: string | null
  category: WorkCategory
  subcategory: WorkSubcategory | null
  order_id: string | null
  worker_type: WorkWorkerType | null
  worker_type_custom: string | null
  assignee_employee_id: string | null
  expected_volume: string | null
  start_date: string | null
  end_date: string | null
  status: WorkStatus
  notes: string | null
  instructions: string | null
  is_active: boolean
  relocation_project_id: string | null
}

type ReportRow = {
  id: string
  report_date: string
  author_employee_id: string
  progress: WorkReportProgress
  status: WorkReportStatus
}

type AssignmentRow = {
  id: string
  employee_id: string
  worker_type: WorkWorkerType | null
  assigned_start: string | null
  assigned_end: string | null
}

export default async function WorkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, permission, can_manage_works, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | {
        id: string
        company_id: string
        permission: 'worker' | 'team_member' | 'team_leader' | 'admin'
        can_manage_works: boolean
        is_active: boolean
      }
    | null
  if (!me || !me.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  const canManage = me.permission === 'admin' || me.can_manage_works

  const { data: workData } = await supabase
    .from('works')
    .select(
      'id, company_id, name, client, address, category, subcategory, order_id, worker_type, worker_type_custom, assignee_employee_id, expected_volume, start_date, end_date, status, notes, instructions, is_active, relocation_project_id',
    )
    .eq('id', id)
    .maybeSingle()
  const work = workData as WorkRow | null
  if (!work || work.company_id !== me.company_id) notFound()

  // 병렬 배치를 위한 KST 오늘 날짜
  const todayKstDate = todayInSeoul()

  // ============== 병렬 배치 A — 작업 기반 독립 쿼리 4건 ==============
  // 작업 행을 기준으로 서로 의존성 없는 쿼리들을 한꺼번에. 직렬 4 → 병렬 1 압축.
  type ChainSummary = {
    id: string
    name: string | null
    node_count: number
  }
  type ConnReportSummary = {
    id: string
    report_date: string
    author_employee_id: string
    progress: WorkReportProgress
    status: WorkReportStatus
  }
  type TodayCheckDetail = {
    id: string
    employee_id: string
    decision: DailyCheckDecision
    note: string | null
    created_at: string
    closed_at: string | null
  }
  const [assignmentsRes, todayChecksRes, siblingsRes, candidatesRes] =
    await Promise.all([
      supabase
        .from('work_assignments')
        .select('id, employee_id, worker_type, assigned_start, assigned_end')
        .eq('work_id', id)
        .order('assigned_start', { ascending: true, nullsFirst: true }),
      supabase
        .from('work_daily_checks')
        .select('id, employee_id, decision, note, created_at, closed_at')
        .eq('work_id', id)
        .eq('check_date', todayKstDate)
        .order('created_at', { ascending: true }),
      work.order_id
        ? supabase
            .from('works')
            .select('id, worker_type')
            .eq('company_id', work.company_id)
            .eq('order_id', work.order_id)
        : Promise.resolve({ data: null as { id: string; worker_type: string | null }[] | null }),
      canManage
        ? supabase
            .from('employees')
            .select('id, name, position, team')
            .eq('is_active', true)
            .order('name')
        : Promise.resolve({
            data: [] as { id: string; name: string; position: string | null; team: string | null }[],
          }),
    ])
  const assignments = (assignmentsRes.data ?? []) as AssignmentRow[]
  const todayChecks = (todayChecksRes.data ?? []) as TodayCheckDetail[]
  const siblings = (siblingsRes.data ?? []) as {
    id: string
    worker_type: string | null
  }[]
  const candidates = (candidatesRes.data ?? []) as {
    id: string
    name: string
    position: string | null
    team: string | null
  }[]

  // 접속팀 작업 판단: 작업 자체의 worker_type 또는 작업자 중 1명이라도 접속팀이면 true.
  // (작업의 worker_type 은 폼에서 더 이상 입력 안 받고 작업자별로 지정)
  const isConnectionTeam =
    work.worker_type === '접속팀' ||
    assignments.some((a) => a.worker_type === '접속팀')

  // ============== 병렬 배치 B — 일보·진행률 (분기) ==============
  let reports: ReportRow[] = []
  let chains: ChainSummary[] = []
  let connectionReports: ConnReportSummary[] = []
  let connectionProgress:
    | { totalCables: number; doneCables: number; ratio: number }
    | null = null
  let nonConnReportCount = 0

  if (isConnectionTeam) {
    // 접속팀: chains + connectionReports 병렬 (각각 work_id 만 의존)
    const [chainsRes, connReportsRes] = await Promise.all([
      supabase
        .from('connection_chains')
        .select('id, name')
        .eq('work_id', id)
        .order('position'),
      supabase
        .from('connection_reports')
        .select('id, report_date, author_employee_id, progress, status')
        .eq('work_id', id)
        .order('report_date', { ascending: false })
        .limit(10),
    ])
    const chainsRaw = (chainsRes.data ?? []) as {
      id: string
      name: string | null
    }[]
    connectionReports = (connReportsRes.data ?? []) as ConnReportSummary[]

    if (chainsRaw.length > 0) {
      const chainIds = chainsRaw.map((c) => c.id)
      // node 수 카운트용 전체 nodes + 진행률용 cable nodes 병렬
      const [allNodesRes, cableNodesRes] = await Promise.all([
        supabase
          .from('connection_plan_nodes')
          .select('chain_id')
          .in('chain_id', chainIds),
        supabase
          .from('connection_plan_nodes')
          .select('id')
          .in('chain_id', chainIds)
          .not('parent_id', 'is', null),
      ])
      const countMap = new Map<string, number>()
      for (const n of (allNodesRes.data ?? []) as { chain_id: string }[]) {
        countMap.set(n.chain_id, (countMap.get(n.chain_id) ?? 0) + 1)
      }
      chains = chainsRaw.map((c) => ({
        id: c.id,
        name: c.name,
        node_count: countMap.get(c.id) ?? 0,
      }))
      const cableNodeIds = ((cableNodesRes.data ?? []) as { id: string }[]).map(
        (n) => n.id,
      )
      const totalCables = cableNodeIds.length
      let doneCables = 0
      if (totalCables > 0) {
        const { data: completedSegs } = await supabase
          .from('connection_report_segments')
          .select('plan_node_id')
          .in('plan_node_id', cableNodeIds)
          .eq('is_completed', true)
        const doneSet = new Set(
          ((completedSegs ?? []) as { plan_node_id: string }[]).map(
            (s) => s.plan_node_id,
          ),
        )
        doneCables = doneSet.size
      }
      connectionProgress = {
        totalCables,
        doneCables,
        ratio: totalCables > 0 ? doneCables / totalCables : 0,
      }
    } else {
      connectionProgress = { totalCables: 0, doneCables: 0, ratio: 0 }
    }
  } else {
    // 외선·기타: reports + count 병렬
    const [reportsRes, countRes] = await Promise.all([
      supabase
        .from('work_daily_reports')
        .select('id, report_date, author_employee_id, progress, status')
        .eq('work_id', id)
        .order('report_date', { ascending: false })
        .limit(10),
      supabase
        .from('work_daily_reports')
        .select('*', { count: 'exact', head: true })
        .eq('work_id', id),
    ])
    reports = (reportsRes.data ?? []) as ReportRow[]
    nonConnReportCount = countRes.count ?? 0
  }

  // 직원 이름·메타 매핑 — 배정자 + 일보 작성자 + 담당자 + 오늘 체크인자 모두 묶어서 1회 조회
  const employeeIds = new Set<string>()
  for (const a of assignments) employeeIds.add(a.employee_id)
  for (const r of reports) employeeIds.add(r.author_employee_id)
  for (const r of connectionReports) employeeIds.add(r.author_employee_id)
  for (const c of todayChecks) employeeIds.add(c.employee_id)
  if (work.assignee_employee_id) employeeIds.add(work.assignee_employee_id)

  const employeeMap = new Map<
    string,
    { name: string; position: string | null; team: string | null; is_active: boolean }
  >()
  if (employeeIds.size > 0) {
    const { data: emps } = await supabase
      .from('employees')
      .select('id, name, position, team, is_active')
      .in('id', Array.from(employeeIds))
    for (const e of (emps ?? []) as {
      id: string
      name: string
      position: string | null
      team: string | null
      is_active: boolean
    }[]) {
      employeeMap.set(e.id, {
        name: e.name,
        position: e.position,
        team: e.team,
        is_active: e.is_active,
      })
    }
  }

  const assignee = work.assignee_employee_id
    ? (employeeMap.get(work.assignee_employee_id) ?? null)
    : null

  // 일보 작성 권한: 본인이 이 작업에 배정됐거나 admin/ceo
  const isAdminLike = me.permission === 'admin'
  const isAssigned = assignments.some((a) => a.employee_id === me.id)
  const canWriteReport = isAdminLike || isAssigned
  // 작업 완료 확정 권한: admin OR can_manage_works OR 담당자
  const isAssignee = work.assignee_employee_id === me.id
  const canConfirmComplete =
    (isAdminLike || me.can_manage_works || isAssignee) && work.status !== '완료'

  // 오늘 일보가 이미 있는지 (자기 자신 작성건)
  const today = new Date()
  const todayKST = new Date(today.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const myTodayReport = reports.find(
    (r) => r.author_employee_id === me.id && r.report_date === todayKST,
  )
  const myTodayConnReport = connectionReports.find(
    (r) => r.author_employee_id === me.id && r.report_date === todayKST,
  )

  // ===== 자재·공종 합계 — 병렬 =====
  // 작업별 (접속팀일 때) + 공사번호별 (siblings 중 접속팀) 한꺼번에.
  // siblings 는 배치 A 에서 이미 로드됨.
  const connSiblingIds = siblings
    .filter((s) => s.worker_type === '접속팀')
    .map((s) => s.id)
  const orderSiblingCount = siblings.length
  const orderConnSiblingCount = connSiblingIds.length

  const [workTotals, orderTotals] = await Promise.all([
    isConnectionTeam
      ? aggregateConnectionTotals(supabase, [work.id])
      : Promise.resolve(null),
    work.order_id && connSiblingIds.length > 0
      ? aggregateConnectionTotals(supabase, connSiblingIds)
      : Promise.resolve(null),
  ])

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-md space-y-5">
        <header className="space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <Link
              href="/works"
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
            >
              <ChevronLeft className="h-4 w-4" />
              작업 목록
            </Link>
            <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight truncate">
              {work.name}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {formatWorkLabel(work.category, work.subcategory)}
              {work.client && <span className="ml-1.5">· {work.client}</span>}
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            {work.relocation_project_id && (
              <Link
                href={`/relocation/${work.relocation_project_id}`}
                className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
                title="공사 설계 — 행정도·코어구성도·직선도 보기"
              >
                <Cable className="h-4 w-4" />
                설계내역 보기
              </Link>
            )}
            {canManage && (
              <Link
                href={`/works/${work.id}/edit`}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Pencil className="h-4 w-4" />
                수정
              </Link>
            )}
          </div>
        </header>

        <InstructionsBanner instructions={work.instructions} />

        <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span
              className={
                'rounded-full border px-3 py-1 text-sm font-medium ' + STATUS_COLOR[work.status]
              }
            >
              {work.status}
            </span>
            {canConfirmComplete && (
              <form action={confirmWorkComplete}>
                <input type="hidden" name="work_id" value={work.id} />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  작업 완료로 확정
                </button>
              </form>
            )}
          </div>
          <InfoRow label="기간">{formatWorkPeriod(work.start_date, work.end_date)}</InfoRow>
          {work.order_id && <InfoRow label="공사번호">{work.order_id}</InfoRow>}
          <InfoRow label="작업자">
            {formatWorkerType(work.worker_type, work.worker_type_custom)}
          </InfoRow>
          <InfoRow label="담당자">
            {assignee ? (
              <>
                <span>{assignee.name}</span>
                {!assignee.is_active && (
                  <span className="ml-1.5 text-xs text-slate-400">(비활성)</span>
                )}
              </>
            ) : (
              <span className="text-slate-400">미지정</span>
            )}
          </InfoRow>
          {work.address && <InfoRow label="주소">{work.address}</InfoRow>}
          {work.expected_volume && <InfoRow label="예상물량">{work.expected_volume}</InfoRow>}
          {work.notes && (
            <InfoRow label="비고">
              <span className="whitespace-pre-wrap">{work.notes}</span>
            </InfoRow>
          )}
        </section>

        {todayChecks.length > 0 && (
          <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
            <h2 className="text-base font-semibold text-slate-700 tracking-tight inline-flex items-center gap-1.5">
              <ListTodo className="h-4 w-4 text-emerald-600" />
              오늘 진행자 ({todayChecks.length}명)
            </h2>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {todayChecks.map((c) => {
                const emp = employeeMap.get(c.employee_id)
                const startTime = new Intl.DateTimeFormat('ko-KR', {
                  timeZone: 'Asia/Seoul',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                }).format(new Date(c.created_at))
                const closeTime = c.closed_at
                  ? new Intl.DateTimeFormat('ko-KR', {
                      timeZone: 'Asia/Seoul',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    }).format(new Date(c.closed_at))
                  : null
                return (
                  <li key={c.id} className="px-3 py-2.5 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-slate-900">
                          <span className="font-medium">{emp?.name ?? '?'}</span>
                          {emp && !emp.is_active && (
                            <span className="ml-1.5 text-xs text-slate-400">(비활성)</span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          시작 {startTime}
                          {closeTime && (
                            <span className="ml-1.5">· 마감 {closeTime}</span>
                          )}
                        </p>
                        {c.note && (
                          <p className="mt-0.5 text-xs text-slate-600 whitespace-pre-wrap">
                            {c.note}
                          </p>
                        )}
                      </div>
                      <span
                        className={
                          'shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ' +
                          DAILY_CHECK_COLOR[c.decision]
                        }
                      >
                        {c.decision}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {connectionProgress ? (
          <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-700 tracking-tight">진행률</h2>
              <span className="text-sm font-semibold tabular-nums text-slate-900">
                {Math.round(connectionProgress.ratio * 100)}%
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${Math.round(connectionProgress.ratio * 100)}%` }}
              />
            </div>
            <p className="text-xs text-slate-500">
              완료 cable {connectionProgress.doneCables} / {connectionProgress.totalCables}개
              {connectionProgress.totalCables === 0 && (
                <span className="ml-1 text-amber-700">· 작업구간을 먼저 등록하세요</span>
              )}
            </p>
          </section>
        ) : (
          <section className="rounded-2xl bg-white border border-slate-200 p-5 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-700 tracking-tight">진행 현황</h2>
            <span className="text-sm text-slate-700">
              누적 일보{' '}
              <span className="font-semibold tabular-nums text-slate-900">
                {nonConnReportCount}
              </span>
              건
            </span>
          </section>
        )}

        {isConnectionTeam ? (
          <>
            {/* 작업구간 관리 (접속팀 전용) */}
            <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-slate-700 tracking-tight inline-flex items-center gap-1.5">
                  <Cable className="h-4 w-4 text-slate-500" />
                  작업구간 관리 ({chains.length})
                </h2>
                {canManage && (
                  <Link
                    href={`/works/${work.id}/chains/new`}
                    className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    작업구간 등록
                  </Link>
                )}
              </div>
              {chains.length === 0 ? (
                <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  등록된 작업구간이 없습니다. 작업구간을 등록한 뒤 함체를 추가하면 접속일보를 작성할 수 있습니다.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {chains.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/works/${work.id}/chains/${c.id}/edit`}
                        className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-slate-50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900 truncate">
                            {c.name || '작업구간'}
                          </p>
                          <p className="text-xs text-slate-500">노드 {c.node_count}개</p>
                        </div>
                        <span className="shrink-0 text-xs text-slate-400">편집 →</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* 접속일보 */}
            <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-slate-700 tracking-tight inline-flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-slate-500" />
                  접속일보 ({connectionReports.length})
                </h2>
                {canWriteReport && chains.length > 0 && !myTodayConnReport && (
                  <Link
                    href={`/works/${work.id}/connection-reports/new`}
                    className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    오늘 일보 작성
                  </Link>
                )}
                {myTodayConnReport && (
                  <Link
                    href={`/works/${work.id}/connection-reports/${myTodayConnReport.id}`}
                    className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    오늘 일보 보기
                  </Link>
                )}
              </div>
              {connectionReports.length === 0 ? (
                <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  아직 작성된 접속일보가 없습니다.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {connectionReports.map((r) => {
                    const emp = employeeMap.get(r.author_employee_id)
                    return (
                      <li key={r.id}>
                        <Link
                          href={`/works/${work.id}/connection-reports/${r.id}`}
                          className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-slate-50"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-slate-900">
                              <span className="font-medium">{r.report_date}</span>
                              <span className="ml-2 text-xs text-slate-500">
                                {emp?.name ?? '?'} · {r.progress}
                              </span>
                            </p>
                          </div>
                          <span
                            className={
                              'shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ' +
                              REPORT_STATUS_COLOR[r.status]
                            }
                          >
                            {r.status}
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </>
        ) : (
          <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-700 tracking-tight inline-flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-slate-500" />
                {reportLabel(work.worker_type)} ({reports.length})
              </h2>
              {canWriteReport && !myTodayReport && (
                <Link
                  href={`/works/${work.id}/reports/new`}
                  className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                  오늘 {reportLabel(work.worker_type)} 작성
                </Link>
              )}
              {myTodayReport && (
                <Link
                  href={`/works/${work.id}/reports/${myTodayReport.id}`}
                  className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  오늘 {reportLabel(work.worker_type)} 보기
                </Link>
              )}
            </div>

            {reports.length === 0 ? (
              <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                아직 작성된 {reportLabel(work.worker_type)}가 없습니다.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {reports.map((r) => {
                  const emp = employeeMap.get(r.author_employee_id)
                  return (
                    <li key={r.id}>
                      <Link
                        href={`/works/${work.id}/reports/${r.id}`}
                        className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-slate-50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-slate-900">
                            <span className="font-medium">{r.report_date}</span>
                            <span className="ml-2 text-xs text-slate-500">
                              {emp?.name ?? '?'} · {r.progress}
                            </span>
                          </p>
                        </div>
                        <span
                          className={
                            'shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ' +
                            REPORT_STATUS_COLOR[r.status]
                          }
                        >
                          {r.status}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )}

        {workTotals && (
          <AggregationCard
            title="이 작업 자재·공종 합계"
            subtitle="이 작업에 작성된 접속일보를 모두 합산한 결과입니다."
            aggregation={workTotals}
          />
        )}

        {orderTotals && work.order_id && (
          <AggregationCard
            title={`공사번호 「${work.order_id}」 합계`}
            subtitle={`같은 공사번호 작업 ${orderSiblingCount}건 중 접속팀 ${orderConnSiblingCount}건의 일보 합산`}
            aggregation={orderTotals}
          />
        )}

        <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
          <h2 className="text-base font-semibold text-slate-700 tracking-tight">
            작업자 배정 ({assignments.length})
          </h2>

          {assignments.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              배정된 작업자가 없습니다.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {assignments.map((a) => {
                const emp = employeeMap.get(a.employee_id)
                return (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-slate-900">
                        <span className="font-medium">{emp?.name ?? '?'}</span>
                        {emp && !emp.is_active && (
                          <span className="ml-1.5 text-xs text-slate-400">(비활성)</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500">
                        {[emp?.position, emp?.team ? `${emp.team}팀` : null]
                          .filter(Boolean)
                          .join(' · ') || '직급·팀 미지정'}
                      </p>
                      {(a.assigned_start || a.assigned_end) && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          기간: {formatWorkPeriod(a.assigned_start, a.assigned_end)}
                        </p>
                      )}
                    </div>
                    {canManage && (
                      <form action={unassignEmployee}>
                        <input type="hidden" name="work_id" value={work.id} />
                        <input type="hidden" name="assignment_id" value={a.id} />
                        <button
                          type="submit"
                          className="shrink-0 rounded p-1 text-slate-400 hover:text-red-600 hover:bg-red-50"
                          aria-label="배정 해제"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </form>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {canManage && candidates.length > 0 && (
            <form action={assignEmployee} className="space-y-2 pt-2 border-t border-slate-100">
              <input type="hidden" name="work_id" value={work.id} />
              <p className="text-xs font-medium text-slate-700">작업자 추가</p>
              <select
                name="employee_id"
                required
                defaultValue=""
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                <option value="" disabled>
                  직원 선택
                </option>
                {candidates.map((c) => {
                  const sub = [c.position, c.team ? `${c.team}팀` : null]
                    .filter(Boolean)
                    .join(' · ')
                  return (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {sub ? ` (${sub})` : ''}
                    </option>
                  )
                })}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  name="assigned_start"
                  placeholder="배정 시작 (선택)"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
                <input
                  type="date"
                  name="assigned_end"
                  placeholder="배정 종료 (선택)"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>
              <p className="text-[11px] text-slate-400">
                기간 비워두면 작업 전체 기간으로 배정됩니다.
              </p>
              <button
                type="submit"
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                배정
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="shrink-0 w-16 text-slate-500">{label}</span>
      <span className="text-slate-800 min-w-0 break-words">{children}</span>
    </div>
  )
}
