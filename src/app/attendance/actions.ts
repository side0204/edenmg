'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// 한국 시간 기준 오늘 (YYYY-MM-DD) — 서버가 UTC 든 어디든 일관되게.
function todayInSeoul(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
}

// 폼 → 좌표·사유 파싱. 좌표는 client 가 navigator.geolocation 으로 채워서 보냄.
function parseGpsForm(formData: FormData) {
  const latStr = String(formData.get('lat') ?? '').trim()
  const lngStr = String(formData.get('lng') ?? '').trim()
  const lat = latStr === '' ? null : Number(latStr)
  const lng = lngStr === '' ? null : Number(lngStr)

  const siteIdRaw = String(formData.get('site_id') ?? '').trim()
  const site_id = siteIdRaw === '' ? null : siteIdRaw

  const reasonRaw = String(formData.get('outside_reason') ?? '').trim()
  const outside_reason = reasonRaw === '' ? null : reasonRaw

  return { lat, lng, site_id, outside_reason }
}

function validateGps(parsed: ReturnType<typeof parseGpsForm>): string | null {
  if (parsed.lat === null || parsed.lng === null || Number.isNaN(parsed.lat) || Number.isNaN(parsed.lng)) {
    return 'GPS 좌표를 가져오지 못했습니다. 브라우저 위치 권한을 확인하고 다시 시도하세요.'
  }
  if (parsed.lat < -90 || parsed.lat > 90 || parsed.lng < -180 || parsed.lng > 180) {
    return '좌표 값이 범위를 벗어났습니다.'
  }
  // 매칭된 현장 없으면 사유 입력 강제.
  if (parsed.site_id === null && !parsed.outside_reason) {
    return '반경 안의 활성 현장이 없습니다. 사유를 입력하세요.'
  }
  return null
}

async function requireEmployee() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const me = meRow as { id: string; company_id: string; is_active: boolean } | null
  if (!me || !me.is_active) {
    redirect('/attendance?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  }
  return { supabase, me }
}

export async function checkIn(formData: FormData) {
  const parsed = parseGpsForm(formData)
  const errMsg = validateGps(parsed)
  if (errMsg) redirect('/attendance?err=' + encodeURIComponent(errMsg))

  const { supabase, me } = await requireEmployee()
  const workDate = todayInSeoul()

  // 이미 오늘 row 가 있으면 출근 시각이 비어있을 때만 다시 채우고, 아니면 차단.
  const { data: existingRow } = await supabase
    .from('attendances')
    .select('id, check_in_at')
    .eq('employee_id', me.id)
    .eq('work_date', workDate)
    .maybeSingle()
  const existing = existingRow as { id: string; check_in_at: string | null } | null

  if (existing && existing.check_in_at) {
    redirect('/attendance?err=' + encodeURIComponent('이미 출근 처리됐습니다'))
  }

  const payload = {
    company_id: me.company_id,
    employee_id: me.id,
    site_id: parsed.site_id,
    work_date: workDate,
    check_in_at: new Date().toISOString(),
    check_in_lat: parsed.lat,
    check_in_lng: parsed.lng,
    check_in_outside_reason: parsed.outside_reason,
  }

  const { error } = existing
    ? await supabase.from('attendances').update(payload).eq('id', existing.id)
    : await supabase.from('attendances').insert(payload)

  if (error) {
    redirect('/attendance?err=' + encodeURIComponent('출근 기록 실패: ' + error.message))
  }

  revalidatePath('/attendance')
  revalidatePath('/')
  redirect('/attendance?ok=' + encodeURIComponent('출근 처리됐습니다'))
}

export async function checkOut(formData: FormData) {
  const parsed = parseGpsForm(formData)
  const errMsg = validateGps(parsed)
  if (errMsg) redirect('/attendance?err=' + encodeURIComponent(errMsg))

  const { supabase, me } = await requireEmployee()
  const workDate = todayInSeoul()

  const { data: row } = await supabase
    .from('attendances')
    .select('id, check_in_at, check_out_at')
    .eq('employee_id', me.id)
    .eq('work_date', workDate)
    .maybeSingle()
  const existing = row as { id: string; check_in_at: string | null; check_out_at: string | null } | null

  if (!existing || !existing.check_in_at) {
    redirect('/attendance?err=' + encodeURIComponent('먼저 출근 처리부터 해주세요'))
  }
  if (existing.check_out_at) {
    redirect('/attendance?err=' + encodeURIComponent('이미 퇴근 처리됐습니다'))
  }

  const { error } = await supabase
    .from('attendances')
    .update({
      check_out_at: new Date().toISOString(),
      check_out_lat: parsed.lat,
      check_out_lng: parsed.lng,
      check_out_outside_reason: parsed.outside_reason,
    })
    .eq('id', existing.id)

  if (error) {
    redirect('/attendance?err=' + encodeURIComponent('퇴근 기록 실패: ' + error.message))
  }

  revalidatePath('/attendance')
  revalidatePath('/')
  redirect('/attendance?ok=' + encodeURIComponent('퇴근 처리됐습니다. 수고하셨습니다'))
}
