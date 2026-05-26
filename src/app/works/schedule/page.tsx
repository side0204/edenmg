import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, Bell, CalendarDays } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import WorkScheduleCalendar, {
  type CalendarWork,
  type CalendarRequest,
} from './WorkScheduleCalendar'

// 작업 캘린더 (owner 2026-05-26).
//   /works/schedule — 배정된 작업의 일정을 캘린더로 시각화.
//   상단 탭: 전체 / 청약작업 / 청약작업외 (relocation_project_id 유무로 분기).
//   이벤트 클릭 → 일정 변경 요청 모달.
//   대기 중인 요청 카운트 배지 — 본인이 담당자인 작업의 pending 요청 수.
//
// 권한: 회사 직원 누구나 (RLS 가 회사 스코프 강제).

type Linkage = 'all' | 'subscription' | 'other'

function parseLinkage(v: string | undefined): Linkage {
  if (v === 'subscription') return 'subscription'
  if (v === 'other') return 'other'
  return 'all'
}

function parseMonth(v: string | undefined): { y: number; m: number } {
  if (v && /^\d{4}-\d{2}$/.test(v)) {
    const [y, m] = v.split('-').map(Number)
    if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12) return { y, m }
  }
  const now = new Date()
  return { y: now.getFullYear(), m: now.getMonth() + 1 }
}

type WorkRow = {
  id: string
  name: string
  client: string | null
  category: string | null
  subcategory: string | null
  status: string
  start_date: string | null
  end_date: string | null
  assignee_employee_id: string | null
  relocation_project_id: string | null
}

type AssignmentRow = {
  work_id: string
  employee_id: string
  worker_type: string | null
  confirmed_at: string | null
}

type EmployeeMini = { id: string; name: string | null }

type RequestRow = {
  id: string
  work_id: string
  requested_by: string
  requested_start: string | null
  requested_end: string | null
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  responded_by: string | null
  responded_at: string | null
  response_note: string | null
  created_at: string
}

export default async function WorksSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ linkage?: string; month?: string }>
}) {
  const { linkage: linkageRaw, month: monthRaw } = await searchParams
  const linkage = parseLinkage(linkageRaw)
  const { y, m } = parseMonth(monthRaw)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, name, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | { id: string; company_id: string; name: string | null; is_active: boolean }
    | null
  if (!me || !me.is_active) {
    redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  }

  // 캘린더 표시 범위 — 한 달 전후 여유 (월 grid 가 6주 = 약 ±1주 보이게)
  const monthStart = new Date(y, m - 1, 1)
  const monthEnd = new Date(y, m, 0) // 해당 월 마지막 일
  const gridStart = new Date(monthStart)
  gridStart.setDate(gridStart.getDate() - 7)
  const gridEnd = new Date(monthEnd)
  gridEnd.setDate(gridEnd.getDate() + 7)
  const gridStartStr = gridStart.toISOString().slice(0, 10)
  const gridEndStr = gridEnd.toISOString().slice(0, 10)

  // works fetch — 표시 범위 ∩ (start_date or end_date) 또는 null.
  //   linkage 분기는 client-side filter 로 단순화 (Supabase query chain TS 추론 회피).
  const { data: worksData } = await supabase
    .from('works')
    .select(
      'id, name, client, category, subcategory, status, start_date, end_date, assignee_employee_id, relocation_project_id',
    )
    .eq('company_id', me.company_id)
    .not('start_date', 'is', null)
    .lte('start_date', gridEndStr)
    .or(`end_date.gte.${gridStartStr},end_date.is.null`)
    .order('start_date')
  const worksAll = (worksData ?? []) as WorkRow[]
  const works = worksAll.filter((w) => {
    if (linkage === 'subscription') return !!w.relocation_project_id
    if (linkage === 'other') return !w.relocation_project_id
    return true
  })

  // 배정 매핑 (work_id → [employee_ids])
  let assignmentsByWork = new Map<string, string[]>()
  let employeeNameById = new Map<string, string>()
  if (works.length > 0) {
    const workIds = works.map((w) => w.id)
    const { data: asData } = await supabase
      .from('work_assignments')
      .select('work_id, employee_id, worker_type, confirmed_at')
      .in('work_id', workIds)
    const assigns = (asData ?? []) as AssignmentRow[]
    for (const a of assigns) {
      if (!assignmentsByWork.has(a.work_id)) assignmentsByWork.set(a.work_id, [])
      assignmentsByWork.get(a.work_id)!.push(a.employee_id)
    }
    const empIds = new Set<string>()
    for (const w of works) if (w.assignee_employee_id) empIds.add(w.assignee_employee_id)
    for (const a of assigns) empIds.add(a.employee_id)
    if (empIds.size > 0) {
      const { data: empData } = await supabase
        .from('employees')
        .select('id, name')
        .in('id', Array.from(empIds))
      for (const e of (empData ?? []) as EmployeeMini[]) {
        if (e.name) employeeNameById.set(e.id, e.name)
      }
    }
  }

  // 일정 변경 요청 — 표시되는 작업들의 모든 요청 (pending + 처리완료)
  let requestsByWork = new Map<string, CalendarRequest[]>()
  let pendingForMe = 0
  if (works.length > 0) {
    const workIds = works.map((w) => w.id)
    const { data: rqData } = await supabase
      .from('work_schedule_change_requests')
      .select(
        'id, work_id, requested_by, requested_start, requested_end, reason, status, responded_by, responded_at, response_note, created_at',
      )
      .in('work_id', workIds)
      .order('created_at', { ascending: false })
    const reqs = (rqData ?? []) as RequestRow[]
    // 요청자·처리자 이름 — 위에서 못 받은 id 추가 fetch
    const extraIds = new Set<string>()
    for (const r of reqs) {
      extraIds.add(r.requested_by)
      if (r.responded_by) extraIds.add(r.responded_by)
    }
    const missing = Array.from(extraIds).filter((id) => !employeeNameById.has(id))
    if (missing.length > 0) {
      const { data: extra } = await supabase
        .from('employees')
        .select('id, name')
        .in('id', missing)
      for (const e of (extra ?? []) as EmployeeMini[]) {
        if (e.name) employeeNameById.set(e.id, e.name)
      }
    }
    for (const r of reqs) {
      if (!requestsByWork.has(r.work_id)) requestsByWork.set(r.work_id, [])
      requestsByWork.get(r.work_id)!.push({
        id: r.id,
        requested_by_name: employeeNameById.get(r.requested_by) ?? '직원',
        requested_start: r.requested_start,
        requested_end: r.requested_end,
        reason: r.reason,
        status: r.status,
        responded_by_name: r.responded_by ? employeeNameById.get(r.responded_by) ?? null : null,
        responded_at: r.responded_at,
        response_note: r.response_note,
        created_at: r.created_at,
      })
    }
    // 본인이 담당자인 작업의 pending 카운트
    pendingForMe = reqs.filter(
      (r) =>
        r.status === 'pending' &&
        works.find((w) => w.id === r.work_id)?.assignee_employee_id === me.id,
    ).length
  }

  // 표시용 CalendarWork[] 변환
  const calendarWorks: CalendarWork[] = works.map((w) => ({
    id: w.id,
    name: w.name,
    status: w.status,
    start_date: w.start_date,
    end_date: w.end_date,
    isSubscription: !!w.relocation_project_id,
    assignee_name: w.assignee_employee_id
      ? employeeNameById.get(w.assignee_employee_id) ?? null
      : null,
    assignee_employee_id: w.assignee_employee_id,
    worker_names: (assignmentsByWork.get(w.id) ?? [])
      .map((id) => employeeNameById.get(id))
      .filter((n): n is string => !!n),
    worker_ids: assignmentsByWork.get(w.id) ?? [],
    requests: requestsByWork.get(w.id) ?? [],
  }))

  const monthStr = `${y}-${String(m).padStart(2, '0')}`
  const tabHref = (lk: Linkage) => `/works/schedule?linkage=${lk}&month=${monthStr}`
  const tabActive: Record<Linkage, string> = {
    all: 'bg-slate-900 text-white',
    subscription: 'bg-emerald-600 text-white',
    other: 'bg-blue-600 text-white',
  }
  const tabIdle: Record<Linkage, string> = {
    all: 'bg-white text-slate-700 hover:bg-slate-50',
    subscription: 'bg-white text-emerald-700 hover:bg-emerald-50',
    other: 'bg-white text-blue-700 hover:bg-blue-50',
  }

  return (
    <main className="min-h-screen p-3 sm:p-6">
      <div className="mx-auto max-w-[100rem] space-y-4">
        <header className="space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
          <div>
            <Link
              href="/works"
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
            >
              <ChevronLeft className="h-4 w-4" />
              작업관리
            </Link>
            <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight inline-flex items-center gap-2">
              <CalendarDays className="h-7 w-7 text-slate-700" />
              작업 캘린더
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              배정된 작업의 일정을 한눈에. 이벤트를 클릭하면 일정 변경을 요청할 수 있습니다.
            </p>
          </div>
          {pendingForMe > 0 && (
            <div className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
              <Bell className="h-4 w-4" />
              일정 변경 대기 {pendingForMe}건
            </div>
          )}
        </header>

        <div className="flex items-center gap-2 flex-wrap">
          {(['all', 'subscription', 'other'] as Linkage[]).map((lk) => (
            <Link
              key={lk}
              href={tabHref(lk)}
              className={
                'inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium ' +
                (linkage === lk ? tabActive[lk] : tabIdle[lk])
              }
            >
              {lk === 'all' ? '전체' : lk === 'subscription' ? '청약작업' : '청약작업외'}
            </Link>
          ))}
          <span className="text-xs text-slate-400 ml-2">{calendarWorks.length}건 표시</span>
        </div>

        <WorkScheduleCalendar
          year={y}
          month={m}
          works={calendarWorks}
          myEmployeeId={me.id}
          myName={me.name ?? '나'}
          linkage={linkage}
        />
      </div>
    </main>
  )
}
