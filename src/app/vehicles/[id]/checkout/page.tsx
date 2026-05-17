import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { checkoutVehicle } from '../../actions'

type Permission = 'worker' | 'foreman' | 'admin' | 'ceo'

type VehicleRow = {
  id: string
  plate_number: string
  name: string
  is_active: boolean
  company_id: string
}

type LastTripRow = {
  end_odometer_km: number | null
  returned_at: string | null
}

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error } = await searchParams
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
    .select('id, plate_number, name, is_active, company_id')
    .eq('id', id)
    .maybeSingle()
  const vehicle = vData as VehicleRow | null
  if (!vehicle || vehicle.company_id !== me.company_id) notFound()

  // 차량이 비활성이거나 이미 사용 중이면 목록으로
  if (!vehicle.is_active) {
    redirect('/vehicles?error=' + encodeURIComponent('비활성 차량입니다'))
  }

  const { data: activeRow } = await supabase
    .from('vehicle_trips')
    .select('id')
    .eq('vehicle_id', id)
    .is('returned_at', null)
    .maybeSingle()
  if (activeRow) {
    redirect('/vehicles?error=' + encodeURIComponent('이미 사용 중인 차량입니다'))
  }

  // 본인이 이미 다른 차량 사용 중이면 차단
  const { data: myActiveRow } = await supabase
    .from('vehicle_trips')
    .select('id, vehicle_id')
    .eq('driver_employee_id', me.id)
    .is('returned_at', null)
    .maybeSingle()
  if (myActiveRow) {
    redirect('/vehicles?error=' + encodeURIComponent('이미 다른 차량을 사용 중입니다. 먼저 반납하세요.'))
  }

  // 마지막 반납 km — placeholder 로 표시
  const { data: lastRow } = await supabase
    .from('vehicle_trips')
    .select('end_odometer_km, returned_at')
    .eq('vehicle_id', id)
    .not('returned_at', 'is', null)
    .order('returned_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const lastEndKm = (lastRow as LastTripRow | null)?.end_odometer_km ?? null

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-md space-y-5">
        <header>
          <Link href="/vehicles" className="text-xs text-slate-500 hover:text-slate-900">
            ← 차량 목록
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">출고</h1>
          <p className="mt-1 text-sm text-slate-600">
            <span className="font-medium">{vehicle.plate_number}</span> · {vehicle.name}
          </p>
        </header>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
            {error}
          </p>
        )}

        <form
          action={checkoutVehicle}
          className="space-y-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200"
        >
          <input type="hidden" name="vehicle_id" value={vehicle.id} />

          <label className="block">
            <span className="block text-sm font-medium text-slate-700">출발 km (선택)</span>
            <div className="mt-1">
              <input
                name="start_odometer_km"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                placeholder={lastEndKm !== null ? `이전 반납 ${lastEndKm.toLocaleString()} km` : '예: 12345'}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <p className="mt-1 text-xs text-slate-400">
              계기판 누적 km. 모르면 비워둬도 됩니다.
            </p>
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-slate-700">목적 (선택)</span>
            <div className="mt-1">
              <textarea
                name="purpose"
                rows={3}
                maxLength={300}
                placeholder="예: 강남현장 자재 운반"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 resize-none"
              />
            </div>
          </label>

          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-base font-medium text-white hover:bg-slate-800 active:bg-slate-700"
          >
            출고 →
          </button>
          <p className="text-xs text-slate-400 text-center">
            출고 시각은 자동으로 지금으로 기록됩니다.
          </p>
        </form>
      </div>
    </main>
  )
}
