'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { todayInSeoul } from '@/lib/work'

type Me = { id: string; company_id: string; permission: string; can_manage_works: boolean }

async function loadMe() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, permission, can_manage_works')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as Me | null
  if (!me) redirect('/?err=' + encodeURIComponent('직원 정보 없음'))
  return { supabase, me: me! }
}

// 오늘 작업 시작 — 본인 배정된 작업 중 선택된 N건을 일괄 체크인.
// 작업이 '예정' 이면 자동 '진행중' 으로 전환 (security definer RPC).
export async function startDailyChecks(formData: FormData) {
  const { supabase, me } = await loadMe()

  const workIds = formData
    .getAll('work_ids')
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0)

  if (workIds.length === 0) {
    redirect('/?err=' + encodeURIComponent('작업을 1개 이상 선택하세요'))
  }

  const today = todayInSeoul()

  // 본인 배정된 작업만, 미완료(완료/취소 아님) 인 것만 통과
  const { data: validRows } = await supabase
    .from('work_assignments')
    .select('work_id, works!inner(id, status, company_id)')
    .eq('employee_id', me.id)
    .in('work_id', workIds)

  type Joined = { work_id: string; works: { id: string; status: string; company_id: string } }
  const valid = ((validRows ?? []) as unknown as Joined[]).filter(
    (r) => r.works.company_id === me.company_id && r.works.status !== '완료' && r.works.status !== '취소',
  )

  if (valid.length === 0) {
    redirect('/?err=' + encodeURIComponent('체크인 가능한 작업이 없습니다'))
  }

  const inserts = valid.map((r) => ({
    company_id: me.company_id,
    work_id: r.work_id,
    employee_id: me.id,
    check_date: today,
    decision: '진행중' as const,
  }))

  // unique(work_id, employee_id, check_date) 충돌 시 무시 → 이미 체크인된 건 그대로 둠
  const { error } = await supabase
    .from('work_daily_checks')
    .upsert(inserts, { onConflict: 'work_id,employee_id,check_date', ignoreDuplicates: true })
  if (error) {
    redirect('/?err=' + encodeURIComponent('시작 실패: ' + error.message))
  }

  // 작업 status='예정' → '진행중' 자동 전환 (security definer)
  const toAdvance = valid.filter((r) => r.works.status === '예정').map((r) => r.work_id)
  for (const wid of toAdvance) {
    await supabase.rpc('work_advance_to_in_progress', { _work_id: wid })
  }

  revalidatePath('/')
  revalidatePath('/works')
  redirect('/?ok=' + encodeURIComponent(`${valid.length}건 시작했습니다`))
}

// 단일 row 마감 — decision = '완료' 또는 '이월'
export async function closeDailyCheck(formData: FormData) {
  const { supabase, me } = await loadMe()

  const id = String(formData.get('id') ?? '')
  const decisionRaw = String(formData.get('decision') ?? '')
  const note = String(formData.get('note') ?? '').trim() || null

  if (!id) redirect('/?err=' + encodeURIComponent('체크 id 가 없습니다'))
  if (decisionRaw !== '완료' && decisionRaw !== '이월') {
    redirect('/?err=' + encodeURIComponent('마감 결정값이 잘못됐습니다'))
  }

  const { error } = await supabase
    .from('work_daily_checks')
    .update({ decision: decisionRaw, note, closed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('employee_id', me.id) // 본인 row 만 (RLS 가 한 번 더 막아줌)

  if (error) {
    redirect('/?err=' + encodeURIComponent('마감 실패: ' + error.message))
  }

  revalidatePath('/')
  revalidatePath('/works')
  redirect('/?ok=' + encodeURIComponent(`${decisionRaw} 처리됐습니다`))
}

// 일괄 마감 — 폼에서 row 별 decision 받아 한 번에 처리
export async function closeDailyChecksBulk(formData: FormData) {
  const { supabase, me } = await loadMe()

  const ids = formData.getAll('id').map(String)
  const decisions = formData.getAll('decision').map(String)
  if (ids.length === 0 || ids.length !== decisions.length) {
    redirect('/?err=' + encodeURIComponent('마감 데이터가 비어있거나 불일치합니다'))
  }

  const now = new Date().toISOString()
  let okCount = 0
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    const decision = decisions[i]
    if (decision !== '완료' && decision !== '이월') continue
    const { error } = await supabase
      .from('work_daily_checks')
      .update({ decision, closed_at: now })
      .eq('id', id)
      .eq('employee_id', me.id)
    if (!error) okCount++
  }

  revalidatePath('/')
  revalidatePath('/works')
  redirect('/?ok=' + encodeURIComponent(`${okCount}건 마감했습니다`))
}

// 담당자/관리자가 작업 자체를 '완료' 로 확정 — security definer RPC
export async function confirmWorkComplete(formData: FormData) {
  const { supabase } = await loadMe()

  const workId = String(formData.get('work_id') ?? '')
  if (!workId) redirect('/works?err=' + encodeURIComponent('작업 id 가 없습니다'))

  const { error } = await supabase.rpc('work_confirm_complete', { _work_id: workId })
  if (error) {
    redirect('/works/' + workId + '?err=' + encodeURIComponent('완료 확정 실패: ' + error.message))
  }

  revalidatePath('/works')
  revalidatePath('/works/' + workId)
  redirect('/works/' + workId + '?ok=' + encodeURIComponent('작업을 완료로 확정했습니다'))
}
