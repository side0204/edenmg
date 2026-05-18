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

type Permission = 'worker' | 'foreman' | 'admin' | 'ceo'

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
  const isAdmin = me.permission === 'admin' || me.permission === 'ceo'
  if (!isAdmin && !me.can_manage_works) {
    redirect('/works?err=' + encodeURIComponent('작업관리 권한이 없습니다'))
  }
  return { supabase, me }
}

// ===== 폼 파서·검증 =====================================================

const ORDER_ID_CATEGORIES: readonly WorkCategory[] = ['청약', '지장이설']

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
  const order_id_raw = String(formData.get('order_id') ?? '').trim()
  // 청약·지장이설 외 카테고리는 ID 필드 자체를 폼에서 숨기므로 항상 null 로 저장
  const order_id = ORDER_ID_CATEGORIES.includes(category) ? order_id_raw || null : null

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
  }
}

function validateWork(p: ReturnType<typeof parseWorkForm>): string | null {
  if (!p.name) return '작업명을 입력하세요.'
  if (p.name.length > 100) return '작업명은 100자 이하로 입력하세요.'

  if (p.clientCustomMissing) return "발주처 '기타' 선택 시 직접 입력하세요."
  if (p.client && p.client.length > 50) return '발주처는 50자 이하로 입력하세요.'
  if (p.order_id && p.order_id.length > 50) return 'ID는 50자 이하로 입력하세요.'

  if (!WORK_CATEGORY_VALUES.includes(p.category)) return '작업 대분류를 선택하세요.'

  const allowedSubs = SUBCATEGORY_BY_CATEGORY[p.category]
  if (p.category === '기타') {
    if (p.subcategory) return "'기타' 분류는 소분류를 선택하지 않습니다."
  } else {
    if (!p.subcategory) return '작업 소분류를 선택하세요.'
    if (!allowedSubs.includes(p.subcategory)) return '잘못된 소분류입니다.'
  }

  if (!WORK_STATUS_VALUES.includes(p.status)) return '상태를 선택하세요.'

  if (!p.worker_type) return '작업자 구분을 선택하세요.'
  if (p.worker_type === '기타' && !p.worker_type_custom) {
    return "작업자 구분 '기타' 선택 시 구분명을 입력하세요."
  }
  if (p.worker_type_custom && p.worker_type_custom.length > 30) {
    return '작업자 구분명은 30자 이하로 입력하세요.'
  }

  if (!p.assignee_employee_id) return '담당자를 선택하세요.'

  if (p.start_date && p.end_date && p.end_date < p.start_date) {
    return '종료일은 시작일 이후여야 합니다.'
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

  revalidatePath('/works')
  redirect('/works?ok=' + encodeURIComponent(`${parsed.name} 작업을 등록했습니다`))
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
