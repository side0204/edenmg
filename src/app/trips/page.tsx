import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Book, ChevronRight, Download, MapPin, Plus, Search, Settings, Users, Car, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  currentMonthKST,
  formatKm,
  formatKrw,
  hmKST,
  monthRangeKSTLocal,
  todayKST,
  todayRangeKST,
  transportText,
  type TransportKind,
} from '@/lib/trips'
import {
  BigTimes,
  SURFACE,
  SectionTitle,
  StatusText,
  Surface,
  TD,
  TH,
  Table,
  TransportLegend,
  TransportTag,
  TwoLine,
} from './ui'
import ElapsedText from './ElapsedText'
import TripCancelButton from './TripCancelButton'

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

type VehicleRow = { id: string; plate_number: string; name: string; is_active: boolean }

type EmbeddedEmployee = { name: string } | { name: string }[] | null
const pickName = (e: EmbeddedEmployee): string | null => {
  if (!e) return null
  if (Array.isArray(e)) return e[0]?.name ?? null
  return e.name ?? null
}

type TripRow = {
  id: string
  vehicle_id: string | null
  driver_employee_id: string
  departed_at: string
  returned_at: string | null
  expected_arrival_at: string | null
  start_odometer_km: number | null
  end_odometer_km: number | null
  purpose: string | null
  place: string | null
  transport: TransportKind
  personal_plate: string | null
  other_note: string | null
  refuel_amount_krw: number | null
  employees: EmbeddedEmployee
}

type CompanionRow = { trip_id: string; employee_id: string; employees: EmbeddedEmployee }

type LogRow = {
  vehicle_id: string | null
  kind: string
  title: string
  vendor: string | null
  next_due_km: number | null
  next_due_on: string | null
  occurred_on: string
}

const DATE_LABEL = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'long',
  day: 'numeric',
  weekday: 'long',
})

function dDay(dateStr: string): number {
  const today = todayKST()
  const a = new Date(today + 'T00:00:00Z').getTime()
  const b = new Date(dateStr + 'T00:00:00Z').getTime()
  return Math.round((b - a) / 86_400_000)
}

export default async function TripsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, permission, name, vehicle_plate, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as {
    id: string
    company_id: string
    permission: Permission
    name: string
    vehicle_plate: string | null
    is_active: boolean
  } | null
  if (!me || !me.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  const isAdmin = me.permission === 'admin'

  const requestMs = new Date().getTime()
  const today = todayRangeKST()
  const month = currentMonthKST()
  const monthRange = monthRangeKSTLocal(month)!

  const [vehiclesRes, tripsRes, lastReturnRes, monthTripsRes, logsRes, personalRes] = await Promise.all([
    supabase
      .from('vehicles')
      .select('id, plate_number, name, is_active')
      .eq('company_id', me.company_id)
      .is('retired_at', null)
      .order('is_active', { ascending: false })
      .order('plate_number'),
    // 오늘 출발했거나 아직 진행 중인 외근 전부 (회사 전원 공개)
    supabase
      .from('vehicle_trips')
      .select(
        'id, vehicle_id, driver_employee_id, departed_at, returned_at, expected_arrival_at, start_odometer_km, end_odometer_km, purpose, place, transport, personal_plate, other_note, refuel_amount_krw, employees!driver_employee_id(name)',
      )
      .eq('company_id', me.company_id)
      .or(`departed_at.gte.${today.startISO},returned_at.is.null`)
      .order('departed_at', { ascending: false })
      .limit(200),
    supabase
      .from('vehicle_trips')
      .select('vehicle_id, end_odometer_km, returned_at, return_location, employees!driver_employee_id(name)')
      .eq('company_id', me.company_id)
      .not('vehicle_id', 'is', null)
      .not('returned_at', 'is', null)
      .order('returned_at', { ascending: false })
      .limit(100),
    supabase
      .from('vehicle_trips')
      .select('vehicle_id, transport, driver_employee_id, start_odometer_km, end_odometer_km, refuel_amount_krw')
      .eq('company_id', me.company_id)
      .gte('departed_at', monthRange.startISO)
      .lt('departed_at', monthRange.endISOExclusive)
      .limit(2000),
    supabase
      .from('vehicle_logs')
      .select('vehicle_id, kind, title, vendor, next_due_km, next_due_on, occurred_on')
      .eq('company_id', me.company_id)
      .not('vehicle_id', 'is', null)
      .order('occurred_on', { ascending: false })
      .limit(500),
    supabase
      .from('employees')
      .select('id, name, work_type, vehicle_plate')
      .eq('company_id', me.company_id)
      .eq('is_active', true)
      .is('resigned_at', null)
      .not('vehicle_plate', 'is', null),
  ])

  const vehicles = (vehiclesRes.data ?? []) as VehicleRow[]
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]))
  const vehicleLabel = (id: string | null) => {
    const v = id ? vehicleById.get(id) : null
    return v ? `${v.plate_number} ${v.name}` : null
  }

  const trips = (tripsRes.data ?? []) as unknown as TripRow[]
  const activeTrips = trips.filter((t) => !t.returned_at)
  const myTrip = activeTrips.find((t) => t.driver_employee_id === me.id) ?? null

  // 동행인 이름 매핑
  const companionsByTrip = new Map<string, { id: string; name: string }[]>()
  if (trips.length > 0) {
    const { data: cData } = await supabase
      .from('vehicle_trip_companions')
      .select('trip_id, employee_id, employees(name)')
      .in(
        'trip_id',
        trips.map((t) => t.id),
      )
    for (const c of (cData ?? []) as unknown as CompanionRow[]) {
      const arr = companionsByTrip.get(c.trip_id) ?? []
      arr.push({ id: c.employee_id, name: pickName(c.employees) ?? '?' })
      companionsByTrip.set(c.trip_id, arr)
    }
  }
  const companionNames = (tripId: string) => (companionsByTrip.get(tripId) ?? []).map((c) => c.name)
  // 내가 동승 중인 외근
  const ridingTrip = activeTrips.find((t) => (companionsByTrip.get(t.id) ?? []).some((c) => c.id === me.id)) ?? null

  // 차량별 최종 반납
  const lastReturnByVehicle = new Map<
    string,
    { driverName: string | null; returnedAt: string; returnLocation: string | null; endKm: number | null }
  >()
  for (const r of (lastReturnRes.data ?? []) as unknown as {
    vehicle_id: string
    end_odometer_km: number | null
    returned_at: string
    return_location: string | null
    employees: EmbeddedEmployee
  }[]) {
    if (!lastReturnByVehicle.has(r.vehicle_id)) {
      lastReturnByVehicle.set(r.vehicle_id, {
        driverName: pickName(r.employees),
        returnedAt: r.returned_at,
        returnLocation: r.return_location,
        endKm: r.end_odometer_km,
      })
    }
  }

  // 이달 주행·주유 (차량별 / 자차 직원별)
  const monthKmByVehicle = new Map<string, number>()
  const monthFuelByVehicle = new Map<string, number>()
  const monthKmByPersonal = new Map<string, number>()
  for (const t of (monthTripsRes.data ?? []) as {
    vehicle_id: string | null
    transport: TransportKind
    driver_employee_id: string
    start_odometer_km: number | null
    end_odometer_km: number | null
    refuel_amount_krw: number | null
  }[]) {
    const km = t.start_odometer_km !== null && t.end_odometer_km !== null ? Math.max(0, t.end_odometer_km - t.start_odometer_km) : 0
    if (t.vehicle_id) {
      monthKmByVehicle.set(t.vehicle_id, (monthKmByVehicle.get(t.vehicle_id) ?? 0) + km)
      monthFuelByVehicle.set(t.vehicle_id, (monthFuelByVehicle.get(t.vehicle_id) ?? 0) + (t.refuel_amount_krw ?? 0))
    } else if (t.transport === '자차') {
      monthKmByPersonal.set(t.driver_employee_id, (monthKmByPersonal.get(t.driver_employee_id) ?? 0) + km)
    }
  }

  // 다음 정비(가장 최근 next_due 기록) · 보험사(가장 최근 보험 기록의 vendor)
  const nextDueByVehicle = new Map<string, { title: string; on: string | null; km: number | null }>()
  const insurerByVehicle = new Map<string, string>()
  for (const l of (logsRes.data ?? []) as LogRow[]) {
    if (!l.vehicle_id) continue
    if ((l.next_due_on || l.next_due_km !== null) && !nextDueByVehicle.has(l.vehicle_id)) {
      nextDueByVehicle.set(l.vehicle_id, { title: l.title, on: l.next_due_on, km: l.next_due_km })
    }
    if (l.kind === '보험' && l.vendor && !insurerByVehicle.has(l.vehicle_id)) insurerByVehicle.set(l.vehicle_id, l.vendor)
  }

  // 오늘 km (진행 중 제외, 오늘 출발 · 도착 완료분)
  const todayKmByVehicle = new Map<string, number>()
  const todayKmByPersonal = new Map<string, number>()
  for (const t of trips) {
    if (t.departed_at < today.startISO) continue
    const km = t.start_odometer_km !== null && t.end_odometer_km !== null ? Math.max(0, t.end_odometer_km - t.start_odometer_km) : 0
    if (t.vehicle_id) todayKmByVehicle.set(t.vehicle_id, (todayKmByVehicle.get(t.vehicle_id) ?? 0) + km)
    else if (t.transport === '자차') todayKmByPersonal.set(t.driver_employee_id, (todayKmByPersonal.get(t.driver_employee_id) ?? 0) + km)
  }

  const personal = (personalRes.data ?? []) as { id: string; name: string; work_type: string | null; vehicle_plate: string | null }[]
  const personalActive = activeTrips.filter((t) => t.transport === '자차')
  const personalActiveIds = new Set(personalActive.map((t) => t.driver_employee_id))
  const personalIdle = personal.filter((p) => (p.vehicle_plate ?? '').trim() && !personalActiveIds.has(p.id))
  const personalIdleByType = personalIdle.reduce<Record<string, number>>((acc, p) => {
    const k = p.work_type ?? '미지정'
    acc[k] = (acc[k] ?? 0) + 1
    return acc
  }, {})

  const activeByVehicle = new Map(activeTrips.filter((t) => t.vehicle_id).map((t) => [t.vehicle_id as string, t]))
  const inUseCount = vehicles.filter((v) => v.is_active && activeByVehicle.has(v.id)).length
  const activeVehicleCount = vehicles.filter((v) => v.is_active).length

  const rowsSorted = [...trips].sort((a, b) => {
    const aActive = a.returned_at ? 1 : 0
    const bActive = b.returned_at ? 1 : 0
    if (aActive !== bActive) return aActive - bActive
    return b.departed_at.localeCompare(a.departed_at)
  })
  const todayCount = rowsSorted.length
  const activeCount = activeTrips.length

  const timeCell = (t: TripRow) => {
    const dep = hmKST(t.departed_at)
    if (t.returned_at) return { top: `${dep} → ${hmKST(t.returned_at)}`, bottom: '완료' }
    if (t.expected_arrival_at) return { top: `${dep} → ${hmKST(t.expected_arrival_at)}`, bottom: '예정' }
    return { top: `${dep} → —`, bottom: '도착 미정' }
  }
  const transportCell = (t: TripRow) => (
    <TransportTag
      transport={t.transport}
      label={
        t.transport === '업무용'
          ? vehicleById.get(t.vehicle_id ?? '')?.plate_number ?? '업무용'
          : t.transport === '자차'
            ? t.personal_plate ?? '자차'
            : t.other_note ?? '기타'
      }
    />
  )
  const nameCell = (t: TripRow) => (
    <TwoLine
      top={
        <>
          <b className="font-semibold">{pickName(t.employees) ?? '?'}</b>
          {t.driver_employee_id === me.id && <span className="ml-1 text-[10px] font-semibold text-emerald-700">(나)</span>}
        </>
      }
      bottom={companionNames(t.id).join('·') || undefined}
      wrap
    />
  )
  const progressOf = (t: TripRow) => {
    if (!t.expected_arrival_at) return 0.35
    const a = new Date(t.departed_at).getTime()
    const b = new Date(t.expected_arrival_at).getTime()
    const n = requestMs
    if (b <= a) return 1
    return Math.max(0.05, Math.min(1, (n - a) / (b - a)))
  }

  const inputStyleBtn =
    'inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[13px] font-medium text-slate-700 shadow-sm ring-1 ring-slate-900/10 hover:bg-slate-50'

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-4 lg:max-w-[100rem]">
        {/* 헤더 */}
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-[-0.03em] text-slate-900 dark:text-slate-100">외근·차량</h1>
            <p className="mt-0.5 text-[13px] text-slate-500">
              {DATE_LABEL.format(new Date())} · 외근 {activeCount}건 진행 중 · 업무용 {activeVehicleCount}대 중 {inUseCount}대 사용 중
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Link href="/vehicles/trips" className={inputStyleBtn} title="운행 이력">
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">운행 이력</span>
            </Link>
            <Link href="/vehicles/workers" className={inputStyleBtn} title="작업차량">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">작업차량</span>
            </Link>
            <a href={`/api/reports/vehicle-trips?mode=month&month=${month}`} className={inputStyleBtn} title="이번 달 CSV">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">CSV</span>
            </a>
            {isAdmin && (
              <Link href="/vehicles" className={inputStyleBtn} title="차량 관리">
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">차량 관리</span>
              </Link>
            )}
          </div>
        </header>

        {/* 내 외근 */}
        <SectionTitle title="내 외근" />
        {myTrip ? (
          <section className={`${SURFACE} space-y-3 p-5 ring-emerald-300`}>
            <div className="flex items-center justify-between">
              <StatusText text="외근 중" tone="emerald" />
              <TripCancelButton tripId={myTrip.id} departedAt={myTrip.departed_at} />
            </div>
            <div className="text-[19px] font-bold leading-[26px] tracking-tight text-slate-900 dark:text-slate-100">
              {myTrip.purpose}
            </div>
            <div className="-mt-1.5 flex items-center gap-1.5 text-sm text-slate-600">
              <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="truncate">{myTrip.place ?? '—'}</span>
            </div>
            <BigTimes
              dep={hmKST(myTrip.departed_at)}
              arr={myTrip.expected_arrival_at ? hmKST(myTrip.expected_arrival_at) : '—'}
              depLabel={
                <>
                  출발 · <ElapsedText fromIso={myTrip.departed_at} />
                </>
              }
              arrLabel={myTrip.expected_arrival_at ? '도착 예정' : '도착 예정 없음'}
              progress={progressOf(myTrip)}
            />
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <Car className="h-4 w-4 text-slate-400" />
                <TransportTag transport={myTrip.transport} label={transportText({ ...myTrip, vehicleLabel: vehicleLabel(myTrip.vehicle_id) })} />
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-4 w-4 text-slate-400" />
                {companionNames(myTrip.id).length > 0 ? companionNames(myTrip.id).join(' · ') : '동행 없음'}
                {companionNames(myTrip.id).length > 0 && (
                  <span className="text-slate-400">({companionNames(myTrip.id).length}/4)</span>
                )}
              </span>
            </div>
            <Link
              href={`/trips/${myTrip.id}/end`}
              className="block rounded-[14px] bg-emerald-600 px-4 py-[15px] text-center text-base font-bold text-white hover:bg-emerald-700 active:bg-emerald-800"
            >
              도착 · 반납하기
            </Link>
          </section>
        ) : (
          <Surface>
            {ridingTrip ? (
              <div className="space-y-1">
                <StatusText text="외근 중 (동승)" tone="emerald" />
                <p className="text-sm text-slate-800 dark:text-slate-200">
                  <b>{pickName(ridingTrip.employees)}</b> 님 외근에 동행 · {ridingTrip.place ?? '—'} · {hmKST(ridingTrip.departed_at)} 출발
                </p>
                <p className="text-xs text-slate-500">도착 처리는 외근을 시작한 운전자가 합니다.</p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">지금 외근 중이 아닙니다.</p>
            )}
            <Link
              href="/trips/new"
              className="flex items-center justify-center gap-1.5 rounded-[14px] bg-slate-900 px-4 py-[15px] text-base font-bold text-white hover:bg-slate-800"
            >
              <Plus className="h-5 w-5" />
              외근 시작
            </Link>
          </Surface>
        )}

        {/* 오늘 외근 */}
        <Surface>
          <SectionTitle
            title="오늘 외근"
            count={todayCount}
            right={
              <span className="text-xs font-medium text-slate-500">
                진행 중 {activeCount} · 완료 {todayCount - activeCount}
              </span>
            }
          />
          {rowsSorted.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">오늘 시작한 외근이 없습니다.</p>
          ) : (
            <>
              {/* 모바일 4열 */}
              <Table className="md:hidden">
                <colgroup>
                  <col className="w-[72px]" />
                  <col />
                  <col className="w-[78px]" />
                  <col className="w-[72px]" />
                </colgroup>
                <thead>
                  <tr>
                    <th className={TH}>이름</th>
                    <th className={TH}>장소 · 목적</th>
                    <th className={TH}>출발 → 도착</th>
                    <th className={TH}>차량</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsSorted.map((t) => {
                    const tc = timeCell(t)
                    const mine = t.driver_employee_id === me.id && !t.returned_at
                    return (
                      <tr key={t.id} className={mine ? 'bg-emerald-50/70' : ''}>
                        <td className={TD}>{nameCell(t)}</td>
                        <td className={TD}>
                          <TwoLine top={t.place ?? '—'} bottom={t.purpose ?? undefined} />
                        </td>
                        <td className={TD}>
                          <TwoLine top={tc.top} bottom={tc.bottom} />
                        </td>
                        <td className={TD}>{transportCell(t)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
              {/* PC 전체 열 */}
              <Table className="hidden md:block">
                <colgroup>
                  <col className="w-[76px]" />
                  <col className="w-[100px]" />
                  <col className="w-[120px]" />
                  <col />
                  <col />
                  <col className="w-[64px]" />
                  <col className="w-[96px]" />
                  <col className="w-[150px]" />
                  <col className="w-[80px]" />
                  <col className="w-[64px]" />
                  <col className="w-[56px]" />
                </colgroup>
                <thead>
                  <tr>
                    <th className={TH}>상태</th>
                    <th className={TH}>이름</th>
                    <th className={TH}>동행</th>
                    <th className={TH}>업무목적</th>
                    <th className={TH}>외근장소</th>
                    <th className={TH}>출발</th>
                    <th className={TH}>도착</th>
                    <th className={TH}>이동수단</th>
                    <th className={`${TH} text-right`}>출발 km</th>
                    <th className={`${TH} text-right`}>주행</th>
                    <th className={TH}></th>
                  </tr>
                </thead>
                <tbody>
                  {rowsSorted.map((t) => {
                    const mine = t.driver_employee_id === me.id && !t.returned_at
                    const km = t.start_odometer_km !== null && t.end_odometer_km !== null ? t.end_odometer_km - t.start_odometer_km : null
                    return (
                      <tr key={t.id} className={mine ? 'bg-emerald-50/70' : ''}>
                        <td className={TD}>
                          {t.returned_at ? <StatusText text="완료" tone="slate" /> : <StatusText text="외근 중" tone="emerald" />}
                        </td>
                        <td className={TD}>
                          <b className="font-semibold">{pickName(t.employees) ?? '?'}</b>
                          {t.driver_employee_id === me.id && <span className="ml-1 text-[10px] font-semibold text-emerald-700">(나)</span>}
                        </td>
                        <td className={`${TD} truncate`}>{companionNames(t.id).join(', ') || '—'}</td>
                        <td className={`${TD} truncate`}>{t.purpose ?? '—'}</td>
                        <td className={`${TD} truncate`}>{t.place ?? '—'}</td>
                        <td className={TD}>
                          <b className="font-semibold">{hmKST(t.departed_at)}</b>
                        </td>
                        <td className={TD}>
                          {t.returned_at ? (
                            hmKST(t.returned_at)
                          ) : t.expected_arrival_at ? (
                            <>
                              {hmKST(t.expected_arrival_at)} <span className="text-slate-500">예정</span>
                            </>
                          ) : (
                            <span className="text-slate-500">미정</span>
                          )}
                        </td>
                        <td className={TD}>
                          <TransportTag transport={t.transport} label={transportText({ ...t, vehicleLabel: vehicleLabel(t.vehicle_id) })} />
                        </td>
                        <td className={`${TD} text-right`}>{t.start_odometer_km?.toLocaleString() ?? '—'}</td>
                        <td className={`${TD} text-right`}>{km !== null ? `${km.toLocaleString()} km` : '—'}</td>
                        <td className={`${TD} text-center`}>
                          {mine && (
                            <Link href={`/trips/${t.id}/end`} className="font-semibold text-emerald-700">
                              도착
                            </Link>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            </>
          )}
          <div className="flex items-center justify-between">
            <TransportLegend />
            <Link href="/vehicles/trips" className="text-xs font-medium text-slate-500 hover:text-slate-900">
              이번 달 →
            </Link>
          </div>
        </Surface>

        {/* 차량 */}
        <Surface>
          <SectionTitle
            title="차량"
            count={`${activeVehicleCount} + 자차 ${personal.length}`}
            right={
              isAdmin ? (
                <Link href="/vehicles/new" className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900">
                  <Plus className="h-3.5 w-3.5" />
                  등록
                </Link>
              ) : undefined
            }
          />
          {vehicles.length === 0 && personal.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              등록된 차량이 없습니다. {isAdmin ? '「등록」으로 업무용 차량을 추가하세요.' : '관리자에게 차량 등록을 요청하세요.'}
            </p>
          ) : (
            <>
              {/* 모바일 */}
              <Table className="md:hidden">
                <colgroup>
                  <col className="w-[92px]" />
                  <col className="w-[66px]" />
                  <col />
                  <col className="w-[52px]" />
                  <col className="w-[28px]" />
                </colgroup>
                <thead>
                  <tr>
                    <th className={TH}>차량</th>
                    <th className={TH}>상태</th>
                    <th className={TH}>사용자 · 출고</th>
                    <th className={`${TH} text-right`}>오늘</th>
                    <th className={TH}></th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((v) => {
                    const a = activeByVehicle.get(v.id)
                    const lr = lastReturnByVehicle.get(v.id)
                    const mine = !!a && a.driver_employee_id === me.id
                    const status = !v.is_active ? (
                      <StatusText text="비활성" tone="slate" />
                    ) : mine ? (
                      <StatusText text="나" tone="emerald" />
                    ) : a ? (
                      <StatusText text="사용 중" tone="amber" />
                    ) : (
                      <StatusText text="대기" tone="slate" />
                    )
                    return (
                      <tr key={v.id} className={mine ? 'bg-emerald-50/70' : !v.is_active ? 'opacity-60' : ''}>
                        <td className={TD}>
                          <TwoLine top={<TransportTag transport="업무용" label={v.plate_number} />} bottom={v.name} />
                        </td>
                        <td className={TD}>{status}</td>
                        <td className={TD}>
                          {a ? (
                            <TwoLine
                              top={pickName(a.employees) ?? '?'}
                              bottom={`${hmKST(a.departed_at)}${a.start_odometer_km !== null ? ` · ${a.start_odometer_km.toLocaleString()} km` : ''}`}
                            />
                          ) : lr ? (
                            <TwoLine top={`최종 ${lr.driverName ?? '?'}`} bottom={`${hmKST(lr.returnedAt)}${lr.returnLocation ? ` · ${lr.returnLocation}` : ''}`} />
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className={`${TD} text-right`}>{todayKmByVehicle.has(v.id) ? `${todayKmByVehicle.get(v.id)} km` : '—'}</td>
                        <td className={`${TD} text-right`}>
                          <Link href={`/trips/logbook/vehicle/${v.id}`} className="text-slate-400 hover:text-slate-900" title="차계부">
                            <Book className="h-4 w-4" />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                  {personalActive.map((t) => (
                    <tr key={t.id}>
                      <td className={TD}>
                        <TwoLine top={<TransportTag transport="자차" label={t.personal_plate ?? '자차'} />} bottom={pickName(t.employees) ?? '?'} />
                      </td>
                      <td className={TD}>
                        <StatusText text="외근 중" tone="emerald" />
                      </td>
                      <td className={TD}>
                        <TwoLine top={pickName(t.employees) ?? '?'} bottom={hmKST(t.departed_at)} />
                      </td>
                      <td className={`${TD} text-right`}>
                        {todayKmByPersonal.has(t.driver_employee_id) ? `${todayKmByPersonal.get(t.driver_employee_id)} km` : '—'}
                      </td>
                      <td className={`${TD} text-right`}>
                        <Link href={`/trips/logbook/personal/${t.driver_employee_id}`} className="text-slate-400 hover:text-slate-900" title="차계부">
                          <Book className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {personalIdle.length > 0 && (
                    <tr>
                      <td className={TD}>
                        <TwoLine top={<b className="font-semibold">자차 {personalIdle.length}대</b>} bottom="오늘 미운행" />
                      </td>
                      <td className={TD}>
                        <span className="text-slate-400">—</span>
                      </td>
                      <td className={TD}>
                        <span className="text-slate-500">
                          {Object.entries(personalIdleByType)
                            .map(([k, n]) => `${k} ${n}`)
                            .join(' · ')}
                        </span>
                      </td>
                      <td className={`${TD} text-right`}>—</td>
                      <td className={`${TD} text-right`}>
                        <Link href="/vehicles/workers" className="text-slate-400 hover:text-slate-900" title="작업차량 목록">
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
              {/* PC */}
              <Table className="hidden md:block">
                <colgroup>
                  <col className="w-[64px]" />
                  <col className="w-[92px]" />
                  <col className="w-[110px]" />
                  <col className="w-[104px]" />
                  <col className="w-[100px]" />
                  <col className="w-[80px]" />
                  <col className="w-[80px]" />
                  <col className="w-[84px]" />
                  <col className="w-[92px]" />
                  <col />
                  <col className="w-[110px]" />
                  <col className="w-[44px]" />
                </colgroup>
                <thead>
                  <tr>
                    <th className={TH}>구분</th>
                    <th className={TH}>차량번호</th>
                    <th className={TH}>차명</th>
                    <th className={TH}>상태</th>
                    <th className={TH}>사용자</th>
                    <th className={TH}>출고</th>
                    <th className={`${TH} text-right`}>누적 km</th>
                    <th className={`${TH} text-right`}>이달 주행</th>
                    <th className={`${TH} text-right`}>이달 주유</th>
                    <th className={TH}>다음 정비</th>
                    <th className={TH}>보험사</th>
                    <th className={TH}></th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((v) => {
                    const a = activeByVehicle.get(v.id)
                    const lr = lastReturnByVehicle.get(v.id)
                    const mine = !!a && a.driver_employee_id === me.id
                    const nd = nextDueByVehicle.get(v.id)
                    let ndText: React.ReactNode = '—'
                    if (nd?.on) {
                      const d = dDay(nd.on)
                      const cls = d <= 3 ? 'text-rose-700' : d <= 14 ? 'text-amber-700' : 'text-slate-700'
                      ndText = (
                        <>
                          <b className={`font-bold ${cls}`}>{d < 0 ? `D+${-d}` : `D-${d}`}</b> {nd.title}
                        </>
                      )
                    } else if (nd?.km !== null && nd?.km !== undefined) {
                      ndText = `${nd.km.toLocaleString()} km · ${nd.title}`
                    }
                    return (
                      <tr key={v.id} className={mine ? 'bg-emerald-50/70' : !v.is_active ? 'opacity-60' : ''}>
                        <td className={TD}>
                          <TransportTag transport="업무용" label="업무용" />
                        </td>
                        <td className={TD}>
                          <b className="font-semibold">{v.plate_number}</b>
                        </td>
                        <td className={`${TD} truncate`}>{v.name}</td>
                        <td className={TD}>
                          {!v.is_active ? (
                            <StatusText text="비활성" tone="slate" />
                          ) : mine ? (
                            <StatusText text="내가 사용 중" tone="emerald" />
                          ) : a ? (
                            <StatusText text="사용 중" tone="amber" />
                          ) : (
                            <StatusText text="대기" tone="slate" />
                          )}
                        </td>
                        <td className={`${TD} truncate`}>
                          {a ? pickName(a.employees) ?? '?' : lr ? <span className="text-slate-500">최종 {lr.driverName ?? '?'}</span> : '—'}
                        </td>
                        <td className={TD}>{a ? hmKST(a.departed_at) : lr ? hmKST(lr.returnedAt) : '—'}</td>
                        <td className={`${TD} text-right`}>{(a?.start_odometer_km ?? lr?.endKm)?.toLocaleString() ?? '—'}</td>
                        <td className={`${TD} text-right`}>{formatKm(monthKmByVehicle.get(v.id) ?? 0)}</td>
                        <td className={`${TD} text-right`}>{formatKrw(monthFuelByVehicle.get(v.id) ?? 0)}</td>
                        <td className={`${TD} truncate`}>{ndText}</td>
                        <td className={`${TD} truncate`}>{insurerByVehicle.get(v.id) ?? '—'}</td>
                        <td className={`${TD} text-center`}>
                          <Link href={`/trips/logbook/vehicle/${v.id}`} className="inline-block text-slate-400 hover:text-slate-900" title="차계부">
                            <Book className="h-4 w-4" />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                  {personal.map((p) => {
                    const a = personalActive.find((t) => t.driver_employee_id === p.id)
                    return (
                      <tr key={p.id}>
                        <td className={TD}>
                          <TransportTag transport="자차" label="자차" />
                        </td>
                        <td className={TD}>
                          <b className="font-semibold">{p.vehicle_plate}</b>
                        </td>
                        <td className={`${TD} truncate`}>{p.name}</td>
                        <td className={TD}>{a ? <StatusText text="외근 중" tone="emerald" /> : <StatusText text="대기" tone="slate" />}</td>
                        <td className={TD}>{a ? p.name : '—'}</td>
                        <td className={TD}>{a ? hmKST(a.departed_at) : '—'}</td>
                        <td className={`${TD} text-right`}>—</td>
                        <td className={`${TD} text-right`}>{formatKm(monthKmByPersonal.get(p.id) ?? 0)}</td>
                        <td className={`${TD} text-right`}>—</td>
                        <td className={TD}>—</td>
                        <td className={TD}>—</td>
                        <td className={`${TD} text-center`}>
                          <Link href={`/trips/logbook/personal/${p.id}`} className="inline-block text-slate-400 hover:text-slate-900" title="차계부">
                            <Book className="h-4 w-4" />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            </>
          )}
          <div className="flex justify-between text-xs font-medium text-slate-500">
            <Link href="/vehicles/trips" className="hover:text-slate-900">
              운행 이력 →
            </Link>
            <Link href="/vehicles/workers" className="hover:text-slate-900">
              작업차량 →
            </Link>
          </div>
        </Surface>

        <p className="flex items-center gap-1.5 px-1 text-[11px] text-slate-400">
          <Clock className="h-3 w-3" />
          외근 시작은 결재 없이 바로 기록됩니다. 잘못 시작했으면 10분 안에 취소할 수 있습니다.
        </p>
      </div>
    </main>
  )
}
