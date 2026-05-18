'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  SUBCATEGORY_BY_CATEGORY,
  WORK_CATEGORY_VALUES,
  WORK_STATUS_VALUES,
  type WorkCategory,
  type WorkStatus,
  type WorkSubcategory,
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

function parseWorkForm(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  const client = String(formData.get('client') ?? '').trim() || null
  const address = String(formData.get('address') ?? '').trim() || null
  const category = String(formData.get('category') ?? '') as WorkCategory
  const subcategoryRaw = String(formData.get('subcategory') ?? '').trim()
  const subcategory = (subcategoryRaw || null) as WorkSubcategory | null
  const expected_volume = String(formData.get('expected_volume') ?? '').trim() || null
  const start_date = String(formData.get('start_date') ?? '').trim() || null
  const end_date = String(formData.get('end_date') ?? '').trim() || null
  const status = (String(formData.get('status') ?? '예정') || '예정') as WorkStatus
  const notes = String(formData.get('notes') ?? '').trim() || null

  return {
    name,
    client,
    address,
    category,
    subcategory,
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

  if (!WORK_CATEGORY_VALUES.includes(p.category)) return '작업 대분류를 선택하세요.'

  const allowedSubs = SUBCATEGORY_BY_CATEGORY[p.category]
  if (p.category === '기타') {
    if (p.subcategory) return "'기타' 분류는 소분류를 선택하지 않습니다."
  } else {
    if (!p.subcategory) return '작업 소분류를 선택하세요.'
    if (!allowedSubs.includes(p.subcategory)) return '잘못된 소분류입니다.'
  }

  if (!WORK_STATUS_VALUES.includes(p.status)) return '상태를 선택하세요.'

  if (p.start_date && p.end_date && p.end_date < p.start_date) {
    return '종료일은 시작일 이후여야 합니다.'
  }
  return null
}

// ===== 작업 CRUD ========================================================

export async function createWork(formData: FormData) {
  const parsed = parseWorkForm(formData)
  const errMsg = validateWork(parsed)
  if (errMsg) redirect('/works/new?err=' + encodeURIComponent(errMsg))

  const { supabase, me } = await requireWorkManager()

  const { data: inserted, error } = await supabase
    .from('works')
    .insert({ ...parsed, company_id: me.company_id })
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

  const { supabase } = await requireWorkManager()

  const { error } = await supabase.from('works').update(parsed).eq('id', id)
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
