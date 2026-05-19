import React from 'react'
import Link from 'next/link'
import {
  Bell,
  Clock,
  Car,
  ClipboardCheck,
  Hammer,
  Settings,
  Settings2,
  FileText,
  CalendarDays,
  Package,
  Network,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { LEAVE_TYPE_LABEL, formatPeriod, type LeaveType } from '@/lib/leave'
import {
  calcLeaveUsage,
  calcRemaining,
  currentPeriodSeq,
  formatLeaveDays,
  formatPeriodRange,
  legalGrantForYear,
  periodDates,
  periodLabel,
} from '@/lib/annual-leave'
import {
  isCardVisible,
  resolveHomeCardPrefs,
  type HomeCardId,
} from '@/lib/home-cards'
import { signOut } from './login/actions'
import VehicleStatusList from './VehicleStatusList'
import TodayWorksCard, {
  type ActiveCheckRow,
  type ClosedCheckRow,
  type PendingWorkRow,
} from './TodayWorksCard'

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

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
    .select(
      'id, name, permission, position, team, work_type, can_manage_stock, workplace_type, hire_date, home_card_prefs, is_active, accepted_at, resigned_at, company_id, companies(name)',
    )
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
        can_manage_stock: boolean
        workplace_type: '본사' | '현장' | string | null
        hire_date: string | null
        home_card_prefs: unknown
        is_active: boolean
        accepted_at: string | null
        resigned_at: string | null
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
    // 가입 직후엔 accepted_at = null. 관리자 승인 시 채워짐.
    // 퇴사 처리됐으면 resigned_at 에 날짜 — 메시지 분기.
    const isResigned = !!employee.resigned_at
    const isFirstApproval = !employee.accepted_at && !isResigned
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 text-center space-y-4">
          <h1 className="text-xl font-bold text-slate-900">
            {isResigned
              ? '퇴사 처리된 계정입니다'
              : isFirstApproval
                ? '관리자 승인 대기 중'
                : '비활성화된 계정입니다'}
          </h1>
          <p className="text-sm text-slate-600">
            {isResigned
              ? `퇴사일: ${employee.resigned_at}. 재입사 처리가 필요하면 관리자에게 문의해주세요.`
              : isFirstApproval
                ? '관리자가 가입 신청을 검토하고 권한을 부여하면 사용할 수 있습니다.'
                : '관리자에게 문의해주세요.'}
          </p>
          <form action={signOut}>
            <button className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              로그아웃
            </button>
          </form>
        </div>
      </main>
    )
  }

  const isAdmin = employee.permission === 'admin'
  const isFieldWorker = employee.workplace_type === '현장'

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
      .is('retired_at', null)
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
      .select(
        'vehicle_id, end_odometer_km, returned_at, return_location, driver_employee_id, employees!driver_employee_id(name)',
      )
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
  type RecentReturned = {
    vehicle_id: string
    end_odometer_km: number | null
    returned_at: string
    return_location: string | null
    driver_employee_id: string | null
    employees: { name: string }[] | null
  }
  const vehicles = (vehiclesRes.data ?? []) as VehicleRow[]
  const activeTrips = (activeTripsRes.data ?? []) as unknown as ActiveTrip[]
  const tripByVehicleId = new Map(activeTrips.map((t) => [t.vehicle_id, t]))

  // 차량별 가장 최근 반납 정보 — km + 반납위치 + 마지막 운전자
  const lastEndKmByVehicleId = new Map<string, number | null>()
  const lastReturnByVehicleId = new Map<
    string,
    { driverName: string | null; returnedAt: string | null; returnLocation: string | null }
  >()
  for (const t of (recentReturnedRes.data ?? []) as unknown as RecentReturned[]) {
    if (!lastEndKmByVehicleId.has(t.vehicle_id)) {
      lastEndKmByVehicleId.set(t.vehicle_id, t.end_odometer_km)
      const drvName = t.employees && t.employees.length > 0 ? t.employees[0].name : null
      lastReturnByVehicleId.set(t.vehicle_id, {
        driverName: drvName,
        returnedAt: t.returned_at,
        returnLocation: t.return_location,
      })
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

  // ===== 내 작업 (배정자 알림용) =====
  // 본인이 배정된 작업의 work_assignments 중 최근 created_at 모아 신규 배지 카운트
  const NEW_ASSIGNMENT_DAYS = 3
  const newCutoff = new Date(
    new Date().getTime() - NEW_ASSIGNMENT_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()
  const { data: myAssignsData } = await supabase
    .from('work_assignments')
    .select(
      'work_id, created_at, works!inner(id, name, category, subcategory, status, order_id, company_id)',
    )
    .eq('employee_id', employee.id)
  type MyAssignJoined = {
    work_id: string
    created_at: string
    works: {
      id: string
      name: string
      category: string
      subcategory: string | null
      status: '예정' | '진행중' | '완료' | '취소' | string
      order_id: string | null
      company_id: string
    }
  }
  const myAssigns = ((myAssignsData ?? []) as unknown) as MyAssignJoined[]
  const myAssignsByWork = new Map<string, MyAssignJoined>()
  for (const a of myAssigns) {
    const prev = myAssignsByWork.get(a.work_id)
    if (!prev || prev.created_at < a.created_at) myAssignsByWork.set(a.work_id, a)
  }
  const myWorkCount = myAssignsByWork.size
  const myNewAssignmentCount = Array.from(myAssignsByWork.values()).filter(
    (a) => a.created_at >= newCutoff,
  ).length

  // ===== 오늘 작업 체크 (work_daily_checks) =====
  const { data: todayChecksData } = await supabase
    .from('work_daily_checks')
    .select('id, work_id, decision, created_at, closed_at')
    .eq('employee_id', employee.id)
    .eq('check_date', workDate)
  type TodayCheck = {
    id: string
    work_id: string
    decision: '진행중' | '완료' | '이월'
    created_at: string
    closed_at: string | null
  }
  const todayChecks = (todayChecksData ?? []) as TodayCheck[]
  const todayCheckByWork = new Map<string, TodayCheck>()
  for (const c of todayChecks) todayCheckByWork.set(c.work_id, c)

  const activeCheckRows: ActiveCheckRow[] = []
  const closedCheckRows: ClosedCheckRow[] = []
  const pendingWorkRows: PendingWorkRow[] = []

  for (const a of myAssignsByWork.values()) {
    const w = a.works
    if (w.company_id !== employee.company_id) continue
    const check = todayCheckByWork.get(w.id)
    if (check) {
      if (check.decision === '진행중') {
        activeCheckRows.push({
          checkId: check.id,
          workId: w.id,
          workName: w.name,
          workCategory: w.category,
          workSubcategory: w.subcategory,
          orderId: w.order_id,
          createdAt: check.created_at,
        })
      } else {
        closedCheckRows.push({
          checkId: check.id,
          workId: w.id,
          workName: w.name,
          decision: check.decision,
          closedAt: check.closed_at,
        })
      }
    } else if (w.status !== '완료' && w.status !== '취소') {
      pendingWorkRows.push({
        workId: w.id,
        name: w.name,
        category: w.category,
        subcategory: w.subcategory,
        status: w.status,
        orderId: w.order_id,
      })
    }
  }
  // 진행 중은 시작 시각 오래된 순
  activeCheckRows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  // 미체크인은 작업명
  pendingWorkRows.sort((a, b) => a.name.localeCompare(b.name))

  // ===== 내 자재 카운트 =====
  const { count: myHoldingsCount } = await supabase
    .from('worker_holdings')
    .select('id', { count: 'exact', head: true })
    .eq('employee_id', employee.id)
    .gt('quantity_remaining', 0)

  // ===== 자재 사용 승인 대기 카운트 (자재담당자/admin 만) =====
  const isStockManager = isAdmin || employee.can_manage_stock
  let stockApprovalsPendingCount = 0
  if (isStockManager) {
    const { count } = await supabase
      .from('daily_report_materials')
      .select('id', { count: 'exact', head: true })
      .eq('approval_status', '대기')
    stockApprovalsPendingCount = count ?? 0
  }

  // 내 연차 잔여 (현재 회차)
  const annualCurrentSeq = employee.hire_date ? currentPeriodSeq(employee.hire_date) : null
  let annualBalance: {
    granted: number
    used: number
    remaining: number
    period_start: string
    period_end: string
    period_seq: number
  } | null = null
  if (annualCurrentSeq !== null) {
    const { data: balRow } = await supabase
      .from('annual_leave_balances')
      .select('granted, used, period_start, period_end, period_seq')
      .eq('employee_id', employee.id)
      .eq('period_seq', annualCurrentSeq)
      .maybeSingle()
    if (balRow) {
      const b = balRow as {
        granted: number
        used: number
        period_start: string
        period_end: string
        period_seq: number
      }
      annualBalance = {
        granted: b.granted,
        used: b.used,
        remaining: calcRemaining(b.granted, b.used),
        period_start: b.period_start,
        period_end: b.period_end,
        period_seq: b.period_seq,
      }
    }
  }
  // 본인 대기 신청 합계 (잔여 카드의 amber 줄)
  let annualPendingUsage = 0
  if (annualCurrentSeq !== null) {
    const { data: pendingRows } = await supabase
      .from('leave_requests')
      .select('type, start_date, end_date')
      .eq('employee_id', employee.id)
      .eq('status', '대기')
    type PR = { type: LeaveType; start_date: string; end_date: string }
    for (const p of (pendingRows ?? []) as PR[]) {
      annualPendingUsage += calcLeaveUsage(p.type, p.start_date, p.end_date)
    }
  }
  // 다음 회차 미리보기
  let nextAnnualPeriod: { seq: number; start: string; end: string; granted: number } | null = null
  if (employee.hire_date && annualCurrentSeq !== null) {
    const nextSeq = annualCurrentSeq + 1
    const { start, end } = periodDates(employee.hire_date, nextSeq)
    nextAnnualPeriod = { seq: nextSeq, start, end, granted: legalGrantForYear(nextSeq) }
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

  // 휴가·외근 현황 — 당일 진행 중인 승인된 신청만 (이번 달 전체는 /leaves 별도 페이지)
  const { data: todayLeavesData } = await supabase
    .from('leave_requests')
    .select(
      'id, employee_id, type, start_date, end_date, start_time, end_time, substitute_employee_id',
    )
    .eq('company_id', employee.company_id)
    .eq('status', '승인')
    .lte('start_date', workDate)
    .gte('end_date', workDate)
    .order('start_date', { ascending: true })

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
  const todayLeaves = (todayLeavesData ?? []) as LeaveRow[]

  const leavePersonIds = Array.from(
    new Set(
      todayLeaves
        .flatMap((l) => [l.employee_id, l.substitute_employee_id])
        .filter((v): v is string => !!v),
    ),
  )
  const leaveNameById = new Map<string, string>()
  if (leavePersonIds.length > 0) {
    const { data: persons } = await supabase
      .from('employees')
      .select('id, name')
      .in('id', leavePersonIds)
    for (const p of (persons ?? []) as { id: string; name: string }[]) {
      leaveNameById.set(p.id, p.name)
    }
  }

  // 사용자 prefs 적용 — 카드 순서 + 표시 여부
  const prefs = resolveHomeCardPrefs(employee.home_card_prefs)

  // 각 카드를 한 곳에 등록. 조건(권한·데이터 없음 등)으로 null 인 카드는 자동 제외.
  const cards: Partial<Record<HomeCardId, React.ReactNode>> = {
    attendance: (
      <section className="rounded-2xl bg-white shadow-sm border border-slate-200 dark:bg-slate-900 dark:border-slate-800 p-6 space-y-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 tracking-tight dark:text-slate-300">
          <Clock className="h-5 w-5 text-slate-400" />
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
    ),

    today_works:
      pendingWorkRows.length + activeCheckRows.length + closedCheckRows.length > 0 ? (
        <TodayWorksCard
          pendingWorks={pendingWorkRows}
          activeChecks={activeCheckRows}
          closedChecks={closedCheckRows}
        />
      ) : undefined,

    vehicles: !isFieldWorker ? (
      <section className="rounded-2xl bg-white shadow-sm border border-slate-200 dark:bg-slate-900 dark:border-slate-800 p-6 space-y-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 tracking-tight dark:text-slate-300">
          <Car className="h-5 w-5 text-slate-400" />
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
          rows={vehicleStatusRows.map(({ vehicle, trip, status }) => {
            const lastReturn = lastReturnByVehicleId.get(vehicle.id) ?? null
            return {
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
              lastDriverName: lastReturn?.driverName ?? null,
              lastReturnedAt: lastReturn?.returnedAt ?? null,
              lastReturnLocation: lastReturn?.returnLocation ?? null,
            }
          })}
          hasMyActive={!!myVehicleTrip}
        />
        <Link
          href="/vehicles"
          className="block rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-base font-medium text-slate-900 dark:border-slate-800 dark:hover:border-slate-100 dark:text-slate-100 text-center"
        >
          전체 차량 관리 →
        </Link>
      </section>
    ) : undefined,

    my_materials:
      (myHoldingsCount ?? 0) > 0 ? (
        <section className="rounded-2xl bg-white shadow-sm border border-slate-200 dark:bg-slate-900 dark:border-slate-800 p-6 space-y-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 tracking-tight dark:text-slate-300">
            <Package className="h-5 w-5 text-slate-400" />
            내 자재
            <span className="ml-auto inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-0.5">
              {myHoldingsCount}건
            </span>
          </h2>
          <Link
            href="/stock/my"
            className="block rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-base font-medium text-slate-900 dark:border-slate-800 dark:hover:border-slate-100 dark:text-slate-100 text-center"
          >
            보유 자재 보기 →
          </Link>
        </section>
      ) : undefined,

    stock_approvals:
      isStockManager && stockApprovalsPendingCount > 0 ? (
        <section className="rounded-2xl bg-amber-50 border border-amber-300 dark:bg-amber-900/20 dark:border-amber-800 p-6 space-y-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-amber-800 tracking-tight dark:text-amber-200">
            <Package className="h-5 w-5" />
            자재 사용 승인 대기
            <span className="ml-auto inline-flex items-center rounded-full bg-amber-200 text-amber-900 text-xs font-bold px-2 py-0.5">
              {stockApprovalsPendingCount}건
            </span>
          </h2>
          <Link
            href="/stock/approvals"
            className="block rounded-lg bg-amber-600 hover:bg-amber-700 px-4 py-3 text-base font-bold text-white text-center"
          >
            승인하러 가기 →
          </Link>
        </section>
      ) : undefined,

    my_works:
      myWorkCount > 0 ? (
        <section className="rounded-2xl bg-white shadow-sm border border-slate-200 dark:bg-slate-900 dark:border-slate-800 p-6 space-y-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 tracking-tight dark:text-slate-300">
            <Hammer className="h-5 w-5 text-slate-400" />
            내 작업 진행 목록
            {myNewAssignmentCount > 0 && (
              <span className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5">
                <Bell className="h-3 w-3" />
                신규 {myNewAssignmentCount}
              </span>
            )}
          </h2>
          <Link
            href="/works?mine=1"
            className="flex items-center justify-between rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-base font-medium text-slate-900 dark:border-slate-800 dark:hover:border-slate-100 dark:text-slate-100"
          >
            <span>
              배정된 작업 {myWorkCount}건
              {myNewAssignmentCount > 0 && (
                <span className="ml-1.5 text-xs font-normal text-amber-700">
                  (최근 {NEW_ASSIGNMENT_DAYS}일 신규 {myNewAssignmentCount}건)
                </span>
              )}
            </span>
            <span className="text-sm text-slate-400">→</span>
          </Link>
          <p className="text-[11px] text-slate-500">
            카드 탭 시 바로 일보 작성. 신규 배정은 호박색 「신규」 배지로 강조됩니다.
          </p>
        </section>
      ) : undefined,

    approvals: !isFieldWorker ? (
      <section className="rounded-2xl bg-white shadow-sm border border-slate-200 dark:bg-slate-900 dark:border-slate-800 p-6 space-y-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 tracking-tight dark:text-slate-300">
          <ClipboardCheck className="h-5 w-5 text-slate-400" />
          결재
        </h2>
        <Link
          href="/requests"
          className="flex items-center justify-between rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-base font-medium text-slate-900 dark:border-slate-800 dark:hover:border-slate-100 dark:text-slate-100"
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
            className="flex items-center justify-between rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-base font-medium text-slate-900 dark:border-slate-800 dark:hover:border-slate-100 dark:text-slate-100"
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
    ) : undefined,

    annual_leave: annualBalance ? (
      <section className="rounded-2xl bg-white shadow-sm border border-slate-200 dark:bg-slate-900 dark:border-slate-800 p-6 space-y-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 tracking-tight dark:text-slate-300">
          <CalendarDays className="h-5 w-5 text-slate-400" />
          내 연차 잔여
          <span
            className={
              'ml-auto inline-flex items-center rounded-full text-sm font-bold px-3 py-0.5 ' +
              (annualBalance.remaining < 0
                ? 'bg-rose-100 text-rose-700'
                : 'bg-emerald-100 text-emerald-800')
            }
          >
            {formatLeaveDays(annualBalance.remaining)}
          </span>
        </h2>
        <p className="text-xs text-slate-600">
          {periodLabel(annualBalance.period_seq)}{' '}
          <span className="tabular-nums text-slate-700">
            ({formatPeriodRange(annualBalance.period_start, annualBalance.period_end)})
          </span>
        </p>
        <p className="text-xs text-slate-500">
          부여 <span className="font-semibold text-slate-700">{formatLeaveDays(annualBalance.granted)}</span> · 사용{' '}
          <span className="font-semibold text-slate-700">{formatLeaveDays(annualBalance.used)}</span>
          {annualBalance.remaining < 0 && (
            <span className="ml-1.5 font-medium text-rose-600">· 한도 초과</span>
          )}
        </p>
        {annualPendingUsage > 0 && (
          <p className="rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5 text-[11px] font-medium text-amber-800">
            대기 중 신청 {formatLeaveDays(annualPendingUsage)} · 승인 시{' '}
            <span
              className={
                'font-bold tabular-nums ' +
                (annualBalance.remaining - annualPendingUsage < 0
                  ? 'text-rose-700'
                  : 'text-amber-900')
              }
            >
              {formatLeaveDays(
                Number((annualBalance.remaining - annualPendingUsage).toFixed(2)),
              )}
            </span>
          </p>
        )}
        {nextAnnualPeriod && (
          <p className="rounded-md bg-blue-50 border border-blue-200 px-2 py-1.5 text-[11px] text-blue-800">
            <span className="font-semibold">{periodLabel(nextAnnualPeriod.seq)}</span> 시작 시{' '}
            <span className="font-bold tabular-nums">{formatLeaveDays(nextAnnualPeriod.granted)}</span> 부여 예정 ·{' '}
            <span className="tabular-nums">
              {formatPeriodRange(nextAnnualPeriod.start, nextAnnualPeriod.end)}
            </span>
          </p>
        )}
        <Link
          href="/my-leaves"
          className="block rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-2 text-sm font-medium text-slate-900 dark:border-slate-800 dark:hover:border-slate-100 dark:text-slate-100 text-center"
        >
          전체 이력 보기 →
        </Link>
      </section>
    ) : undefined,

    leaves: (
      <section className="rounded-2xl bg-white shadow-sm border border-slate-200 dark:bg-slate-900 dark:border-slate-800 p-6 space-y-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 tracking-tight dark:text-slate-300">
          <CalendarDays className="h-5 w-5 text-slate-400" />
          휴가·외근 현황
          <span className="ml-auto text-xs font-normal text-slate-400">오늘</span>
        </h2>
        {todayLeaves.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            오늘 휴가·외근 중인 직원이 없습니다.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {todayLeaves.map((l) => (
              <li key={l.id} className="px-3 py-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-slate-900">
                      <span className="font-semibold">
                        {leaveNameById.get(l.employee_id) ?? '?'}
                      </span>
                      <span className="ml-1.5 text-slate-500">
                        · {LEAVE_TYPE_LABEL[l.type]}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatPeriod(l.start_date, l.end_date, l.start_time, l.end_time)}
                    </p>
                    {l.substitute_employee_id && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        대무: {leaveNameById.get(l.substitute_employee_id) ?? '?'}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-0.5">
                    진행 중
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/leaves"
          className="block rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-base font-medium text-slate-900 dark:border-slate-800 dark:hover:border-slate-100 dark:text-slate-100 text-center"
        >
          이번 달 전체 보기 →
        </Link>
      </section>
    ),

    relocation: (
      <section className="rounded-2xl bg-white shadow-sm border border-slate-200 dark:bg-slate-900 dark:border-slate-800 p-6 space-y-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 tracking-tight dark:text-slate-300">
          <Network className="h-5 w-5 text-slate-400" />
          지장이설 설계
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          LGU+ 광케이블 지장이설 코어구성도·직선도 설계 (데스크톱 권장).
        </p>
        <Link
          href="/relocation"
          className="block rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-base font-medium text-slate-900 dark:border-slate-800 dark:hover:border-slate-100 dark:text-slate-100 text-center"
        >
          프로젝트 목록 →
        </Link>
      </section>
    ),

    admin: isAdmin ? (
      <section className="rounded-2xl bg-white shadow-sm border border-slate-200 dark:bg-slate-900 dark:border-slate-800 p-6 space-y-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 tracking-tight dark:text-slate-300">
          <Settings className="h-5 w-5 text-slate-400" />
          관리
        </h2>
        <Link
          href="/admin/employees"
          className="block rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-base font-medium text-slate-900 dark:border-slate-800 dark:hover:border-slate-100 dark:text-slate-100"
        >
          직원 관리 →
        </Link>
        <Link
          href="/admin/sites"
          className="block rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-base font-medium text-slate-900 dark:border-slate-800 dark:hover:border-slate-100 dark:text-slate-100"
        >
          현장 관리 →
        </Link>
        <Link
          href="/admin/materials"
          className="block rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-base font-medium text-slate-900 dark:border-slate-800 dark:hover:border-slate-100 dark:text-slate-100"
        >
          자재 마스터 →
        </Link>
        <Link
          href="/admin/cables"
          className="block rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-base font-medium text-slate-900 dark:border-slate-800 dark:hover:border-slate-100 dark:text-slate-100"
        >
          케이블 마스터 →
        </Link>
        <Link
          href="/admin/facilities"
          className="block rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-base font-medium text-slate-900 dark:border-slate-800 dark:hover:border-slate-100 dark:text-slate-100"
        >
          함체·국사 마스터 →
        </Link>
        <Link
          href="/stock"
          className="block rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-base font-medium text-slate-900 dark:border-slate-800 dark:hover:border-slate-100 dark:text-slate-100"
        >
          자재 입출고 →
        </Link>
        <Link
          href="/admin/annual-leaves"
          className="block rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-base font-medium text-slate-900 dark:border-slate-800 dark:hover:border-slate-100 dark:text-slate-100"
        >
          연차 관리 →
        </Link>
        <Link
          href="/admin/reports"
          className="block rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-base font-medium text-slate-900 dark:border-slate-800 dark:hover:border-slate-100 dark:text-slate-100"
        >
          월별 리포트 →
        </Link>
      </section>
    ) : undefined,

    reports:
      !isAdmin && employee.permission === 'team_leader' ? (
        <section className="rounded-2xl bg-white shadow-sm border border-slate-200 dark:bg-slate-900 dark:border-slate-800 p-6 space-y-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 tracking-tight dark:text-slate-300">
            <FileText className="h-5 w-5 text-slate-400" />
            리포트
          </h2>
          <Link
            href="/admin/reports"
            className="block rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-base font-medium text-slate-900 dark:border-slate-800 dark:hover:border-slate-100 dark:text-slate-100"
          >
            내 현장 월별 리포트 →
          </Link>
        </section>
      ) : undefined,
  }

  const visibleCardIds = prefs.order.filter(
    (id) => isCardVisible(prefs, id) && cards[id] != null,
  )

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-600 dark:text-slate-400">{employee.companies?.name ?? '회사 미지정'}</p>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight dark:text-slate-100">
              {employee.name}님 반갑습니다.
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/settings"
              aria-label="설정"
              className="inline-flex items-center rounded-lg border border-slate-300 px-2.5 py-2 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Settings2 className="h-4 w-4" />
            </Link>
            <form action={signOut}>
              <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                로그아웃
              </button>
            </form>
          </div>
        </header>

        {visibleCardIds.length === 0 ? (
          <section className="rounded-2xl bg-amber-50 border border-amber-200 p-6 text-center space-y-3">
            <p className="text-sm font-medium text-amber-800">
              표시할 카드가 없습니다. 홈 화면 설정에서 카드를 켜주세요.
            </p>
            <Link
              href="/settings/home"
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700"
            >
              <Settings2 className="h-4 w-4" />홈 화면 설정 →
            </Link>
          </section>
        ) : (
          visibleCardIds.map((id) => (
            <React.Fragment key={id}>{cards[id]}</React.Fragment>
          ))
        )}

        <p className="text-center text-xs text-slate-400">
          v0.1 · 사내 베타
          <span className="mx-1.5">·</span>
          © {new Date().getFullYear()} 최경열
        </p>
      </div>
    </main>
  )
}
