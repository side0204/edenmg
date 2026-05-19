import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarDays, ChevronLeft, History } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  LEAVE_TYPE_LABEL,
  STATUS_COLOR,
  formatPeriod,
  type LeaveStatus,
  type LeaveType,
} from '@/lib/leave'
import {
  calcLeaveUsage,
  calcRemaining,
  currentPeriodSeq,
  formatLeaveDays,
  formatPeriodRange,
  legalGrantForYear,
  periodDates,
  periodLabel,
  yearsBetween,
} from '@/lib/annual-leave'

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

type BalanceRow = {
  id: string
  period_seq: number
  period_start: string
  period_end: string
  granted: number
  used: number
}

type LeaveRow = {
  id: string
  type: LeaveType
  start_date: string
  end_date: string
  start_time: string | null
  end_time: string | null
  status: LeaveStatus
  final_actor_id: string | null
  final_acted_at: string | null
  created_at: string
}

type GrantRow = {
  id: string
  balance_id: string
  delta: number
  reason: string
  source: string
  actor_employee_id: string | null
  created_at: string
}

function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

export default async function MyLeavesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, name, hire_date, is_active, permission')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | { id: string; name: string; hire_date: string | null; is_active: boolean; permission: Permission }
    | null
  if (!me || !me.is_active) {
    redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  }

  // 본인 회차 전체 (현재 + 과거)
  const { data: balData } = await supabase
    .from('annual_leave_balances')
    .select('id, period_seq, period_start, period_end, granted, used')
    .eq('employee_id', me.id)
    .order('period_seq', { ascending: false })
  const balances = (balData ?? []) as BalanceRow[]

  const currentSeq = me.hire_date ? currentPeriodSeq(me.hire_date) : null
  const currentBal = balances.find((b) => b.period_seq === currentSeq) ?? null
  const currentRemaining = currentBal ? calcRemaining(currentBal.granted, currentBal.used) : null

  // 본인 휴가 신청 이력 (전체)
  const { data: leaveData } = await supabase
    .from('leave_requests')
    .select(
      'id, type, start_date, end_date, start_time, end_time, status, final_actor_id, final_acted_at, created_at',
    )
    .eq('employee_id', me.id)
    .order('start_date', { ascending: false })
    .limit(100)
  const leaves = (leaveData ?? []) as LeaveRow[]

  // 대기 중 신청의 차감 예정 합계 (status='대기' + 차감 대상 종류만)
  const pendingUsage = leaves
    .filter((l) => l.status === '대기')
    .reduce(
      (acc, l) => acc + calcLeaveUsage(l.type, l.start_date, l.end_date),
      0,
    )
  const projectedAfterPending =
    currentRemaining !== null
      ? Number((currentRemaining - pendingUsage).toFixed(2))
      : null

  // audit 이력 (본인 balance 대상)
  let grants: GrantRow[] = []
  if (balances.length > 0) {
    const { data: grantData } = await supabase
      .from('annual_leave_grants')
      .select('id, balance_id, delta, reason, source, actor_employee_id, created_at')
      .in(
        'balance_id',
        balances.map((b) => b.id),
      )
      .order('created_at', { ascending: false })
      .limit(50)
    grants = (grantData ?? []) as GrantRow[]
  }

  // 다음 회차 미리보기
  let nextPeriod: { seq: number; start: string; end: string; granted: number } | null = null
  if (me.hire_date && currentSeq !== null) {
    const nextSeq = currentSeq + 1
    const { start, end } = periodDates(me.hire_date, nextSeq)
    nextPeriod = {
      seq: nextSeq,
      start,
      end,
      granted: legalGrantForYear(nextSeq),
    }
  }

  // 사용 액터 이름 (audit + 결재 처리자)
  const actorIds = Array.from(
    new Set([
      ...grants.map((g) => g.actor_employee_id).filter((v): v is string => !!v),
      ...leaves.map((l) => l.final_actor_id).filter((v): v is string => !!v),
    ]),
  )
  const nameById = new Map<string, string>()
  if (actorIds.length > 0) {
    const { data: actors } = await supabase
      .from('employees')
      .select('id, name')
      .in('id', actorIds)
    for (const a of (actors ?? []) as { id: string; name: string }[]) {
      nameById.set(a.id, a.name)
    }
  }

  const yrs = me.hire_date ? yearsBetween(me.hire_date) : null

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
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">내 연차</h1>
          {me.hire_date && yrs !== null ? (
            <p className="mt-1 text-sm text-slate-500">
              입사 <span className="font-medium text-slate-700 tabular-nums">{me.hire_date}</span>{' '}
              · 근속 {yrs}년차
            </p>
          ) : (
            <p className="mt-1 text-sm text-amber-700">
              입사일이 등록되지 않았습니다. 관리자에게 입력을 요청하세요.
            </p>
          )}
        </header>

        {/* 현재 회차 큰 잔여 카드 */}
        {currentBal && currentRemaining !== null && (
          <section className="rounded-2xl bg-white border border-slate-200 p-6 space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">현재 잔여</p>
                <p
                  className={
                    'text-4xl font-bold tabular-nums ' +
                    (currentRemaining < 0 ? 'text-rose-600' : 'text-slate-900')
                  }
                >
                  {formatLeaveDays(currentRemaining)}
                </p>
              </div>
              <Link
                href="/requests/new"
                className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                휴가 신청
              </Link>
            </div>
            <p className="text-xs text-slate-600">
              {periodLabel(currentBal.period_seq)}{' '}
              <span className="tabular-nums">
                ({formatPeriodRange(currentBal.period_start, currentBal.period_end)})
              </span>
            </p>
            <p className="text-xs text-slate-500">
              부여 <span className="font-semibold text-slate-700">{formatLeaveDays(currentBal.granted)}</span> · 사용{' '}
              <span className="font-semibold text-slate-700">{formatLeaveDays(currentBal.used)}</span>
            </p>
            {pendingUsage > 0 && projectedAfterPending !== null && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs">
                <p className="font-medium text-amber-800">
                  대기 중 신청 {formatLeaveDays(pendingUsage)}
                </p>
                <p className="mt-0.5 text-amber-700">
                  모두 승인 시 잔여{' '}
                  <span
                    className={
                      'font-bold tabular-nums ' +
                      (projectedAfterPending < 0 ? 'text-rose-700' : 'text-amber-900')
                    }
                  >
                    {formatLeaveDays(projectedAfterPending)}
                  </span>{' '}
                  으로 줄어듭니다.
                </p>
              </div>
            )}
          </section>
        )}

        {!currentBal && me.hire_date && (
          <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-800">
            연차 회차가 아직 생성되지 않았습니다. 관리자에게 「연차 갱신」 을 요청하세요.
          </section>
        )}

        {/* 다음 회차 미리보기 */}
        {nextPeriod && (
          <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-1.5">
            <p className="text-xs font-medium text-blue-800 uppercase tracking-wide">
              다음 회차 예고
            </p>
            <p className="text-sm text-slate-700">
              <span className="font-semibold">{periodLabel(nextPeriod.seq)}</span> 가 시작되면{' '}
              <span className="font-bold text-blue-700 tabular-nums">
                {formatLeaveDays(nextPeriod.granted)}
              </span>{' '}
              부여 예정
            </p>
            <p className="text-xs text-slate-500 tabular-nums">
              {formatPeriodRange(nextPeriod.start, nextPeriod.end)}
            </p>
          </section>
        )}

        {/* 이전 회차들 (현재 제외) */}
        {balances.filter((b) => b.period_seq !== currentSeq).length > 0 && (
          <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
            <h2 className="flex items-center gap-1.5 text-base font-semibold text-slate-700 tracking-tight">
              <History className="h-4 w-4 text-slate-500" />
              이전 회차
            </h2>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {balances
                .filter((b) => b.period_seq !== currentSeq)
                .map((b) => {
                  const r = calcRemaining(b.granted, b.used)
                  return (
                    <li key={b.id} className="px-3 py-2.5 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-900">{periodLabel(b.period_seq)}</p>
                          <p className="text-[11px] text-slate-500 tabular-nums">
                            {formatPeriodRange(b.period_start, b.period_end)}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-600">
                            부여 <span className="font-semibold">{formatLeaveDays(b.granted)}</span> · 사용{' '}
                            <span className="font-semibold">{formatLeaveDays(b.used)}</span>
                          </p>
                        </div>
                        <span
                          className={
                            'shrink-0 text-sm font-semibold tabular-nums ' +
                            (r < 0 ? 'text-rose-600' : 'text-slate-700')
                          }
                        >
                          잔여 {formatLeaveDays(r)}
                        </span>
                      </div>
                    </li>
                  )
                })}
            </ul>
          </section>
        )}

        {/* 본인 휴가 신청 이력 */}
        <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
          <h2 className="flex items-center gap-1.5 text-base font-semibold text-slate-700 tracking-tight">
            <CalendarDays className="h-4 w-4 text-slate-500" />
            내 휴가 신청 이력 ({leaves.length})
          </h2>
          {leaves.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              아직 휴가 신청 내역이 없습니다.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {leaves.map((l) => {
                const usage = calcLeaveUsage(l.type, l.start_date, l.end_date)
                return (
                  <li key={l.id} className="px-3 py-2.5 text-sm">
                    <Link
                      href={`/requests/${l.id}`}
                      className="flex items-start justify-between gap-2 hover:underline"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-slate-900">
                          <span className="font-medium">{LEAVE_TYPE_LABEL[l.type]}</span>
                          <span className="ml-2 text-xs text-slate-500 tabular-nums">
                            {formatPeriod(l.start_date, l.end_date, l.start_time, l.end_time)}
                          </span>
                        </p>
                        {usage > 0 && (
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            차감 {formatLeaveDays(usage)}
                            {l.final_acted_at && (
                              <span className="ml-1.5">
                                · 처리 {fmtDateTime(l.final_acted_at)}
                                {l.final_actor_id && nameById.get(l.final_actor_id) && (
                                  <span className="ml-1">
                                    ({nameById.get(l.final_actor_id)})
                                  </span>
                                )}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                      <span
                        className={
                          'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ' +
                          STATUS_COLOR[l.status]
                        }
                      >
                        {l.status}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* audit 이력 (admin 부여·조정) */}
        {grants.length > 0 && (
          <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
            <h2 className="flex items-center gap-1.5 text-base font-semibold text-slate-700 tracking-tight">
              <History className="h-4 w-4 text-slate-500" />
              부여·조정 이력
            </h2>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {grants.map((g) => {
                const bal = balances.find((b) => b.id === g.balance_id)
                return (
                  <li key={g.id} className="px-3 py-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-slate-900">
                          <span
                            className={
                              'font-semibold tabular-nums ' +
                              (g.delta >= 0 ? 'text-emerald-700' : 'text-rose-700')
                            }
                          >
                            {g.delta > 0 ? '+' : ''}
                            {formatLeaveDays(g.delta)}
                          </span>
                          <span className="ml-2 text-xs text-slate-600">{g.reason}</span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {bal && (
                            <span className="mr-1.5">
                              {periodLabel(bal.period_seq)} ·
                            </span>
                          )}
                          {fmtDateTime(g.created_at)}
                          {g.actor_employee_id && nameById.get(g.actor_employee_id) && (
                            <span className="ml-1">({nameById.get(g.actor_employee_id)})</span>
                          )}
                          <span className="ml-1.5 text-slate-400">[{g.source}]</span>
                        </p>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </div>
    </main>
  )
}
