'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  REPORT_PROGRESS_VALUES,
  type WorkReportProgress,
} from '@/lib/work'

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

type Me = {
  id: string
  company_id: string
  permission: Permission
  is_active: boolean
}

async function requireUser(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>
  me: Me
}> {
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
  const me = meRow as Me | null
  if (!me || !me.is_active) {
    redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  }
  return { supabase, me }
}

// 일보 작성 권한 확인 — 같은 회사 작업 + (배정자 OR admin/ceo)
async function ensureCanAuthor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  me: Me,
  workId: string,
): Promise<{ assignee_employee_id: string | null }> {
  const { data: workRow } = await supabase
    .from('works')
    .select('id, company_id, assignee_employee_id')
    .eq('id', workId)
    .maybeSingle()
  const work = workRow as
    | { id: string; company_id: string; assignee_employee_id: string | null }
    | null
  if (!work || work.company_id !== me.company_id) {
    redirect('/works?err=' + encodeURIComponent('잘못된 작업입니다'))
  }

  const isAdmin = me.permission === 'admin'
  if (!isAdmin) {
    const { data: assigned } = await supabase
      .from('work_assignments')
      .select('id')
      .eq('work_id', workId)
      .eq('employee_id', me.id)
      .limit(1)
    if (!assigned || assigned.length === 0) {
      redirect(`/works/${workId}?err=` + encodeURIComponent('이 작업에 배정되지 않았습니다'))
    }
  }

  return { assignee_employee_id: work.assignee_employee_id }
}

function parseReportForm(formData: FormData) {
  const work_id = String(formData.get('work_id') ?? '').trim()
  const report_date = String(formData.get('report_date') ?? '').trim()
  const content = String(formData.get('content') ?? '').trim()
  const materials_used = String(formData.get('materials_used') ?? '').trim() || null
  const progress_raw = String(formData.get('progress') ?? '').trim()
  const progress = (REPORT_PROGRESS_VALUES.includes(progress_raw as WorkReportProgress)
    ? (progress_raw as WorkReportProgress)
    : '진행중') as WorkReportProgress
  const notes = String(formData.get('notes') ?? '').trim() || null

  return { work_id, report_date, content, materials_used, progress, notes }
}

function validateReport(p: ReturnType<typeof parseReportForm>): string | null {
  if (!p.work_id) return '작업 id 가 없습니다.'
  if (!p.report_date) return '일자를 선택하세요.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.report_date)) return '일자 형식이 올바르지 않습니다.'
  if (!p.content) return '작업내역을 입력하세요.'
  if (p.content.length > 2000) return '작업내역은 2000자 이하로 입력하세요.'
  if (p.materials_used && p.materials_used.length > 1000) {
    return '사용 자재는 1000자 이하로 입력하세요.'
  }
  if (p.notes && p.notes.length > 1000) return '특이사항은 1000자 이하로 입력하세요.'
  return null
}

// ===== 일보 CRUD ========================================================

export async function submitReport(formData: FormData) {
  const parsed = parseReportForm(formData)
  const workId = parsed.work_id
  const errMsg = validateReport(parsed)
  if (errMsg) {
    redirect(`/works/${workId}/reports/new?err=` + encodeURIComponent(errMsg))
  }

  const { supabase, me } = await requireUser()
  await ensureCanAuthor(supabase, me, workId)

  const { data: inserted, error } = await supabase
    .from('work_daily_reports')
    .insert({
      work_id: workId,
      author_employee_id: me.id,
      report_date: parsed.report_date,
      content: parsed.content,
      materials_used: parsed.materials_used,
      progress: parsed.progress,
      notes: parsed.notes,
    })
    .select('id')
    .single()

  if (error || !inserted) {
    const msg = error?.message ?? '알 수 없는 오류'
    const friendly = msg.includes('duplicate')
      ? '같은 날짜에 이미 작성한 일보가 있습니다'
      : '저장 실패: ' + msg
    redirect(`/works/${workId}/reports/new?err=` + encodeURIComponent(friendly))
  }

  revalidatePath(`/works/${workId}`)
  redirect(
    `/works/${workId}/reports/${inserted.id}?ok=` + encodeURIComponent('일보를 제출했습니다'),
  )
}

export async function updateReport(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) redirect('/works?err=' + encodeURIComponent('일보 id 가 없습니다'))

  const parsed = parseReportForm(formData)
  const workId = parsed.work_id
  const errMsg = validateReport(parsed)
  if (errMsg) {
    redirect(`/works/${workId}/reports/${id}?err=` + encodeURIComponent(errMsg))
  }

  const { supabase, me } = await requireUser()

  // 본인 작성 + 상태=대기 확인
  const { data: rowData } = await supabase
    .from('work_daily_reports')
    .select('id, author_employee_id, status')
    .eq('id', id)
    .maybeSingle()
  const row = rowData as
    | { id: string; author_employee_id: string; status: '대기' | '승인' | '반려' }
    | null
  if (!row) {
    redirect(`/works/${workId}?err=` + encodeURIComponent('일보를 찾을 수 없습니다'))
  }
  if (row.author_employee_id !== me.id) {
    redirect(
      `/works/${workId}/reports/${id}?err=` + encodeURIComponent('본인 작성 일보만 수정할 수 있습니다'),
    )
  }
  if (row.status !== '대기') {
    redirect(
      `/works/${workId}/reports/${id}?err=` +
        encodeURIComponent('결재가 시작된 일보는 수정할 수 없습니다'),
    )
  }

  const { error } = await supabase
    .from('work_daily_reports')
    .update({
      content: parsed.content,
      materials_used: parsed.materials_used,
      progress: parsed.progress,
      notes: parsed.notes,
    })
    .eq('id', id)

  if (error) {
    redirect(
      `/works/${workId}/reports/${id}?err=` + encodeURIComponent('수정 실패: ' + error.message),
    )
  }

  revalidatePath(`/works/${workId}`)
  revalidatePath(`/works/${workId}/reports/${id}`)
  redirect(
    `/works/${workId}/reports/${id}?ok=` + encodeURIComponent('일보를 수정했습니다'),
  )
}

// 담당자 결재 — 승인 / 반려
async function reviewReport(formData: FormData, decision: '승인' | '반려') {
  const id = String(formData.get('id') ?? '').trim()
  const workId = String(formData.get('work_id') ?? '').trim()
  const comment = String(formData.get('review_comment') ?? '').trim() || null
  if (!id || !workId) redirect('/works?err=' + encodeURIComponent('일보 id 가 없습니다'))

  if (decision === '반려' && !comment) {
    redirect(
      `/works/${workId}/reports/${id}?err=` + encodeURIComponent('반려 시 사유를 입력하세요'),
    )
  }

  const { supabase, me } = await requireUser()

  const { data: rowData } = await supabase
    .from('work_daily_reports')
    .select('id, work_id, status')
    .eq('id', id)
    .maybeSingle()
  const row = rowData as
    | { id: string; work_id: string; status: '대기' | '승인' | '반려' }
    | null
  if (!row || row.work_id !== workId) {
    redirect(`/works/${workId}?err=` + encodeURIComponent('일보를 찾을 수 없습니다'))
  }
  if (row.status !== '대기') {
    redirect(
      `/works/${workId}/reports/${id}?err=` + encodeURIComponent('이미 결재된 일보입니다'),
    )
  }

  // 담당자 OR admin/ceo 만 가능
  const isAdmin = me.permission === 'admin'
  if (!isAdmin) {
    const { data: workRow } = await supabase
      .from('works')
      .select('id, assignee_employee_id')
      .eq('id', workId)
      .maybeSingle()
    const work = workRow as { id: string; assignee_employee_id: string | null } | null
    if (!work || work.assignee_employee_id !== me.id) {
      redirect(
        `/works/${workId}/reports/${id}?err=` + encodeURIComponent('담당자만 결재할 수 있습니다'),
      )
    }
  }

  const { error } = await supabase
    .from('work_daily_reports')
    .update({
      status: decision,
      reviewed_by: me.id,
      reviewed_at: new Date().toISOString(),
      review_comment: comment,
    })
    .eq('id', id)

  if (error) {
    redirect(
      `/works/${workId}/reports/${id}?err=` +
        encodeURIComponent('결재 실패: ' + error.message),
    )
  }

  revalidatePath(`/works/${workId}`)
  revalidatePath(`/works/${workId}/reports/${id}`)
  const okMsg = decision === '승인' ? '일보를 승인했습니다' : '일보를 반려했습니다'
  redirect(`/works/${workId}/reports/${id}?ok=` + encodeURIComponent(okMsg))
}

export async function approveReport(formData: FormData) {
  return reviewReport(formData, '승인')
}

export async function rejectReport(formData: FormData) {
  return reviewReport(formData, '반려')
}
