'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { ACQUISITION_REASON_VALUES, type AcquisitionReasonType } from '@/lib/stock'
import { consumeHolding, restoreHolding } from '../stock/actions'

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

type Me = {
  id: string
  company_id: string
  permission: Permission
  is_active: boolean
  can_manage_stock: boolean
}

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, permission, is_active, can_manage_stock')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as Me | null
  if (!me?.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  return { supabase, me }
}

function parseNumOrNull(v: FormDataEntryValue | null): number | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

// ===== 일반일보 자재 추가 — 승인 분기 통합 ============================
//
// 케이스:
// A) holding 사용 + holding.work_id == 일보.work_id
//    → 자동승인. 즉시 차감 (초과 부분 있으면 over_quantity 기록, holding 0 까지만 차감)
// B) holding 사용 + holding.work_id ≠ 일보.work_id
//    → 지입+low_value: 사후신고 + 즉시 차감
//    → 그 외: 대기 (차감 안 함, 자재담당자 승인 시 차감)
// C) holding 없음 (master / custom)
//    → 사후신고 + 취득사유 필수. 차감 없음 (재고 없는 자재라 영향 X)
export async function addDailyReportMaterial(formData: FormData) {
  const reportId = String(formData.get('report_id') ?? '').trim()
  const workId = String(formData.get('work_id') ?? '').trim()
  const holdingId = String(formData.get('holding_id') ?? '').trim() || null
  const materialId = String(formData.get('material_id') ?? '').trim() || null
  const customName = String(formData.get('custom_name') ?? '').trim() || null
  const customSpec = String(formData.get('custom_spec') ?? '').trim() || null
  const customUnit = String(formData.get('custom_unit') ?? '').trim() || null
  const quantity = parseNumOrNull(formData.get('quantity'))
  const notes = String(formData.get('notes') ?? '').trim() || null
  const overReason = String(formData.get('over_reason') ?? '').trim() || null
  const acqTypeRaw = String(formData.get('acquisition_reason_type') ?? '').trim()
  const acqType = (ACQUISITION_REASON_VALUES.includes(acqTypeRaw as AcquisitionReasonType)
    ? (acqTypeRaw as AcquisitionReasonType)
    : null)
  const acqReason = String(formData.get('acquisition_reason') ?? '').trim() || null

  if (!reportId || !workId) redirect('/works?err=' + encodeURIComponent('필수 값이 없습니다'))
  if (!quantity || quantity <= 0) {
    redirect(
      `/works/${workId}/reports/${reportId}?err=` + encodeURIComponent('수량을 올바르게 입력하세요'),
    )
  }
  if (!holdingId && !materialId && !customName) {
    redirect(
      `/works/${workId}/reports/${reportId}?err=` +
        encodeURIComponent('자재(holding/마스터/직접입력) 중 하나는 선택하세요'),
    )
  }

  const { supabase, me } = await requireUser()

  // 일보 권한 체크
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
  const isAuthorPending = r.author_employee_id === me.id && r.status === '대기'
  const { data: wRow } = await supabase
    .from('works')
    .select('assignee_employee_id')
    .eq('id', workId)
    .maybeSingle()
  const isAssignee = (wRow as { assignee_employee_id: string | null } | null)?.assignee_employee_id === me.id
  if (!isAuthorPending && !isAdmin && !isAssignee) {
    redirect(`/works/${workId}/reports/${reportId}?err=` + encodeURIComponent('편집 권한이 없습니다'))
  }

  // 결정 변수
  let approvalStatus = '자동승인'
  let overQuantity = 0
  let consumeAmount = 0 // holding 에서 차감할 양
  type HoldingInfo = {
    id: string
    work_id: string
    quantity_remaining: number
    stock_lots: { source_type: string; materials: { low_value: boolean } | null } | null
  }
  if (holdingId) {
    const { data: hRow } = await supabase
      .from('worker_holdings')
      .select(
        `id, work_id, quantity_remaining,
         stock_lots ( source_type, materials ( low_value ) )`,
      )
      .eq('id', holdingId)
      .maybeSingle()
    const holding = hRow as unknown as HoldingInfo | null
    if (!holding) {
      redirect(`/works/${workId}/reports/${reportId}?err=` + encodeURIComponent('holding 을 찾을 수 없습니다'))
    }

    const remaining = Number(holding.quantity_remaining)
    const lowValue = holding.stock_lots?.materials?.low_value === true
    const sourceType = holding.stock_lots?.source_type ?? ''
    const isSameWork = holding.work_id === workId

    // 초과 사용 처리
    if (quantity > remaining) {
      if (!overReason) {
        redirect(
          `/works/${workId}/reports/${reportId}?err=` +
            encodeURIComponent(`잔량(${remaining}) 초과 — 사유를 입력하세요`),
        )
      }
      overQuantity = quantity - remaining
      consumeAmount = remaining
    } else {
      consumeAmount = quantity
    }

    // 승인 상태
    if (isSameWork) {
      approvalStatus = '자동승인'
    } else if (sourceType === '지입' && lowValue) {
      approvalStatus = '사후신고'
    } else {
      approvalStatus = '대기'
      consumeAmount = 0 // 승인 전엔 차감 X
      overQuantity = 0 // 승인 시점에 재계산
    }
  } else {
    // 미출고 자재 — 취득사유 필수
    if (!acqType || !acqReason) {
      redirect(
        `/works/${workId}/reports/${reportId}?err=` +
          encodeURIComponent('출고받지 않은 자재는 취득사유를 입력하세요'),
      )
    }
    approvalStatus = '사후신고'
  }

  // 1) 차감 (필요한 경우)
  if (consumeAmount > 0 && holdingId) {
    const cr = await consumeHolding(holdingId, consumeAmount)
    if (!cr.ok) {
      redirect(`/works/${workId}/reports/${reportId}?err=` + encodeURIComponent('자재 차감 실패: ' + cr.error))
    }
  }

  // 2) row insert
  const { error } = await supabase.from('daily_report_materials').insert({
    report_id: reportId,
    holding_id: holdingId,
    material_id: materialId,
    custom_name: customName,
    custom_spec: customSpec,
    custom_unit: customUnit,
    quantity,
    notes,
    approval_status: approvalStatus,
    over_quantity: overQuantity,
    over_reason: overQuantity > 0 ? overReason : null,
    acquisition_reason_type: !holdingId ? acqType : null,
    acquisition_reason: !holdingId ? acqReason : null,
  })
  if (error) {
    if (consumeAmount > 0 && holdingId) await restoreHolding(holdingId, consumeAmount)
    redirect(`/works/${workId}/reports/${reportId}?err=` + encodeURIComponent('자재 추가 실패: ' + error.message))
  }

  revalidatePath(`/works/${workId}/reports/${reportId}`)
  revalidatePath('/stock/my')
  revalidatePath('/stock/approvals')
  revalidatePath('/')

  const okMsg =
    approvalStatus === '대기'
      ? '자재 사용 요청을 전송했습니다. 자재담당자 승인 후 반영됩니다'
      : approvalStatus === '사후신고'
        ? '자재 사용을 등록했습니다 (사후 신고)'
        : '자재를 추가했습니다'
  redirect(`/works/${workId}/reports/${reportId}?ok=` + encodeURIComponent(okMsg))
}

// 자재 row 삭제 — holding 차감 되돌리기 (자동승인·승인·사후신고 상태에서만 차감되어 있음)
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
    .select('id, holding_id, quantity, over_quantity, approval_status')
    .eq('id', id)
    .maybeSingle()
  const row = rowData as
    | {
        id: string
        holding_id: string | null
        quantity: number
        over_quantity: number
        approval_status: string
      }
    | null
  if (!row) {
    redirect(`/works/${workId}/reports/${reportId}?err=` + encodeURIComponent('자재 행을 찾을 수 없습니다'))
  }

  const { error } = await supabase.from('daily_report_materials').delete().eq('id', id)
  if (error) {
    redirect(`/works/${workId}/reports/${reportId}?err=` + encodeURIComponent('삭제 실패: ' + error.message))
  }
  // 대기·반려 상태가 아니면서 holding 있을 때만 복원
  if (row.holding_id && row.approval_status !== '대기' && row.approval_status !== '반려') {
    const consumed = Number(row.quantity) - Number(row.over_quantity)
    if (consumed > 0) await restoreHolding(row.holding_id, consumed)
  }
  revalidatePath(`/works/${workId}/reports/${reportId}`)
  revalidatePath('/stock/my')
  revalidatePath('/stock/approvals')
  redirect(`/works/${workId}/reports/${reportId}?ok=` + encodeURIComponent('자재를 삭제했습니다'))
}

// ===== 자재담당자 — 사전 승인 처리 =====================================

async function requireStockManager() {
  const { supabase, me } = await requireUser()
  const isAdmin = me.permission === 'admin'
  if (!isAdmin && !me.can_manage_stock) {
    redirect('/?err=' + encodeURIComponent('자재 관리 권한이 없습니다'))
  }
  return { supabase, me }
}

export async function approveDailyMaterialUse(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  const comment = String(formData.get('comment') ?? '').trim() || null
  if (!id) redirect('/stock/approvals?err=' + encodeURIComponent('id 가 없습니다'))

  const { supabase, me } = await requireStockManager()

  const { data: rowData } = await supabase
    .from('daily_report_materials')
    .select('id, holding_id, quantity, approval_status')
    .eq('id', id)
    .maybeSingle()
  const row = rowData as
    | { id: string; holding_id: string | null; quantity: number; approval_status: string }
    | null
  if (!row) redirect('/stock/approvals?err=' + encodeURIComponent('자재 행 없음'))
  if (row.approval_status !== '대기') {
    redirect('/stock/approvals?err=' + encodeURIComponent('대기 중인 요청만 처리할 수 있습니다'))
  }

  // holding 차감 (잔량 확인 후 가능한 만큼)
  let overQuantity = 0
  let consumeAmount = Number(row.quantity)
  if (row.holding_id) {
    const { data: hRow } = await supabase
      .from('worker_holdings')
      .select('quantity_remaining')
      .eq('id', row.holding_id)
      .maybeSingle()
    const remaining = Number((hRow as { quantity_remaining: number } | null)?.quantity_remaining ?? 0)
    if (consumeAmount > remaining) {
      overQuantity = consumeAmount - remaining
      consumeAmount = remaining
    }
    if (consumeAmount > 0) {
      const cr = await consumeHolding(row.holding_id, consumeAmount)
      if (!cr.ok) {
        redirect('/stock/approvals?err=' + encodeURIComponent('차감 실패: ' + cr.error))
      }
    }
  }

  const { error } = await supabase
    .from('daily_report_materials')
    .update({
      approval_status: '승인',
      approved_by: me.id,
      approved_at: new Date().toISOString(),
      approval_comment: comment,
      over_quantity: overQuantity,
    })
    .eq('id', id)
  if (error) {
    // 롤백
    if (row.holding_id && consumeAmount > 0) await restoreHolding(row.holding_id, consumeAmount)
    redirect('/stock/approvals?err=' + encodeURIComponent('승인 실패: ' + error.message))
  }

  revalidatePath('/stock/approvals')
  revalidatePath('/stock/my')
  revalidatePath('/')
  redirect('/stock/approvals?ok=' + encodeURIComponent('자재 사용을 승인했습니다'))
}

export async function rejectDailyMaterialUse(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  const comment = String(formData.get('comment') ?? '').trim()
  if (!id) redirect('/stock/approvals?err=' + encodeURIComponent('id 가 없습니다'))
  if (!comment) {
    redirect('/stock/approvals?err=' + encodeURIComponent('반려 사유를 입력하세요'))
  }

  const { supabase, me } = await requireStockManager()

  const { data: rowData } = await supabase
    .from('daily_report_materials')
    .select('id, approval_status')
    .eq('id', id)
    .maybeSingle()
  const row = rowData as { id: string; approval_status: string } | null
  if (!row || row.approval_status !== '대기') {
    redirect('/stock/approvals?err=' + encodeURIComponent('대기 중인 요청만 반려할 수 있습니다'))
  }

  const { error } = await supabase
    .from('daily_report_materials')
    .update({
      approval_status: '반려',
      approved_by: me.id,
      approved_at: new Date().toISOString(),
      approval_comment: comment,
    })
    .eq('id', id)
  if (error) {
    redirect('/stock/approvals?err=' + encodeURIComponent('반려 실패: ' + error.message))
  }

  revalidatePath('/stock/approvals')
  revalidatePath('/')
  redirect('/stock/approvals?ok=' + encodeURIComponent('자재 사용을 반려했습니다'))
}
