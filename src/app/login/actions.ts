'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// 로그인·로그아웃 기록 — activity_logs 에 1행 추가.
// 실패해도 로그인/로그아웃 흐름 자체는 막지 않는다 (모니터링용 부가 기능).
async function logActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  action: 'login' | 'logout',
) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { data: meRow } = await supabase
      .from('employees')
      .select('id, company_id')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    const me = meRow as { id: string; company_id: string } | null
    if (!me) return

    await supabase.from('activity_logs').insert({
      company_id: me.company_id,
      employee_id: me.id,
      action,
    })
  } catch {
    // 모니터링용 부가 기능 — 실패는 무시
  }
}

export async function signIn(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    redirect('/login?err=' + encodeURIComponent('이메일과 비밀번호를 모두 입력해주세요'))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    const msg = error.message === 'Invalid login credentials'
      ? '이메일 또는 비밀번호가 올바르지 않습니다'
      : error.message
    redirect('/login?err=' + encodeURIComponent(msg))
  }

  await logActivity(supabase, 'login')

  redirect('/')
}

export async function signOut() {
  const supabase = await createClient()
  // 로그아웃 기록은 signOut 전에 — 세션이 살아 있어야 RLS 가 통과한다
  await logActivity(supabase, 'logout')
  await supabase.auth.signOut()
  redirect('/login')
}
