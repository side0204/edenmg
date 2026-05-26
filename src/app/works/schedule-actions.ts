'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// 작업 일정 변경 요청 (mig 0083). owner 2026-05-26.
//   배정된 작업자가 캘린더에서 자기 작업을 선택해 일정 변경을 요청.
//   작업 담당자(works.assignee_employee_id) 가 home/works 페이지의 알림 배지로
//   확인하고 승인·반려.
//   append-only — 처리(approve/reject) 후 row 는 그대로 남아 히스토리.

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

async function requireMember() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, permission, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | { id: string; company_id: string; permission: Permission; is_active: boolean }
    | null
  if (!me || !me.is_active) {
    redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  }
  return { supabase, me }
}

function parseDate(v: string | null | undefined): string | null {
  if (!v) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}

export async function createScheduleChangeRequest(input: {
  work_id: string
  requested_start: string | null
  requested_end: string | null
  reason: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const workId = String(input.work_id ?? '').trim()
  const reason = String(input.reason ?? '').trim()
  if (!workId) return { ok: false, error: '작업 정보가 없습니다' }
  if (!reason) return { ok: false, error: '변경 사유를 입력하세요' }
  if (reason.length > 1000) return { ok: false, error: '사유는 1000자 이하로 입력하세요' }

  const start = parseDate(input.requested_start)
  const end = parseDate(input.requested_end)
  if (!start && !end) {
    return { ok: false, error: '변경 희망 일자를 하나 이상 입력하세요' }
  }
  // 정렬 — start > end 면 swap
  let s = start
  let e = end ?? start
  if (s && e && s > e) {
    const t = s
    s = e
    e = t
  }

  const { supabase, me } = await requireMember()

  // 작업이 본인 회사 것인지 검증 (RLS 가 한 번 더 막아주지만 친절 메시지)
  const { data: w } = await supabase
    .from('works')
    .select('id, company_id')
    .eq('id', workId)
    .maybeSingle()
  if (!w || (w as { company_id: string }).company_id !== me.company_id) {
    return { ok: false, error: '작업을 찾을 수 없거나 권한이 없습니다' }
  }

  const { error } = await supabase.from('work_schedule_change_requests').insert({
    work_id: workId,
    requested_by: me.id,
    requested_start: s,
    requested_end: e,
    reason,
    status: 'pending',
  })
  if (error) return { ok: false, error: '요청 등록 실패: ' + error.message }

  revalidatePath('/works')
  revalidatePath('/works/schedule')
  return { ok: true }
}

async function respondScheduleChangeRequest(
  requestId: string,
  decision: 'approved' | 'rejected',
  note: string | null,
  applyDates: boolean, // true 면 승인 시 works 의 start_date/end_date 갱신
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!requestId) return { ok: false, error: '요청 id 가 없습니다' }
  const { supabase, me } = await requireMember()

  // 권한: 작업 담당자 또는 admin (RLS UPDATE 정책과 동일)
  const { data: req } = await supabase
    .from('work_schedule_change_requests')
    .select('id, work_id, requested_start, requested_end, status')
    .eq('id', requestId)
    .maybeSingle()
  if (!req) return { ok: false, error: '요청을 찾을 수 없습니다' }
  type Req = {
    id: string
    work_id: string
    requested_start: string | null
    requested_end: string | null
    status: string
  }
  const r = req as Req
  if (r.status !== 'pending') return { ok: false, error: '이미 처리된 요청입니다' }

  // RLS 가 회사 스코프·assignee/admin 검증 — update 실행 후 결과로 판단
  const { error } = await supabase
    .from('work_schedule_change_requests')
    .update({
      status: decision,
      responded_by: me.id,
      responded_at: new Date().toISOString(),
      response_note: note ?? null,
    })
    .eq('id', requestId)
  if (error) return { ok: false, error: '처리 실패: ' + error.message }

  // 승인 시 작업 일정 동기화
  if (decision === 'approved' && applyDates) {
    const update: Record<string, string | null> = {}
    if (r.requested_start) update.start_date = r.requested_start
    if (r.requested_end) update.end_date = r.requested_end
    if (Object.keys(update).length > 0) {
      await supabase.from('works').update(update).eq('id', r.work_id)
    }
  }

  revalidatePath('/works')
  revalidatePath('/works/schedule')
  revalidatePath('/')
  return { ok: true }
}

export async function approveScheduleChangeRequest(input: {
  request_id: string
  note?: string | null
  apply_dates?: boolean
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return respondScheduleChangeRequest(
    String(input.request_id ?? '').trim(),
    'approved',
    input.note ?? null,
    input.apply_dates !== false, // 기본 true — 승인 시 작업 날짜 동기화
  )
}

export async function rejectScheduleChangeRequest(input: {
  request_id: string
  note?: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return respondScheduleChangeRequest(
    String(input.request_id ?? '').trim(),
    'rejected',
    input.note ?? null,
    false,
  )
}
