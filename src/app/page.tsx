import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from './login/actions'

type Permission = 'worker' | 'foreman' | 'admin' | 'ceo'

const PERMISSION_LABEL: Record<Permission, string> = {
  worker: '작업자',
  foreman: '소장',
  admin: '관리자',
  ceo: '대표',
}

function todayInSeoul(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
}

function fmtHourMin(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

export default async function Home() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // proxy.ts 가 비로그인 사용자를 /login 으로 보내지만 방어적으로 한 번 더.
  if (!user) {
    return null
  }

  const { data } = await supabase
    .from('employees')
    .select('id, name, permission, position, team, work_type, is_active, company_id, companies(name)')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const employee = data as
    | {
        id: string
        name: string
        permission: Permission
        position: string | null
        team: string | null
        work_type: string | null
        is_active: boolean
        company_id: string
        companies: { name: string } | null
      }
    | null

  if (!employee) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 text-center space-y-4">
          <h1 className="text-xl font-bold text-slate-900">계정이 회사에 연결되지 않았습니다</h1>
          <p className="text-sm text-slate-600">
            가입 처리가 끝나지 않았습니다. 관리자에게 문의해주세요.
          </p>
          <p className="text-xs text-slate-400 break-all">{user.email}</p>
          <form action={signOut}>
            <button className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              로그아웃
            </button>
          </form>
        </div>
      </main>
    )
  }

  if (!employee.is_active) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 text-center space-y-4">
          <h1 className="text-xl font-bold text-slate-900">비활성화된 계정입니다</h1>
          <p className="text-sm text-slate-600">관리자에게 문의해주세요.</p>
          <form action={signOut}>
            <button className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              로그아웃
            </button>
          </form>
        </div>
      </main>
    )
  }

  const isAdmin = employee.permission === 'admin' || employee.permission === 'ceo'
  const subtitleParts = [
    employee.position,
    employee.team ? `${employee.team}팀` : null,
    employee.work_type,
  ].filter(Boolean)

  // 오늘 근태 1줄 요약 (홈 카드용)
  const workDate = todayInSeoul()
  const { data: todayRow } = await supabase
    .from('attendances')
    .select('check_in_at, check_out_at, site_id')
    .eq('employee_id', employee.id)
    .eq('work_date', workDate)
    .maybeSingle()
  const today = todayRow as
    | { check_in_at: string | null; check_out_at: string | null; site_id: string | null }
    | null

  let todaySiteName: string | null = null
  if (today?.site_id) {
    const { data: s } = await supabase.from('sites').select('name').eq('id', today.site_id).maybeSingle()
    todaySiteName = (s as { name: string } | null)?.name ?? null
  }

  const checkedIn = !!today?.check_in_at
  const checkedOut = !!today?.check_out_at

  // 차량 — 내가 현재 사용 중인 운행 (있으면)
  const { data: myVehicleTripRow } = await supabase
    .from('vehicle_trips')
    .select('id, vehicle_id, departed_at')
    .eq('driver_employee_id', employee.id)
    .is('returned_at', null)
    .maybeSingle()
  const myVehicleTrip = myVehicleTripRow as
    | { id: string; vehicle_id: string; departed_at: string }
    | null

  let myVehicleName: string | null = null
  if (myVehicleTrip) {
    const { data: v } = await supabase
      .from('vehicles')
      .select('plate_number, name')
      .eq('id', myVehicleTrip.vehicle_id)
      .maybeSingle()
    const vRow = v as { plate_number: string; name: string } | null
    if (vRow) myVehicleName = `${vRow.plate_number} · ${vRow.name}`
  }

  // 결재 대기 건수 (홈 배지용)
  const canApprove = employee.permission !== 'worker'
  let approvalsPendingCount = 0
  if (canApprove) {
    if (isAdmin) {
      const { count } = await supabase
        .from('leave_requests')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', employee.company_id)
        .eq('status', '대기')
        .not('pending_stage', 'is', null)
      approvalsPendingCount = count ?? 0
    } else {
      const { count } = await supabase
        .from('leave_requests')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_foreman_id', employee.id)
        .eq('pending_stage', 'foreman')
        .eq('status', '대기')
      approvalsPendingCount = count ?? 0
    }
  }

  // 내가 낸 대기 신청 건수
  const { count: myPendingCount } = await supabase
    .from('leave_requests')
    .select('*', { count: 'exact', head: true })
    .eq('employee_id', employee.id)
    .eq('status', '대기')

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500">{employee.companies?.name ?? '회사 미지정'}</p>
            <h1 className="text-2xl font-bold text-slate-900">
              {employee.name}
              <span className="ml-2 text-sm font-medium text-slate-500">
                {PERMISSION_LABEL[employee.permission]}
              </span>
            </h1>
            {subtitleParts.length > 0 && (
              <p className="mt-0.5 text-xs text-slate-500">{subtitleParts.join(' · ')}</p>
            )}
          </div>
          <form action={signOut}>
            <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
              로그아웃
            </button>
          </form>
        </header>

        <section className="rounded-2xl bg-white shadow-sm border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wider">
            오늘 근태
          </h2>

          {checkedIn && (
            <div className="text-sm space-y-1">
              <p className="text-slate-900">
                <span className="font-medium">{fmtHourMin(today!.check_in_at!)}</span> 출근
                {todaySiteName && <span className="text-slate-500"> · {todaySiteName}</span>}
              </p>
              {checkedOut && (
                <p className="text-slate-900">
                  <span className="font-medium">{fmtHourMin(today!.check_out_at!)}</span> 퇴근
                </p>
              )}
            </div>
          )}

          <Link
            href="/attendance"
            className={
              checkedOut
                ? 'block rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-sm font-medium text-slate-700 text-center'
                : checkedIn
                  ? 'block rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-slate-700 px-4 py-4 text-base font-bold text-white text-center'
                  : 'block rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 px-4 py-4 text-base font-bold text-white text-center'
            }
          >
            {checkedOut ? '근무 마감 — 기록 보기' : checkedIn ? '퇴근하기 →' : '출근하기 →'}
          </Link>
        </section>

        <section className="rounded-2xl bg-white shadow-sm border border-slate-200 p-6 space-y-3">
          <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wider">
            업무용 차량
          </h2>
          {myVehicleTrip ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-900">
                사용 중: <span className="font-medium">{myVehicleName ?? '?'}</span>
                <span className="ml-2 text-xs text-slate-500">
                  출고 {fmtHourMin(myVehicleTrip.departed_at)}
                </span>
              </p>
              <Link
                href={`/vehicles/${myVehicleTrip.vehicle_id}/return`}
                className="block rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 px-4 py-3 text-base font-bold text-white text-center"
              >
                반납하기 →
              </Link>
            </div>
          ) : (
            <Link
              href="/vehicles"
              className="block rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-sm font-medium text-slate-900 text-center"
            >
              차량 출고·반납 →
            </Link>
          )}
        </section>

        <section className="rounded-2xl bg-white shadow-sm border border-slate-200 p-6 space-y-3">
          <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wider">
            결재
          </h2>
          <Link
            href="/requests"
            className="flex items-center justify-between rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-sm font-medium text-slate-900"
          >
            <span>내 신청 (휴가·외근 등)</span>
            {(myPendingCount ?? 0) > 0 && (
              <span className="rounded-full bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5">
                대기 {myPendingCount}
              </span>
            )}
          </Link>
          {canApprove && (
            <Link
              href="/approvals"
              className="flex items-center justify-between rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-sm font-medium text-slate-900"
            >
              <span>결재함</span>
              {approvalsPendingCount > 0 && (
                <span className="rounded-full bg-red-600 text-white text-xs font-bold px-2 py-0.5">
                  {approvalsPendingCount}
                </span>
              )}
            </Link>
          )}
        </section>

        {isAdmin && (
          <section className="rounded-2xl bg-white shadow-sm border border-slate-200 p-6 space-y-3">
            <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wider">
              관리
            </h2>
            <Link
              href="/admin/employees"
              className="block rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-sm font-medium text-slate-900"
            >
              직원 관리 →
            </Link>
            <Link
              href="/admin/sites"
              className="block rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-sm font-medium text-slate-900"
            >
              현장 관리 →
            </Link>
            <Link
              href="/admin/reports"
              className="block rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-sm font-medium text-slate-900"
            >
              월별 리포트 →
            </Link>
          </section>
        )}

        {!isAdmin && employee.permission === 'foreman' && (
          <section className="rounded-2xl bg-white shadow-sm border border-slate-200 p-6 space-y-3">
            <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wider">
              리포트
            </h2>
            <Link
              href="/admin/reports"
              className="block rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-sm font-medium text-slate-900"
            >
              내 현장 월별 리포트 →
            </Link>
          </section>
        )}

        <p className="text-center text-xs text-slate-400">v0.1 · 사내 베타</p>
      </div>
    </main>
  )
}
