'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  ATTACHMENT_ALLOWED_TYPES,
  LEAVE_TYPE_META,
  LEAVE_TYPE_VALUES,
  type LeaveType,
} from '@/lib/leave'

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024 // 10MB
const ATTACHMENT_MIME_WHITELIST = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
])
const ATTACHMENT_BUCKET = 'leave-attachments'

// FormData 에서 첨부 파일 추출 + 검증. 파일 없으면 null 반환.
function extractAttachment(formData: FormData, type: LeaveType): File | null | string {
  const raw = formData.get('attachment')
  if (!(raw instanceof File) || raw.size === 0) return null
  if (!ATTACHMENT_ALLOWED_TYPES.includes(type)) {
    return '이 신청 종류에는 첨부할 수 없습니다.'
  }
  if (raw.size > ATTACHMENT_MAX_BYTES) {
    return '파일은 10MB 이하여야 합니다.'
  }
  if (!ATTACHMENT_MIME_WHITELIST.has(raw.type)) {
    return '이미지(JPG·PNG·WEBP·HEIC) 또는 PDF 만 첨부할 수 있습니다.'
  }
  return raw
}

function buildAttachmentPath(leaveRequestId: string, filename: string): string {
  const dot = filename.lastIndexOf('.')
  const ext = dot >= 0 ? filename.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : ''
  const uuid = crypto.randomUUID()
  return ext ? `${leaveRequestId}/${uuid}.${ext}` : `${leaveRequestId}/${uuid}`
}

function parseSubmitForm(formData: FormData) {
  const type = String(formData.get('type') ?? '') as LeaveType
  const startDate = String(formData.get('start_date') ?? '').trim()
  const endDateRaw = String(formData.get('end_date') ?? '').trim()
  const startTimeRaw = String(formData.get('start_time') ?? '').trim()
  const endTimeRaw = String(formData.get('end_time') ?? '').trim()
  const reason = String(formData.get('reason') ?? '').trim()
  const foremanRaw = String(formData.get('assigned_foreman_id') ?? '').trim()
  const substituteRaw = String(formData.get('substitute_employee_id') ?? '').trim()
  const isUrgent = formData.get('is_urgent') === 'on'

  return {
    type,
    start_date: startDate,
    end_date: endDateRaw || startDate,  // 단일일 입력 케이스에 대비
    start_time: startTimeRaw || null,
    end_time: endTimeRaw || null,
    reason,
    assigned_foreman_id: foremanRaw || null,
    substitute_employee_id: substituteRaw || null,
    is_urgent: isUrgent,
  }
}

function validateSubmit(p: ReturnType<typeof parseSubmitForm>): string | null {
  if (!LEAVE_TYPE_VALUES.includes(p.type)) return '신청 종류를 선택하세요.'
  if (!p.start_date) return '시작일을 선택하세요.'
  if (!p.end_date) return '종료일을 선택하세요.'
  if (p.end_date < p.start_date) return '종료일은 시작일 이후여야 합니다.'

  const meta = LEAVE_TYPE_META[p.type]
  if (!meta.multiDay && p.start_date !== p.end_date) {
    return '이 종류는 하루 단위로만 신청할 수 있습니다.'
  }
  if (meta.needsTime) {
    if (!p.start_time || !p.end_time) return '시작·종료 시간을 입력하세요.'
    if (p.end_time <= p.start_time) return '종료 시간은 시작 시간 이후여야 합니다.'
  } else {
    // 시간 입력 불가 종류는 null 강제
    p.start_time = null
    p.end_time = null
  }

  if (!p.reason) return '사유를 입력하세요.'
  if (p.reason.length > 500) return '사유는 500자 이하로 입력하세요.'
  if (!p.substitute_employee_id) return '대무자를 지정하세요.'
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

export async function submitRequest(formData: FormData) {
  const parsed = parseSubmitForm(formData)
  const errMsg = validateSubmit(parsed)
  if (errMsg) redirect('/requests/new?err=' + encodeURIComponent(errMsg))

  // 첨부 검증을 insert 전에 끝낸다 — 잘못된 파일로 신청만 들어가는 사태 방지.
  const attachment = extractAttachment(formData, parsed.type)
  if (typeof attachment === 'string') {
    redirect('/requests/new?err=' + encodeURIComponent(attachment))
  }

  const { supabase, me } = await requireEmployee()

  // assigned_foreman_id 가 본인이거나 같은 회사가 아니면 거부
  if (parsed.assigned_foreman_id) {
    if (parsed.assigned_foreman_id === me.id) {
      redirect('/requests/new?err=' + encodeURIComponent('본인을 결재자로 지정할 수 없습니다'))
    }
    const { data: f } = await supabase
      .from('employees')
      .select('id, company_id')
      .eq('id', parsed.assigned_foreman_id)
      .maybeSingle()
    const foreman = f as { id: string; company_id: string } | null
    if (!foreman || foreman.company_id !== me.company_id) {
      redirect('/requests/new?err=' + encodeURIComponent('잘못된 결재자입니다'))
    }
  }

  // substitute_employee_id 검증 — 본인 금지, 같은 회사 활성 직원만
  if (parsed.substitute_employee_id === me.id) {
    redirect('/requests/new?err=' + encodeURIComponent('본인을 대무자로 지정할 수 없습니다'))
  }
  const { data: subRow } = await supabase
    .from('employees')
    .select('id, company_id, is_active')
    .eq('id', parsed.substitute_employee_id)
    .maybeSingle()
  const substitute = subRow as { id: string; company_id: string; is_active: boolean } | null
  if (!substitute || substitute.company_id !== me.company_id) {
    redirect('/requests/new?err=' + encodeURIComponent('잘못된 대무자입니다'))
  }
  if (!substitute.is_active) {
    redirect('/requests/new?err=' + encodeURIComponent('비활성 직원은 대무자로 지정할 수 없습니다'))
  }

  // 결재자 지정 여부에 따라 시작 stage 결정
  const pendingStage = parsed.assigned_foreman_id ? 'foreman' : 'admin'

  const { data: inserted, error } = await supabase
    .from('leave_requests')
    .insert({
      company_id: me.company_id,
      employee_id: me.id,
      type: parsed.type,
      start_date: parsed.start_date,
      end_date: parsed.end_date,
      start_time: parsed.start_time,
      end_time: parsed.end_time,
      reason: parsed.reason,
      assigned_foreman_id: parsed.assigned_foreman_id,
      substitute_employee_id: parsed.substitute_employee_id,
      is_urgent: parsed.is_urgent,
      status: '대기',
      pending_stage: pendingStage,
    })
    .select('id')
    .single()

  if (error || !inserted) {
    redirect('/requests/new?err=' + encodeURIComponent('신청 실패: ' + (error?.message ?? '알 수 없음')))
  }

  await supabase.from('leave_request_approvals').insert({
    leave_request_id: inserted.id,
    actor_employee_id: me.id,
    action: '신청',
    comment: null,
  })

  // 첨부가 있으면 Storage 업로드 + path 컬럼 업데이트.
  // Storage 실패 시 신청 자체는 유지하되 상세 페이지에서 재시도 안내.
  if (attachment instanceof File) {
    const path = buildAttachmentPath(inserted.id, attachment.name)
    const { error: upErr } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .upload(path, attachment, { contentType: attachment.type, upsert: false })
    if (upErr) {
      revalidatePath('/requests')
      revalidatePath('/')
      redirect(`/requests/${inserted.id}?err=` + encodeURIComponent('신청은 접수됐지만 첨부 업로드에 실패했습니다: ' + upErr.message))
    }
    await supabase
      .from('leave_requests')
      .update({ attachment_path: path, attachment_filename: attachment.name })
      .eq('id', inserted.id)
  }

  revalidatePath('/requests')
  revalidatePath('/approvals')
  revalidatePath('/')
  redirect('/requests?ok=' + encodeURIComponent('신청을 접수했습니다'))
}

// 대기 중 첨부 교체. 새 파일을 받아 기존 path 가 있으면 삭제 → 새 파일 업로드 → 컬럼 갱신.
export async function replaceAttachment(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) redirect('/requests?err=' + encodeURIComponent('신청 id 가 없습니다'))

  const { supabase, me } = await requireEmployee()

  const { data: row } = await supabase
    .from('leave_requests')
    .select('id, employee_id, type, status, attachment_path')
    .eq('id', id)
    .maybeSingle()
  const lr = row as
    | { id: string; employee_id: string; type: LeaveType; status: string; attachment_path: string | null }
    | null

  if (!lr) redirect('/requests?err=' + encodeURIComponent('신청을 찾을 수 없습니다'))
  if (lr.employee_id !== me.id) {
    redirect(`/requests/${id}?err=` + encodeURIComponent('본인 신청만 수정할 수 있습니다'))
  }
  if (lr.status !== '대기') {
    redirect(`/requests/${id}?err=` + encodeURIComponent('대기 중인 신청만 첨부를 바꿀 수 있습니다'))
  }

  const attachment = extractAttachment(formData, lr.type)
  if (typeof attachment === 'string') {
    redirect(`/requests/${id}?err=` + encodeURIComponent(attachment))
  }
  if (!(attachment instanceof File)) {
    redirect(`/requests/${id}?err=` + encodeURIComponent('파일을 선택하세요'))
  }

  const path = buildAttachmentPath(lr.id, attachment.name)
  const { error: upErr } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, attachment, { contentType: attachment.type, upsert: false })
  if (upErr) {
    redirect(`/requests/${id}?err=` + encodeURIComponent('업로드 실패: ' + upErr.message))
  }

  if (lr.attachment_path && lr.attachment_path !== path) {
    // 이전 파일 정리. 실패해도 본문 흐름은 계속 (orphan 은 v2 에서 정기 청소).
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([lr.attachment_path])
  }

  await supabase
    .from('leave_requests')
    .update({ attachment_path: path, attachment_filename: attachment.name })
    .eq('id', id)

  revalidatePath(`/requests/${id}`)
  revalidatePath('/requests')
  redirect(`/requests/${id}?ok=` + encodeURIComponent('첨부파일을 교체했습니다'))
}

// 대기 중 첨부 삭제.
export async function removeAttachment(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) redirect('/requests?err=' + encodeURIComponent('신청 id 가 없습니다'))

  const { supabase, me } = await requireEmployee()

  const { data: row } = await supabase
    .from('leave_requests')
    .select('id, employee_id, status, attachment_path')
    .eq('id', id)
    .maybeSingle()
  const lr = row as
    | { id: string; employee_id: string; status: string; attachment_path: string | null }
    | null

  if (!lr) redirect('/requests?err=' + encodeURIComponent('신청을 찾을 수 없습니다'))
  if (lr.employee_id !== me.id) {
    redirect(`/requests/${id}?err=` + encodeURIComponent('본인 신청만 수정할 수 있습니다'))
  }
  if (lr.status !== '대기') {
    redirect(`/requests/${id}?err=` + encodeURIComponent('대기 중인 신청만 첨부를 바꿀 수 있습니다'))
  }
  if (!lr.attachment_path) {
    redirect(`/requests/${id}?err=` + encodeURIComponent('삭제할 첨부가 없습니다'))
  }

  await supabase.storage.from(ATTACHMENT_BUCKET).remove([lr.attachment_path])
  await supabase
    .from('leave_requests')
    .update({ attachment_path: null, attachment_filename: null })
    .eq('id', id)

  revalidatePath(`/requests/${id}`)
  revalidatePath('/requests')
  redirect(`/requests/${id}?ok=` + encodeURIComponent('첨부파일을 삭제했습니다'))
}

// 다운로드 — 신청 상세/결재함 양쪽에서 사용. signedUrl 5분짜리.
// RLS 가 권한 분기를 담당 (본인 / assigned_foreman / 회사 admin·ceo).
export async function getAttachmentUrl(leaveRequestId: string): Promise<{ url: string; filename: string } | null> {
  const supabase = await createClient()
  const { data: row } = await supabase
    .from('leave_requests')
    .select('attachment_path, attachment_filename')
    .eq('id', leaveRequestId)
    .maybeSingle()
  const lr = row as { attachment_path: string | null; attachment_filename: string | null } | null
  if (!lr?.attachment_path) return null
  const { data, error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(lr.attachment_path, 60 * 5, { download: lr.attachment_filename ?? undefined })
  if (error || !data?.signedUrl) return null
  return { url: data.signedUrl, filename: lr.attachment_filename ?? '첨부파일' }
}

export async function cancelRequest(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) redirect('/requests?err=' + encodeURIComponent('신청 id 가 없습니다'))

  const { supabase, me } = await requireEmployee()

  const { data: row } = await supabase
    .from('leave_requests')
    .select('id, employee_id, status')
    .eq('id', id)
    .maybeSingle()
  const lr = row as { id: string; employee_id: string; status: string } | null

  if (!lr) redirect('/requests?err=' + encodeURIComponent('신청을 찾을 수 없습니다'))
  if (lr.employee_id !== me.id) {
    redirect('/requests?err=' + encodeURIComponent('본인 신청만 취소할 수 있습니다'))
  }
  if (lr.status !== '대기') {
    redirect(`/requests/${id}?err=` + encodeURIComponent('대기 중인 신청만 취소할 수 있습니다'))
  }

  const now = new Date().toISOString()
  const { error: upErr } = await supabase
    .from('leave_requests')
    .update({
      status: '취소',
      pending_stage: null,
      final_actor_id: me.id,
      final_acted_at: now,
    })
    .eq('id', id)

  if (upErr) {
    redirect(`/requests/${id}?err=` + encodeURIComponent('취소 실패: ' + upErr.message))
  }

  await supabase.from('leave_request_approvals').insert({
    leave_request_id: id,
    actor_employee_id: me.id,
    action: '취소',
    comment: null,
  })

  revalidatePath('/requests')
  revalidatePath(`/requests/${id}`)
  revalidatePath('/approvals')
  revalidatePath('/')
  redirect(`/requests/${id}?ok=` + encodeURIComponent('신청을 취소했습니다'))
}
