'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { FIELD_VALUES, type EditableField, type Permission } from './fields'

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

  if (!me || (me.permission !== 'admin' && me.permission !== 'ceo')) {
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

  if (!me || (me.permission !== 'admin' && me.permission !== 'ceo')) {
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

  if (!me || (me.permission !== 'admin' && me.permission !== 'ceo')) {
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

  if (!me || (me.permission !== 'admin' && me.permission !== 'ceo')) {
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
