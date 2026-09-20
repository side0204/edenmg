import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { hmKST, transportText, type TransportKind } from '@/lib/trips'
import { BigTimes, StatusText, TransportTag } from '../../ui'
import ElapsedText from '../../ElapsedText'
import { TripEndForm } from './TripEndForm'

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'
type EmbeddedEmployee = { name: string } | { name: string }[] | null
const pickName = (e: EmbeddedEmployee): string | null => {
  if (!e) return null
  if (Array.isArray(e)) return e[0]?.name ?? null
  return e.name ?? null
}

export default async function EndTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, permission, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; permission: Permission; is_active: boolean } | null
  if (!me || !me.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))

  const { data: tRow } = await supabase
    .from('vehicle_trips')
    .select(
      'id, vehicle_id, driver_employee_id, departed_at, returned_at, expected_arrival_at, start_odometer_km, purpose, place, transport, personal_plate, other_note, vehicles(plate_number, name), employees!driver_employee_id(name)',
    )
    .eq('id', id)
    .maybeSingle()
  const trip = tRow as unknown as {
    id: string
    vehicle_id: string | null
    driver_employee_id: string
    departed_at: string
    returned_at: string | null
    expected_arrival_at: string | null
    start_odometer_km: number | null
    purpose: string | null
    place: string | null
    transport: TransportKind
    personal_plate: string | null
    other_note: string | null
    vehicles: { plate_number: string; name: string } | { plate_number: string; name: string }[] | null
    employees: EmbeddedEmployee
  } | null
  if (!trip) redirect('/trips?err=' + encodeURIComponent('외근 기록을 찾을 수 없습니다'))
  if (trip.returned_at) redirect('/trips?err=' + encodeURIComponent('이미 도착 처리된 외근입니다'))
  if (trip.driver_employee_id !== me.id && me.permission !== 'admin') {
    redirect('/trips?err=' + encodeURIComponent('본인 외근만 도착 처리할 수 있습니다'))
  }

  const { data: cData } = await supabase.from('vehicle_trip_companions').select('employees(name)').eq('trip_id', trip.id)
  const companions = ((cData ?? []) as unknown as { employees: EmbeddedEmployee }[]).map((c) => pickName(c.employees) ?? '?')

  const v = Array.isArray(trip.vehicles) ? trip.vehicles[0] ?? null : trip.vehicles
  const vehicleLabel = v ? `${v.plate_number} ${v.name}` : null

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <header>
          <Link href="/trips" className="inline-flex items-center gap-0.5 text-[13px] font-medium text-slate-500 hover:text-slate-900">
            <ChevronLeft className="h-4 w-4" />
            외근·차량
          </Link>
          <h1 className="mt-0.5 text-2xl font-bold tracking-[-0.03em] text-slate-900 dark:text-slate-100">도착 · 반납</h1>
          <p className="mt-0.5 text-[13px] text-slate-500">도착시간과 km 만 확인하면 끝. 주유·반납 위치는 있을 때만.</p>
        </header>

        <section className="space-y-2.5 rounded-2xl bg-white p-[18px] shadow-sm ring-1 ring-slate-900/5 dark:bg-slate-900 dark:ring-slate-800">
          <div className="flex items-center justify-between">
            <StatusText text="외근 중" tone="emerald" />
            <TransportTag transport={trip.transport} label={transportText({ ...trip, vehicleLabel })} />
          </div>
          <div className="text-[17px] font-bold tracking-tight text-slate-900 dark:text-slate-100">{trip.purpose}</div>
          <div className="-mt-1 flex items-center gap-1.5 text-[13px] text-slate-600">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="truncate">{trip.place ?? '—'}</span>
            {companions.length > 0 && <span className="text-slate-500">· 동행 {companions.join(' · ')}</span>}
            {trip.driver_employee_id !== me.id && (
              <span className="text-slate-500">· 운전자 {pickName(trip.employees)}</span>
            )}
          </div>
          <BigTimes
            dep={hmKST(trip.departed_at)}
            arr={trip.expected_arrival_at ? hmKST(trip.expected_arrival_at) : '—'}
            depLabel={
              <>
                출발 · <ElapsedText fromIso={trip.departed_at} />
              </>
            }
            arrLabel={trip.expected_arrival_at ? '도착 예정' : '도착 예정 없음'}
            progress={1}
            size="text-2xl leading-7"
          />
        </section>

        <TripEndForm tripId={trip.id} transport={trip.transport} startKm={trip.start_odometer_km} />
      </div>
    </main>
  )
}
