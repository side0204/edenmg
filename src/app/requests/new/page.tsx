import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarDays, ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  calcRemaining,
  currentPeriodSeq,
  formatLeaveDays,
} from '@/lib/annual-leave'
import { RequestForm, type ForemanOption } from './RequestForm'
import type { EmployeeOption } from './EmployeeCombobox'

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

const PERMISSION_LABEL: Record<Permission, string> = {
  worker: '작업자',
  team_leader: '팀장',
  team_member: '팀원',
  admin: '관리자',
}

function todayInSeoul(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
}

export default async function NewRequestPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, hire_date, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as {
    id: string
    company_id: string
    hire_date: string | null
    is_active: boolean
  } | null
  if (!me || !me.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))

  // 본인 잔여 연차 (현재 회차)
  const currentSeq = me.hire_date ? currentPeriodSeq(me.hire_date) : null
  let myBalance: { granted: number; used: number; remaining: number } | null = null
  if (currentSeq !== null) {
    const { data: balRow } = await supabase
      .from('annual_leave_balances')
      .select('granted, used')
      .eq('employee_id', me.id)
      .eq('period_seq', currentSeq)
      .maybeSingle()
    if (balRow) {
      const b = balRow as { granted: number; used: number }
      myBalance = {
        granted: b.granted,
        used: b.used,
        remaining: calcRemaining(b.granted, b.used),
      }
    }
  }

  // 결재자 후보: 본인 제외, 같은 회사 활성, foreman/admin/ceo 권한
  const { data: foremenData } = await supabase
    .from('employees')
    .select('id, name, permission')
    .in('permission', ['team_leader', 'admin'])
    .eq('is_active', true)
    .neq('id', me.id)
    .order('name')

  const foremen: ForemanOption[] = ((foremenData ?? []) as { id: string; name: string; permission: Permission }[]).map(
    (e) => ({ id: e.id, name: e.name, permission_label: PERMISSION_LABEL[e.permission] }),
  )

  // 대무자 후보: 본인 제외, 같은 회사 활성 직원 전원 (권한 무관)
  // RLS 가 같은 회사 직원 select 만 허용하므로 회사 스코프는 자동 적용.
  const { data: substituteData } = await supabase
    .from('employees')
    .select('id, name, position, team, work_type')
    .eq('is_active', true)
    .neq('id', me.id)
    .order('name')

  const substituteCandidates: EmployeeOption[] = (substituteData ?? []) as EmployeeOption[]

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-md space-y-5">
        <header>
          <Link href="/requests" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
            <ChevronLeft className="h-4 w-4" />
            내 신청
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">신청 작성</h1>
          <p className="mt-1 text-sm text-slate-500">휴가·외근·기타 결재 신청서를 작성합니다.</p>
        </header>


        {myBalance && (
          <section
            className={
              'rounded-xl border p-3 ' +
              (myBalance.remaining < 0
                ? 'bg-rose-50 border-rose-200'
                : myBalance.remaining < 1
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-emerald-50/40 border-emerald-200')
            }
          >
            <div className="flex items-center gap-2 text-sm">
              <CalendarDays
                className={
                  'h-4 w-4 ' +
                  (myBalance.remaining < 0
                    ? 'text-rose-600'
                    : myBalance.remaining < 1
                      ? 'text-amber-700'
                      : 'text-emerald-700')
                }
              />
              <span className="font-medium text-slate-700">올해 잔여 연차</span>
              <span
                className={
                  'ml-auto text-base font-bold tabular-nums ' +
                  (myBalance.remaining < 0 ? 'text-rose-600' : 'text-slate-900')
                }
              >
                {formatLeaveDays(myBalance.remaining)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              부여 {formatLeaveDays(myBalance.granted)} · 사용 {formatLeaveDays(myBalance.used)}
              {myBalance.remaining < 0 && (
                <span className="ml-1.5 font-medium text-rose-600">
                  · 음수 (한도 초과) — 신청은 가능하지만 결재자 확인 필요
                </span>
              )}
              {myBalance.remaining >= 0 && myBalance.remaining < 1 && (
                <span className="ml-1.5 font-medium text-amber-700">
                  · 잔여 1일 미만 — 신청 전 확인 권장
                </span>
              )}
            </p>
          </section>
        )}
        {!myBalance && me.hire_date && (
          <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-800">
            연차 회차가 아직 생성되지 않았습니다. 관리자에게 「연차 갱신」 을 요청하세요.
          </section>
        )}
        {!me.hire_date && (
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            입사일이 등록되지 않아 연차 잔여 정보를 표시할 수 없습니다.
          </section>
        )}

        <RequestForm
          foremen={foremen}
          substituteCandidates={substituteCandidates}
          defaultDate={todayInSeoul()}
        />
      </div>
    </main>
  )
}
