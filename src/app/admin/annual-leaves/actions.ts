'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { plannedPeriods } from '@/lib/annual-leave'

type Me = { id: string; company_id: string; permission: string }

async function loadAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, permission')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as Me | null
  if (!me || me.permission !== 'admin') {
    redirect('/?err=' + encodeURIComponent('관리자만 접근 가능합니다'))
  }
  return { supabase, me: me! }
}

/**
 * 한 직원의 모든 회차를 근로기준법 공식대로 upsert.
 *   - 이미 존재하는 회차의 granted 는 (자동 기대값 + admin 수동 가산) 중 더 큰 값 유지
 *     → 관리자가 추가 부여한 경우 자동 갱신이 그 값을 깎지 않음
 *   - period 시작·종료 일자는 입사일 기준으로 새로 계산해 정합 보정
 */
async function refreshOneEmployee(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  employeeId: string,
  hireDate: string | null,
  actorEmployeeId: string,
): Promise<{ added: number; updated: number }> {
  if (!hireDate) return { added: 0, updated: 0 }
  const planned = plannedPeriods(hireDate)

  // 기존 회차 조회
  const { data: existingData } = await supabase
    .from('annual_leave_balances')
    .select('id, period_seq, granted')
    .eq('employee_id', employeeId)
  type Existing = { id: string; period_seq: number; granted: number }
  const existing = (existingData ?? []) as Existing[]
  const byseq = new Map(existing.map((e) => [e.period_seq, e]))

  let added = 0
  let updated = 0

  for (const p of planned) {
    const prev = byseq.get(p.seq)
    if (!prev) {
      const { data: ins } = await supabase
        .from('annual_leave_balances')
        .insert({
          company_id: companyId,
          employee_id: employeeId,
          period_seq: p.seq,
          period_start: p.start,
          period_end: p.end,
          granted: p.granted,
          used: 0,
          note: '근로기준법 자동 부여',
        })
        .select('id')
        .single()
      const balanceId = (ins as { id: string } | null)?.id
      if (balanceId) {
        await supabase.from('annual_leave_grants').insert({
          balance_id: balanceId,
          delta: p.granted,
          reason: p.seq === 0 ? '근로기준법 자동 부여 (1년 미만 월 누적)' : '근로기준법 자동 부여',
          source: 'auto',
          actor_employee_id: actorEmployeeId,
        })
      }
      added++
    } else if (prev.granted < p.granted) {
      // 자동 누적이 기존 값보다 크면 차액 +적용
      const delta = Number((p.granted - prev.granted).toFixed(2))
      await supabase
        .from('annual_leave_balances')
        .update({
          period_start: p.start,
          period_end: p.end,
          granted: p.granted,
        })
        .eq('id', prev.id)
      await supabase.from('annual_leave_grants').insert({
        balance_id: prev.id,
        delta,
        reason: p.seq === 0 ? '근로기준법 자동 부여 (월 누적)' : '근로기준법 자동 부여 (추가)',
        source: 'auto',
        actor_employee_id: actorEmployeeId,
      })
      updated++
    }
  }
  return { added, updated }
}

// 한 직원만 갱신
export async function refreshEmployeeAnnualLeaves(formData: FormData) {
  const { supabase, me } = await loadAdmin()
  const employeeId = String(formData.get('employee_id') ?? '')
  if (!employeeId) redirect('/admin/annual-leaves?err=' + encodeURIComponent('직원 id 가 없습니다'))

  const { data: emp } = await supabase
    .from('employees')
    .select('id, company_id, hire_date')
    .eq('id', employeeId)
    .maybeSingle()
  const target = emp as { id: string; company_id: string; hire_date: string | null } | null
  if (!target || target.company_id !== me.company_id) {
    redirect('/admin/annual-leaves?err=' + encodeURIComponent('대상 직원을 찾을 수 없습니다'))
  }
  if (!target!.hire_date) {
    redirect('/admin/annual-leaves?err=' + encodeURIComponent('입사일이 등록되지 않았습니다'))
  }

  const { added, updated } = await refreshOneEmployee(
    supabase,
    me.company_id,
    employeeId,
    target!.hire_date,
    me.id,
  )
  revalidatePath('/admin/annual-leaves')
  revalidatePath('/')
  redirect(
    '/admin/annual-leaves?ok=' +
      encodeURIComponent(`갱신 완료 — 신규 ${added}건 / 가산 ${updated}건`),
  )
}

// 전직원 일괄 갱신
export async function refreshAllAnnualLeaves() {
  const { supabase, me } = await loadAdmin()

  const { data: emps } = await supabase
    .from('employees')
    .select('id, hire_date')
    .eq('company_id', me.company_id)
    .eq('is_active', true)
    .not('hire_date', 'is', null)
  type E = { id: string; hire_date: string }
  const list = (emps ?? []) as E[]

  let totalAdded = 0
  let totalUpdated = 0
  let processed = 0
  for (const e of list) {
    const { added, updated } = await refreshOneEmployee(
      supabase,
      me.company_id,
      e.id,
      e.hire_date,
      me.id,
    )
    totalAdded += added
    totalUpdated += updated
    processed++
  }

  revalidatePath('/admin/annual-leaves')
  revalidatePath('/')
  redirect(
    '/admin/annual-leaves?ok=' +
      encodeURIComponent(
        `일괄 갱신 완료 — 직원 ${processed}명 · 신규 ${totalAdded} · 가산 ${totalUpdated}`,
      ),
  )
}

// 운영 전 사용 이력 반영 — 관리자가 「현재 잔여」 를 직접 입력하면
// used 가 (granted - remaining) 으로 역산되어 저장됨. 운영 시작 시 1회용.
export async function setInitialRemaining(formData: FormData) {
  const { supabase, me } = await loadAdmin()
  const balanceId = String(formData.get('balance_id') ?? '')
  const remainingRaw = String(formData.get('remaining') ?? '').trim()

  if (!balanceId) {
    redirect('/admin/annual-leaves?err=' + encodeURIComponent('대상이 없습니다'))
  }
  const remaining = Number(remainingRaw)
  if (!Number.isFinite(remaining) || remaining < 0) {
    redirect(
      '/admin/annual-leaves?err=' +
        encodeURIComponent('잔여는 0 이상의 숫자여야 합니다'),
    )
  }

  const { data: b } = await supabase
    .from('annual_leave_balances')
    .select('id, company_id, granted, used')
    .eq('id', balanceId)
    .maybeSingle()
  const bal = b as
    | { id: string; company_id: string; granted: number; used: number }
    | null
  if (!bal || bal.company_id !== me.company_id) {
    redirect('/admin/annual-leaves?err=' + encodeURIComponent('대상을 찾을 수 없습니다'))
  }

  const granted = Number(bal!.granted)
  const newUsed = Math.max(0, Number((granted - remaining).toFixed(2)))
  const oldUsed = Number(bal!.used)
  const delta = Number((newUsed - oldUsed).toFixed(2))

  const { error } = await supabase
    .from('annual_leave_balances')
    .update({ used: newUsed })
    .eq('id', balanceId)
  if (error) {
    redirect(
      '/admin/annual-leaves?err=' +
        encodeURIComponent('저장 실패: ' + error.message),
    )
  }

  // audit: grants 에 source='admin_manual' 로 기록. delta 의 부호는 used 변화 기준.
  await supabase.from('annual_leave_grants').insert({
    balance_id: balanceId,
    delta,
    reason: `운영 전 잔여 ${remaining}일 설정 (사용 ${oldUsed}→${newUsed})`,
    source: 'admin_manual',
    actor_employee_id: me.id,
  })

  revalidatePath('/admin/annual-leaves')
  revalidatePath('/')
  redirect(
    '/admin/annual-leaves?ok=' +
      encodeURIComponent(`잔여 ${remaining}일로 설정 완료 (사용 ${newUsed}일)`),
  )
}

// 관리자 수동 조정 — granted 에 delta 가산 (음수 = 차감)
export async function adjustAnnualLeaveBalance(formData: FormData) {
  const { supabase, me } = await loadAdmin()
  const balanceId = String(formData.get('balance_id') ?? '')
  const deltaRaw = String(formData.get('delta') ?? '').trim()
  const reason = String(formData.get('reason') ?? '').trim() || '관리자 수동 조정'

  const delta = Number(deltaRaw)
  if (!balanceId || !Number.isFinite(delta) || delta === 0) {
    redirect('/admin/annual-leaves?err=' + encodeURIComponent('변화량을 정확히 입력하세요'))
  }

  const { data: b } = await supabase
    .from('annual_leave_balances')
    .select('id, company_id, granted')
    .eq('id', balanceId)
    .maybeSingle()
  const bal = b as { id: string; company_id: string; granted: number } | null
  if (!bal || bal.company_id !== me.company_id) {
    redirect('/admin/annual-leaves?err=' + encodeURIComponent('대상을 찾을 수 없습니다'))
  }

  const nextGranted = Math.max(0, Number((bal!.granted + delta).toFixed(2)))
  await supabase
    .from('annual_leave_balances')
    .update({ granted: nextGranted })
    .eq('id', balanceId)
  await supabase.from('annual_leave_grants').insert({
    balance_id: balanceId,
    delta,
    reason,
    source: 'admin_manual',
    actor_employee_id: me.id,
  })

  revalidatePath('/admin/annual-leaves')
  redirect('/admin/annual-leaves?ok=' + encodeURIComponent('조정 완료'))
}

// hire_date 갱신 (admin)
export async function updateHireDate(formData: FormData) {
  const { supabase, me } = await loadAdmin()
  const employeeId = String(formData.get('employee_id') ?? '')
  const hireDate = String(formData.get('hire_date') ?? '').trim() || null
  if (!employeeId) redirect('/admin/annual-leaves?err=' + encodeURIComponent('직원 id 가 없습니다'))

  const { data: emp } = await supabase
    .from('employees')
    .select('id, company_id')
    .eq('id', employeeId)
    .maybeSingle()
  const target = emp as { id: string; company_id: string } | null
  if (!target || target.company_id !== me.company_id) {
    redirect('/admin/annual-leaves?err=' + encodeURIComponent('대상 직원을 찾을 수 없습니다'))
  }

  const { error } = await supabase
    .from('employees')
    .update({ hire_date: hireDate })
    .eq('id', employeeId)
  if (error) {
    redirect('/admin/annual-leaves?err=' + encodeURIComponent('저장 실패: ' + error.message))
  }

  // hire_date 가 새로 들어왔으면 즉시 한 번 갱신
  if (hireDate) {
    await refreshOneEmployee(supabase, me.company_id, employeeId, hireDate, me.id)
  }

  revalidatePath('/admin/annual-leaves')
  revalidatePath('/admin/employees')
  redirect('/admin/annual-leaves?ok=' + encodeURIComponent('입사일 저장 + 회차 갱신 완료'))
}
