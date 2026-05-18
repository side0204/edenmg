'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  CABLE_SPEC_VALUES,
  CONNECTION_TASK_TYPE_VALUES,
  PHOTO_BUCKET,
  PHOTO_MAX_BYTES,
  PHOTO_MIME_WHITELIST,
  parseLineNumbers,
  type CableSpec,
  type ConnectionTaskType,
  type WorkReportProgress,
} from '@/lib/connection'

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

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

  // segments: form fields cable_spec_<nodeId>, line_numbers_<nodeId>, completed_<nodeId>, segment_notes_<nodeId>, cable_code_<nodeId>
  // (cable segment 는 child node 의 id 키로 입력됨. parent_id 가 NULL 인 root 노드는 segment 없음.)
  const segmentInputs: Array<{
    plan_node_id: string
    cable_spec: CableSpec
    line_numbers: string
    is_completed: boolean
    segment_notes: string | null
    cable_code: string | null
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
    const cableCode = String(formData.get(`cable_code_${nodeId}`) ?? '').trim() || null
    segmentInputs.push({
      plan_node_id: nodeId,
      cable_spec: cableSpecRaw,
      line_numbers: lineNumbers,
      is_completed: isCompleted,
      segment_notes: segmentNotes,
      cable_code: cableCode,
    })
  }

  // tasks_json / materials_json 파싱
  const tasksByNode = parseJsonField<
    Record<
      string,
      Array<{
        task_type?: string
        custom_task_name?: string
        task_count?: string | number
        notes?: string
      }>
    >
  >(formData.get('tasks_json'), {})
  const materialsByNode = parseJsonField<
    Record<
      string,
      Array<{
        material_id?: string
        custom_name?: string
        custom_spec?: string
        custom_unit?: string
        quantity?: string | number
        notes?: string
      }>
    >
  >(formData.get('materials_json'), {})

  // 검증 + payload 빌드 — 자재·공종은 모든 노드(상위국·접속함체·하위국)에서 입력 가능
  const taskPayloads: Array<{
    plan_node_id: string
    task_type: ConnectionTaskType
    custom_task_name: string | null
    task_count: number
    notes: string | null
  }> = []
  for (const nodeId of Object.keys(tasksByNode)) {
    for (const t of tasksByNode[nodeId] ?? []) {
      const tt = String(t.task_type ?? '').trim() as ConnectionTaskType
      if (!tt) continue // 빈 행 skip
      if (!CONNECTION_TASK_TYPE_VALUES.includes(tt)) {
        redirect(
          `/works/${workId}/connection-reports/new?err=` + encodeURIComponent('공종이 잘못되었습니다'),
        )
      }
      const customName = String(t.custom_task_name ?? '').trim() || null
      if (tt === '기타' && !customName) {
        redirect(
          `/works/${workId}/connection-reports/new?err=` +
            encodeURIComponent("공종 '기타' 선택 시 공종명을 입력하세요"),
        )
      }
      const cnt = parseInt(String(t.task_count ?? ''), 10)
      if (!Number.isFinite(cnt) || cnt <= 0) {
        redirect(
          `/works/${workId}/connection-reports/new?err=` +
            encodeURIComponent('공종 수량은 1 이상이어야 합니다'),
        )
      }
      taskPayloads.push({
        plan_node_id: nodeId,
        task_type: tt,
        custom_task_name: tt === '기타' ? customName : null,
        task_count: cnt,
        notes: String(t.notes ?? '').trim() || null,
      })
    }
  }

  const materialPayloads: Array<{
    plan_node_id: string
    material_id: string | null
    custom_name: string | null
    custom_spec: string | null
    custom_unit: string | null
    quantity: number
    notes: string | null
  }> = []
  for (const nodeId of Object.keys(materialsByNode)) {
    for (const m of materialsByNode[nodeId] ?? []) {
      const materialId = String(m.material_id ?? '').trim() || null
      const customName = String(m.custom_name ?? '').trim() || null
      const hasMaster = !!materialId
      const hasCustom = !!customName
      if (!hasMaster && !hasCustom) continue // 빈 행
      if (hasMaster && hasCustom) {
        redirect(
          `/works/${workId}/connection-reports/new?err=` +
            encodeURIComponent('자재는 마스터 선택 또는 직접 입력 중 하나만 입력하세요'),
        )
      }
      const qty = Number(m.quantity)
      if (!Number.isFinite(qty) || qty <= 0) {
        redirect(
          `/works/${workId}/connection-reports/new?err=` +
            encodeURIComponent('자재 수량을 올바르게 입력하세요'),
        )
      }
      materialPayloads.push({
        plan_node_id: nodeId,
        material_id: hasMaster ? materialId : null,
        custom_name: hasMaster ? null : customName,
        custom_spec: hasMaster ? null : String(m.custom_spec ?? '').trim() || null,
        custom_unit: hasMaster ? null : String(m.custom_unit ?? '').trim() || null,
        quantity: qty,
        notes: String(m.notes ?? '').trim() || null,
      })
    }
  }

  // 적어도 하나는 있어야 의미 있는 일보. 모두 비면 막음.
  if (
    segmentInputs.length === 0 &&
    taskPayloads.length === 0 &&
    materialPayloads.length === 0
  ) {
    redirect(
      `/works/${workId}/connection-reports/new?err=` +
        encodeURIComponent('cable 선번, 노드 자재, 노드 공종 중 최소 하나는 입력하세요'),
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

  // segments insert (없으면 skip — cable 입력 안 한 노드만 작업한 날도 가능)
  if (segmentInputs.length > 0) {
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
  }

  // tasks insert
  if (taskPayloads.length > 0) {
    const { error: tErr } = await supabase
      .from('connection_node_tasks')
      .insert(taskPayloads.map((t) => ({ ...t, report_id: report.id })))
    if (tErr) {
      redirect(
        `/works/${workId}/connection-reports/${report.id}?err=` +
          encodeURIComponent('공종 저장 실패: ' + tErr.message),
      )
    }
  }

  // materials insert
  if (materialPayloads.length > 0) {
    const { error: mErr } = await supabase
      .from('connection_node_materials')
      .insert(materialPayloads.map((m) => ({ ...m, report_id: report.id })))
    if (mErr) {
      redirect(
        `/works/${workId}/connection-reports/${report.id}?err=` +
          encodeURIComponent('자재 저장 실패: ' + mErr.message),
      )
    }
  }

  revalidatePath(`/works/${workId}`)
  redirect(
    `/works/${workId}/connection-reports/${report.id}?ok=` +
      encodeURIComponent('접속일보를 제출했습니다'),
  )
}

function parseJsonField<T>(raw: FormDataEntryValue | null, fallback: T): T {
  if (typeof raw !== 'string' || !raw.trim()) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
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

  const isAdmin = me.permission === 'admin'
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

// ===== 사진 첨부 ========================================================
// 클라이언트(PhotoUploader)에서 한 장씩 호출. EXIF (촬영시각·GPS) 는 클라이언트
// 에서 exifr 로 미리 추출해 hidden field 로 함께 전송한다.
// 결과를 JSON 으로 돌려준다 (redirect 안 함) — client 가 여러 장 순차 업로드 후
// 한 번만 refresh.

type UploadResult = { ok: true } | { ok: false; error: string }

function buildPhotoPath(reportId: string, filename: string): string {
  const dot = filename.lastIndexOf('.')
  const ext = dot >= 0 ? filename.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : ''
  const uuid = crypto.randomUUID()
  return ext ? `${reportId}/${uuid}.${ext}` : `${reportId}/${uuid}`
}

function parseFloatOrNull(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export async function uploadConnectionPhoto(formData: FormData): Promise<UploadResult> {
  const reportId = String(formData.get('report_id') ?? '').trim()
  const workId = String(formData.get('work_id') ?? '').trim()
  if (!reportId || !workId) return { ok: false, error: '일보 id 가 없습니다' }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: '파일이 비어있습니다' }
  }
  if (file.size > PHOTO_MAX_BYTES) {
    return { ok: false, error: `'${file.name}' — 10MB 이하여야 합니다` }
  }
  if (!PHOTO_MIME_WHITELIST.includes(file.type)) {
    return { ok: false, error: `'${file.name}' — 이미지(JPG·PNG·WEBP·HEIC) 만 첨부할 수 있습니다` }
  }

  const takenAtRaw = String(formData.get('taken_at') ?? '').trim() || null
  const gpsLat = parseFloatOrNull(formData.get('gps_lat'))
  const gpsLng = parseFloatOrNull(formData.get('gps_lng'))

  const { supabase, me } = await requireUser()
  await ensureAuthorPending(supabase, me, reportId, workId)

  const path = buildPhotoPath(reportId, file.name)
  const { error: upErr } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (upErr) {
    return { ok: false, error: `업로드 실패: ${upErr.message}` }
  }

  const { error: insErr } = await supabase.from('connection_report_photos').insert({
    report_id: reportId,
    path,
    filename: file.name,
    mime_type: file.type,
    file_size: file.size,
    taken_at: takenAtRaw,
    gps_lat: gpsLat,
    gps_lng: gpsLng,
    uploaded_by: me.id,
  })
  if (insErr) {
    // Storage 에는 올라갔지만 DB row 없음 → 고아 파일 방지로 즉시 삭제 시도
    await supabase.storage.from(PHOTO_BUCKET).remove([path])
    return { ok: false, error: `메타 저장 실패: ${insErr.message}` }
  }

  revalidatePath(`/works/${workId}/connection-reports/${reportId}`)
  return { ok: true }
}

export async function removeConnectionPhoto(formData: FormData) {
  const photoId = String(formData.get('photo_id') ?? '').trim()
  const reportId = String(formData.get('report_id') ?? '').trim()
  const workId = String(formData.get('work_id') ?? '').trim()
  if (!photoId || !reportId || !workId) {
    redirect('/works?err=' + encodeURIComponent('필수 값이 없습니다'))
  }

  const { supabase } = await requireUser()
  // RLS 가 권한 분기 담당 (작성자+대기 OR admin)

  // 먼저 path 조회 후 storage 정리
  const { data: row } = await supabase
    .from('connection_report_photos')
    .select('path')
    .eq('id', photoId)
    .maybeSingle()
  const photo = row as { path: string } | null
  if (!photo) {
    redirect(
      `/works/${workId}/connection-reports/${reportId}?err=` +
        encodeURIComponent('사진을 찾을 수 없습니다'),
    )
  }

  const { error: delErr } = await supabase
    .from('connection_report_photos')
    .delete()
    .eq('id', photoId)
  if (delErr) {
    redirect(
      `/works/${workId}/connection-reports/${reportId}?err=` +
        encodeURIComponent('삭제 실패: ' + delErr.message),
    )
  }

  // Storage 정리 (실패해도 본문 진행)
  await supabase.storage.from(PHOTO_BUCKET).remove([photo.path])

  revalidatePath(`/works/${workId}/connection-reports/${reportId}`)
  redirect(
    `/works/${workId}/connection-reports/${reportId}?ok=` +
      encodeURIComponent('사진을 삭제했습니다'),
  )
}

// 다운로드용 signedUrl. 5분짜리. 서버 컴포넌트에서 호출.
export async function getConnectionPhotoUrl(
  path: string,
  filename: string,
): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(path, 60 * 5, { download: filename })
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

// 인라인 표시용 (download 옵션 없이 signedUrl)
export async function getConnectionPhotoViewUrls(
  paths: string[],
): Promise<Map<string, string>> {
  const supabase = await createClient()
  const result = new Map<string, string>()
  if (paths.length === 0) return result
  const { data } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(paths, 60 * 30) // 30분
  if (!data) return result
  for (const item of data) {
    if (item.signedUrl && item.path) result.set(item.path, item.signedUrl)
  }
  return result
}
