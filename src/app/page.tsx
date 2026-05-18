import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from './login/actions'
import VehicleStatusList from './VehicleStatusList'

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

  // 차량 — 회사 전 차량 + 현재 운행 중인 행 + 차량별 마지막 반납 km(placeholder 용)
  const [vehiclesRes, activeTripsRes, recentReturnedRes] = await Promise.all([
    supabase
      .from('vehicles')
      .select('id, plate_number, name, is_active')
      .eq('company_id', employee.company_id)
      .order('is_active', { ascending: false })
      .order('plate_number'),
    supabase
      .from('vehicle_trips')
      .select(
        'id, vehicle_id, departed_at, driver_employee_id, start_odometer_km, purpose, employees!driver_employee_id(name)',
      )
      .eq('company_id', employee.company_id)
      .is('returned_at', null),
    supabase
      .from('vehicle_trips')
      .select('vehicle_id, end_odometer_km, returned_at')
      .eq('company_id', employee.company_id)
      .not('returned_at', 'is', null)
      .order('returned_at', { ascending: false })
      .limit(50),
  ])

  type VehicleRow = { id: string; plate_number: string; name: string; is_active: boolean }
  type ActiveTrip = {
    id: string
    vehicle_id: string
    departed_at: string
    driver_employee_id: string
    start_odometer_km: number | null
    purpose: string | null
    employees: { name: string }[] | null
  }
  type RecentReturned = { vehicle_id: string; end_odometer_km: number | null; returned_at: string }
  const vehicles = (vehiclesRes.data ?? []) as VehicleRow[]
  const activeTrips = (activeTripsRes.data ?? []) as unknown as ActiveTrip[]
  const tripByVehicleId = new Map(activeTrips.map((t) => [t.vehicle_id, t]))

  // 차량별 가장 최근 반납 km — 회사 전체 returned_at desc 정렬 50건에서 vehicle_id 별 첫 행 추출
  const lastEndKmByVehicleId = new Map<string, number | null>()
  for (const t of (recentReturnedRes.data ?? []) as RecentReturned[]) {
    if (!lastEndKmByVehicleId.has(t.vehicle_id)) {
      lastEndKmByVehicleId.set(t.vehicle_id, t.end_odometer_km)
    }
  }

  const myVehicleTrip = activeTrips.find((t) => t.driver_employee_id === employee.id) ?? null
  const myVehicle = myVehicleTrip ? vehicles.find((v) => v.id === myVehicleTrip.vehicle_id) ?? null : null
  const myVehicleName = myVehicle ? `${myVehicle.plate_number} · ${myVehicle.name}` : null

  // 정렬: 사용중 → 대기 → 비활성, 그 안에서 plate_number
  const vehicleStatusRows = vehicles
    .map((v) => {
      const trip = tripByVehicleId.get(v.id) ?? null
      const status: 'in_use' | 'idle' | 'inactive' = !v.is_active
        ? 'inactive'
        : trip
          ? 'in_use'
          : 'idle'
      return { vehicle: v, trip, status }
    })
    .sort((a, b) => {
      const order = { in_use: 0, idle: 1, inactive: 2 } as const
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status]
      return a.vehicle.plate_number.localeCompare(b.vehicle.plate_number)
    })

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
            <p className="text-sm text-slate-600">{employee.companies?.name ?? '회사 미지정'}</p>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
              {employee.name}
              <span className="ml-2 text-base font-medium text-slate-500">
                {PERMISSION_LABEL[employee.permission]}
              </span>
            </h1>
            {subtitleParts.length > 0 && (
              <p className="mt-1 text-sm text-slate-500">{subtitleParts.join(' · ')}</p>
            )}
          </div>
          <form action={signOut}>
            <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              로그아웃
            </button>
          </form>
        </header>

        <section className="rounded-2xl bg-white shadow-sm border border-slate-200 p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-700 tracking-tight">
            오늘 근태
          </h2>

          {checkedIn && (
            <div className="text-base space-y-1">
              <p className="text-slate-900">
                <span className="font-semibold">{fmtHourMin(today!.check_in_at!)}</span> 출근
                {todaySiteName && <span className="text-slate-500"> · {todaySiteName}</span>}
              </p>
              {checkedOut && (
                <p className="text-slate-900">
                  <span className="font-semibold">{fmtHourMin(today!.check_out_at!)}</span> 퇴근
                </p>
              )}
            </div>
          )}

          <Link
            href="/attendance"
            className={
              checkedOut
                ? 'block rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-base font-medium text-slate-700 text-center'
                : checkedIn
                  ? 'block rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-slate-700 px-4 py-4 text-lg font-bold text-white text-center'
                  : 'block rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 px-4 py-4 text-lg font-bold text-white text-center'
            }
          >
            {checkedOut ? '근무 마감 — 기록 보기' : checkedIn ? '퇴근하기 →' : '출근하기 →'}
          </Link>
        </section>

        <section className="rounded-2xl bg-white shadow-sm border border-slate-200 p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-700 tracking-tight">
            업무용 차량
          </h2>

          {myVehicleTrip && (
            <div className="space-y-2">
              <p className="text-base text-slate-900">
                사용 중: <span className="font-semibold">{myVehicleName ?? '?'}</span>
                <span className="ml-2 text-sm text-slate-500">
                  출고 {fmtHourMin(myVehicleTrip.departed_at)}
                </span>
              </p>
              <Link
                href={`/vehicles/${myVehicleTrip.vehicle_id}/return`}
                className="block rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 px-4 py-4 text-lg font-bold text-white text-center"
              >
                반납하기 →
              </Link>
            </div>
          )}

          <VehicleStatusList
            rows={vehicleStatusRows.map(({ vehicle, trip, status }) => ({
              vehicleId: vehicle.id,
              plateNumber: vehicle.plate_number,
              name: vehicle.name,
              status,
              driverName: trip?.employees?.[0]?.name ?? null,
              departedAt: trip?.departed_at ?? null,
              startOdometerKm: trip?.start_odometer_km ?? null,
              purpose: trip?.purpose ?? null,
              isMine: trip?.driver_employee_id === employee.id,
              lastEndOdometerKm: lastEndKmByVehicleId.get(vehicle.id) ?? null,
            }))}
            hasMyActive={!!myVehicleTrip}
          />

          <Link
            href="/vehicles"
            className="block rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-base font-medium text-slate-900 text-center"
          >
            전체 차량 관리 →
          </Link>
        </section>

        <section className="rounded-2xl bg-white shadow-sm border border-slate-200 p-6 space-y-3">
          <h2 className="text-base font-semibold text-slate-700 tracking-tight">
            결재
          </h2>
          <Link
            href="/requests"
            className="flex items-center justify-between rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-base font-medium text-slate-900"
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
              className="flex items-center justify-between rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-base font-medium text-slate-900"
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
            <h2 className="text-base font-semibold text-slate-700 tracking-tight">
              관리
            </h2>
            <Link
              href="/admin/employees"
              className="block rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-base font-medium text-slate-900"
            >
              직원 관리 →
            </Link>
            <Link
              href="/admin/sites"
              className="block rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-base font-medium text-slate-900"
            >
              현장 관리 →
            </Link>
            <Link
              href="/admin/reports"
              className="block rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-base font-medium text-slate-900"
            >
              월별 리포트 →
            </Link>
          </section>
        )}

        {!isAdmin && employee.permission === 'foreman' && (
          <section className="rounded-2xl bg-white shadow-sm border border-slate-200 p-6 space-y-3">
            <h2 className="text-base font-semibold text-slate-700 tracking-tight">
              리포트
            </h2>
            <Link
              href="/admin/reports"
              className="block rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-base font-medium text-slate-900"
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
