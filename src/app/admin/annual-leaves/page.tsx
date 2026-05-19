import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CalendarDays, ChevronLeft, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  calcRemaining,
  currentPeriodSeq,
  formatLeaveDays,
  formatPeriodRange,
  inclusiveEndDate,
  legalGrantForYear,
  periodLabel,
  yearsBetween,
} from '@/lib/annual-leave'
import {
  adjustAnnualLeaveBalance,
  refreshAllAnnualLeaves,
  refreshEmployeeAnnualLeaves,
  setInitialRemaining,
  updateHireDate,
} from './actions'

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

type EmpRow = {
  id: string
  name: string
  position: string | null
  team: string | null
  work_type: string | null
  hire_date: string | null
  is_active: boolean
}

type BalanceRow = {
  id: string
  employee_id: string
  period_seq: number
  period_start: string
  period_end: string
  granted: number
  used: number
}

export default async function AdminAnnualLeavesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, permission')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; company_id: string; permission: Permission } | null
  if (!me || me.permission !== 'admin') notFound()

  const { data: empData } = await supabase
    .from('employees')
    .select('id, name, position, team, work_type, hire_date, is_active')
    .eq('company_id', me.company_id)
    .order('hire_date', { ascending: true, nullsFirst: false })
    .order('name')
  const emps = (empData ?? []) as EmpRow[]

  const { data: balData } = await supabase
    .from('annual_leave_balances')
    .select('id, employee_id, period_seq, period_start, period_end, granted, used')
    .eq('company_id', me.company_id)
    .order('period_seq', { ascending: false })
  const balances = (balData ?? []) as BalanceRow[]

  // 직원별 잔여·현재 회차
  const balancesByEmp = new Map<string, BalanceRow[]>()
  for (const b of balances) {
    const arr = balancesByEmp.get(b.employee_id) ?? []
    arr.push(b)
    balancesByEmp.set(b.employee_id, arr)
  }

  const totalEmpsWithHire = emps.filter((e) => e.hire_date).length

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <header>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
            홈
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">연차 관리</h1>
          <p className="mt-1 text-sm text-slate-500">
            근로기준법 기준 자동 부여. 직원 입사일을 등록하면 자동 회차가 생성됩니다.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            * 1년 미만: 매월 1일 누적 (최대 11일). 1년 이상: 매 1주년에 15일 + 3년차부터 2년마다 +1일 (최대 25일).
          </p>
          <p className="mt-1 text-xs text-amber-700">
            * 시스템 운영 전에 사용한 연차가 있다면 회차별 「잔여 직접 설정」 input 에 현재 남은 일수를 입력하세요. 사용일수가 자동 계산됩니다.
          </p>
        </header>

        <section className="rounded-2xl bg-white border border-slate-200 p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-700">전직원 일괄 갱신</p>
            <p className="text-xs text-slate-500">
              입사일 등록된 직원 {totalEmpsWithHire}명 — 현재 시점까지의 회차를 자동 부여
            </p>
          </div>
          <form action={refreshAllAnnualLeaves}>
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              <RefreshCw className="h-4 w-4" />
              일괄 갱신
            </button>
          </form>
        </section>

        <ul className="space-y-3">
          {emps.map((emp) => {
            const empBalances = balancesByEmp.get(emp.id) ?? []
            const currentSeq = emp.hire_date ? currentPeriodSeq(emp.hire_date) : null
            const currentBal = empBalances.find((b) => b.period_seq === currentSeq) ?? null
            const yrs = emp.hire_date ? yearsBetween(emp.hire_date) : null

            return (
              <li key={emp.id} className="rounded-xl bg-white border border-slate-200 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {emp.name}
                      {!emp.is_active && (
                        <span className="ml-1.5 text-[10px] font-normal text-slate-400">(비활성)</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {[emp.position, emp.team ? `${emp.team}팀` : null, emp.work_type]
                        .filter(Boolean)
                        .join(' · ') || '직급·팀·직무 미지정'}
                    </p>
                  </div>
                  {currentBal && (
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] font-medium text-slate-500 uppercase">잔여</p>
                      <p
                        className={
                          'text-lg font-bold tabular-nums ' +
                          (calcRemaining(currentBal.granted, currentBal.used) < 0
                            ? 'text-rose-600'
                            : 'text-slate-900')
                        }
                      >
                        {formatLeaveDays(calcRemaining(currentBal.granted, currentBal.used))}
                      </p>
                    </div>
                  )}
                </div>

                <form
                  action={updateHireDate}
                  className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"
                >
                  <input type="hidden" name="employee_id" value={emp.id} />
                  <span className="text-xs font-medium text-slate-700 shrink-0">입사일</span>
                  <input
                    type="date"
                    name="hire_date"
                    defaultValue={emp.hire_date ?? ''}
                    className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
                  />
                  <button
                    type="submit"
                    className="shrink-0 rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800"
                  >
                    저장
                  </button>
                </form>

                {emp.hire_date && yrs !== null && (
                  <p className="text-xs text-slate-500">
                    입사{' '}
                    <span className="font-medium text-slate-700 tabular-nums">{emp.hire_date}</span>
                    {' · '}근속 {yrs}년차 · 현재{' '}
                    {currentSeq === 0 ? '1년 미만 (월 누적)' : `${currentSeq}주년 회차`}
                    {currentSeq !== null && currentSeq >= 1 && (
                      <span className="ml-1">
                        · 법정 부여 {legalGrantForYear(currentSeq)}일
                      </span>
                    )}
                  </p>
                )}

                {empBalances.length > 0 && (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {empBalances.map((b) => {
                      const remaining = calcRemaining(b.granted, b.used)
                      const isCurrent = b.period_seq === currentSeq
                      return (
                        <li
                          key={b.id}
                          className={
                            'px-3 py-2.5 text-sm space-y-2 ' +
                            (isCurrent ? 'bg-emerald-50/40' : '')
                          }
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-slate-900">
                                {periodLabel(b.period_seq)}
                                {isCurrent && (
                                  <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                                    현재
                                  </span>
                                )}
                              </p>
                              <p className="mt-0.5 text-xs font-medium text-slate-700 tabular-nums">
                                {formatPeriodRange(b.period_start, b.period_end)}
                              </p>
                              <p className="mt-0.5 text-[11px] text-slate-600">
                                부여 <span className="font-semibold">{formatLeaveDays(b.granted)}</span>{' '}
                                · 사용{' '}
                                <span className="font-semibold text-slate-700">{formatLeaveDays(b.used)}</span>{' '}
                                · 잔여{' '}
                                <span
                                  className={
                                    'font-semibold ' +
                                    (remaining < 0 ? 'text-rose-600' : 'text-emerald-700')
                                  }
                                >
                                  {formatLeaveDays(remaining)}
                                </span>
                              </p>
                            </div>
                          </div>
                          <form
                            action={setInitialRemaining}
                            className="rounded-md bg-amber-50/60 border border-amber-200 p-2 space-y-1.5"
                          >
                            <input type="hidden" name="balance_id" value={b.id} />
                            <p className="text-[11px] font-medium text-amber-900">
                              📅 <span className="tabular-nums">{b.period_start}</span> ~{' '}
                              <span className="tabular-nums">{inclusiveEndDate(b.period_end)}</span>{' '}
                              사용분을 제외한 잔여일 입력
                            </p>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                step="0.25"
                                min="0"
                                name="remaining"
                                placeholder={`현재 ${remaining}`}
                                className="w-24 rounded-md border border-amber-300 bg-white px-2 py-1 text-xs"
                              />
                              <span className="text-[11px] text-slate-500 shrink-0">일 남음</span>
                              <button
                                type="submit"
                                className="ml-auto shrink-0 rounded-md bg-amber-600 px-3 py-1 text-xs font-bold text-white hover:bg-amber-700"
                              >
                                적용
                              </button>
                            </div>
                            <p className="text-[10px] text-amber-700/80">
                              부여 {formatLeaveDays(b.granted)} 기준 → 사용량 자동 계산. 운영 전 사용 이력 반영 또는 잔여 보정용.
                            </p>
                          </form>

                          <form
                            action={adjustAnnualLeaveBalance}
                            className="flex items-center gap-1.5"
                          >
                            <input type="hidden" name="balance_id" value={b.id} />
                            <input
                              type="number"
                              step="0.25"
                              name="delta"
                              placeholder="부여 ±"
                              className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs"
                            />
                            <input
                              type="text"
                              name="reason"
                              placeholder="사유 (선택)"
                              className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
                            />
                            <button
                              type="submit"
                              className="shrink-0 rounded-md bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-700"
                            >
                              가산
                            </button>
                          </form>
                        </li>
                      )
                    })}
                  </ul>
                )}

                {emp.hire_date && (
                  <form action={refreshEmployeeAnnualLeaves}>
                    <input type="hidden" name="employee_id" value={emp.id} />
                    <button
                      type="submit"
                      className="w-full inline-flex items-center justify-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      이 직원만 갱신
                    </button>
                  </form>
                )}

                {!emp.hire_date && (
                  <p className="rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5 text-xs text-amber-700">
                    입사일 등록 시 자동으로 회차가 부여됩니다.
                  </p>
                )}
              </li>
            )
          })}
        </ul>

        {emps.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
            <CalendarDays className="inline h-5 w-5 mr-1 text-slate-400" />
            직원이 없습니다.
          </p>
        )}
      </div>
    </main>
  )
}
