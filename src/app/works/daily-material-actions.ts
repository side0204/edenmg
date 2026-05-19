'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { consumeHolding, restoreHolding } from '../stock/actions'

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

type Me = {
  id: string
  company_id: string
  permission: Permission
  is_active: boolean
}

async function requireUser() {
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
  const me = meRow as Me | null
  if (!me?.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  return { supabase, me }
}

// 일반일보 자재 추가 — holding (자기 자재) / master / custom 3 모드.
export async function addDailyReportMaterial(formData: FormData) {
  const reportId = String(formData.get('report_id') ?? '').trim()
  const workId = String(formData.get('work_id') ?? '').trim()
  const holdingId = String(formData.get('holding_id') ?? '').trim() || null
  const materialId = String(formData.get('material_id') ?? '').trim() || null
  const customName = String(formData.get('custom_name') ?? '').trim() || null
  const customSpec = String(formData.get('custom_spec') ?? '').trim() || null
  const customUnit = String(formData.get('custom_unit') ?? '').trim() || null
  const quantityRaw = String(formData.get('quantity') ?? '').trim()
  const quantity = Number(quantityRaw)
  const notes = String(formData.get('notes') ?? '').trim() || null

  if (!reportId || !workId) redirect('/works?err=' + encodeURIComponent('필수 값이 없습니다'))
  if (!Number.isFinite(quantity) || quantity <= 0) {
    redirect(
      `/works/${workId}/reports/${reportId}?err=` + encodeURIComponent('수량을 올바르게 입력하세요'),
    )
  }
  // 셋 중 하나 이상 필수
  if (!holdingId && !materialId && !customName) {
    redirect(
      `/works/${workId}/reports/${reportId}?err=` +
        encodeURIComponent('자재(holding/마스터/직접입력) 중 하나는 선택하세요'),
    )
  }

  const { supabase, me } = await requireUser()

  // 일보 권한 체크 — 작성자+대기 OR 담당자/admin
  const { data: rRow } = await supabase
    .from('work_daily_reports')
    .select('id, work_id, author_employee_id, status')
    .eq('id', reportId)
    .maybeSingle()
  const r = rRow as
    | { id: string; work_id: string; author_employee_id: string; status: string }
    | null
  if (!r || r.work_id !== workId) {
    redirect(`/works/${workId}?err=` + encodeURIComponent('일보를 찾을 수 없습니다'))
  }
  const isAdmin = me.permission === 'admin'
  const isAuthor = r.author_employee_id === me.id
  const isAuthorPending = isAuthor && r.status === '대기'
  // 담당자 확인
  const { data: wRow } = await supabase
    .from('works')
    .select('assignee_employee_id')
    .eq('id', workId)
    .maybeSingle()
  const isAssignee = (wRow as { assignee_employee_id: string | null } | null)?.assignee_employee_id === me.id
  if (!isAuthorPending && !isAdmin && !isAssignee) {
    redirect(`/works/${workId}/reports/${reportId}?err=` + encodeURIComponent('편집 권한이 없습니다'))
  }

  // holding 사용 시 차감
  if (holdingId) {
    const r = await consumeHolding(holdingId, quantity)
    if (!r.ok) {
      redirect(`/works/${workId}/reports/${reportId}?err=` + encodeURIComponent('자재 차감 실패: ' + r.error))
    }
  }

  const { error } = await supabase.from('daily_report_materials').insert({
    report_id: reportId,
    holding_id: holdingId,
    material_id: materialId,
    custom_name: customName,
    custom_spec: customSpec,
    custom_unit: customUnit,
    quantity,
    notes,
  })
  if (error) {
    // holding 롤백
    if (holdingId) await restoreHolding(holdingId, quantity)
    redirect(`/works/${workId}/reports/${reportId}?err=` + encodeURIComponent('자재 추가 실패: ' + error.message))
  }

  revalidatePath(`/works/${workId}/reports/${reportId}`)
  revalidatePath('/stock/my')
  redirect(`/works/${workId}/reports/${reportId}?ok=` + encodeURIComponent('자재를 추가했습니다'))
}

export async function removeDailyReportMaterial(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  const reportId = String(formData.get('report_id') ?? '').trim()
  const workId = String(formData.get('work_id') ?? '').trim()
  if (!id || !reportId || !workId) {
    redirect('/works?err=' + encodeURIComponent('필수 값이 없습니다'))
  }

  const { supabase } = await requireUser()

  const { data: rowData } = await supabase
    .from('daily_report_materials')
    .select('id, holding_id, quantity')
    .eq('id', id)
    .maybeSingle()
  const row = rowData as { id: string; holding_id: string | null; quantity: number } | null
  if (!row) {
    redirect(`/works/${workId}/reports/${reportId}?err=` + encodeURIComponent('자재 행을 찾을 수 없습니다'))
  }

  const { error } = await supabase.from('daily_report_materials').delete().eq('id', id)
  if (error) {
    redirect(`/works/${workId}/reports/${reportId}?err=` + encodeURIComponent('삭제 실패: ' + error.message))
  }
  // holding 차감 되돌리기
  if (row.holding_id) {
    await restoreHolding(row.holding_id, Number(row.quantity))
  }
  revalidatePath(`/works/${workId}/reports/${reportId}`)
  revalidatePath('/stock/my')
  redirect(`/works/${workId}/reports/${reportId}?ok=` + encodeURIComponent('자재를 삭제했습니다'))
}
