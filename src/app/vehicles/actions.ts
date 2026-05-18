'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type Permission = 'worker' | 'foreman' | 'admin' | 'ceo'

// ===== 공통 =============================================================

async function requireMe() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, permission')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; company_id: string; permission: Permission } | null

  if (!me) redirect('/login')
  return { supabase, me }
}

async function requireAdmin() {
  const { supabase, me } = await requireMe()
  if (me.permission !== 'admin' && me.permission !== 'ceo') {
    redirect('/vehicles?err=' + encodeURIComponent('권한이 없습니다'))
  }
  return { supabase, me }
}

// ===== 차량 마스터 ======================================================

function parseVehicleForm(formData: FormData) {
  const plate = String(formData.get('plate_number') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  const isActive = formData.get('is_active') === 'on'
  const notes = String(formData.get('notes') ?? '').trim()

  return {
    plate_number: plate,
    name,
    is_active: isActive,
    notes: notes || null,
  }
}

function validateVehicle(parsed: ReturnType<typeof parseVehicleForm>): string | null {
  if (!parsed.plate_number) return '차량번호를 입력하세요.'
  if (parsed.plate_number.length > 20) return '차량번호는 20자 이하로 입력하세요.'
  if (!parsed.name) return '차명을 입력하세요.'
  if (parsed.name.length > 50) return '차명은 50자 이하로 입력하세요.'
  return null
}

export async function createVehicle(formData: FormData) {
  const parsed = parseVehicleForm(formData)
  const errMsg = validateVehicle(parsed)
  if (errMsg) {
    redirect('/vehicles/new?err=' + encodeURIComponent(errMsg))
  }

  const { supabase, me } = await requireAdmin()

  const { error } = await supabase.from('vehicles').insert({
    ...parsed,
    company_id: me.company_id,
  })

  if (error) {
    redirect('/vehicles/new?err=' + encodeURIComponent('등록 실패: ' + error.message))
  }

  revalidatePath('/vehicles')
  redirect('/vehicles?ok=' + encodeURIComponent(`${parsed.name} 차량을 등록했습니다`))
}

export async function updateVehicle(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) redirect('/vehicles?err=' + encodeURIComponent('차량 id 가 없습니다'))

  const parsed = parseVehicleForm(formData)
  const errMsg = validateVehicle(parsed)
  if (errMsg) {
    redirect(`/vehicles/${id}/edit?err=` + encodeURIComponent(errMsg))
  }

  const { supabase } = await requireAdmin()

  const { error } = await supabase.from('vehicles').update(parsed).eq('id', id)

  if (error) {
    redirect(`/vehicles/${id}/edit?err=` + encodeURIComponent('수정 실패: ' + error.message))
  }

  revalidatePath('/vehicles')
  revalidatePath(`/vehicles/${id}/edit`)
  redirect('/vehicles?ok=' + encodeURIComponent(`${parsed.name} 정보를 수정했습니다`))
}

// ===== 출고·반납 ========================================================

function parseInt0OrNull(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? '').trim()
  if (s === '') return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return Math.trunc(n)
}

export async function checkoutVehicle(formData: FormData) {
  const vehicleId = String(formData.get('vehicle_id') ?? '').trim()
  if (!vehicleId) {
    redirect('/vehicles?err=' + encodeURIComponent('차량 id 가 없습니다'))
  }

  const startKm = parseInt0OrNull(formData.get('start_odometer_km'))
  const purpose = String(formData.get('purpose') ?? '').trim() || null

  if (startKm !== null && startKm < 0) {
    redirect(`/vehicles/${vehicleId}/checkout?err=` + encodeURIComponent('출발 km 는 0 이상이어야 합니다'))
  }

  const { supabase, me } = await requireMe()

  // 차량이 같은 회사 + 활성인지 확인
  const { data: vRow } = await supabase
    .from('vehicles')
    .select('id, name, is_active, company_id')
    .eq('id', vehicleId)
    .maybeSingle()
  const vehicle = vRow as { id: string; name: string; is_active: boolean; company_id: string } | null

  if (!vehicle || vehicle.company_id !== me.company_id) {
    redirect('/vehicles?err=' + encodeURIComponent('차량을 찾을 수 없습니다'))
  }
  if (!vehicle.is_active) {
    redirect('/vehicles?err=' + encodeURIComponent('비활성 차량입니다'))
  }

  // 사용 중인 trip 이 이미 있는지 (UI 가 막아주지만 race 안전망)
  const { data: activeRow } = await supabase
    .from('vehicle_trips')
    .select('id')
    .eq('vehicle_id', vehicleId)
    .is('returned_at', null)
    .maybeSingle()
  if (activeRow) {
    redirect('/vehicles?err=' + encodeURIComponent('이미 사용 중인 차량입니다'))
  }

  const { error } = await supabase.from('vehicle_trips').insert({
    company_id: me.company_id,
    vehicle_id: vehicleId,
    driver_employee_id: me.id,
    start_odometer_km: startKm,
    purpose,
  })

  if (error) {
    redirect(`/vehicles/${vehicleId}/checkout?err=` + encodeURIComponent('출고 실패: ' + error.message))
  }

  revalidatePath('/vehicles')
  revalidatePath('/')
  redirect('/vehicles?ok=' + encodeURIComponent(`${vehicle.name} 출고 완료. 운행 마치고 꼭 반납하세요`))
}

export async function returnVehicle(formData: FormData) {
  const vehicleId = String(formData.get('vehicle_id') ?? '').trim()
  const tripId = String(formData.get('trip_id') ?? '').trim()
  if (!vehicleId || !tripId) {
    redirect('/vehicles?err=' + encodeURIComponent('운행 id 가 없습니다'))
  }

  const endKm = parseInt0OrNull(formData.get('end_odometer_km'))
  const refueled = formData.get('refueled') === 'on'
  const refuelAmount = refueled ? parseInt0OrNull(formData.get('refuel_amount_krw')) : null
  const purposeOverride = String(formData.get('purpose') ?? '').trim()

  if (endKm !== null && endKm < 0) {
    redirect(`/vehicles/${vehicleId}/return?err=` + encodeURIComponent('도착 km 는 0 이상이어야 합니다'))
  }
  if (refueled && refuelAmount !== null && refuelAmount < 0) {
    redirect(`/vehicles/${vehicleId}/return?err=` + encodeURIComponent('주유 금액은 0 이상이어야 합니다'))
  }

  const { supabase, me } = await requireMe()

  // trip 이 본인 운행이고 아직 사용 중인지 확인
  const { data: tRow } = await supabase
    .from('vehicle_trips')
    .select('id, vehicle_id, driver_employee_id, start_odometer_km, purpose, returned_at')
    .eq('id', tripId)
    .maybeSingle()
  const trip = tRow as {
    id: string
    vehicle_id: string
    driver_employee_id: string
    start_odometer_km: number | null
    purpose: string | null
    returned_at: string | null
  } | null

  if (!trip || trip.vehicle_id !== vehicleId) {
    redirect('/vehicles?err=' + encodeURIComponent('운행 기록을 찾을 수 없습니다'))
  }
  if (trip.returned_at) {
    redirect('/vehicles?err=' + encodeURIComponent('이미 반납된 운행입니다'))
  }
  if (trip.driver_employee_id !== me.id && me.permission !== 'admin' && me.permission !== 'ceo') {
    redirect('/vehicles?err=' + encodeURIComponent('본인 운행만 반납할 수 있습니다'))
  }

  if (endKm !== null && trip.start_odometer_km !== null && endKm < trip.start_odometer_km) {
    redirect(`/vehicles/${vehicleId}/return?err=` + encodeURIComponent('도착 km 는 출발 km 이상이어야 합니다'))
  }

  const update: Record<string, unknown> = {
    returned_at: new Date().toISOString(),
    end_odometer_km: endKm,
    refueled,
    refuel_amount_krw: refueled ? refuelAmount : null,
  }
  if (purposeOverride) update.purpose = purposeOverride

  const { error } = await supabase.from('vehicle_trips').update(update).eq('id', tripId)

  if (error) {
    redirect(`/vehicles/${vehicleId}/return?err=` + encodeURIComponent('반납 실패: ' + error.message))
  }

  revalidatePath('/vehicles')
  revalidatePath('/')
  redirect('/vehicles?ok=' + encodeURIComponent('반납 처리됐습니다'))
}
