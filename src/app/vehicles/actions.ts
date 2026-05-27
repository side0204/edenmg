'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

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
  if (me.permission !== 'admin') {
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

// 영구 삭제 — 운행 이력 0건 차량만 (DB ON DELETE RESTRICT 가 보장).
// 등록 실수 정정용. 이력 있는 차량은 retireVehicle 로 사용 종료 처리.
export async function deleteVehicle(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) redirect('/vehicles?err=' + encodeURIComponent('차량 id 가 없습니다'))

  const { supabase } = await requireAdmin()

  // 운행 이력 존재 여부 사전 확인 (RESTRICT 에 걸리기 전 친절한 메시지)
  const { count } = await supabase
    .from('vehicle_trips')
    .select('id', { count: 'exact', head: true })
    .eq('vehicle_id', id)
  if ((count ?? 0) > 0) {
    redirect(
      '/vehicles?err=' +
        encodeURIComponent('운행 이력이 있어 영구 삭제할 수 없습니다. 사용 종료 처리를 이용하세요.'),
    )
  }

  // 차량명 미리 조회 (성공 메시지용)
  const { data: vRow } = await supabase
    .from('vehicles')
    .select('name')
    .eq('id', id)
    .maybeSingle()
  const name = (vRow as { name: string } | null)?.name ?? '차량'

  const { error } = await supabase.from('vehicles').delete().eq('id', id)
  if (error) {
    redirect('/vehicles?err=' + encodeURIComponent('삭제 실패: ' + error.message))
  }

  revalidatePath('/vehicles')
  redirect('/vehicles?ok=' + encodeURIComponent(`${name} 을(를) 영구 삭제했습니다`))
}

// 사용 종료 처리 — 운행 이력 있는 차량의 소프트 삭제.
// retired_at + retire_reason 기록 + is_active=false. 운영 재개 시 reactivateVehicle.
export async function retireVehicle(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  const reason = String(formData.get('retire_reason') ?? '').trim()
  const dateRaw = String(formData.get('retired_at') ?? '').trim()
  const retiredAt = dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw)
    ? dateRaw
    : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())

  if (!id) redirect('/vehicles?err=' + encodeURIComponent('차량 id 가 없습니다'))
  if (!reason) {
    redirect('/vehicles?err=' + encodeURIComponent('사용 종료 사유를 입력하세요 (예: 폐차, 매각, 리스반납)'))
  }
  if (reason.length > 200) {
    redirect('/vehicles?err=' + encodeURIComponent('사유는 200자 이하로 입력하세요'))
  }

  const { supabase } = await requireAdmin()

  // 사용 중인 차량은 사용 종료 불가 (먼저 반납해야 함)
  const { data: activeRow } = await supabase
    .from('vehicle_trips')
    .select('id')
    .eq('vehicle_id', id)
    .is('returned_at', null)
    .maybeSingle()
  if (activeRow) {
    redirect(
      '/vehicles?err=' +
        encodeURIComponent('사용 중인 차량입니다. 먼저 반납 처리 후 사용 종료해주세요.'),
    )
  }

  const { error } = await supabase
    .from('vehicles')
    .update({
      retired_at: retiredAt,
      retire_reason: reason,
      is_active: false,
    })
    .eq('id', id)
  if (error) {
    redirect('/vehicles?err=' + encodeURIComponent('사용 종료 실패: ' + error.message))
  }

  revalidatePath('/vehicles')
  revalidatePath('/vehicles/retired')
  revalidatePath('/')
  redirect('/vehicles?ok=' + encodeURIComponent(`사용 종료 처리 (${retiredAt})`))
}

// 사용 종료 차량의 운영 재개. retired_at=null + retire_reason=null + is_active=true.
export async function reactivateVehicle(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) redirect('/vehicles/retired?err=' + encodeURIComponent('차량 id 가 없습니다'))

  const { supabase } = await requireAdmin()

  const { error } = await supabase
    .from('vehicles')
    .update({ retired_at: null, retire_reason: null, is_active: true })
    .eq('id', id)
  if (error) {
    redirect('/vehicles/retired?err=' + encodeURIComponent('운영 재개 실패: ' + error.message))
  }

  revalidatePath('/vehicles')
  revalidatePath('/vehicles/retired')
  redirect('/vehicles/retired?ok=' + encodeURIComponent('운영 재개 처리됐습니다'))
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
  const returnLocation = String(formData.get('return_location') ?? '').trim() || null

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
  if (trip.driver_employee_id !== me.id && me.permission !== 'admin') {
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
    return_location: returnLocation,
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

// 출고 취소 — 출고 후 10분 내 본인 운행만. security definer RPC 호출.
// vehicle_trips DELETE GRANT 없으므로 RPC 가 모든 검증 + 삭제 담당.
export async function cancelCheckout(formData: FormData) {
  const tripId = String(formData.get('trip_id') ?? '').trim()
  if (!tripId) {
    redirect('/vehicles?err=' + encodeURIComponent('운행 id 가 없습니다'))
  }

  const { supabase } = await requireMe()
  const { error } = await supabase.rpc('vehicle_trip_cancel', { _trip_id: tripId })

  if (error) {
    redirect('/vehicles?err=' + encodeURIComponent(error.message))
  }

  revalidatePath('/vehicles')
  revalidatePath('/')
  redirect('/vehicles?ok=' + encodeURIComponent('출고를 취소했습니다'))
}
