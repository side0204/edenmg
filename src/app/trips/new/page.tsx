import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { hmKST } from '@/lib/trips'
import { TripStartForm, type VehicleOption } from './TripStartForm'
import type { CompanionCandidate } from './CompanionPicker'

type EmbeddedEmployee = { name: string } | { name: string }[] | null
const pickName = (e: EmbeddedEmployee): string | null => {
  if (!e) return null
  if (Array.isArray(e)) return e[0]?.name ?? null
  return e.name ?? null
}

export default async function NewTripPage({
  searchParams,
}: {
  searchParams: Promise<{ vehicle?: string }>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, vehicle_plate, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; company_id: string; vehicle_plate: string | null; is_active: boolean } | null
  if (!me || !me.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))

  // 진행 중 외근이 있으면 시작 페이지 대신 메인으로
  const { data: myActive } = await supabase
    .from('vehicle_trips')
    .select('id')
    .eq('driver_employee_id', me.id)
    .is('returned_at', null)
    .maybeSingle()
  if (myActive) redirect('/trips?err=' + encodeURIComponent('진행 중인 외근이 있습니다. 먼저 도착 처리해주세요.'))

  const [vehiclesRes, activeRes, lastReturnRes, candidatesRes, recentPlacesRes] = await Promise.all([
    supabase
      .from('vehicles')
      .select('id, plate_number, name')
      .eq('company_id', me.company_id)
      .eq('is_active', true)
      .is('retired_at', null)
      .order('plate_number'),
    supabase
      .from('vehicle_trips')
      .select('vehicle_id, departed_at, employees!driver_employee_id(name)')
      .eq('company_id', me.company_id)
      .is('returned_at', null)
      .not('vehicle_id', 'is', null),
    supabase
      .from('vehicle_trips')
      .select('vehicle_id, end_odometer_km, return_location, returned_at')
      .eq('company_id', me.company_id)
      .not('vehicle_id', 'is', null)
      .not('returned_at', 'is', null)
      .order('returned_at', { ascending: false })
      .limit(100),
    supabase
      .from('employees')
      .select('id, name, position, team, work_type')
      .eq('company_id', me.company_id)
      .eq('is_active', true)
      .is('resigned_at', null)
      .neq('id', me.id)
      .order('name'),
    supabase
      .from('vehicle_trips')
      .select('place')
      .eq('driver_employee_id', me.id)
      .not('place', 'is', null)
      .order('departed_at', { ascending: false })
      .limit(30),
  ])

  const active = new Map<string, { driverName: string | null; departedAt: string }>()
  for (const a of (activeRes.data ?? []) as unknown as { vehicle_id: string; departed_at: string; employees: EmbeddedEmployee }[]) {
    active.set(a.vehicle_id, { driverName: pickName(a.employees), departedAt: a.departed_at })
  }
  const lastReturn = new Map<string, { endKm: number | null; location: string | null }>()
  for (const r of (lastReturnRes.data ?? []) as { vehicle_id: string; end_odometer_km: number | null; return_location: string | null }[]) {
    if (!lastReturn.has(r.vehicle_id)) lastReturn.set(r.vehicle_id, { endKm: r.end_odometer_km, location: r.return_location })
  }

  const vehicles: VehicleOption[] = ((vehiclesRes.data ?? []) as { id: string; plate_number: string; name: string }[]).map((v) => {
    const a = active.get(v.id)
    const lr = lastReturn.get(v.id)
    return {
      id: v.id,
      label: `${v.plate_number} · ${v.name}`,
      inUseBy: a ? `${a.driverName ?? '?'} ${hmKST(a.departedAt)} 출고` : null,
      lastEndKm: lr?.endKm ?? null,
      lastLocation: lr?.location ?? null,
    }
  })

  const recentPlaces = Array.from(
    new Set(((recentPlacesRes.data ?? []) as { place: string | null }[]).map((r) => (r.place ?? '').trim()).filter(Boolean)),
  ).slice(0, 5)

  const candidates = (candidatesRes.data ?? []) as CompanionCandidate[]

  const defaultVehicleId = sp.vehicle && vehicles.some((v) => v.id === sp.vehicle) ? sp.vehicle : null

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <header>
          <Link href="/trips" className="inline-flex items-center gap-0.5 text-[13px] font-medium text-slate-500 hover:text-slate-900">
            <ChevronLeft className="h-4 w-4" />
            외근·차량
          </Link>
          <h1 className="mt-0.5 text-2xl font-bold tracking-[-0.03em] text-slate-900 dark:text-slate-100">외근 시작</h1>
          <p className="mt-0.5 text-[13px] text-slate-500">결재 없이 바로 시작됩니다. 목적·장소·이동수단만 적으세요.</p>
        </header>

        <TripStartForm
          vehicles={vehicles}
          candidates={candidates}
          recentPlaces={recentPlaces}
          myPlate={me.vehicle_plate}
          defaultVehicleId={defaultVehicleId}
        />
      </div>
    </main>
  )
}
