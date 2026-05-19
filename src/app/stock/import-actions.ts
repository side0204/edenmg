'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { parseCsv, indexHeaders, getCell } from '@/lib/csv-parse'
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

async function requireStockManager() {
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
  const isAdmin = me.permission === 'admin'
  if (!isAdmin && !me.can_manage_stock) {
    redirect('/?err=' + encodeURIComponent('자재 관리 권한이 없습니다'))
  }
  return { supabase, me }
}

export type ImportResult = {
  ok: boolean
  message: string
  created: number
  updated: number
  skipped: number
  errors: Array<{ row: number; message: string }>
}

// ===== 자재 마스터 CSV import ============================================
// 헤더: 자재명*, 규격, 단위, 카테고리, 발주처, 발주처코드
export async function importMaterialsCsv(formData: FormData): Promise<ImportResult> {
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: '파일이 비어있습니다', created: 0, updated: 0, skipped: 0, errors: [] }
  }
  const text = await file.text()
  const { rows } = parseCsv(text)
  if (rows.length < 2) {
    return { ok: false, message: '데이터 행이 없습니다 (헤더 1행 + 데이터 1행 이상 필요)', created: 0, updated: 0, skipped: 0, errors: [] }
  }
  const header = rows[0]
  const cols = indexHeaders(header, ['자재명', '규격', '단위', '카테고리', '발주처', '발주처코드'])
  if (cols['자재명'] < 0) {
    return { ok: false, message: '필수 헤더 「자재명」 이 없습니다', created: 0, updated: 0, skipped: 0, errors: [] }
  }

  const { supabase, me } = await requireStockManager()

  let created = 0
  let updated = 0
  let skipped = 0
  const errors: Array<{ row: number; message: string }> = []

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const name = getCell(r, cols['자재명'])
    if (!name) {
      errors.push({ row: i + 1, message: '자재명이 비어있음' })
      continue
    }
    const spec = getCell(r, cols['규격']) || null
    const unit = getCell(r, cols['단위']) || null
    const category = getCell(r, cols['카테고리']) || null
    const supplier = getCell(r, cols['발주처']) || null
    const code = getCell(r, cols['발주처코드']) || null

    // 발주처코드 매칭 (사급 자재)
    let existingId: string | null = null
    if (supplier && code) {
      const { data: existing } = await supabase
        .from('materials')
        .select('id')
        .eq('company_id', me.company_id)
        .eq('default_supplier', supplier)
        .eq('supplier_code', code)
        .maybeSingle()
      existingId = (existing as { id: string } | null)?.id ?? null
    } else {
      // name + spec 기반 매칭 (지입)
      const { data: existing } = await supabase
        .from('materials')
        .select('id')
        .eq('company_id', me.company_id)
        .eq('name', name)
        .is('default_supplier', null)
        .maybeSingle()
      existingId = (existing as { id: string } | null)?.id ?? null
    }

    if (existingId) {
      // update — 카테고리·단위 등 최신값으로 덮어쓰기
      const { error } = await supabase
        .from('materials')
        .update({
          name,
          spec,
          unit,
          category,
          default_spec: spec,
          default_unit: unit,
          default_supplier: supplier,
          supplier_code: code,
        })
        .eq('id', existingId)
      if (error) {
        errors.push({ row: i + 1, message: '갱신 실패: ' + error.message })
        continue
      }
      updated++
    } else {
      const { error } = await supabase.from('materials').insert({
        company_id: me.company_id,
        name,
        spec,
        unit,
        category,
        default_spec: spec,
        default_unit: unit,
        default_supplier: supplier,
        supplier_code: code,
      })
      if (error) {
        errors.push({ row: i + 1, message: '추가 실패: ' + error.message })
        continue
      }
      created++
    }
  }

  skipped = errors.length
  revalidatePath('/admin/materials')
  return {
    ok: true,
    message: `자재 마스터 import 완료: 신규 ${created} · 갱신 ${updated} · 실패 ${skipped}`,
    created,
    updated,
    skipped,
    errors,
  }
}

// ===== 재고 lot CSV import ===============================================
// 헤더: 자재명*, 발주처코드, 규격, 단위, 사급지입*, 입고형태*, 발주처, 수량*, 단가, 관련공사번호, 메모
// 매칭: 발주처코드+발주처 → 자재명+발주처 → 자재명 단독
// 매칭 실패 시 자재 마스터 자동 생성 (옵션)
export async function importStockCsv(formData: FormData): Promise<ImportResult> {
  const file = formData.get('file')
  const autoCreate = String(formData.get('auto_create_master') ?? '') === '1'
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: '파일이 비어있습니다', created: 0, updated: 0, skipped: 0, errors: [] }
  }
  const text = await file.text()
  const { rows } = parseCsv(text)
  if (rows.length < 2) {
    return { ok: false, message: '데이터 행이 없습니다', created: 0, updated: 0, skipped: 0, errors: [] }
  }
  const header = rows[0]
  const cols = indexHeaders(header, [
    '자재명',
    '발주처코드',
    '규격',
    '단위',
    '사급지입',
    '입고형태',
    '발주처',
    '수량',
    '단가',
    '관련공사번호',
    '메모',
  ])
  const missing: string[] = []
  for (const k of ['자재명', '사급지입', '입고형태', '수량'] as const) {
    if (cols[k] < 0) missing.push(k)
  }
  if (missing.length > 0) {
    return {
      ok: false,
      message: `필수 헤더 누락: ${missing.join(', ')}`,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    }
  }

  const { supabase, me } = await requireStockManager()

  // 본사창고 한 번 조회
  const { data: whRow } = await supabase
    .from('warehouses')
    .select('id')
    .eq('company_id', me.company_id)
    .eq('type', 'headquarters')
    .eq('is_active', true)
    .maybeSingle()
  const warehouse = whRow as { id: string } | null
  if (!warehouse) {
    return {
      ok: false,
      message: '본사창고가 없습니다 (마이그 0022 실행 필요)',
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    }
  }

  // 관련 작업 캐시 (order_id 매칭)
  const workCache = new Map<string, string>()

  let created = 0
  const updated = 0
  let skipped = 0
  const errors: Array<{ row: number; message: string }> = []

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const name = getCell(r, cols['자재명'])
    if (!name) {
      errors.push({ row: i + 1, message: '자재명이 비어있음' })
      continue
    }
    const code = getCell(r, cols['발주처코드']) || null
    const spec = getCell(r, cols['규격']) || null
    const unit = getCell(r, cols['단위']) || null
    const sourceTypeRaw = getCell(r, cols['사급지입']) as StockSourceType
    if (!STOCK_SOURCE_TYPE_VALUES.includes(sourceTypeRaw)) {
      errors.push({ row: i + 1, message: `사급지입 값 '${sourceTypeRaw}' 불가 (사급/지입)` })
      continue
    }
    const receiptTypeRaw = getCell(r, cols['입고형태']) as StockReceiptType
    if (!STOCK_RECEIPT_TYPE_VALUES.includes(receiptTypeRaw)) {
      errors.push({ row: i + 1, message: `입고형태 값 '${receiptTypeRaw}' 불가 (일반입고/직납입고)` })
      continue
    }
    const supplier = getCell(r, cols['발주처']) || null
    if (sourceTypeRaw === '사급' && !supplier) {
      errors.push({ row: i + 1, message: '사급은 발주처 필수' })
      continue
    }
    const qtyStr = getCell(r, cols['수량'])
    const quantity = Number(qtyStr)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors.push({ row: i + 1, message: `수량 '${qtyStr}' 이 올바르지 않음` })
      continue
    }
    const unitCostStr = getCell(r, cols['단가'])
    const unitCost = unitCostStr ? Number(unitCostStr) : null
    if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) {
      errors.push({ row: i + 1, message: `단가 '${unitCostStr}' 이 올바르지 않음` })
      continue
    }
    const orderId = getCell(r, cols['관련공사번호']) || null
    const notes = getCell(r, cols['메모']) || null

    // 직납이면 관련 작업 필수
    let relatedWorkId: string | null = null
    if (receiptTypeRaw === '직납입고') {
      if (!orderId) {
        errors.push({ row: i + 1, message: '직납입고는 관련공사번호 필수' })
        continue
      }
      let wid = workCache.get(orderId) ?? null
      if (!wid) {
        const { data: w } = await supabase
          .from('works')
          .select('id')
          .eq('company_id', me.company_id)
          .eq('order_id', orderId)
          .limit(1)
          .maybeSingle()
        wid = (w as { id: string } | null)?.id ?? null
        if (wid) workCache.set(orderId, wid)
      }
      if (!wid) {
        errors.push({ row: i + 1, message: `공사번호 '${orderId}' 작업을 찾을 수 없음` })
        continue
      }
      relatedWorkId = wid
    }

    // 자재 매칭
    let materialId: string | null = null
    if (code && supplier) {
      const { data: m } = await supabase
        .from('materials')
        .select('id')
        .eq('company_id', me.company_id)
        .eq('default_supplier', supplier)
        .eq('supplier_code', code)
        .maybeSingle()
      materialId = (m as { id: string } | null)?.id ?? null
    }
    if (!materialId && supplier) {
      const { data: m } = await supabase
        .from('materials')
        .select('id')
        .eq('company_id', me.company_id)
        .eq('default_supplier', supplier)
        .eq('name', name)
        .maybeSingle()
      materialId = (m as { id: string } | null)?.id ?? null
    }
    if (!materialId) {
      const { data: m } = await supabase
        .from('materials')
        .select('id')
        .eq('company_id', me.company_id)
        .eq('name', name)
        .is('default_supplier', null)
        .maybeSingle()
      materialId = (m as { id: string } | null)?.id ?? null
    }

    if (!materialId) {
      if (!autoCreate) {
        errors.push({ row: i + 1, message: `자재 '${name}' 매칭 실패 (마스터 자동 생성 꺼짐)` })
        continue
      }
      const { data: newM, error } = await supabase
        .from('materials')
        .insert({
          company_id: me.company_id,
          name,
          spec,
          unit,
          default_spec: spec,
          default_unit: unit,
          default_supplier: supplier,
          supplier_code: code,
        })
        .select('id')
        .single()
      if (error || !newM) {
        errors.push({ row: i + 1, message: '자재 마스터 자동 생성 실패: ' + (error?.message ?? '') })
        continue
      }
      materialId = newM.id
    }

    // receipt + lot insert
    const { data: receipt, error: rErr } = await supabase
      .from('stock_receipts')
      .insert({
        company_id: me.company_id,
        warehouse_id: warehouse.id,
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
      errors.push({ row: i + 1, message: '입고 실패: ' + (rErr?.message ?? '') })
      continue
    }
    const { error: lErr } = await supabase.from('stock_lots').insert({
      receipt_id: receipt.id,
      company_id: me.company_id,
      warehouse_id: warehouse.id,
      material_id: materialId,
      source_type: sourceTypeRaw,
      supplier: sourceTypeRaw === '사급' ? supplier : null,
      related_work_id: relatedWorkId,
      quantity_initial: quantity,
      quantity_remaining: quantity,
      is_depleted: false,
    })
    if (lErr) {
      errors.push({ row: i + 1, message: 'lot 생성 실패: ' + lErr.message })
      continue
    }
    created++
  }

  skipped = errors.length
  revalidatePath('/stock/lots')
  revalidatePath('/stock')
  return {
    ok: true,
    message: `재고 import 완료: 신규 ${created} · 실패 ${skipped}`,
    created,
    updated,
    skipped,
    errors,
  }
}
