'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  MAX_COMPANIONS,
  OTHER_TRANSPORT_OPTIONS,
  TRANSPORT_VALUES,
  VEHICLE_LOG_KINDS,
  kstDateTimeToIso,
  todayKST,
  type TransportKind,
  type VehicleLogKind,
} from '@/lib/trips'

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
    .select('id, company_id, permission, vehicle_plate, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as {
    id: string
    company_id: string
    permission: Permission
    vehicle_plate: string | null
    is_active: boolean
  } | null
  if (!me || !me.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  return { supabase, me }
}

function fail(path: string, msg: string): never {
  redirect(`${path}${path.includes('?') ? '&' : '?'}err=${encodeURIComponent(msg)}`)
}

function parseIntOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? '').trim().replace(/,/g, '')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? Math.floor(n) : null
}

function parseIdArray(v: FormDataEntryValue | null): string[] {
  const raw = String(v ?? '').trim()
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    return Array.from(new Set(arr.filter((x): x is string => typeof x === 'string' && uuid.test(x))))
  } catch {
    return []
  }
}

// ===== 외근 시작 ========================================================
//
// 폼 필드:
//   purpose*, place*, departed_time (HH:MM, 오늘 KST · 비우면 지금), expected_time (선택)
//   transport* (업무용 | 자차 | 기타)
//   vehicle_id (업무용), personal_plate (자차), other_note (기타)
//   start_odometer_km (선택), companion_ids (JSON id 배열, 최대 4)
export async function startTrip(formData: FormData) {
  const back = '/trips/new'
  const purpose = String(formData.get('purpose') ?? '').trim()
  const place = String(formData.get('place') ?? '').trim()
  const departedTime = String(formData.get('departed_time') ?? '').trim()
  const expectedTime = String(formData.get('expected_time') ?? '').trim()
  const transportRaw = String(formData.get('transport') ?? '').trim()
  const vehicleId = String(formData.get('vehicle_id') ?? '').trim()
  const personalPlateRaw = String(formData.get('personal_plate') ?? '').trim()
  const otherNote = String(formData.get('other_note') ?? '').trim()
  const startKm = parseIntOrNull(formData.get('start_odometer_km'))
  const companionIds = parseIdArray(formData.get('companion_ids'))

  if (!purpose) fail(back, '업무목적을 입력하세요.')
  if (purpose.length > 100) fail(back, '업무목적은 100자 이하로 입력하세요.')
  if (!place) fail(back, '외근장소를 입력하세요.')
  if (place.length > 200) fail(back, '외근장소는 200자 이하로 입력하세요.')
  if (!TRANSPORT_VALUES.includes(transportRaw as TransportKind)) fail(back, '이동수단을 선택하세요.')
  const transport = transportRaw as TransportKind
  if (startKm !== null && startKm < 0) fail(back, '출발 km 는 0 이상이어야 합니다.')
  if (companionIds.length > MAX_COMPANIONS) fail(back, `동행인은 최대 ${MAX_COMPANIONS}명까지입니다.`)

  const today = todayKST()
  const departedAt = departedTime ? kstDateTimeToIso(today, departedTime) : new Date().toISOString()
  if (!departedAt) fail(back, '출발시간 형식이 올바르지 않습니다.')
  const expectedAt = expectedTime ? kstDateTimeToIso(today, expectedTime) : null
  if (expectedTime && !expectedAt) fail(back, '도착 예정시간 형식이 올바르지 않습니다.')
  if (expectedAt && expectedAt < departedAt) fail(back, '도착 예정은 출발시간 이후여야 합니다.')

  const { supabase, me } = await requireMe()

  if (companionIds.includes(me.id)) fail(back, '본인은 동행인으로 넣을 수 없습니다.')

  // 본인 진행 중 외근 1건만
  const { data: myActive } = await supabase
    .from('vehicle_trips')
    .select('id')
    .eq('driver_employee_id', me.id)
    .is('returned_at', null)
    .maybeSingle()
  if (myActive) fail('/trips', '진행 중인 외근이 있습니다. 먼저 도착 처리해주세요.')

  let personalPlate: string | null = null
  let vehicleIdToUse: string | null = null
  let otherNoteToUse: string | null = null

  if (transport === '업무용') {
    if (!vehicleId) fail(back, '업무용 차량을 선택하세요.')
    const { data: vRow } = await supabase
      .from('vehicles')
      .select('id, name, plate_number, is_active, retired_at')
      .eq('id', vehicleId)
      .maybeSingle()
    const v = vRow as { id: string; name: string; plate_number: string; is_active: boolean; retired_at: string | null } | null
    if (!v) fail(back, '차량을 찾을 수 없습니다.')
    if (!v.is_active || v.retired_at) fail(back, '사용할 수 없는 차량입니다.')
    const { data: inUse } = await supabase
      .from('vehicle_trips')
      .select('id')
      .eq('vehicle_id', v.id)
      .is('returned_at', null)
      .maybeSingle()
    if (inUse) fail(back, `${v.plate_number} ${v.name} 은(는) 다른 사람이 사용 중입니다.`)
    vehicleIdToUse = v.id
  } else if (transport === '자차') {
    personalPlate = (personalPlateRaw || me.vehicle_plate || '').trim() || null
    if (!personalPlate) fail(back, '자차 차량번호를 입력하세요. (프로필의 차량번호가 비어 있습니다)')
    if (personalPlate.length > 20) fail(back, '차량번호는 20자 이하로 입력하세요.')
  } else {
    otherNoteToUse = otherNote || OTHER_TRANSPORT_OPTIONS[0]
    if (otherNoteToUse.length > 50) fail(back, '이동수단 메모는 50자 이하로 입력하세요.')
  }

  // 동행인 검증 — 같은 회사 · 활성
  if (companionIds.length > 0) {
    const { data: emps } = await supabase
      .from('employees')
      .select('id')
      .eq('company_id', me.company_id)
      .eq('is_active', true)
      .in('id', companionIds)
    const ok = new Set(((emps ?? []) as { id: string }[]).map((e) => e.id))
    if (ok.size !== companionIds.length) fail(back, '동행인 중 선택할 수 없는 직원이 있습니다.')
  }

  const { data: inserted, error } = await supabase
    .from('vehicle_trips')
    .insert({
      company_id: me.company_id,
      vehicle_id: vehicleIdToUse,
      driver_employee_id: me.id,
      departed_at: departedAt,
      expected_arrival_at: expectedAt,
      start_odometer_km: startKm,
      purpose,
      place,
      transport,
      personal_plate: personalPlate,
      other_note: otherNoteToUse,
    })
    .select('id')
    .single()
  if (error || !inserted) {
    fail(back, '외근 시작 실패: ' + (error?.message ?? '알 수 없는 오류'))
  }
  const tripId = (inserted as { id: string }).id

  if (companionIds.length > 0) {
    const { error: cErr } = await supabase.from('vehicle_trip_companions').insert(
      companionIds.map((eid) => ({ trip_id: tripId, employee_id: eid, company_id: me.company_id })),
    )
    if (cErr) {
      // 외근 자체는 유지. 동행인만 실패 안내.
      revalidatePath('/trips')
      revalidatePath('/')
      redirect('/trips?err=' + encodeURIComponent('외근은 시작됐지만 동행인 저장에 실패했습니다: ' + cErr.message))
    }
  }

  revalidatePath('/trips')
  revalidatePath('/vehicles')
  revalidatePath('/')
  redirect('/trips?ok=' + encodeURIComponent('외근을 시작했습니다'))
}

// ===== 도착 · 반납 ======================================================
//
// 폼 필드: trip_id*, arrived_time (HH:MM 오늘 KST · 비우면 지금), end_odometer_km,
//          refueled (on), refuel_amount_krw, return_location, notes
export async function endTrip(formData: FormData) {
  const tripId = String(formData.get('trip_id') ?? '').trim()
  if (!tripId) fail('/trips', '외근 id 가 없습니다.')
  const back = `/trips/${tripId}/end`

  const arrivedTime = String(formData.get('arrived_time') ?? '').trim()
  const endKm = parseIntOrNull(formData.get('end_odometer_km'))
  const refueled = formData.get('refueled') === 'on'
  const refuelAmount = refueled ? parseIntOrNull(formData.get('refuel_amount_krw')) : null
  const returnLocation = String(formData.get('return_location') ?? '').trim() || null
  const notes = String(formData.get('notes') ?? '').trim() || null

  if (endKm !== null && endKm < 0) fail(back, '도착 km 는 0 이상이어야 합니다.')
  if (refueled && refuelAmount !== null && refuelAmount < 0) fail(back, '주유 금액은 0 이상이어야 합니다.')
  if (notes && notes.length > 300) fail(back, '메모는 300자 이하로 입력하세요.')
  if (returnLocation && returnLocation.length > 200) fail(back, '반납 위치는 200자 이하로 입력하세요.')

  const { supabase, me } = await requireMe()

  const { data: tRow } = await supabase
    .from('vehicle_trips')
    .select('id, driver_employee_id, departed_at, returned_at, start_odometer_km, transport')
    .eq('id', tripId)
    .maybeSingle()
  const trip = tRow as {
    id: string
    driver_employee_id: string
    departed_at: string
    returned_at: string | null
    start_odometer_km: number | null
    transport: TransportKind
  } | null
  if (!trip) fail('/trips', '외근 기록을 찾을 수 없습니다.')
  if (trip.returned_at) fail('/trips', '이미 도착 처리된 외근입니다.')
  if (trip.driver_employee_id !== me.id && me.permission !== 'admin') {
    fail('/trips', '본인 외근만 도착 처리할 수 있습니다.')
  }
  if (endKm !== null && trip.start_odometer_km !== null && endKm < trip.start_odometer_km) {
    fail(back, '도착 km 는 출발 km 이상이어야 합니다.')
  }

  let arrivedAt = new Date().toISOString()
  if (arrivedTime) {
    const iso = kstDateTimeToIso(todayKST(), arrivedTime)
    if (!iso) fail(back, '도착시간 형식이 올바르지 않습니다.')
    arrivedAt = iso
  }
  if (arrivedAt < trip.departed_at) fail(back, '도착시간은 출발시간 이후여야 합니다.')

  const { error } = await supabase
    .from('vehicle_trips')
    .update({
      returned_at: arrivedAt,
      end_odometer_km: endKm,
      refueled,
      refuel_amount_krw: refueled ? refuelAmount : null,
      return_location: trip.transport === '업무용' ? returnLocation : null,
      notes,
    })
    .eq('id', tripId)
  if (error) fail(back, '도착 처리 실패: ' + error.message)

  revalidatePath('/trips')
  revalidatePath('/vehicles')
  revalidatePath('/')
  redirect('/trips?ok=' + encodeURIComponent('도착 처리했습니다'))
}

// 출발 후 10분 내 취소 — 0084 의 vehicle_trip_cancel RPC 재사용 (동행인은 cascade 삭제)
export async function cancelTrip(formData: FormData) {
  const tripId = String(formData.get('trip_id') ?? '').trim()
  if (!tripId) fail('/trips', '외근 id 가 없습니다.')

  const { supabase } = await requireMe()
  const { error } = await supabase.rpc('vehicle_trip_cancel', { _trip_id: tripId })
  if (error) fail('/trips', error.message)

  revalidatePath('/trips')
  revalidatePath('/vehicles')
  revalidatePath('/')
  redirect('/trips?ok=' + encodeURIComponent('외근 시작을 취소했습니다'))
}

// ===== 차계부 ===========================================================
//
// target: 'vehicle' + vehicle_id  또는  'personal' + employee_id
export async function addVehicleLog(formData: FormData) {
  const targetKind = String(formData.get('target_kind') ?? '').trim()
  const targetId = String(formData.get('target_id') ?? '').trim()
  const back = `/trips/logbook/${targetKind}/${targetId}`
  if ((targetKind !== 'vehicle' && targetKind !== 'personal') || !targetId) fail('/trips', '차계부 대상이 없습니다.')

  const kindRaw = String(formData.get('kind') ?? '').trim()
  const occurredOn = String(formData.get('occurred_on') ?? '').trim()
  const title = String(formData.get('title') ?? '').trim()
  const amount = parseIntOrNull(formData.get('amount_krw'))
  const odometer = parseIntOrNull(formData.get('odometer_km'))
  const vendor = String(formData.get('vendor') ?? '').trim() || null
  const memo = String(formData.get('memo') ?? '').trim() || null
  const nextDueKm = parseIntOrNull(formData.get('next_due_km'))
  const nextDueOn = String(formData.get('next_due_on') ?? '').trim() || null

  if (!VEHICLE_LOG_KINDS.includes(kindRaw as VehicleLogKind)) fail(back, '항목 종류를 선택하세요.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) fail(back, '일자를 입력하세요.')
  if (!title) fail(back, '내용을 입력하세요.')
  if (title.length > 100) fail(back, '내용은 100자 이하로 입력하세요.')
  if (amount !== null && amount < 0) fail(back, '금액은 0 이상이어야 합니다.')
  if (odometer !== null && odometer < 0) fail(back, 'km 는 0 이상이어야 합니다.')
  if (nextDueKm !== null && nextDueKm < 0) fail(back, '다음 정비 km 는 0 이상이어야 합니다.')
  if (nextDueOn && !/^\d{4}-\d{2}-\d{2}$/.test(nextDueOn)) fail(back, '다음 정비일 형식이 올바르지 않습니다.')
  if (vendor && vendor.length > 100) fail(back, '업체명은 100자 이하로 입력하세요.')
  if (memo && memo.length > 500) fail(back, '메모는 500자 이하로 입력하세요.')

  const { supabase, me } = await requireMe()

  if (targetKind === 'vehicle') {
    const { data: v } = await supabase.from('vehicles').select('id').eq('id', targetId).maybeSingle()
    if (!v) fail('/trips', '차량을 찾을 수 없습니다.')
  } else {
    const { data: e } = await supabase
      .from('employees')
      .select('id')
      .eq('id', targetId)
      .eq('company_id', me.company_id)
      .maybeSingle()
    if (!e) fail('/trips', '직원을 찾을 수 없습니다.')
  }

  const { error } = await supabase.from('vehicle_logs').insert({
    company_id: me.company_id,
    vehicle_id: targetKind === 'vehicle' ? targetId : null,
    personal_employee_id: targetKind === 'personal' ? targetId : null,
    kind: kindRaw,
    occurred_on: occurredOn,
    title,
    amount_krw: amount,
    odometer_km: odometer,
    vendor,
    memo,
    next_due_km: nextDueKm,
    next_due_on: nextDueOn,
    created_by: me.id,
  })
  if (error) fail(back, '기록 추가 실패: ' + error.message)

  revalidatePath(back)
  revalidatePath('/trips')
  redirect(`${back}?ok=${encodeURIComponent('차계부에 기록했습니다')}`)
}

export async function deleteVehicleLog(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  const targetKind = String(formData.get('target_kind') ?? '').trim()
  const targetId = String(formData.get('target_id') ?? '').trim()
  const back = `/trips/logbook/${targetKind}/${targetId}`
  if (!id) fail(back, '기록 id 가 없습니다.')

  const { supabase } = await requireMe()
  // RLS 가 작성자 OR admin 만 허용. 0건 삭제면 권한 없음으로 안내.
  const { data, error } = await supabase.from('vehicle_logs').delete().eq('id', id).select('id')
  if (error) fail(back, '삭제 실패: ' + error.message)
  if (!data || data.length === 0) fail(back, '본인이 작성한 기록만 삭제할 수 있습니다.')

  revalidatePath(back)
  redirect(`${back}?ok=${encodeURIComponent('기록을 삭제했습니다')}`)
}
