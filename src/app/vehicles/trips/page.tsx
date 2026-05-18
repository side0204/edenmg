import Link from 'next/link'
import { Download, Fuel, ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { monthRangeKST } from '@/lib/csv'

type SearchParams = {
  mode?: string
  month?: string
  start?: string
  end?: string
  vehicle_id?: string
  driver_id?: string
  refueled?: string
}

type VehicleOpt = { id: string; plate_number: string; name: string }
type EmployeeOpt = { id: string; name: string }

type TripRow = {
  id: string
  vehicle_id: string
  driver_employee_id: string
  departed_at: string
  returned_at: string | null
  start_odometer_km: number | null
  end_odometer_km: number | null
  purpose: string | null
  refueled: boolean
  refuel_amount_krw: number | null
}

const TIME_FMT = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: '2-digit',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function currentMonthKST(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
  })
  return fmt.format(new Date()).slice(0, 7) // 'YYYY-MM'
}

function defaultStartEnd(): { start: string; end: string } {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
  // 기본: 최근 1개월
  const d = new Date(today)
  d.setDate(d.getDate() - 30)
  const start = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d)
  return { start, end: today }
}

export default async function VehicleTripsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; company_id: string } | null
  if (!me) return null

  // ===== 필터 정규화 ===================================================
  const mode = sp.mode === 'range' ? 'range' : 'month'
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : currentMonthKST()
  const defaultRange = defaultStartEnd()
  const start = sp.start && /^\d{4}-\d{2}-\d{2}$/.test(sp.start) ? sp.start : defaultRange.start
  const end = sp.end && /^\d{4}-\d{2}-\d{2}$/.test(sp.end) ? sp.end : defaultRange.end
  const vehicleFilter = sp.vehicle_id ?? ''
  const driverFilter = sp.driver_id ?? ''
  const refueledOnly = sp.refueled === '1'

  // 기간 → ISO
  let startIso: string | null = null
  let endIsoExclusive: string | null = null
  let periodLabel = ''
  let rangeError: string | null = null

  if (mode === 'month') {
    const range = monthRangeKST(month)
    if (range) {
      startIso = range.startISO
      endIsoExclusive = range.endISOExclusive
      periodLabel = `${month}`
    } else {
      rangeError = '월 형식이 올바르지 않습니다.'
    }
  } else {
    if (end < start) {
      rangeError = '종료일은 시작일 이후여야 합니다.'
    } else {
      const [sy, sm, sd] = start.split('-').map(Number)
      const [ey, em, ed] = end.split('-').map(Number)
      startIso = new Date(Date.UTC(sy, sm - 1, sd, -9, 0, 0)).toISOString()
      endIsoExclusive = new Date(Date.UTC(ey, em - 1, ed + 1, -9, 0, 0)).toISOString()
      periodLabel = `${start} ~ ${end}`
    }
  }

  // ===== 차량·직원 옵션 =================================================
  const { data: vData } = await supabase
    .from('vehicles')
    .select('id, plate_number, name')
    .order('plate_number', { ascending: true })
  const vehicles = (vData ?? []) as VehicleOpt[]

  const { data: eData } = await supabase
    .from('employees')
    .select('id, name')
    .eq('company_id', me.company_id)
    .eq('is_active', true)
    .order('name', { ascending: true })
  const employees = (eData ?? []) as EmployeeOpt[]

  // ===== 검색 결과 ======================================================
  let trips: TripRow[] = []
  let queryError: string | null = null
  if (startIso && endIsoExclusive) {
    let query = supabase
      .from('vehicle_trips')
      .select(
        'id, vehicle_id, driver_employee_id, departed_at, returned_at, start_odometer_km, end_odometer_km, purpose, refueled, refuel_amount_krw',
      )
      .eq('company_id', me.company_id)
      .gte('departed_at', startIso)
      .lt('departed_at', endIsoExclusive)
      .order('departed_at', { ascending: false })
      .limit(500)

    if (vehicleFilter) query = query.eq('vehicle_id', vehicleFilter)
    if (driverFilter) query = query.eq('driver_employee_id', driverFilter)
    if (refueledOnly) query = query.eq('refueled', true)

    const { data, error } = await query
    if (error) queryError = error.message
    else trips = (data ?? []) as TripRow[]
  }

  // 매핑 (UI 표시용)
  const vehicleNameById = new Map<string, string>()
  for (const v of vehicles) vehicleNameById.set(v.id, `${v.plate_number} · ${v.name}`)
  const employeeNameById = new Map<string, string>()
  for (const e of employees) employeeNameById.set(e.id, e.name)
  // 운전자가 비활성·삭제된 경우 추가 lookup
  const missingDrivers = trips
    .map((t) => t.driver_employee_id)
    .filter((id) => !employeeNameById.has(id))
  if (missingDrivers.length > 0) {
    const { data: extras } = await supabase
      .from('employees')
      .select('id, name')
      .in('id', Array.from(new Set(missingDrivers)))
    for (const e of (extras ?? []) as EmployeeOpt[]) {
      employeeNameById.set(e.id, e.name)
    }
  }

  // CSV 다운로드 URL — 현재 필터 그대로
  const csvParams = new URLSearchParams()
  csvParams.set('mode', mode)
  if (mode === 'month') csvParams.set('month', month)
  else {
    csvParams.set('start', start)
    csvParams.set('end', end)
  }
  if (vehicleFilter) csvParams.set('vehicle_id', vehicleFilter)
  if (driverFilter) csvParams.set('driver_id', driverFilter)
  if (refueledOnly) csvParams.set('refueled', '1')
  const csvHref = `/api/reports/vehicle-trips?${csvParams.toString()}`

  // 통계
  const totalCount = trips.length
  const totalDistance = trips.reduce((sum, t) => {
    if (t.start_odometer_km !== null && t.end_odometer_km !== null) {
      return sum + (t.end_odometer_km - t.start_odometer_km)
    }
    return sum
  }, 0)
  const totalRefuelAmount = trips.reduce(
    (sum, t) => sum + (t.refueled && t.refuel_amount_krw !== null ? t.refuel_amount_krw : 0),
    0,
  )
  const refueledCount = trips.filter((t) => t.refueled).length

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <header className="flex items-center justify-between gap-3">
          <div>
            <Link href="/vehicles" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
              <ChevronLeft className="h-4 w-4" />
              차량 관리
            </Link>
            <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">운행일지 검색</h1>
            <p className="mt-0.5 text-xs text-slate-500">기간·차량·운전자·주유 여부로 필터링 후 CSV 다운로드</p>
          </div>
          <a
            href={csvHref}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Download className="h-4 w-4" />
            CSV
          </a>
        </header>

        {/* 검색 폼 — GET 으로 같은 페이지에 query string 붙여 reload */}
        <form
          method="GET"
          className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4 shadow-sm"
        >
          {/* 모드 토글 */}
          <div className="inline-flex rounded-lg border border-slate-300 p-1 bg-slate-100">
            <ModeRadio name="mode" value="month" current={mode} label="월" />
            <ModeRadio name="mode" value="range" current={mode} label="기간" />
          </div>

          {mode === 'month' ? (
            <Field label="대상 월">
              <input
                type="month"
                name="month"
                defaultValue={month}
                className={inputClass}
              />
              <input type="hidden" name="start" value={start} />
              <input type="hidden" name="end" value={end} />
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="시작일">
                <input
                  type="date"
                  name="start"
                  defaultValue={start}
                  className={inputClass}
                />
              </Field>
              <Field label="종료일">
                <input
                  type="date"
                  name="end"
                  defaultValue={end}
                  className={inputClass}
                />
              </Field>
              <input type="hidden" name="month" value={month} />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="차량">
              <select name="vehicle_id" defaultValue={vehicleFilter} className={inputClass}>
                <option value="">전체</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plate_number} · {v.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="운전자">
              <select name="driver_id" defaultValue={driverFilter} className={inputClass}>
                <option value="">전체</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="refueled"
              value="1"
              defaultChecked={refueledOnly}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
            />
            <span className="text-sm text-slate-700">주유한 운행만 보기</span>
          </label>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="flex-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              검색
            </button>
            <Link
              href="/vehicles/trips"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              초기화
            </Link>
          </div>
        </form>

        {rangeError && <Banner kind="err">{rangeError}</Banner>}
        {queryError && <Banner kind="err">조회 실패: {queryError}</Banner>}

        {/* 결과 요약 */}
        <section className="rounded-2xl bg-white border border-slate-200 p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center shadow-sm">
          <StatCell label="조회 기간" value={periodLabel} />
          <StatCell label="운행 건수" value={`${totalCount.toLocaleString()} 건`} />
          <StatCell
            label="총 주행거리"
            value={totalDistance > 0 ? `${totalDistance.toLocaleString()} km` : '-'}
          />
          <StatCell
            label="주유 합계"
            value={
              refueledCount > 0
                ? `${refueledCount}건 · ${totalRefuelAmount.toLocaleString()}원`
                : '-'
            }
          />
        </section>

        {/* 결과 리스트 */}
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-slate-700">
            검색 결과 ({totalCount.toLocaleString()} 건{totalCount >= 500 && ' · 최대 500건'})
          </h2>
          {totalCount === 0 ? (
            <p className="rounded-xl bg-white border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              해당 조건에 맞는 운행 기록이 없습니다.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <Th>출고</Th>
                    <Th>반납</Th>
                    <Th>차량</Th>
                    <Th>운전자</Th>
                    <Th className="text-right">출발km</Th>
                    <Th className="text-right">도착km</Th>
                    <Th className="text-right">주행km</Th>
                    <Th>주유</Th>
                    <Th>목적</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {trips.map((t) => {
                    const distance =
                      t.start_odometer_km !== null && t.end_odometer_km !== null
                        ? t.end_odometer_km - t.start_odometer_km
                        : null
                    const ongoing = t.returned_at === null
                    return (
                      <tr key={t.id} className={ongoing ? 'bg-emerald-50/40' : ''}>
                        <Td>{TIME_FMT.format(new Date(t.departed_at))}</Td>
                        <Td>
                          {t.returned_at ? (
                            TIME_FMT.format(new Date(t.returned_at))
                          ) : (
                            <span className="text-emerald-700 font-medium">사용 중</span>
                          )}
                        </Td>
                        <Td>{vehicleNameById.get(t.vehicle_id) ?? '?'}</Td>
                        <Td>{employeeNameById.get(t.driver_employee_id) ?? '?'}</Td>
                        <Td className="text-right tabular-nums">
                          {t.start_odometer_km !== null ? t.start_odometer_km.toLocaleString() : '-'}
                        </Td>
                        <Td className="text-right tabular-nums">
                          {t.end_odometer_km !== null ? t.end_odometer_km.toLocaleString() : '-'}
                        </Td>
                        <Td className="text-right tabular-nums">
                          {distance !== null ? distance.toLocaleString() : '-'}
                        </Td>
                        <Td>
                          {t.refueled ? (
                            <span className="inline-flex items-center gap-1 text-amber-700">
                              <Fuel className="h-3.5 w-3.5" />
                              {t.refuel_amount_krw !== null
                                ? t.refuel_amount_krw.toLocaleString()
                                : ''}
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </Td>
                        <Td className="max-w-[200px] truncate" title={t.purpose ?? ''}>
                          {t.purpose ?? <span className="text-slate-300">-</span>}
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function ModeRadio({
  name,
  value,
  current,
  label,
}: {
  name: string
  value: string
  current: string
  label: string
}) {
  const active = value === current
  return (
    <label
      className={`cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
        active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={active}
        className="sr-only"
      />
      {label}
    </label>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-900">{value}</p>
    </div>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 text-left font-medium ${className}`}>{children}</th>
}

function Td({ children, className = '', title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <td className={`px-3 py-2 text-slate-700 ${className}`} title={title}>
      {children}
    </td>
  )
}

function Banner({ kind, children }: { kind: 'ok' | 'err'; children: React.ReactNode }) {
  const cls =
    kind === 'ok'
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : 'text-red-600 bg-red-50 border-red-200'
  return <p className={`text-sm border rounded-lg p-3 ${cls}`}>{children}</p>
}

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900'
