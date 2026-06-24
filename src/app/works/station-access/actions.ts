'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type Me = {
  id: string
  name: string
  company_id: string
  permission: string
  phone: string | null
  is_active: boolean
}

async function loadMe() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: meRow } = await supabase
    .from('employees')
    .select('id, name, company_id, permission, phone, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as Me | null
  if (!me) redirect('/?err=' + encodeURIComponent('직원 정보 없음'))
  if (!me!.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  return { supabase, me: me! }
}

const BASE = '/works/station-access'

type AccessRow = {
  id: string
  requested_by: string | null
  visitor_name: string
  station_name: string
  access_start_date: string
  access_end_date: string
  status: string
}

// datetime-local 'YYYY-MM-DDTHH:mm' → KST timestamptz 문자열.
const DT_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
function toKstTimestamp(local: string): string | null {
  if (!DT_LOCAL.test(local)) return null
  return `${local}:00+09:00`
}

// 앱 → Power Automate 전송 (실패해도 요청 자체는 보존 → 상세에서 재시도).
// configured=false 면 웹훅 URL 미설정 = 무료(폴링) 방식 — Power Automate Desktop 이
// 주기적으로 가져가므로 정상. 이때는 그냥 '대기' 로 두면 됨.
async function triggerPowerAutomate(
  req: AccessRow,
): Promise<{ configured: boolean; ok: boolean; reason?: string }> {
  const url = process.env.STATION_ACCESS_WEBHOOK_URL
  if (!url) return { configured: false, ok: false }

  const payload = {
    request_id: req.id,
    requester_name: req.visitor_name, // PC 엑셀 매칭 키 = 이름
    station_name: req.station_name,
    access_start: req.access_start_date,
    access_end: req.access_end_date,
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-eden-secret': process.env.STATION_ACCESS_WEBHOOK_SECRET ?? '',
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) return { configured: true, ok: false, reason: `자동화 응답 ${res.status}` }
    return { configured: true, ok: true }
  } catch (e) {
    return {
      configured: true,
      ok: false,
      reason: '자동화 전송 실패: ' + (e instanceof Error ? e.message : '네트워크 오류'),
    }
  }
}

// 출입요청 생성 → 즉시 Power Automate 로 전송
export async function createAccessRequest(formData: FormData) {
  const { supabase, me } = await loadMe()

  const stationId = String(formData.get('station_id') ?? '').trim()
  const startLocal = String(formData.get('access_start_date') ?? '').trim()
  const endLocal = String(formData.get('access_end_date') ?? '').trim() || startLocal

  if (!stationId) redirect(`${BASE}/new?err=` + encodeURIComponent('국사를 선택하세요'))
  if (!startLocal) redirect(`${BASE}/new?err=` + encodeURIComponent('출입 시작일시를 입력하세요'))
  if (endLocal < startLocal) redirect(`${BASE}/new?err=` + encodeURIComponent('종료일시가 시작일시보다 빠릅니다'))

  const start = toKstTimestamp(startLocal)
  const end = toKstTimestamp(endLocal)
  if (!start || !end) redirect(`${BASE}/new?err=` + encodeURIComponent('출입일시 형식이 올바르지 않습니다'))

  // 국사 마스터 조회 (회사 스코프) → 이름 스냅샷
  const { data: stationRow } = await supabase
    .from('field_stations')
    .select('id, name, company_id')
    .eq('id', stationId)
    .maybeSingle()
  const station = stationRow as { id: string; name: string; company_id: string } | null
  if (!station || station.company_id !== me.company_id) {
    redirect(`${BASE}/new?err=` + encodeURIComponent('국사를 찾을 수 없습니다'))
  }

  const { data: inserted, error } = await supabase
    .from('station_access_requests')
    .insert({
      company_id: me.company_id,
      station_id: station!.id,
      station_name: station!.name,
      access_start_date: start,
      access_end_date: end,
      requested_by: me.id,
      visitor_name: me.name,
      visitor_phone: me.phone,
      status: '대기',
    })
    .select('id, requested_by, visitor_name, station_name, access_start_date, access_end_date, status')
    .single()

  if (error || !inserted) {
    redirect(`${BASE}/new?err=` + encodeURIComponent('요청 저장 실패: ' + (error?.message ?? '')))
  }

  const sent = await triggerPowerAutomate(inserted as AccessRow)

  revalidatePath(BASE)
  if (!sent.configured) {
    // 무료(폴링) 방식 — 저장만 하면 자동화 PC 가 가져감
    redirect(`${BASE}/${inserted!.id}?ok=` + encodeURIComponent('출입요청을 저장했습니다 · 자동등록 대기 중'))
  }
  if (sent.ok) {
    redirect(`${BASE}/${inserted!.id}?ok=` + encodeURIComponent('출입요청을 전송했습니다'))
  }
  redirect(
    `${BASE}/${inserted!.id}?err=` +
      encodeURIComponent(`요청은 저장됐지만 ${sent.reason}. 상세에서 재시도하세요`),
  )
}

// 재시도 — 실패·취소·대기 요청을 다시 전송 (상태 대기로 초기화)
export async function retryAccessRequest(formData: FormData) {
  const { supabase, me } = await loadMe()
  const id = String(formData.get('id') ?? '').trim()
  if (!id) redirect(`${BASE}?err=` + encodeURIComponent('요청 id 가 없습니다'))

  const { data: row } = await supabase
    .from('station_access_requests')
    .select('id, requested_by, visitor_name, station_name, access_start_date, access_end_date, status')
    .eq('id', id)
    .maybeSingle()
  const req = row as AccessRow | null
  if (!req) redirect(`${BASE}?err=` + encodeURIComponent('요청을 찾을 수 없습니다'))
  if (req!.status === '등록중') {
    redirect(`${BASE}/${id}?err=` + encodeURIComponent('이미 등록 진행 중입니다'))
  }

  // 상태 대기로 초기화 (RLS 가 본인/admin 만 허용)
  const { error: updErr } = await supabase
    .from('station_access_requests')
    .update({ status: '대기', rpa_result: null, rpa_completed_at: null })
    .eq('id', id)
  if (updErr) {
    redirect(`${BASE}/${id}?err=` + encodeURIComponent('재시도 실패: ' + updErr.message))
  }

  const sent = await triggerPowerAutomate({ ...req!, status: '대기' })
  revalidatePath(BASE)
  revalidatePath(`${BASE}/${id}`)
  if (!sent.configured) {
    // 무료(폴링) 방식 — 대기로 되돌렸으니 다시 가져감
    redirect(`${BASE}/${id}?ok=` + encodeURIComponent('대기 상태로 되돌렸습니다 · 자동등록 대기 중'))
  }
  if (sent.ok) {
    redirect(`${BASE}/${id}?ok=` + encodeURIComponent('다시 전송했습니다'))
  }
  redirect(`${BASE}/${id}?err=` + encodeURIComponent(sent.reason ?? '전송 실패'))
}

// 취소 — 완료된 건은 취소 불가 (외부 등록 이미 됨)
export async function cancelAccessRequest(formData: FormData) {
  const { supabase } = await loadMe()
  const id = String(formData.get('id') ?? '').trim()
  if (!id) redirect(`${BASE}?err=` + encodeURIComponent('요청 id 가 없습니다'))

  const { data: row } = await supabase
    .from('station_access_requests')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()
  const req = row as { id: string; status: string } | null
  if (!req) redirect(`${BASE}?err=` + encodeURIComponent('요청을 찾을 수 없습니다'))
  if (req!.status === '완료') {
    redirect(`${BASE}/${id}?err=` + encodeURIComponent('완료된 요청은 취소할 수 없습니다'))
  }

  const { error } = await supabase
    .from('station_access_requests')
    .update({ status: '취소' })
    .eq('id', id)
  if (error) {
    redirect(`${BASE}/${id}?err=` + encodeURIComponent('취소 실패: ' + error.message))
  }

  revalidatePath(BASE)
  revalidatePath(`${BASE}/${id}`)
  redirect(`${BASE}/${id}?ok=` + encodeURIComponent('출입요청을 취소했습니다'))
}
