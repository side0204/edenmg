'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  STOCK_RECEIPT_TYPE_VALUES,
  STOCK_SOURCE_TYPE_VALUES,
  type StockReceiptType,
  type StockSourceType,
} from '@/lib/stock'

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
  if (!me || !me.is_active) {
    redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  }
  return { supabase, me }
}

function requireStockManager(me: Me) {
  const isAdmin = me.permission === 'admin'
  if (!isAdmin && !me.can_manage_stock) {
    redirect('/?err=' + encodeURIComponent('자재 관리 권한이 없습니다'))
  }
}

function parseQty(v: FormDataEntryValue | null): number | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? n : null
}

// ===== 입고 등록 ========================================================

export async function createReceipt(formData: FormData) {
  const warehouseId = String(formData.get('warehouse_id') ?? '').trim()
  const materialId = String(formData.get('material_id') ?? '').trim()
  const sourceTypeRaw = String(formData.get('source_type') ?? '').trim() as StockSourceType
  const receiptTypeRaw = String(formData.get('receipt_type') ?? '').trim() as StockReceiptType
  const supplier = String(formData.get('supplier') ?? '').trim() || null
  const relatedWorkId = String(formData.get('related_work_id') ?? '').trim() || null
  const quantity = parseQty(formData.get('quantity'))
  const unitCostRaw = String(formData.get('unit_cost') ?? '').trim()
  const unitCost = unitCostRaw ? Number(unitCostRaw) : null
  const notes = String(formData.get('notes') ?? '').trim() || null

  if (!warehouseId) redirect('/stock/receipts/new?err=' + encodeURIComponent('창고를 선택하세요'))
  if (!materialId) redirect('/stock/receipts/new?err=' + encodeURIComponent('자재를 선택하세요'))
  if (!STOCK_SOURCE_TYPE_VALUES.includes(sourceTypeRaw)) {
    redirect('/stock/receipts/new?err=' + encodeURIComponent('사급/지입 을 선택하세요'))
  }
  if (!STOCK_RECEIPT_TYPE_VALUES.includes(receiptTypeRaw)) {
    redirect('/stock/receipts/new?err=' + encodeURIComponent('입고 형태를 선택하세요'))
  }
  if (sourceTypeRaw === '사급' && !supplier) {
    redirect('/stock/receipts/new?err=' + encodeURIComponent('사급은 발주처가 필수입니다'))
  }
  if (receiptTypeRaw === '직납입고' && !relatedWorkId) {
    redirect('/stock/receipts/new?err=' + encodeURIComponent('직납입고는 관련 작업이 필수입니다'))
  }
  if (!quantity) {
    redirect('/stock/receipts/new?err=' + encodeURIComponent('수량은 0 보다 커야 합니다'))
  }
  if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) {
    redirect('/stock/receipts/new?err=' + encodeURIComponent('단가가 올바르지 않습니다'))
  }

  const { supabase, me } = await requireUser()
  requireStockManager(me)

  // 회사 스코프 검증 (warehouse + material + work)
  const { data: wh } = await supabase
    .from('warehouses')
    .select('id, company_id')
    .eq('id', warehouseId)
    .maybeSingle()
  if (!(wh as { company_id: string } | null) || (wh as { company_id: string }).company_id !== me.company_id) {
    redirect('/stock/receipts/new?err=' + encodeURIComponent('잘못된 창고입니다'))
  }
  const { data: mat } = await supabase
    .from('materials')
    .select('id, company_id, default_supplier')
    .eq('id', materialId)
    .maybeSingle()
  const material = mat as { id: string; company_id: string; default_supplier: string | null } | null
  if (!material || material.company_id !== me.company_id) {
    redirect('/stock/receipts/new?err=' + encodeURIComponent('잘못된 자재입니다'))
  }
  if (relatedWorkId) {
    const { data: w } = await supabase
      .from('works')
      .select('id, company_id')
      .eq('id', relatedWorkId)
      .maybeSingle()
    if (!(w as { company_id: string } | null) || (w as { company_id: string }).company_id !== me.company_id) {
      redirect('/stock/receipts/new?err=' + encodeURIComponent('잘못된 작업입니다'))
    }
  }

  // 사급일 때 자재 마스터 default_supplier 와 일치 강제 (격리)
  if (sourceTypeRaw === '사급' && material.default_supplier && material.default_supplier !== supplier) {
    redirect(
      '/stock/receipts/new?err=' +
        encodeURIComponent(
          `이 자재의 발주처는 '${material.default_supplier}' 입니다 (마스터 설정과 다름)`,
        ),
    )
  }

  // receipt + lot 한 번에
  const { data: receipt, error: rErr } = await supabase
    .from('stock_receipts')
    .insert({
      company_id: me.company_id,
      warehouse_id: warehouseId,
      material_id: materialId,
      source_type: sourceTypeRaw,
      receipt_type: receiptTypeRaw,
      supplier: sourceTypeRaw === '사급' ? supplier : null,
      related_work_id: relatedWorkId,
      quantity,
      unit_cost: unitCost,
      notes,
      received_by: me.id,
    })
    .select('id')
    .single()
  if (rErr || !receipt) {
    redirect(
      '/stock/receipts/new?err=' + encodeURIComponent('입고 실패: ' + (rErr?.message ?? '')),
    )
  }

  const { error: lErr } = await supabase.from('stock_lots').insert({
    receipt_id: receipt.id,
    company_id: me.company_id,
    warehouse_id: warehouseId,
    material_id: materialId,
    source_type: sourceTypeRaw,
    supplier: sourceTypeRaw === '사급' ? supplier : null,
    related_work_id: relatedWorkId,
    quantity_initial: quantity,
    quantity_remaining: quantity,
    is_depleted: false,
  })
  if (lErr) {
    redirect('/stock/receipts?err=' + encodeURIComponent('lot 생성 실패: ' + lErr.message))
  }

  revalidatePath('/stock')
  revalidatePath('/stock/lots')
  redirect('/stock/lots?ok=' + encodeURIComponent('입고가 등록되었습니다'))
}

// ===== 출고 등록 ========================================================
// lot 잔량 차감 + worker_holdings UPSERT + stock_issuances 기록

export async function createIssuance(formData: FormData) {
  const lotId = String(formData.get('lot_id') ?? '').trim()
  const workId = String(formData.get('work_id') ?? '').trim()
  const employeeId = String(formData.get('employee_id') ?? '').trim()
  const quantity = parseQty(formData.get('quantity'))
  const notes = String(formData.get('notes') ?? '').trim() || null

  if (!lotId) redirect('/stock/issuances/new?err=' + encodeURIComponent('자재(lot)를 선택하세요'))
  if (!workId) redirect('/stock/issuances/new?err=' + encodeURIComponent('작업을 선택하세요'))
  if (!employeeId) redirect('/stock/issuances/new?err=' + encodeURIComponent('작업자를 선택하세요'))
  if (!quantity) redirect('/stock/issuances/new?err=' + encodeURIComponent('수량을 입력하세요'))

  const { supabase, me } = await requireUser()
  requireStockManager(me)

  // lot 조회 + 잔량 확인
  const { data: lotRow } = await supabase
    .from('stock_lots')
    .select(
      'id, company_id, material_id, source_type, supplier, related_work_id, quantity_remaining, is_depleted',
    )
    .eq('id', lotId)
    .maybeSingle()
  const lot = lotRow as
    | {
        id: string
        company_id: string
        material_id: string
        source_type: StockSourceType
        supplier: string | null
        related_work_id: string | null
        quantity_remaining: number
        is_depleted: boolean
      }
    | null
  if (!lot || lot.company_id !== me.company_id) {
    redirect('/stock/issuances/new?err=' + encodeURIComponent('잘못된 lot 입니다'))
  }
  if (lot.is_depleted || lot.quantity_remaining <= 0) {
    redirect('/stock/issuances/new?err=' + encodeURIComponent('소진된 lot 입니다'))
  }
  if (quantity > lot.quantity_remaining) {
    redirect(
      '/stock/issuances/new?err=' +
        encodeURIComponent(`잔량(${lot.quantity_remaining}) 보다 많이 출고할 수 없습니다`),
    )
  }

  // work 조회 — 발주처(client) 격리 검증
  const { data: workRow } = await supabase
    .from('works')
    .select('id, company_id, name, order_id, client')
    .eq('id', workId)
    .maybeSingle()
  const work = workRow as
    | { id: string; company_id: string; name: string; order_id: string | null; client: string | null }
    | null
  if (!work || work.company_id !== me.company_id) {
    redirect('/stock/issuances/new?err=' + encodeURIComponent('잘못된 작업입니다'))
  }
  // 사급 lot 은 work.client 와 lot.supplier 가 같아야 (둘 다 명시된 경우만 enforce)
  if (lot.source_type === '사급' && lot.supplier && work.client && lot.supplier !== work.client) {
    redirect(
      '/stock/issuances/new?err=' +
        encodeURIComponent(`사급 자재 발주처(${lot.supplier}) ≠ 작업 발주처(${work.client})`),
    )
  }
  // work.client 가 비어있어도 운영 편의상 허용

  // employee 회사 검증
  const { data: empRow } = await supabase
    .from('employees')
    .select('id, company_id, is_active')
    .eq('id', employeeId)
    .maybeSingle()
  const emp = empRow as { id: string; company_id: string; is_active: boolean } | null
  if (!emp || emp.company_id !== me.company_id) {
    redirect('/stock/issuances/new?err=' + encodeURIComponent('잘못된 작업자입니다'))
  }
  if (!emp.is_active) {
    redirect('/stock/issuances/new?err=' + encodeURIComponent('비활성 작업자입니다'))
  }

  const now = new Date().toISOString()

  // 1) lot 차감
  const newRemaining = lot.quantity_remaining - quantity
  const isDepleted = newRemaining <= 0
  const { error: lotErr } = await supabase
    .from('stock_lots')
    .update({ quantity_remaining: newRemaining, is_depleted: isDepleted })
    .eq('id', lotId)
    .eq('quantity_remaining', lot.quantity_remaining)  // 낙관적 잠금
  if (lotErr) {
    redirect('/stock/issuances/new?err=' + encodeURIComponent('lot 차감 실패: ' + lotErr.message))
  }

  // 2) worker_holdings UPSERT
  const { data: existingHolding } = await supabase
    .from('worker_holdings')
    .select('id, quantity_remaining')
    .eq('employee_id', employeeId)
    .eq('lot_id', lotId)
    .eq('work_id', workId)
    .maybeSingle()
  const existing = existingHolding as { id: string; quantity_remaining: number } | null

  let holdingId: string
  if (existing) {
    const newQty = Number(existing.quantity_remaining) + quantity
    const { error: hErr } = await supabase
      .from('worker_holdings')
      .update({ quantity_remaining: newQty, last_issued_at: now })
      .eq('id', existing.id)
    if (hErr) {
      // 롤백 시도 (lot 복원)
      await supabase
        .from('stock_lots')
        .update({ quantity_remaining: lot.quantity_remaining, is_depleted: false })
        .eq('id', lotId)
      redirect('/stock/issuances/new?err=' + encodeURIComponent('holding 업데이트 실패: ' + hErr.message))
    }
    holdingId = existing.id
  } else {
    const { data: newH, error: hErr } = await supabase
      .from('worker_holdings')
      .insert({
        company_id: me.company_id,
        employee_id: employeeId,
        lot_id: lotId,
        work_id: workId,
        quantity_remaining: quantity,
      })
      .select('id')
      .single()
    if (hErr || !newH) {
      await supabase
        .from('stock_lots')
        .update({ quantity_remaining: lot.quantity_remaining, is_depleted: false })
        .eq('id', lotId)
      redirect('/stock/issuances/new?err=' + encodeURIComponent('holding 생성 실패: ' + (hErr?.message ?? '')))
    }
    holdingId = newH.id
  }

  // 3) issuance audit
  await supabase.from('stock_issuances').insert({
    company_id: me.company_id,
    lot_id: lotId,
    holding_id: holdingId,
    employee_id: employeeId,
    work_id: workId,
    quantity,
    issued_by: me.id,
    notes,
  })

  revalidatePath('/stock')
  revalidatePath('/stock/issuances')
  revalidatePath('/stock/my')
  redirect('/stock/issuances?ok=' + encodeURIComponent('출고가 등록되었습니다'))
}

// ===== holding 차감 (일보 사용 확정 시 server action 에서 호출) ============
// 일보 actions 에서 import 해서 사용.
//
// 인자: holding_id + qty. RLS 가 본인 holding 만 update 허용 (또는 admin).
// 반환: ok | error.
export async function consumeHolding(
  holdingId: string,
  quantity: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (quantity <= 0) return { ok: false, error: '수량은 0 보다 커야 합니다' }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: '로그인이 필요합니다' }

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, permission')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; company_id: string; permission: Permission } | null
  if (!me) return { ok: false, error: '계정을 찾을 수 없습니다' }

  const { data: hRow } = await supabase
    .from('worker_holdings')
    .select('id, employee_id, company_id, quantity_remaining')
    .eq('id', holdingId)
    .maybeSingle()
  const h = hRow as
    | { id: string; employee_id: string; company_id: string; quantity_remaining: number }
    | null
  if (!h || h.company_id !== me.company_id) return { ok: false, error: 'holding 없음' }
  // 본인 holding 또는 admin
  const isAdmin = me.permission === 'admin'
  if (!isAdmin && h.employee_id !== me.id) {
    return { ok: false, error: '본인 holding 만 차감할 수 있습니다' }
  }
  if (Number(h.quantity_remaining) < quantity) {
    return { ok: false, error: `잔량(${h.quantity_remaining}) 부족` }
  }

  const newQty = Number(h.quantity_remaining) - quantity
  const { error } = await supabase
    .from('worker_holdings')
    .update({ quantity_remaining: newQty })
    .eq('id', holdingId)
    .eq('quantity_remaining', h.quantity_remaining)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// holding 차감 되돌리기 (일보 자재 삭제 시)
export async function restoreHolding(
  holdingId: string,
  quantity: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (quantity <= 0) return { ok: false, error: '수량은 0 보다 커야 합니다' }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: '로그인이 필요합니다' }

  const { data: hRow } = await supabase
    .from('worker_holdings')
    .select('id, quantity_remaining')
    .eq('id', holdingId)
    .maybeSingle()
  const h = hRow as { id: string; quantity_remaining: number } | null
  if (!h) return { ok: false, error: 'holding 없음' }
  const newQty = Number(h.quantity_remaining) + quantity
  const { error } = await supabase
    .from('worker_holdings')
    .update({ quantity_remaining: newQty })
    .eq('id', holdingId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ===== 권한 토글 ========================================================

export async function toggleCanManageStock(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  const target = String(formData.get('target') ?? '').trim()
  if (!id) redirect('/admin/employees?err=' + encodeURIComponent('직원 id 가 없습니다'))

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: meRow } = await supabase
    .from('employees')
    .select('permission, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { permission: Permission; is_active: boolean } | null
  if (!me?.is_active || me.permission !== 'admin') {
    redirect('/admin/employees?err=' + encodeURIComponent('관리자 권한이 필요합니다'))
  }

  const { error } = await supabase
    .from('employees')
    .update({ can_manage_stock: target === 'true' })
    .eq('id', id)
  if (error) {
    redirect('/admin/employees?err=' + encodeURIComponent('변경 실패: ' + error.message))
  }
  revalidatePath('/admin/employees')
  redirect(
    '/admin/employees?ok=' +
      encodeURIComponent(target === 'true' ? '자재관리 권한을 부여했습니다' : '자재관리 권한을 해제했습니다'),
  )
}
