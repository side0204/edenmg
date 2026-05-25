'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  SUBCATEGORY_BY_CATEGORY,
  WORKER_TYPE_VALUES,
  WORK_CATEGORY_VALUES,
  WORK_STATUS_VALUES,
  type WorkCategory,
  type WorkStatus,
  type WorkSubcategory,
  type WorkWorkerType,
} from '@/lib/work'

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

// ===== 공통 =============================================================

async function requireWorkManager() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, permission, is_active, can_manage_works')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | {
        id: string
        company_id: string
        permission: Permission
        is_active: boolean
        can_manage_works: boolean
      }
    | null

  if (!me || !me.is_active) {
    redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  }
  const isAdmin = me.permission === 'admin'
  if (!isAdmin && !me.can_manage_works) {
    redirect('/works?err=' + encodeURIComponent('작업관리 권한이 없습니다'))
  }
  return { supabase, me }
}

// ===== 폼 파서·검증 =====================================================

function parseWorkForm(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  const clientChoice = String(formData.get('client_choice') ?? '').trim()
  const clientCustom = String(formData.get('client_custom') ?? '').trim()
  let client: string | null = null
  let clientCustomMissing = false
  if (clientChoice === 'LG유플러스') client = 'LG유플러스'
  else if (clientChoice === '기타') {
    if (!clientCustom) clientCustomMissing = true
    client = clientCustom || null
  }
  const address = String(formData.get('address') ?? '').trim() || null
  const category = String(formData.get('category') ?? '') as WorkCategory
  const subcategoryRaw = String(formData.get('subcategory') ?? '').trim()
  const subcategory = (subcategoryRaw || null) as WorkSubcategory | null
  // 공사번호는 모든 카테고리에서 선택 입력 가능 (없으면 null)
  const order_id = String(formData.get('order_id') ?? '').trim() || null

  const worker_type_raw = String(formData.get('worker_type') ?? '').trim()
  const worker_type = (WORKER_TYPE_VALUES.includes(worker_type_raw as WorkWorkerType)
    ? (worker_type_raw as WorkWorkerType)
    : null) as WorkWorkerType | null
  const worker_type_custom_raw = String(formData.get('worker_type_custom') ?? '').trim()
  const worker_type_custom = worker_type === '기타' ? worker_type_custom_raw || null : null

  const assignee_employee_id = String(formData.get('assignee_employee_id') ?? '').trim() || null

  const expected_volume = String(formData.get('expected_volume') ?? '').trim() || null
  const start_date = String(formData.get('start_date') ?? '').trim() || null
  const end_date = String(formData.get('end_date') ?? '').trim() || null
  const status = (String(formData.get('status') ?? '예정') || '예정') as WorkStatus
  const notes = String(formData.get('notes') ?? '').trim() || null
  const instructions = String(formData.get('instructions') ?? '').trim() || null

  return {
    name,
    client,
    clientCustomMissing,
    address,
    category,
    subcategory,
    order_id,
    worker_type,
    worker_type_custom,
    assignee_employee_id,
    expected_volume,
    start_date,
    end_date,
    status,
    notes,
    instructions,
  }
}

function validateWork(p: ReturnType<typeof parseWorkForm>): string | null {
  if (!p.name) return '작업명을 입력하세요.'
  if (p.name.length > 100) return '작업명은 100자 이하로 입력하세요.'

  if (p.clientCustomMissing) return "발주처 '기타' 선택 시 직접 입력하세요."
  if (p.client && p.client.length > 50) return '발주처는 50자 이하로 입력하세요.'
  if (p.order_id && p.order_id.length > 50) return '공사번호는 50자 이하로 입력하세요.'

  if (!WORK_CATEGORY_VALUES.includes(p.category)) return '작업 대분류를 선택하세요.'

  const allowedSubs = SUBCATEGORY_BY_CATEGORY[p.category]
  if (p.category === '기타') {
    if (p.subcategory) return "'기타' 분류는 소분류를 선택하지 않습니다."
  } else {
    if (!p.subcategory) return '작업 소분류를 선택하세요.'
    if (!allowedSubs.includes(p.subcategory)) return '잘못된 소분류입니다.'
  }

  if (!WORK_STATUS_VALUES.includes(p.status)) return '상태를 선택하세요.'

  // 작업자 구분(worker_type) 은 작업 단위가 아닌 각 작업자별로 지정 (work_assignments.worker_type).
  // 작업 자체의 worker_type 은 폼에 없으므로 항상 null 로 저장.

  if (!p.assignee_employee_id) return '담당자를 선택하세요.'

  if (p.start_date && p.end_date && p.end_date < p.start_date) {
    return '종료일은 시작일 이후여야 합니다.'
  }
  if (p.instructions && p.instructions.length > 1000) {
    return '지시사항은 1000자 이하로 입력하세요.'
  }
  return null
}

// 같은 회사·활성 직원인지 확인 (server-side safety net)
async function validateAssignee(
  supabase: Awaited<ReturnType<typeof createClient>>,
  assigneeId: string,
  companyId: string,
): Promise<string | null> {
  const { data: empRow } = await supabase
    .from('employees')
    .select('id, company_id, is_active')
    .eq('id', assigneeId)
    .maybeSingle()
  const emp = empRow as { id: string; company_id: string; is_active: boolean } | null
  if (!emp || emp.company_id !== companyId) return '담당자가 같은 회사 직원이 아닙니다.'
  if (!emp.is_active) return '비활성 직원은 담당자로 지정할 수 없습니다.'
  return null
}

// ===== 작업 CRUD ========================================================

export async function createWork(formData: FormData) {
  const parsed = parseWorkForm(formData)
  const errMsg = validateWork(parsed)
  if (errMsg) redirect('/works/new?err=' + encodeURIComponent(errMsg))

  const { supabase, me } = await requireWorkManager()

  if (parsed.assignee_employee_id) {
    const assigneeErr = await validateAssignee(supabase, parsed.assignee_employee_id, me.company_id)
    if (assigneeErr) redirect('/works/new?err=' + encodeURIComponent(assigneeErr))
  }

  // 작업자 다중 선택 — worker_ids JSON 객체 배열
  //   [{ id: uuid, worker_type: '접속팀'|'외선팀'|'기타', worker_type_custom?: string }]
  const workerIdsRaw = String(formData.get('worker_ids') ?? '')
  type WorkerInput = {
    id: string
    worker_type: WorkWorkerType
    worker_type_custom: string | null
  }
  let workers: WorkerInput[] = []
  if (workerIdsRaw) {
    try {
      const parsedArr = JSON.parse(workerIdsRaw)
      if (Array.isArray(parsedArr)) {
        const seen = new Set<string>()
        for (const x of parsedArr) {
          if (!x || typeof x !== 'object') continue
          const id = String((x as { id?: unknown }).id ?? '').trim()
          if (!/^[0-9a-f-]{36}$/i.test(id)) continue
          if (seen.has(id)) continue
          const wt = String((x as { worker_type?: unknown }).worker_type ?? '').trim()
          if (!WORKER_TYPE_VALUES.includes(wt as WorkWorkerType)) continue
          const wtCustomRaw = String(
            (x as { worker_type_custom?: unknown }).worker_type_custom ?? '',
          ).trim()
          const worker_type_custom = wt === '기타' ? wtCustomRaw || null : null
          if (wt === '기타' && !worker_type_custom) continue // 기타는 custom 필수
          seen.add(id)
          workers.push({
            id,
            worker_type: wt as WorkWorkerType,
            worker_type_custom,
          })
        }
      }
    } catch {
      // 무시
    }
  }

  // 작업자 검증 — 같은 회사·활성
  if (workers.length > 0) {
    const ids = workers.map((w) => w.id)
    const { data: workersRows } = await supabase
      .from('employees')
      .select('id, company_id, is_active')
      .in('id', ids)
    const validIds = new Set(
      ((workersRows ?? []) as { id: string; company_id: string; is_active: boolean }[])
        .filter((w) => w.company_id === me.company_id && w.is_active)
        .map((w) => w.id),
    )
    if (validIds.size !== workers.length) {
      redirect(
        '/works/new?err=' +
          encodeURIComponent('일부 작업자가 같은 회사 활성 직원이 아닙니다. 다시 선택하세요.'),
      )
    }
    workers = workers.filter((w) => validIds.has(w.id))
  }

  const { clientCustomMissing, ...payload } = parsed
  void clientCustomMissing
  const { data: inserted, error } = await supabase
    .from('works')
    .insert({ ...payload, company_id: me.company_id })
    .select('id')
    .single()

  if (error || !inserted) {
    redirect('/works/new?err=' + encodeURIComponent('등록 실패: ' + (error?.message ?? '알 수 없음')))
  }

  // 작업자 일괄 배정 — 작업 전체 기간 + 작업자별 worker_type.
  // 관리자가 직접 등록하는 경로라 자동 확정(confirmed_at = now()).
  // 청약 자동 동기화 경로(syncLinkedWork)만 confirmed_at = null 로 두고 별도 확정 단계를 거침.
  if (workers.length > 0) {
    const nowIso = new Date().toISOString()
    const { error: assignErr } = await supabase.from('work_assignments').insert(
      workers.map((w) => ({
        work_id: inserted.id,
        employee_id: w.id,
        worker_type: w.worker_type,
        assigned_start: null,
        assigned_end: null,
        confirmed_at: nowIso,
      })),
    )
    if (assignErr) {
      redirect(
        `/works/${inserted.id}?err=` +
          encodeURIComponent('작업 등록은 완료. 일부 작업자 배정 실패: ' + assignErr.message),
      )
    }
  }

  revalidatePath('/works')

  // 접속팀 작업이거나, 작업자 중 접속팀이 1명이라도 있으면 작업구간 등록 화면으로 진입.
  const hasConnectionWorker =
    parsed.worker_type === '접속팀' || workers.some((w) => w.worker_type === '접속팀')
  if (hasConnectionWorker) {
    redirect(
      `/works/${inserted.id}/chains/new?ok=` +
        encodeURIComponent(
          `${parsed.name} 등록 완료 (작업자 ${workers.length}명). 이어서 작업구간을 등록하세요.`,
        ),
    )
  }

  redirect(
    `/works/${inserted.id}?ok=` +
      encodeURIComponent(
        `${parsed.name} 작업을 등록했습니다${workers.length > 0 ? ` (작업자 ${workers.length}명 배정)` : ''}`,
      ),
  )
}

export async function updateWork(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) redirect('/works?err=' + encodeURIComponent('작업 id 가 없습니다'))

  const parsed = parseWorkForm(formData)
  const errMsg = validateWork(parsed)
  if (errMsg) redirect(`/works/${id}/edit?err=` + encodeURIComponent(errMsg))

  const { supabase, me } = await requireWorkManager()

  if (parsed.assignee_employee_id) {
    const assigneeErr = await validateAssignee(supabase, parsed.assignee_employee_id, me.company_id)
    if (assigneeErr) redirect(`/works/${id}/edit?err=` + encodeURIComponent(assigneeErr))
  }

  const { clientCustomMissing, ...payload } = parsed
  void clientCustomMissing
  const { error } = await supabase.from('works').update(payload).eq('id', id)
  if (error) {
    redirect(`/works/${id}/edit?err=` + encodeURIComponent('수정 실패: ' + error.message))
  }

  revalidatePath('/works')
  revalidatePath(`/works/${id}`)
  redirect(`/works/${id}?ok=` + encodeURIComponent('작업 정보를 수정했습니다'))
}

// ===== 작업 삭제 ========================================================

// admin/ceo OR employees.can_delete_works=true 만 삭제 가능.
// works.id FK 가 모두 ON DELETE CASCADE 이므로:
//   - work_assignments, work_daily_reports, connection_chains,
//     connection_plan_nodes, connection_reports, segments, tasks, materials
//   모두 함께 사라진다.
export async function deleteWork(formData: FormData) {
  const workId = String(formData.get('work_id') ?? '').trim()
  if (!workId) redirect('/works?err=' + encodeURIComponent('작업 id 가 없습니다'))

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, permission, can_delete_works, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | {
        id: string
        company_id: string
        permission: Permission
        can_delete_works: boolean
        is_active: boolean
      }
    | null
  if (!me || !me.is_active) {
    redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  }
  const isAdmin = me.permission === 'admin'
  if (!isAdmin && !me.can_delete_works) {
    redirect('/works?err=' + encodeURIComponent('작업 삭제 권한이 없습니다'))
  }

  // 회사 스코프 + 작업명 확보 (성공 메시지용)
  const { data: workRow } = await supabase
    .from('works')
    .select('id, company_id, name')
    .eq('id', workId)
    .maybeSingle()
  const work = workRow as { id: string; company_id: string; name: string } | null
  if (!work || work.company_id !== me.company_id) {
    redirect('/works?err=' + encodeURIComponent('잘못된 작업입니다'))
  }

  const { error } = await supabase.from('works').delete().eq('id', workId)
  if (error) {
    redirect('/works?err=' + encodeURIComponent('삭제 실패: ' + error.message))
  }

  revalidatePath('/works')
  redirect('/works?ok=' + encodeURIComponent(`${work.name} 작업을 삭제했습니다`))
}


// ===== 작업자 배정 ======================================================

export async function assignEmployee(formData: FormData) {
  const workId = String(formData.get('work_id') ?? '').trim()
  const employeeId = String(formData.get('employee_id') ?? '').trim()
  const assignedStart = String(formData.get('assigned_start') ?? '').trim() || null
  const assignedEnd = String(formData.get('assigned_end') ?? '').trim() || null

  if (!workId) redirect('/works?err=' + encodeURIComponent('작업 id 가 없습니다'))
  if (!employeeId) {
    redirect(`/works/${workId}?err=` + encodeURIComponent('직원을 선택하세요'))
  }
  if (assignedStart && assignedEnd && assignedEnd < assignedStart) {
    redirect(`/works/${workId}?err=` + encodeURIComponent('배정 종료일은 시작일 이후여야 합니다'))
  }

  const { supabase, me } = await requireWorkManager()

  // 작업과 직원이 같은 회사 안인지 확인 (RLS 가 한 번 더 막아주지만 명시적 안전망)
  const { data: empRow } = await supabase
    .from('employees')
    .select('id, company_id, is_active')
    .eq('id', employeeId)
    .maybeSingle()
  const emp = empRow as { id: string; company_id: string; is_active: boolean } | null
  if (!emp || emp.company_id !== me.company_id) {
    redirect(`/works/${workId}?err=` + encodeURIComponent('잘못된 직원입니다'))
  }
  if (!emp.is_active) {
    redirect(`/works/${workId}?err=` + encodeURIComponent('비활성 직원은 배정할 수 없습니다'))
  }

  const { error } = await supabase.from('work_assignments').insert({
    work_id: workId,
    employee_id: employeeId,
    assigned_start: assignedStart,
    assigned_end: assignedEnd,
    // 관리자 직접 배정 — 자동 확정 (청약 자동 동기화만 confirmed_at=null 로 두고 별도 확정 단계)
    confirmed_at: new Date().toISOString(),
  })
  if (error) {
    redirect(`/works/${workId}?err=` + encodeURIComponent('배정 실패: ' + error.message))
  }

  revalidatePath(`/works/${workId}`)
  redirect(`/works/${workId}?ok=` + encodeURIComponent('작업자를 배정했습니다'))
}

export async function unassignEmployee(formData: FormData) {
  const workId = String(formData.get('work_id') ?? '').trim()
  const assignmentId = String(formData.get('assignment_id') ?? '').trim()
  if (!workId || !assignmentId) {
    redirect('/works?err=' + encodeURIComponent('배정 id 가 없습니다'))
  }

  const { supabase } = await requireWorkManager()
  const { error } = await supabase.from('work_assignments').delete().eq('id', assignmentId)
  if (error) {
    redirect(`/works/${workId}?err=` + encodeURIComponent('배정 해제 실패: ' + error.message))
  }

  revalidatePath(`/works/${workId}`)
  redirect(`/works/${workId}?ok=` + encodeURIComponent('배정을 해제했습니다'))
}
