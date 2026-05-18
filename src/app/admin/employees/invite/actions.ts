'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  PERMISSION_VALUES,
  POSITION_VALUES,
  TEAM_VALUES,
  WORK_TYPE_VALUES,
  type Permission,
} from '../fields'

function pickOptional(
  formData: FormData,
  key: string,
  allowed: readonly string[],
): string | null {
  const raw = String(formData.get(key) ?? '').trim()
  if (raw === '') return null
  if (!allowed.includes(raw)) return null
  return raw
}

export async function inviteEmployee(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const phone = String(formData.get('phone') ?? '').trim() || null
  const permissionInput = String(formData.get('permission') ?? 'worker') as Permission
  const position = pickOptional(formData, 'position', POSITION_VALUES)
  const team = pickOptional(formData, 'team', TEAM_VALUES)
  const workType = pickOptional(formData, 'work_type', WORK_TYPE_VALUES)

  if (!name || !email) {
    redirect('/admin/employees/invite?err=' + encodeURIComponent('이름과 이메일은 필수입니다'))
  }
  if (!PERMISSION_VALUES.includes(permissionInput)) {
    redirect('/admin/employees/invite?err=' + encodeURIComponent('권한 값이 올바르지 않습니다'))
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
    .select('permission, company_id, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { permission: Permission; company_id: string; is_active: boolean } | null

  if (!me || !me.is_active || (me.permission !== 'admin')) {
    redirect('/admin/employees/invite?err=' + encodeURIComponent('초대 권한이 없습니다'))
  }

  const { data: dup } = await supabase
    .from('employees')
    .select('id')
    .eq('email', email)
    .maybeSingle()
  if (dup) {
    redirect('/admin/employees/invite?err=' + encodeURIComponent('이미 등록된 이메일입니다'))
  }

  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    const msg = e instanceof Error ? e.message : '초대 클라이언트 생성 실패'
    redirect('/admin/employees/invite?err=' + encodeURIComponent(msg))
  }

  // Supabase Dashboard → Authentication → URL Configuration → Redirect URLs 에
  // http://localhost:3000/auth/confirm 과 프로덕션 URL 둘 다 등록되어 있어야 한다.
  const h = await headers()
  const host = h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const origin = `${proto}://${host}`
  const redirectTo = `${origin}/auth/confirm?next=/welcome`

  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      company_id: me.company_id,
      name,
      permission: permissionInput,
      position,
      team,
      work_type: workType,
      phone,
    },
    redirectTo,
  })

  if (error) {
    redirect('/admin/employees/invite?err=' + encodeURIComponent('초대 발송 실패: ' + error.message))
  }

  // 초대 성공 → employees 행은 트리거가 자동 생성. phone 만 별도 업데이트
  // (트리거는 phone 을 메타에서 못 읽도록 설계해놓아서).
  if (phone) {
    await admin
      .from('employees')
      .update({ phone })
      .eq('email', email)
      .eq('company_id', me.company_id)
  }

  revalidatePath('/admin/employees')
  redirect('/admin/employees?ok=' + encodeURIComponent(`${email} 초대를 발송했습니다`))
}
