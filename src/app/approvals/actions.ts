'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { LeaveAction, LeaveStage, LeaveStatus, LeaveType } from '@/lib/leave'
import { calcLeaveUsage } from '@/lib/annual-leave'

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

async function requireApprover() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, permission, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | { id: string; company_id: string; permission: Permission; is_active: boolean }
    | null
  if (!me || !me.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  if (me.permission === 'worker') {
    redirect('/?err=' + encodeURIComponent('결재 권한이 없습니다'))
  }
  return { supabase, me }
}

// 본인이 이 신청에 대해 어떤 결재 액션이 가능한지 판단.
// 반환: { canAct: boolean, isAdmin: boolean, currentStage: 'foreman'|'admin' }
function decideAuthority(
  me: { id: string; permission: Permission },
  lr: { assigned_foreman_id: string | null; pending_stage: LeaveStage | null; status: LeaveStatus },
): { canAct: boolean; isAdmin: boolean } {
  if (lr.status !== '대기' || lr.pending_stage === null) return { canAct: false, isAdmin: false }
  const isAdmin = me.permission === 'admin'
  if (isAdmin) return { canAct: true, isAdmin }
  if (me.permission === 'team_leader' && lr.pending_stage === 'foreman' && lr.assigned_foreman_id === me.id) {
    return { canAct: true, isAdmin: false }
  }
  return { canAct: false, isAdmin: false }
}

async function loadRequest(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data } = await supabase
    .from('leave_requests')
    .select(
      'id, company_id, assigned_foreman_id, pending_stage, status, employee_id, type, start_date, end_date',
    )
    .eq('id', id)
    .maybeSingle()
  return data as
    | {
        id: string
        company_id: string
        assigned_foreman_id: string | null
        pending_stage: LeaveStage | null
        status: LeaveStatus
        employee_id: string
        type: LeaveType
        start_date: string
        end_date: string
      }
    | null
}

function parseActionForm(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  const commentRaw = String(formData.get('comment') ?? '').trim()
  return { id, comment: commentRaw || null }
}

export async function approveRequest(formData: FormData) {
  const { id, comment } = parseActionForm(formData)
  if (!id) redirect('/approvals?err=' + encodeURIComponent('신청 id 가 없습니다'))

  const { supabase, me } = await requireApprover()
  const lr = await loadRequest(supabase, id)
  if (!lr) redirect('/approvals?err=' + encodeURIComponent('신청을 찾을 수 없습니다'))
  if (lr.company_id !== me.company_id) {
    redirect('/approvals?err=' + encodeURIComponent('다른 회사 신청입니다'))
  }

  const authority = decideAuthority(me, lr)
  if (!authority.canAct) {
    redirect(`/approvals/${id}?err=` + encodeURIComponent('이 신청을 결재할 권한이 없습니다'))
  }

  const now = new Date().toISOString()
  let nextStatus: LeaveStatus = lr.status
  let nextStage: LeaveStage | null = lr.pending_stage
  let action: LeaveAction = '승인'
  let finalActorId: string | null = null
  let finalActedAt: string | null = null

  if (authority.isAdmin) {
    // 관리자는 어느 단계든 단독 종결. foreman 단계였으면 '전결' 로 기록.
    if (lr.pending_stage === 'foreman') {
      action = '전결'
    } else {
      action = '승인'
    }
    nextStatus = '승인'
    nextStage = null
    finalActorId = me.id
    finalActedAt = now
  } else {
    // 팀장 승인 — 다음 단계로 이동
    action = '승인'
    nextStatus = '대기'
    nextStage = 'admin'
  }

  const { error: upErr } = await supabase
    .from('leave_requests')
    .update({
      status: nextStatus,
      pending_stage: nextStage,
      final_actor_id: finalActorId ?? undefined,
      final_acted_at: finalActedAt ?? undefined,
    })
    .eq('id', id)

  if (upErr) {
    redirect(`/approvals/${id}?err=` + encodeURIComponent('처리 실패: ' + upErr.message))
  }

  await supabase.from('leave_request_approvals').insert({
    leave_request_id: id,
    actor_employee_id: me.id,
    action,
    comment,
  })

  // 최종 승인 시 연차 used 자동 가산 (병가·공가·외근은 calcLeaveUsage 가 0 반환)
  if (nextStatus === '승인') {
    const usage = calcLeaveUsage(lr.type, lr.start_date, lr.end_date)
    if (usage > 0) {
      await supabase.rpc('annual_leave_apply_usage', {
        _employee_id: lr.employee_id,
        _on_date: lr.start_date,
        _delta: usage,
      })
    }
  }

  revalidatePath('/approvals')
  revalidatePath(`/approvals/${id}`)
  revalidatePath('/requests')
  revalidatePath(`/requests/${id}`)
  revalidatePath('/admin/annual-leaves')
  revalidatePath('/')
  redirect('/approvals?ok=' + encodeURIComponent(`${action} 처리됐습니다`))
}

export async function rejectRequest(formData: FormData) {
  const { id, comment } = parseActionForm(formData)
  if (!id) redirect('/approvals?err=' + encodeURIComponent('신청 id 가 없습니다'))

  const { supabase, me } = await requireApprover()
  const lr = await loadRequest(supabase, id)
  if (!lr) redirect('/approvals?err=' + encodeURIComponent('신청을 찾을 수 없습니다'))
  if (lr.company_id !== me.company_id) {
    redirect('/approvals?err=' + encodeURIComponent('다른 회사 신청입니다'))
  }
  const authority = decideAuthority(me, lr)
  if (!authority.canAct) {
    redirect(`/approvals/${id}?err=` + encodeURIComponent('이 신청을 결재할 권한이 없습니다'))
  }

  const now = new Date().toISOString()
  const { error: upErr } = await supabase
    .from('leave_requests')
    .update({
      status: '반려',
      pending_stage: null,
      final_actor_id: me.id,
      final_acted_at: now,
    })
    .eq('id', id)

  if (upErr) {
    redirect(`/approvals/${id}?err=` + encodeURIComponent('반려 실패: ' + upErr.message))
  }

  await supabase.from('leave_request_approvals').insert({
    leave_request_id: id,
    actor_employee_id: me.id,
    action: '반려',
    comment,
  })

  revalidatePath('/approvals')
  revalidatePath(`/approvals/${id}`)
  revalidatePath('/requests')
  revalidatePath(`/requests/${id}`)
  revalidatePath('/')
  redirect('/approvals?ok=' + encodeURIComponent('반려 처리됐습니다'))
}
