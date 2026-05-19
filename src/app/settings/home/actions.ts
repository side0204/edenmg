'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  isValidHomeCardId,
  resolveHomeCardPrefs,
  type HomeCardId,
} from '@/lib/home-cards'

async function loadMe() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: meRow } = await supabase
    .from('employees')
    .select('id, home_card_prefs')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; home_card_prefs: unknown } | null
  if (!me) redirect('/?err=' + encodeURIComponent('직원 정보 없음'))
  return { supabase, me: me! }
}

export async function moveHomeCard(formData: FormData) {
  const idRaw = String(formData.get('id') ?? '')
  const dir = String(formData.get('dir') ?? '')
  if (!isValidHomeCardId(idRaw) || (dir !== 'up' && dir !== 'down')) {
    redirect('/settings/home?err=' + encodeURIComponent('잘못된 요청입니다'))
  }
  const id = idRaw as HomeCardId

  const { supabase, me } = await loadMe()
  const prefs = resolveHomeCardPrefs(me.home_card_prefs)
  const idx = prefs.order.indexOf(id)
  if (idx === -1) redirect('/settings/home')
  const targetIdx = dir === 'up' ? idx - 1 : idx + 1
  if (targetIdx < 0 || targetIdx >= prefs.order.length) {
    redirect('/settings/home')
  }

  const order = [...prefs.order]
  ;[order[idx], order[targetIdx]] = [order[targetIdx], order[idx]]

  const { error } = await supabase
    .from('employees')
    .update({ home_card_prefs: { order, hidden: prefs.hidden } })
    .eq('id', me.id)
  if (error) {
    redirect('/settings/home?err=' + encodeURIComponent('저장 실패: ' + error.message))
  }

  revalidatePath('/settings/home')
  revalidatePath('/')
  redirect('/settings/home')
}

export async function toggleHomeCardVisible(formData: FormData) {
  const idRaw = String(formData.get('id') ?? '')
  if (!isValidHomeCardId(idRaw)) {
    redirect('/settings/home?err=' + encodeURIComponent('잘못된 카드입니다'))
  }
  const id = idRaw as HomeCardId

  const { supabase, me } = await loadMe()
  const prefs = resolveHomeCardPrefs(me.home_card_prefs)
  const hidden = prefs.hidden.includes(id)
    ? prefs.hidden.filter((h) => h !== id)
    : [...prefs.hidden, id]

  const { error } = await supabase
    .from('employees')
    .update({ home_card_prefs: { order: prefs.order, hidden } })
    .eq('id', me.id)
  if (error) {
    redirect('/settings/home?err=' + encodeURIComponent('저장 실패: ' + error.message))
  }

  revalidatePath('/settings/home')
  revalidatePath('/')
  redirect('/settings/home')
}

export async function resetHomeCardPrefs() {
  const { supabase, me } = await loadMe()
  const { error } = await supabase
    .from('employees')
    .update({ home_card_prefs: {} })
    .eq('id', me.id)
  if (error) {
    redirect('/settings/home?err=' + encodeURIComponent('초기화 실패: ' + error.message))
  }
  revalidatePath('/settings/home')
  revalidatePath('/')
  redirect('/settings/home?ok=' + encodeURIComponent('기본 설정으로 초기화했습니다'))
}
