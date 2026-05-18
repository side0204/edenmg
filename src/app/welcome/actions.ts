'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function setPassword(formData: FormData) {
  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')

  if (password.length < 8) {
    redirect('/welcome?err=' + encodeURIComponent('비밀번호는 8자 이상이어야 합니다'))
  }
  if (password !== confirm) {
    redirect('/welcome?err=' + encodeURIComponent('비밀번호가 일치하지 않습니다'))
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    redirect('/welcome?err=' + encodeURIComponent('비밀번호 설정 실패: ' + error.message))
  }

  // employees.accepted_at 갱신 — update_self RLS 정책이 본인 행만 허용.
  await supabase
    .from('employees')
    .update({ accepted_at: new Date().toISOString() })
    .eq('auth_user_id', user.id)
    .is('accepted_at', null)

  redirect('/')
}
