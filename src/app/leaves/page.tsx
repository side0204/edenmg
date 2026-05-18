import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { LEAVE_TYPE_LABEL, formatPeriod, type LeaveType } from '@/lib/leave'

function todayInSeoul(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
}

type LeaveRow = {
  id: string
  employee_id: string
  type: LeaveType
  start_date: string
  end_date: string
  start_time: string | null
  end_time: string | null
  substitute_employee_id: string | null
}

export default async function LeavesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; company_id: string; is_active: boolean } | null
  if (!me || !me.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))

  const today = todayInSeoul()
  const [yearStr, monthStr] = today.split('-')
  const yearNum = Number(yearStr)
  const monthNum = Number(monthStr)
  const lastDayOfMonth = new Date(Date.UTC(yearNum, monthNum, 0)).getUTCDate()
  const monthFirst = `${yearStr}-${monthStr}-01`
  const monthLast = `${yearStr}-${monthStr}-${String(lastDayOfMonth).padStart(2, '0')}`

  // 이번 달에 일부라도 걸치는 승인된 휴가·외근
  const { data: leavesData } = await supabase
    .from('leave_requests')
    .select(
      'id, employee_id, type, start_date, end_date, start_time, end_time, substitute_employee_id',
    )
    .eq('company_id', me.company_id)
    .eq('status', '승인')
    .lte('start_date', monthLast)
    .gte('end_date', monthFirst)
    .order('start_date', { ascending: true })

  const leaves = (leavesData ?? []) as LeaveRow[]

  // 직원 이름 매핑
  const personIds = Array.from(
    new Set(
      leaves
        .flatMap((l) => [l.employee_id, l.substitute_employee_id])
        .filter((v): v is string => !!v),
    ),
  )
  const nameById = new Map<string, string>()
  if (personIds.length > 0) {
    const { data: persons } = await supabase
      .from('employees')
      .select('id, name')
      .in('id', personIds)
    for (const p of (persons ?? []) as { id: string; name: string }[]) {
      nameById.set(p.id, p.name)
    }
  }

  // 진행 중 / 예정 / 종료 그룹화
  const ongoing = leaves.filter((l) => today >= l.start_date && today <= l.end_date)
  const upcoming = leaves.filter((l) => today < l.start_date)
  const past = leaves.filter((l) => today > l.end_date)

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-5">
        <header>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
            홈
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">
            휴가·외근 현황
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {yearStr}년 {monthNum}월 · 회사 전체 승인된 휴가·외근
          </p>
        </header>

        {leaves.length === 0 ? (
          <p className="rounded-2xl bg-white border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            이번 달 승인된 휴가·외근이 없습니다.
          </p>
        ) : (
          <>
            {ongoing.length > 0 && (
              <Section title="진행 중" count={ongoing.length}>
                {ongoing.map((l) => (
                  <LeaveItem key={l.id} leave={l} nameById={nameById} highlight />
                ))}
              </Section>
            )}
            {upcoming.length > 0 && (
              <Section title="예정" count={upcoming.length}>
                {upcoming.map((l) => (
                  <LeaveItem key={l.id} leave={l} nameById={nameById} />
                ))}
              </Section>
            )}
            {past.length > 0 && (
              <Section title="종료" count={past.length}>
                {past.map((l) => (
                  <LeaveItem key={l.id} leave={l} nameById={nameById} dim />
                ))}
              </Section>
            )}
          </>
        )}
      </div>
    </main>
  )
}

function Section({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-baseline gap-2 px-1 text-base font-semibold text-slate-700 tracking-tight">
        {title}
        <span className="text-sm font-normal text-slate-400">{count}건</span>
      </h2>
      <ul className="divide-y divide-slate-100 rounded-2xl bg-white border border-slate-200">
        {children}
      </ul>
    </section>
  )
}

function LeaveItem({
  leave,
  nameById,
  highlight,
  dim,
}: {
  leave: LeaveRow
  nameById: Map<string, string>
  highlight?: boolean
  dim?: boolean
}) {
  return (
    <li className={'px-4 py-3 text-sm ' + (dim ? 'opacity-60' : '')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-slate-900">
            <span className="font-semibold">{nameById.get(leave.employee_id) ?? '?'}</span>
            <span className="ml-1.5 text-slate-500">· {LEAVE_TYPE_LABEL[leave.type]}</span>
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {formatPeriod(leave.start_date, leave.end_date, leave.start_time, leave.end_time)}
          </p>
          {leave.substitute_employee_id && (
            <p className="mt-0.5 text-xs text-slate-500">
              대무: {nameById.get(leave.substitute_employee_id) ?? '?'}
            </p>
          )}
        </div>
        {highlight && (
          <span className="shrink-0 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-0.5">
            진행 중
          </span>
        )}
      </div>
    </li>
  )
}
