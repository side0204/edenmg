import Link from 'next/link'
import { Search, Fuel, Plus, ChevronLeft, Car, Users, Ban } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { EmptyState } from '@/components/EmptyState'
import { retireVehicle } from './actions'
import DeleteVehicleButton from './DeleteVehicleButton'

function todayInSeoul(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
}

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

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
  year: 'numeric',
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

  const isAdmin = me.permission === 'admin'

  // 차량 목록 (사용 종료 차량 제외 — 별도 /vehicles/retired 페이지)
  const { data: vData, error: vErr } = await supabase
    .from('vehicles')
    .select('id, plate_number, name, is_active, notes')
    .is('retired_at', null)
    .order('is_active', { ascending: false })
    .order('plate_number', { ascending: true })

  const vehicles = (vData ?? []) as VehicleRow[]

  // 사용 종료 차량 수 (진입점 배지용)
  const { count: retiredCount } = await supabase
    .from('vehicles')
    .select('id', { count: 'exact', head: true })
    .not('retired_at', 'is', null)

  // 운행 이력 vehicle_id 일괄 (영구 삭제 가능 여부 판단용)
  // 회사 규모상 운행 기록 50,000건 미만 가정. 그 이상이면 RPC 로 distinct 개선 필요.
  const tripVehicleIds = new Set<string>()
  if (isAdmin && vehicles.length > 0) {
    const { data: allTrips } = await supabase
      .from('vehicle_trips')
      .select('vehicle_id')
      .limit(50000)
    for (const t of (allTrips ?? []) as { vehicle_id: string }[]) {
      tripVehicleIds.add(t.vehicle_id)
    }
  }

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
      'id, vehicle_id, driver_employee_id, departed_at, returned_at, start_odometer_km, end_odometer_km, purpose, refueled, refuel_amount_krw, return_location',
    )
    .order('departed_at', { ascending: false })
    .limit(10)

  const recent = (recentData ?? []) as RecentTripRow[]

  // 차량별 가장 최근 반납 정보 (대기 카드 표시용)
  const { data: lastReturnedData } = await supabase
    .from('vehicle_trips')
    .select('vehicle_id, driver_employee_id, returned_at, return_location')
    .not('returned_at', 'is', null)
    .order('returned_at', { ascending: false })
    .limit(100)
  const lastReturnByVehicleId = new Map<
    string,
    { driverId: string; returnedAt: string; returnLocation: string | null }
  >()
  for (const t of (lastReturnedData ?? []) as Array<{
    vehicle_id: string
    driver_employee_id: string
    returned_at: string
    return_location: string | null
  }>) {
    if (!lastReturnByVehicleId.has(t.vehicle_id)) {
      lastReturnByVehicleId.set(t.vehicle_id, {
        driverId: t.driver_employee_id,
        returnedAt: t.returned_at,
        returnLocation: t.return_location,
      })
    }
  }

  // 직원 이름 매핑 (active + recent + 최종 반납 운전자 합쳐서 한 번에)
  const employeeIds = new Set<string>()
  for (const t of activeByVehicleId.values()) employeeIds.add(t.driver_employee_id)
  for (const t of recent) employeeIds.add(t.driver_employee_id)
  for (const v of lastReturnByVehicleId.values()) employeeIds.add(v.driverId)

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
        <header className="space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
          <div>
            <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
              <ChevronLeft className="h-4 w-4" />
              홈
            </Link>
            <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">업무용 차량</h1>
            <p className="mt-1 text-sm text-slate-500">
              {isAdmin ? '회사 전체 차량 · 운행 현황' : '회사 차량 출고·반납'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            <Link
              href="/vehicles/workers"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Users className="h-4 w-4" />
              작업차량
            </Link>
            <Link
              href="/vehicles/trips"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Search className="h-4 w-4" />
              운행 이력
            </Link>
            {isAdmin && (
              <>
                <Link
                  href="/vehicles/retired"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Ban className="h-4 w-4" />
                  사용 종료
                  {retiredCount ? (
                    <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                      {retiredCount}
                    </span>
                  ) : null}
                </Link>
                <Link
                  href="/vehicles/new"
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  <Plus className="h-4 w-4" />
                  차량 등록
                </Link>
              </>
            )}
          </div>
        </header>

        {vErr && <Banner kind="err">목록을 불러오지 못했습니다: {vErr.message}</Banner>}

        {/* 차량 카드 리스트 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-slate-700 tracking-tight">차량 목록</h2>
          {vehicles.length === 0 ? (
            <EmptyState
              icon={Car}
              title="등록된 차량 없음"
              description={isAdmin ? '회사 업무용 차량을 등록하면 출고·반납 기록이 시작됩니다.' : '관리자에게 차량 등록을 요청하세요.'}
              cta={
                isAdmin ? (
                  <Link
                    href="/vehicles/new"
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    <Plus className="h-4 w-4" />
                    차량 등록
                  </Link>
                ) : null
              }
            />
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

                    {/* 대기 (active 없음 + 활성 차량) 인 경우 최종 반납 정보 */}
                    {!active && v.is_active && (() => {
                      const lr = lastReturnByVehicleId.get(v.id)
                      if (!lr) return null
                      const lastDriverName = nameById.get(lr.driverId) ?? '?'
                      return (
                        <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600 space-y-0.5">
                          <p className="font-medium text-slate-700">최종 반납</p>
                          <p>
                            <span className="text-slate-500">사용자</span>{' '}
                            <span className="text-slate-800">{lastDriverName}</span>
                            <span className="ml-2 text-slate-500">
                              {TIME_FMT.format(new Date(lr.returnedAt))}
                            </span>
                          </p>
                          {lr.returnLocation && (
                            <p>
                              <span className="text-slate-500">위치</span>{' '}
                              <span className="text-slate-800">{lr.returnLocation}</span>
                            </p>
                          )}
                        </div>
                      )
                    })()}

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

                    {/* 관리자 관리 영역 — 사용 종료 / 영구 삭제. 사용 중 차량은 둘 다 차단. */}
                    {isAdmin && !active && (() => {
                      const hasTrips = tripVehicleIds.has(v.id)
                      const vehicleLabel = `${v.plate_number} · ${v.name}`
                      return (
                        <div className="flex flex-wrap items-start gap-2 pt-2 border-t border-slate-100">
                          <details className="flex-1 min-w-[240px] rounded-lg border border-rose-200 bg-rose-50/40">
                            <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-rose-700 flex items-center gap-1.5">
                              <Ban className="h-3.5 w-3.5" />
                              사용 종료 처리
                            </summary>
                            <form
                              action={retireVehicle}
                              className="px-3 pb-3 pt-1 space-y-2 border-t border-rose-200"
                            >
                              <input type="hidden" name="id" value={v.id} />
                              <p className="text-[11px] text-rose-700/80">
                                폐차·매각·리스반납·렌트반납 등 회사를 떠난 차량 처리. 운행 이력은 그대로
                                보존되며 사용 종료 차량 페이지에서 확인·운영 재개할 수 있습니다.
                              </p>
                              <label className="block">
                                <span className="block text-[11px] font-medium text-rose-700">
                                  사용 종료일
                                </span>
                                <input
                                  type="date"
                                  name="retired_at"
                                  defaultValue={todayInSeoul()}
                                  className="mt-1 w-full rounded-md border border-rose-300 bg-white px-2 py-1.5 text-sm"
                                />
                              </label>
                              <label className="block">
                                <span className="block text-[11px] font-medium text-rose-700">
                                  사유 *
                                </span>
                                <input
                                  type="text"
                                  name="retire_reason"
                                  required
                                  maxLength={200}
                                  placeholder="예: 폐차, 매각, 리스반납, 렌트반납"
                                  className="mt-1 w-full rounded-md border border-rose-300 bg-white px-2 py-1.5 text-sm"
                                />
                              </label>
                              <button
                                type="submit"
                                className="w-full rounded-md bg-rose-600 px-3 py-2 text-sm font-bold text-white hover:bg-rose-700"
                              >
                                사용 종료 처리
                              </button>
                            </form>
                          </details>

                          {/* 영구 삭제 — 운행 이력 0건만 노출 */}
                          {!hasTrips && (
                            <DeleteVehicleButton vehicleId={v.id} vehicleLabel={vehicleLabel} />
                          )}
                        </div>
                      )
                    })()}
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
              <h2 className="text-base font-semibold text-slate-700 tracking-tight">최근 운행 (10건)</h2>
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
                        <span className="ml-2 inline-flex items-center gap-1 text-amber-700">
                          <Fuel className="h-3.5 w-3.5" />
                          {t.refuel_amount_krw !== null
                            ? `${t.refuel_amount_krw.toLocaleString()}원`
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
