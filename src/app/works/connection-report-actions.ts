'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  CABLE_SPEC_VALUES,
  CONNECTION_TASK_TYPE_VALUES,
  parseLineNumbers,
  type CableSpec,
  type ConnectionTaskType,
  type WorkReportProgress,
} from '@/lib/connection'

type Permission = 'worker' | 'foreman' | 'admin' | 'ceo'

type Me = {
  id: string
  company_id: string
  permission: Permission
  is_active: boolean
}

async function requireUser() {
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

async function ensureCanAuthor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  me: Me,
  workId: string,
) {
  const { data: workRow } = await supabase
    .from('works')
    .select('id, company_id')
    .eq('id', workId)
    .maybeSingle()
  const work = workRow as { id: string; company_id: string } | null
  if (!work || work.company_id !== me.company_id) {
    redirect('/works?err=' + encodeURIComponent('잘못된 작업입니다'))
  }
  const isAdmin = me.permission === 'admin' || me.permission === 'ceo'
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
}

// ===== 일보 작성 ========================================================

export async function submitConnectionReport(formData: FormData) {
  const workId = String(formData.get('work_id') ?? '').trim()
  const reportDate = String(formData.get('report_date') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim() || null
  const progressRaw = String(formData.get('progress') ?? '').trim()
  const progress = (['시작전', '진행중', '완료'].includes(progressRaw)
    ? progressRaw
    : '진행중') as WorkReportProgress

  if (!workId) redirect('/works?err=' + encodeURIComponent('작업 id 가 없습니다'))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    redirect(
      `/works/${workId}/connection-reports/new?err=` + encodeURIComponent('일자 형식이 올바르지 않습니다'),
    )
  }

  // segments: form fields cable_spec_<nodeId>, line_numbers_<nodeId>, completed_<nodeId>, segment_notes_<nodeId>
  const segmentInputs: Array<{
    plan_node_id: string
    cable_spec: CableSpec
    line_numbers: string
    is_completed: boolean
    segment_notes: string | null
  }> = []
  for (const [key, val] of formData.entries()) {
    if (typeof val !== 'string') continue
    const match = key.match(/^line_numbers_(.+)$/)
    if (!match) continue
    const nodeId = match[1]
    const lineNumbers = String(val).trim()
    if (!lineNumbers) continue // 빈 줄은 skip (그 cable 미작업)
    const cableSpecRaw = String(formData.get(`cable_spec_${nodeId}`) ?? '').trim() as CableSpec
    if (!CABLE_SPEC_VALUES.includes(cableSpecRaw)) {
      redirect(
        `/works/${workId}/connection-reports/new?err=` +
          encodeURIComponent('케이블 규격이 잘못되었습니다'),
      )
    }
    // 선번 파싱·중복 검증
    const r = parseLineNumbers(lineNumbers)
    if (!r.ok) {
      redirect(
        `/works/${workId}/connection-reports/new?err=` +
          encodeURIComponent(`선번 오류: ${r.error}`),
      )
    }
    const isCompleted = String(formData.get(`completed_${nodeId}`) ?? '') === '1'
    const segmentNotes = String(formData.get(`segment_notes_${nodeId}`) ?? '').trim() || null
    segmentInputs.push({
      plan_node_id: nodeId,
      cable_spec: cableSpecRaw,
      line_numbers: lineNumbers,
      is_completed: isCompleted,
      segment_notes: segmentNotes,
    })
  }

  if (segmentInputs.length === 0) {
    redirect(
      `/works/${workId}/connection-reports/new?err=` +
        encodeURIComponent('최소 1개 cable 에 케이블 규격·선번을 입력하세요'),
    )
  }

  const { supabase, me } = await requireUser()
  await ensureCanAuthor(supabase, me, workId)

  // 일보 insert
  const { data: report, error: rErr } = await supabase
    .from('connection_reports')
    .insert({
      work_id: workId,
      author_employee_id: me.id,
      report_date: reportDate,
      notes,
      progress,
    })
    .select('id')
    .single()
  if (rErr || !report) {
    const msg = rErr?.message ?? ''
    const friendly = msg.includes('duplicate')
      ? '같은 날짜에 이미 작성한 일보가 있습니다'
      : '저장 실패: ' + msg
    redirect(`/works/${workId}/connection-reports/new?err=` + encodeURIComponent(friendly))
  }

  // segments insert
  const segmentPayload = segmentInputs.map((s) => ({ ...s, report_id: report.id }))
  const { error: sErr } = await supabase
    .from('connection_report_segments')
    .insert(segmentPayload)
  if (sErr) {
    redirect(
      `/works/${workId}/connection-reports/${report.id}?err=` +
        encodeURIComponent('일보는 생성됐지만 segment 저장 실패: ' + sErr.message),
    )
  }

  revalidatePath(`/works/${workId}`)
  redirect(
    `/works/${workId}/connection-reports/${report.id}?ok=` +
      encodeURIComponent('접속일보를 제출했습니다. 노드별 공종·자재를 추가하세요'),
  )
}

// ===== 일보 메타 수정 (date 고정, notes/progress 만) ===================

export async function updateConnectionReportMeta(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  const workId = String(formData.get('work_id') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim() || null
  const progressRaw = String(formData.get('progress') ?? '').trim()
  const progress = (['시작전', '진행중', '완료'].includes(progressRaw)
    ? progressRaw
    : '진행중') as WorkReportProgress

  if (!id || !workId) redirect('/works?err=' + encodeURIComponent('일보 id 가 없습니다'))

  const { supabase, me } = await requireUser()

  const { data: row } = await supabase
    .from('connection_reports')
    .select('id, author_employee_id, status')
    .eq('id', id)
    .maybeSingle()
  const r = row as { author_employee_id: string; status: string } | null
  if (!r) redirect(`/works/${workId}?err=` + encodeURIComponent('일보를 찾을 수 없습니다'))
  if (r.author_employee_id !== me.id) {
    redirect(
      `/works/${workId}/connection-reports/${id}?err=` +
        encodeURIComponent('본인 작성 일보만 수정할 수 있습니다'),
    )
  }
  if (r.status !== '대기') {
    redirect(
      `/works/${workId}/connection-reports/${id}?err=` +
        encodeURIComponent('결재가 시작된 일보는 수정할 수 없습니다'),
    )
  }

  const { error } = await supabase
    .from('connection_reports')
    .update({ notes, progress })
    .eq('id', id)
  if (error) {
    redirect(
      `/works/${workId}/connection-reports/${id}?err=` +
        encodeURIComponent('수정 실패: ' + error.message),
    )
  }
  revalidatePath(`/works/${workId}/connection-reports/${id}`)
  redirect(
    `/works/${workId}/connection-reports/${id}?ok=` + encodeURIComponent('일보 메타를 수정했습니다'),
  )
}

// ===== 결재 =============================================================

async function reviewConnectionReport(formData: FormData, decision: '승인' | '반려') {
  const id = String(formData.get('id') ?? '').trim()
  const workId = String(formData.get('work_id') ?? '').trim()
  const comment = String(formData.get('review_comment') ?? '').trim() || null
  if (!id || !workId) redirect('/works?err=' + encodeURIComponent('일보 id 가 없습니다'))
  if (decision === '반려' && !comment) {
    redirect(
      `/works/${workId}/connection-reports/${id}?err=` +
        encodeURIComponent('반려 시 사유를 입력하세요'),
    )
  }

  const { supabase, me } = await requireUser()

  const { data: rowData } = await supabase
    .from('connection_reports')
    .select('id, work_id, status')
    .eq('id', id)
    .maybeSingle()
  const row = rowData as { id: string; work_id: string; status: string } | null
  if (!row || row.work_id !== workId) {
    redirect(`/works/${workId}?err=` + encodeURIComponent('일보를 찾을 수 없습니다'))
  }
  if (row.status !== '대기') {
    redirect(
      `/works/${workId}/connection-reports/${id}?err=` +
        encodeURIComponent('이미 결재된 일보입니다'),
    )
  }

  const isAdmin = me.permission === 'admin' || me.permission === 'ceo'
  if (!isAdmin) {
    const { data: workRow } = await supabase
      .from('works')
      .select('id, assignee_employee_id')
      .eq('id', workId)
      .maybeSingle()
    const work = workRow as { assignee_employee_id: string | null } | null
    if (!work || work.assignee_employee_id !== me.id) {
      redirect(
        `/works/${workId}/connection-reports/${id}?err=` +
          encodeURIComponent('담당자만 결재할 수 있습니다'),
      )
    }
  }

  const { error } = await supabase
    .from('connection_reports')
    .update({
      status: decision,
      reviewed_by: me.id,
      reviewed_at: new Date().toISOString(),
      review_comment: comment,
    })
    .eq('id', id)
  if (error) {
    redirect(
      `/works/${workId}/connection-reports/${id}?err=` +
        encodeURIComponent('결재 실패: ' + error.message),
    )
  }

  revalidatePath(`/works/${workId}/connection-reports/${id}`)
  revalidatePath(`/works/${workId}`)
  redirect(
    `/works/${workId}/connection-reports/${id}?ok=` +
      encodeURIComponent(decision === '승인' ? '일보를 승인했습니다' : '일보를 반려했습니다'),
  )
}

export async function approveConnectionReport(formData: FormData) {
  return reviewConnectionReport(formData, '승인')
}

export async function rejectConnectionReport(formData: FormData) {
  return reviewConnectionReport(formData, '반려')
}

// ===== 노드별 공종·자재 (작성자+대기 시에만 가능) =====================

async function ensureAuthorPending(
  supabase: Awaited<ReturnType<typeof createClient>>,
  me: Me,
  reportId: string,
  workId: string,
) {
  const { data: r } = await supabase
    .from('connection_reports')
    .select('id, work_id, author_employee_id, status')
    .eq('id', reportId)
    .maybeSingle()
  const row = r as
    | { id: string; work_id: string; author_employee_id: string; status: string }
    | null
  if (!row || row.work_id !== workId) {
    redirect(`/works/${workId}?err=` + encodeURIComponent('일보를 찾을 수 없습니다'))
  }
  if (row.author_employee_id !== me.id) {
    redirect(
      `/works/${workId}/connection-reports/${reportId}?err=` +
        encodeURIComponent('본인 작성 일보만 편집할 수 있습니다'),
    )
  }
  if (row.status !== '대기') {
    redirect(
      `/works/${workId}/connection-reports/${reportId}?err=` +
        encodeURIComponent('결재가 시작된 일보는 편집할 수 없습니다'),
    )
  }
}

export async function addTask(formData: FormData) {
  const reportId = String(formData.get('report_id') ?? '').trim()
  const workId = String(formData.get('work_id') ?? '').trim()
  const planNodeId = String(formData.get('plan_node_id') ?? '').trim()
  const taskTypeRaw = String(formData.get('task_type') ?? '').trim() as ConnectionTaskType
  const customTaskName = String(formData.get('custom_task_name') ?? '').trim() || null
  const taskCount = parseInt(String(formData.get('task_count') ?? '0'), 10)
  const notes = String(formData.get('notes') ?? '').trim() || null

  if (!reportId || !workId || !planNodeId) {
    redirect('/works?err=' + encodeURIComponent('필수 값이 없습니다'))
  }
  if (!CONNECTION_TASK_TYPE_VALUES.includes(taskTypeRaw)) {
    redirect(
      `/works/${workId}/connection-reports/${reportId}?err=` +
        encodeURIComponent('공종을 선택하세요'),
    )
  }
  if (taskTypeRaw === '기타' && !customTaskName) {
    redirect(
      `/works/${workId}/connection-reports/${reportId}?err=` +
        encodeURIComponent("공종 '기타' 선택 시 공종명을 입력하세요"),
    )
  }
  if (taskCount <= 0) {
    redirect(
      `/works/${workId}/connection-reports/${reportId}?err=` +
        encodeURIComponent('공종 수량은 1 이상이어야 합니다'),
    )
  }

  const { supabase, me } = await requireUser()
  await ensureAuthorPending(supabase, me, reportId, workId)

  const { error } = await supabase.from('connection_node_tasks').insert({
    report_id: reportId,
    plan_node_id: planNodeId,
    task_type: taskTypeRaw,
    custom_task_name: taskTypeRaw === '기타' ? customTaskName : null,
    task_count: taskCount,
    notes,
  })
  if (error) {
    redirect(
      `/works/${workId}/connection-reports/${reportId}?err=` +
        encodeURIComponent('공종 추가 실패: ' + error.message),
    )
  }

  revalidatePath(`/works/${workId}/connection-reports/${reportId}`)
  redirect(
    `/works/${workId}/connection-reports/${reportId}?ok=` + encodeURIComponent('공종을 추가했습니다'),
  )
}

export async function removeTask(formData: FormData) {
  const taskId = String(formData.get('task_id') ?? '').trim()
  const reportId = String(formData.get('report_id') ?? '').trim()
  const workId = String(formData.get('work_id') ?? '').trim()
  if (!taskId || !reportId || !workId) {
    redirect('/works?err=' + encodeURIComponent('필수 값이 없습니다'))
  }

  const { supabase, me } = await requireUser()
  await ensureAuthorPending(supabase, me, reportId, workId)

  const { error } = await supabase.from('connection_node_tasks').delete().eq('id', taskId)
  if (error) {
    redirect(
      `/works/${workId}/connection-reports/${reportId}?err=` +
        encodeURIComponent('삭제 실패: ' + error.message),
    )
  }
  revalidatePath(`/works/${workId}/connection-reports/${reportId}`)
  redirect(
    `/works/${workId}/connection-reports/${reportId}?ok=` + encodeURIComponent('공종을 삭제했습니다'),
  )
}

export async function addMaterial(formData: FormData) {
  const reportId = String(formData.get('report_id') ?? '').trim()
  const workId = String(formData.get('work_id') ?? '').trim()
  const planNodeId = String(formData.get('plan_node_id') ?? '').trim()
  const materialId = String(formData.get('material_id') ?? '').trim() || null
  const customName = String(formData.get('custom_name') ?? '').trim() || null
  const customSpec = String(formData.get('custom_spec') ?? '').trim() || null
  const customUnit = String(formData.get('custom_unit') ?? '').trim() || null
  const quantityRaw = String(formData.get('quantity') ?? '').trim()
  const quantity = Number(quantityRaw)
  const notes = String(formData.get('notes') ?? '').trim() || null

  if (!reportId || !workId || !planNodeId) {
    redirect('/works?err=' + encodeURIComponent('필수 값이 없습니다'))
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    redirect(
      `/works/${workId}/connection-reports/${reportId}?err=` +
        encodeURIComponent('수량을 올바르게 입력하세요'),
    )
  }
  // 마스터 OR 직접입력 둘 중 하나
  const hasMaster = !!materialId
  const hasCustom = !!customName
  if (hasMaster === hasCustom) {
    redirect(
      `/works/${workId}/connection-reports/${reportId}?err=` +
        encodeURIComponent('자재를 마스터에서 선택하거나 직접 입력하세요 (둘 중 하나)'),
    )
  }

  const { supabase, me } = await requireUser()
  await ensureAuthorPending(supabase, me, reportId, workId)

  const { error } = await supabase.from('connection_node_materials').insert({
    report_id: reportId,
    plan_node_id: planNodeId,
    material_id: hasMaster ? materialId : null,
    custom_name: hasMaster ? null : customName,
    custom_spec: hasMaster ? null : customSpec,
    custom_unit: hasMaster ? null : customUnit,
    quantity,
    notes,
  })
  if (error) {
    redirect(
      `/works/${workId}/connection-reports/${reportId}?err=` +
        encodeURIComponent('자재 추가 실패: ' + error.message),
    )
  }

  revalidatePath(`/works/${workId}/connection-reports/${reportId}`)
  redirect(
    `/works/${workId}/connection-reports/${reportId}?ok=` + encodeURIComponent('자재를 추가했습니다'),
  )
}

export async function removeMaterial(formData: FormData) {
  const materialRowId = String(formData.get('material_row_id') ?? '').trim()
  const reportId = String(formData.get('report_id') ?? '').trim()
  const workId = String(formData.get('work_id') ?? '').trim()
  if (!materialRowId || !reportId || !workId) {
    redirect('/works?err=' + encodeURIComponent('필수 값이 없습니다'))
  }

  const { supabase, me } = await requireUser()
  await ensureAuthorPending(supabase, me, reportId, workId)

  const { error } = await supabase
    .from('connection_node_materials')
    .delete()
    .eq('id', materialRowId)
  if (error) {
    redirect(
      `/works/${workId}/connection-reports/${reportId}?err=` +
        encodeURIComponent('삭제 실패: ' + error.message),
    )
  }
  revalidatePath(`/works/${workId}/connection-reports/${reportId}`)
  redirect(
    `/works/${workId}/connection-reports/${reportId}?ok=` + encodeURIComponent('자재를 삭제했습니다'),
  )
}
