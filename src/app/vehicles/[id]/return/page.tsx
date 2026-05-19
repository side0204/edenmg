import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { returnVehicle } from '../../actions'

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

type VehicleRow = {
  id: string
  plate_number: string
  name: string
  company_id: string
}

type ActiveTripRow = {
  id: string
  vehicle_id: string
  driver_employee_id: string
  departed_at: string
  start_odometer_km: number | null
  purpose: string | null
}

const TIME_FMT = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export default async function ReturnPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
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

  const { data: vData } = await supabase
    .from('vehicles')
    .select('id, plate_number, name, company_id')
    .eq('id', id)
    .maybeSingle()
  const vehicle = vData as VehicleRow | null
  if (!vehicle || vehicle.company_id !== me.company_id) notFound()

  // 현재 사용 중인 운행
  const { data: tripData } = await supabase
    .from('vehicle_trips')
    .select('id, vehicle_id, driver_employee_id, departed_at, start_odometer_km, purpose')
    .eq('vehicle_id', id)
    .is('returned_at', null)
    .maybeSingle()
  const trip = tripData as ActiveTripRow | null

  if (!trip) {
    redirect('/vehicles?err=' + encodeURIComponent('이 차량은 사용 중이 아닙니다'))
  }

  const isAdmin = me.permission === 'admin'
  if (trip.driver_employee_id !== me.id && !isAdmin) {
    redirect('/vehicles?err=' + encodeURIComponent('본인 운행만 반납할 수 있습니다'))
  }

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-md space-y-5">
        <header>
          <Link href="/vehicles" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
            <ChevronLeft className="h-4 w-4" />
            차량 목록
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">반납</h1>
          <p className="mt-1 text-sm text-slate-600">
            <span className="font-medium">{vehicle.plate_number}</span> · {vehicle.name}
          </p>
        </header>

        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs text-slate-600 space-y-1">
          <p>
            <span className="text-slate-500">출고</span>{' '}
            {TIME_FMT.format(new Date(trip.departed_at))}
            {trip.start_odometer_km !== null && (
              <span className="ml-2 text-slate-500">
                ({trip.start_odometer_km.toLocaleString()} km)
              </span>
            )}
          </p>
          {trip.purpose && <p className="text-slate-500">목적: {trip.purpose}</p>}
        </div>


        <form
          action={returnVehicle}
          className="space-y-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200"
        >
          <input type="hidden" name="vehicle_id" value={vehicle.id} />
          <input type="hidden" name="trip_id" value={trip.id} />

          <label className="block">
            <span className="block text-sm font-medium text-slate-700">도착 km (선택)</span>
            <div className="mt-1">
              <input
                name="end_odometer_km"
                type="number"
                min={trip.start_odometer_km ?? 0}
                step={1}
                inputMode="numeric"
                placeholder={
                  trip.start_odometer_km !== null
                    ? `출발 ${trip.start_odometer_km.toLocaleString()} km 이상`
                    : '예: 12400'
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <p className="mt-1 text-xs text-slate-400">
              계기판 누적 km. 모르면 비워둬도 됩니다.
            </p>
          </label>

          <fieldset className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="refueled"
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              <span className="text-sm text-slate-700">주유함</span>
            </label>
            <label className="block">
              <span className="block text-xs text-slate-500">주유 금액 (원, 선택)</span>
              <div className="mt-1">
                <input
                  name="refuel_amount_krw"
                  type="number"
                  min={0}
                  step={100}
                  inputMode="numeric"
                  placeholder="예: 50000"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>
              <p className="mt-1 text-xs text-slate-400">주유함 체크 안 했으면 무시됩니다.</p>
            </label>
          </fieldset>

          <label className="block">
            <span className="block text-sm font-medium text-slate-700">반납 위치 (선택)</span>
            <div className="mt-1">
              <input
                name="return_location"
                maxLength={200}
                placeholder="예: 본사 주차장, 강남현장 지하 1층"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <p className="mt-1 text-xs text-slate-400">
              다음 사용자가 차량 위치를 파악할 수 있게 적어주세요.
            </p>
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-slate-700">메모 (선택)</span>
            <div className="mt-1">
              <textarea
                name="purpose"
                rows={3}
                maxLength={300}
                defaultValue={trip.purpose ?? ''}
                placeholder="추가/수정할 내용이 있으면 적으세요"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 resize-none"
              />
            </div>
            <p className="mt-1 text-xs text-slate-400">
              비우면 출고 시 적은 목적이 유지됩니다.
            </p>
          </label>

          <button
            type="submit"
            className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-base font-medium text-white hover:bg-emerald-700 active:bg-emerald-800"
          >
            반납 →
          </button>
          <p className="text-xs text-slate-400 text-center">
            반납 시각은 자동으로 지금으로 기록됩니다.
          </p>
        </form>
      </div>
    </main>
  )
}
