import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

type Permission = 'worker' | 'foreman' | 'admin' | 'ceo'

type VehicleRow = {
  id: string
  plate_number: string
  name: string
  is_active: boolean
  notes: string | null
}

type ActiveTripRow = {
  id: string
  vehicle_id: string
  driver_employee_id: string
  departed_at: string
  start_odometer_km: number | null
  purpose: string | null
}

type RecentTripRow = {
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
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export default async function VehiclesPage() {
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
  if (!me) return null

  const isAdmin = me.permission === 'admin' || me.permission === 'ceo'

  // 차량 목록
  const { data: vData, error: vErr } = await supabase
    .from('vehicles')
    .select('id, plate_number, name, is_active, notes')
    .order('is_active', { ascending: false })
    .order('plate_number', { ascending: true })

  const vehicles = (vData ?? []) as VehicleRow[]

  // 현재 사용 중인 운행
  const { data: activeData } = await supabase
    .from('vehicle_trips')
    .select('id, vehicle_id, driver_employee_id, departed_at, start_odometer_km, purpose')
    .is('returned_at', null)

  const activeByVehicleId = new Map<string, ActiveTripRow>()
  for (const t of (activeData ?? []) as ActiveTripRow[]) {
    activeByVehicleId.set(t.vehicle_id, t)
  }

  // 최근 운행 이력 (반납 완료 포함, 최신 10건)
  const { data: recentData } = await supabase
    .from('vehicle_trips')
    .select(
      'id, vehicle_id, driver_employee_id, departed_at, returned_at, start_odometer_km, end_odometer_km, purpose, refueled, refuel_amount_krw',
    )
    .order('departed_at', { ascending: false })
    .limit(10)

  const recent = (recentData ?? []) as RecentTripRow[]

  // 직원 이름 매핑 (active + recent 합쳐서 한 번에)
  const employeeIds = new Set<string>()
  for (const t of activeByVehicleId.values()) employeeIds.add(t.driver_employee_id)
  for (const t of recent) employeeIds.add(t.driver_employee_id)

  const nameById = new Map<string, string>()
  if (employeeIds.size > 0) {
    const { data: emps } = await supabase
      .from('employees')
      .select('id, name')
      .in('id', Array.from(employeeIds))
    for (const e of (emps ?? []) as { id: string; name: string }[]) {
      nameById.set(e.id, e.name)
    }
  }

  // 차량 이름 매핑
  const vehicleNameById = new Map<string, string>()
  for (const v of vehicles) vehicleNameById.set(v.id, `${v.plate_number} · ${v.name}`)

  // 본인이 현재 사용 중인 차량 (홈 카드 용 + UI 분기 용)
  const myActive = Array.from(activeByVehicleId.values()).find(
    (t) => t.driver_employee_id === me.id,
  )

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-center justify-between gap-3">
          <div>
            <Link href="/" className="text-xs text-slate-500 hover:text-slate-900">
              ← 홈
            </Link>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">업무용 차량</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {isAdmin ? '회사 전체 차량 · 운행 현황' : '회사 차량 출고·반납'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/vehicles/trips"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              🔍 운행 이력
            </Link>
            {isAdmin && (
              <Link
                href="/vehicles/new"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                + 차량 등록
              </Link>
            )}
          </div>
        </header>

        {vErr && <Banner kind="err">목록을 불러오지 못했습니다: {vErr.message}</Banner>}

        {/* 차량 카드 리스트 */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-slate-700">차량 목록</h2>
          {vehicles.length === 0 ? (
            <p className="rounded-xl bg-white border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              등록된 차량이 없습니다.
              {isAdmin && (
                <>
                  {' '}
                  우측 상단 <span className="font-medium">+ 차량 등록</span> 으로 시작하세요.
                </>
              )}
            </p>
          ) : (
            <ul className="space-y-3">
              {vehicles.map((v) => {
                const active = activeByVehicleId.get(v.id)
                const usedByMe = active && active.driver_employee_id === me.id
                const usedByOther = active && !usedByMe
                const driverName = active ? nameById.get(active.driver_employee_id) ?? '?' : null

                return (
                  <li
                    key={v.id}
                    className={`rounded-xl bg-white border p-4 space-y-3 ${
                      usedByMe
                        ? 'border-emerald-300 ring-1 ring-emerald-200'
                        : !v.is_active
                        ? 'border-slate-200 opacity-70'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">
                          {v.plate_number} <span className="text-slate-500">·</span> {v.name}
                        </p>
                        {v.notes && (
                          <p className="mt-0.5 text-xs text-slate-500 truncate">{v.notes}</p>
                        )}
                      </div>
                      <StatusBadge
                        active={active != null}
                        inactive={!v.is_active}
                        mine={!!usedByMe}
                      />
                    </div>

                    {active && (
                      <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600 space-y-0.5">
                        <p>
                          <span className="text-slate-500">사용자</span>{' '}
                          <span className="font-medium text-slate-800">{driverName}</span>
                          {usedByMe && <span className="ml-1 text-emerald-700">(나)</span>}
                        </p>
                        <p>
                          <span className="text-slate-500">출고</span>{' '}
                          {TIME_FMT.format(new Date(active.departed_at))}
                          {active.start_odometer_km !== null && (
                            <span className="ml-2 text-slate-500">
                              ({active.start_odometer_km.toLocaleString()} km)
                            </span>
                          )}
                        </p>
                        {active.purpose && (
                          <p className="text-slate-500 truncate">목적: {active.purpose}</p>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {usedByMe ? (
                        <Link
                          href={`/vehicles/${v.id}/return`}
                          className="flex-1 min-w-[120px] rounded-lg bg-emerald-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-emerald-700"
                        >
                          반납하기 →
                        </Link>
                      ) : usedByOther ? (
                        <span className="flex-1 min-w-[120px] rounded-lg bg-slate-100 px-4 py-2 text-center text-sm text-slate-500">
                          사용 중
                        </span>
                      ) : v.is_active ? (
                        myActive ? (
                          <span
                            title="이미 다른 차량을 사용 중입니다. 먼저 반납하세요."
                            className="flex-1 min-w-[120px] rounded-lg bg-slate-100 px-4 py-2 text-center text-sm text-slate-400 cursor-not-allowed"
                          >
                            출고 불가 (다른 차량 사용 중)
                          </span>
                        ) : (
                          <Link
                            href={`/vehicles/${v.id}/checkout`}
                            className="flex-1 min-w-[120px] rounded-lg bg-slate-900 px-4 py-2 text-center text-sm font-medium text-white hover:bg-slate-800"
                          >
                            출고하기 →
                          </Link>
                        )
                      ) : (
                        <span className="flex-1 min-w-[120px] rounded-lg bg-slate-100 px-4 py-2 text-center text-sm text-slate-400">
                          비활성
                        </span>
                      )}
                      {isAdmin && (
                        <Link
                          href={`/vehicles/${v.id}/edit`}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                          수정
                        </Link>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* 최근 운행 이력 */}
        {recent.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-700">최근 운행 (10건)</h2>
              <Link
                href="/vehicles/trips"
                className="text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                전체 검색·CSV →
              </Link>
            </div>
            <ul className="rounded-xl bg-white border border-slate-200 divide-y divide-slate-100">
              {recent.map((t) => {
                const vName = vehicleNameById.get(t.vehicle_id) ?? '?'
                const driver = nameById.get(t.driver_employee_id) ?? '?'
                const ongoing = t.returned_at === null
                const distance =
                  t.start_odometer_km !== null && t.end_odometer_km !== null
                    ? t.end_odometer_km - t.start_odometer_km
                    : null
                return (
                  <li key={t.id} className="p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-slate-800 truncate">{vName}</p>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                          ongoing
                            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                            : 'text-slate-500 bg-slate-50 border-slate-200'
                        }`}
                      >
                        {ongoing ? '사용 중' : '완료'}
                      </span>
                    </div>
                    <p className="text-slate-500">
                      {driver} · {TIME_FMT.format(new Date(t.departed_at))}
                      {t.returned_at && (
                        <>
                          {' ~ '}
                          {TIME_FMT.format(new Date(t.returned_at))}
                        </>
                      )}
                      {distance !== null && (
                        <span className="ml-2 text-slate-600">{distance.toLocaleString()} km</span>
                      )}
                      {t.refueled && (
                        <span className="ml-2 text-amber-700">
                          ⛽
                          {t.refuel_amount_krw !== null
                            ? ` ${t.refuel_amount_krw.toLocaleString()}원`
                            : ''}
                        </span>
                      )}
                    </p>
                    {t.purpose && <p className="text-slate-500 truncate">목적: {t.purpose}</p>}
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

function StatusBadge({
  active,
  inactive,
  mine,
}: {
  active: boolean
  inactive: boolean
  mine: boolean
}) {
  if (inactive) {
    return <PillBadge tone="gray">비활성</PillBadge>
  }
  if (mine) {
    return <PillBadge tone="emerald">내가 사용 중</PillBadge>
  }
  if (active) {
    return <PillBadge tone="amber">사용 중</PillBadge>
  }
  return <PillBadge tone="slate">대기</PillBadge>
}

function PillBadge({
  tone,
  children,
}: {
  tone: 'emerald' | 'amber' | 'slate' | 'gray'
  children: React.ReactNode
}) {
  const cls = {
    emerald: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    amber: 'text-amber-700 bg-amber-50 border-amber-200',
    slate: 'text-slate-600 bg-slate-50 border-slate-200',
    gray: 'text-slate-500 bg-slate-100 border-slate-200',
  }[tone]
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  )
}

function Banner({ kind, children }: { kind: 'ok' | 'err'; children: React.ReactNode }) {
  const cls =
    kind === 'ok'
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : 'text-red-600 bg-red-50 border-red-200'
  return <p className={`text-sm border rounded-lg p-3 ${cls}`}>{children}</p>
}
