'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { FIELD_VALUES, PERMISSION_VALUES, type EditableField, type Permission } from './fields'

const FIELD_KEYS = Object.keys(FIELD_VALUES) as EditableField[]

export async function updateEmployeeField(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const field = String(formData.get('field') ?? '') as EditableField
  const rawValue = String(formData.get('value') ?? '')
  const value = rawValue === '' ? null : rawValue

  if (!id) {
    redirect('/admin/employees?err=' + encodeURIComponent('직원 id 가 없습니다'))
  }
  if (!FIELD_KEYS.includes(field)) {
    redirect('/admin/employees?err=' + encodeURIComponent('잘못된 필드입니다'))
  }
  if (value !== null && !FIELD_VALUES[field].includes(value)) {
    redirect('/admin/employees?err=' + encodeURIComponent('잘못된 값입니다'))
  }
  // 권한은 NULL 불가 (사용자 로그인 시 분기 기준).
  if (field === 'permission' && value === null) {
    redirect('/admin/employees?err=' + encodeURIComponent('권한은 비울 수 없습니다'))
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, permission')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; permission: Permission } | null

  if (!me || (me.permission !== 'admin')) {
    redirect('/admin/employees?err=' + encodeURIComponent('권한이 없습니다'))
  }
  if (field === 'permission' && me.id === id) {
    redirect(
      '/admin/employees?err=' +
        encodeURIComponent('본인 권한은 직접 변경할 수 없습니다. 다른 관리자에게 요청하세요.'),
    )
  }

  const { error } = await supabase
    .from('employees')
    .update({ [field]: value })
    .eq('id', id)

  if (error) {
    redirect('/admin/employees?err=' + encodeURIComponent('변경 실패: ' + error.message))
  }

  revalidatePath('/admin/employees')
  redirect('/admin/employees?ok=' + encodeURIComponent('변경됐습니다'))
}

// 작업관리 권한 토글. admin/ceo 만 변경 가능. 본인 권한 변경은 자유 (lockout 위험 없음).
export async function toggleCanManageWorks(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const nextValue = formData.get('next') === '1'

  if (!id) {
    redirect('/admin/employees?err=' + encodeURIComponent('직원 id 가 없습니다'))
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, permission')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; permission: Permission } | null

  if (!me || (me.permission !== 'admin')) {
    redirect('/admin/employees?err=' + encodeURIComponent('권한이 없습니다'))
  }

  const { error } = await supabase
    .from('employees')
    .update({ can_manage_works: nextValue })
    .eq('id', id)

  if (error) {
    redirect('/admin/employees?err=' + encodeURIComponent('변경 실패: ' + error.message))
  }

  revalidatePath('/admin/employees')
  redirect(
    '/admin/employees?ok=' +
      encodeURIComponent(nextValue ? '작업관리 권한 부여' : '작업관리 권한 해제'),
  )
}

// 작업통계 조회 권한 토글. admin/ceo 만 변경 가능.
// 부여 안 받으면 /works/stats 에서 본인 작성 일보 기반 통계만 표시 (admin/ceo 는 자동).
export async function toggleCanViewStats(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const nextValue = formData.get('next') === '1'

  if (!id) {
    redirect('/admin/employees?err=' + encodeURIComponent('직원 id 가 없습니다'))
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, permission')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; permission: Permission } | null

  if (!me || (me.permission !== 'admin')) {
    redirect('/admin/employees?err=' + encodeURIComponent('권한이 없습니다'))
  }

  const { error } = await supabase
    .from('employees')
    .update({ can_view_stats: nextValue })
    .eq('id', id)

  if (error) {
    redirect('/admin/employees?err=' + encodeURIComponent('변경 실패: ' + error.message))
  }

  revalidatePath('/admin/employees')
  redirect(
    '/admin/employees?ok=' +
      encodeURIComponent(nextValue ? '통계 조회 권한 부여' : '통계 조회 권한 해제'),
  )
}

// 차량번호 업데이트 — admin 만 가능 (접속팀은 비울 수 없음).
export async function updateVehiclePlate(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const plate = String(formData.get('vehicle_plate') ?? '').trim() || null

  if (!id) redirect('/admin/employees?err=' + encodeURIComponent('직원 id 가 없습니다'))

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, permission')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; permission: Permission } | null
  if (!me || me.permission !== 'admin') {
    redirect('/admin/employees?err=' + encodeURIComponent('권한이 없습니다'))
  }

  // 접속팀은 plate 필수
  const { data: target } = await supabase
    .from('employees')
    .select('work_type')
    .eq('id', id)
    .maybeSingle()
  const targetWorkType = (target as { work_type: string | null } | null)?.work_type
  if (targetWorkType === '접속팀' && !plate) {
    redirect('/admin/employees?err=' + encodeURIComponent('접속팀은 차량번호가 필수입니다'))
  }

  const { error } = await supabase
    .from('employees')
    .update({ vehicle_plate: plate })
    .eq('id', id)
  if (error) {
    redirect('/admin/employees?err=' + encodeURIComponent('변경 실패: ' + error.message))
  }
  revalidatePath('/admin/employees')
  redirect(
    '/admin/employees?ok=' + encodeURIComponent(plate ? '차량번호를 등록했습니다' : '차량번호를 해제했습니다'),
  )
}

// 가입 신청 승인 — is_active=true 로 활성화 + 권한·토글 + 본사/현장 함께 적용.
export async function approveSignup(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const permRaw = String(formData.get('permission') ?? 'worker') as Permission
  const permission = PERMISSION_VALUES.includes(permRaw) ? permRaw : 'worker'
  const workplaceRaw = String(formData.get('workplace_type') ?? '본사')
  const workplace = workplaceRaw === '현장' ? '현장' : '본사'
  const canManageWorks = formData.get('can_manage_works') === 'on'
  const canDeleteWorks = formData.get('can_delete_works') === 'on'
  const canViewStats = formData.get('can_view_stats') === 'on'
  const canManageStock = formData.get('can_manage_stock') === 'on'

  if (!id) redirect('/admin/employees?err=' + encodeURIComponent('직원 id 가 없습니다'))

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, permission')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; permission: Permission } | null
  if (!me || me.permission !== 'admin') {
    redirect('/admin/employees?err=' + encodeURIComponent('권한이 없습니다'))
  }

  const { error } = await supabase
    .from('employees')
    .update({
      is_active: true,
      accepted_at: new Date().toISOString(),
      permission,
      workplace_type: workplace,
      can_manage_works: canManageWorks,
      can_delete_works: canDeleteWorks,
      can_view_stats: canViewStats,
      can_manage_stock: canManageStock,
    })
    .eq('id', id)
  if (error) {
    redirect('/admin/employees?err=' + encodeURIComponent('승인 실패: ' + error.message))
  }

  revalidatePath('/admin/employees')
  redirect('/admin/employees?ok=' + encodeURIComponent('가입을 승인했습니다'))
}

// 활성 직원의 본사/현장 변경
export async function updateWorkplaceType(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const workplaceRaw = String(formData.get('workplace_type') ?? '본사')
  const workplace = workplaceRaw === '현장' ? '현장' : '본사'
  if (!id) redirect('/admin/employees?err=' + encodeURIComponent('직원 id 가 없습니다'))

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, permission')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; permission: Permission } | null
  if (!me || me.permission !== 'admin') {
    redirect('/admin/employees?err=' + encodeURIComponent('권한이 없습니다'))
  }

  const { error } = await supabase
    .from('employees')
    .update({ workplace_type: workplace })
    .eq('id', id)
  if (error) {
    redirect('/admin/employees?err=' + encodeURIComponent('변경 실패: ' + error.message))
  }
  revalidatePath('/admin/employees')
  redirect('/admin/employees?ok=' + encodeURIComponent(`${workplace} 으로 변경했습니다`))
}

// 가입 신청 거부 — auth user + employees row 모두 삭제 (영구).
export async function rejectSignup(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  if (!id) redirect('/admin/employees?err=' + encodeURIComponent('직원 id 가 없습니다'))

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, permission')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; permission: Permission } | null
  if (!me || me.permission !== 'admin') {
    redirect('/admin/employees?err=' + encodeURIComponent('권한이 없습니다'))
  }

  // 대상 employee row 조회 (auth_user_id 확보)
  const { data: target } = await supabase
    .from('employees')
    .select('id, auth_user_id, is_active, accepted_at')
    .eq('id', id)
    .maybeSingle()
  const emp = target as
    | { id: string; auth_user_id: string | null; is_active: boolean; accepted_at: string | null }
    | null
  if (!emp) redirect('/admin/employees?err=' + encodeURIComponent('직원을 찾을 수 없습니다'))
  // 이미 승인된 직원은 거부 불가 (활성 직원 삭제는 별도 흐름 필요)
  if (emp.is_active || emp.accepted_at) {
    redirect('/admin/employees?err=' + encodeURIComponent('이미 승인된 직원은 거부할 수 없습니다'))
  }

  const admin = createAdminClient()
  if (emp.auth_user_id) {
    await admin.auth.admin.deleteUser(emp.auth_user_id)
  }
  // employees row 도 정리 (auth user 삭제 시 cascade 안 될 수 있으니 명시)
  await supabase.from('employees').delete().eq('id', id)

  revalidatePath('/admin/employees')
  redirect('/admin/employees?ok=' + encodeURIComponent('가입 신청을 거부했습니다'))
}

// 작업 삭제 권한 토글. admin/ceo 만 변경 가능.
// can_manage_works 와 별개 — 삭제는 cascade 가 크므로 더 좁은 권한자에게만 부여.
export async function toggleCanDeleteWorks(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const nextValue = formData.get('next') === '1'

  if (!id) {
    redirect('/admin/employees?err=' + encodeURIComponent('직원 id 가 없습니다'))
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, permission')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; permission: Permission } | null

  if (!me || (me.permission !== 'admin')) {
    redirect('/admin/employees?err=' + encodeURIComponent('권한이 없습니다'))
  }

  const { error } = await supabase
    .from('employees')
    .update({ can_delete_works: nextValue })
    .eq('id', id)

  if (error) {
    redirect('/admin/employees?err=' + encodeURIComponent('변경 실패: ' + error.message))
  }

  revalidatePath('/admin/employees')
  redirect(
    '/admin/employees?ok=' +
      encodeURIComponent(nextValue ? '작업 삭제 권한 부여' : '작업 삭제 권한 해제'),
  )
}
