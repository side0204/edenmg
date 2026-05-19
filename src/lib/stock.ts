// 자재관리 (M4) 공통 유틸. server/client 양쪽에서 사용.

export type StockSourceType = '사급' | '지입'
export const STOCK_SOURCE_TYPE_VALUES: readonly StockSourceType[] = ['사급', '지입']

export type StockReceiptType = '일반입고' | '직납입고'
export const STOCK_RECEIPT_TYPE_VALUES: readonly StockReceiptType[] = ['일반입고', '직납입고']

export type WarehouseType = 'headquarters' | 'site'

export const WAREHOUSE_TYPE_LABEL: Record<WarehouseType, string> = {
  headquarters: '본사창고',
  site: '현장창고',
}

export const SOURCE_TYPE_COLOR: Record<StockSourceType, string> = {
  '사급': 'text-blue-700 bg-blue-50 border-blue-200',
  '지입': 'text-emerald-700 bg-emerald-50 border-emerald-200',
}

export const RECEIPT_TYPE_COLOR: Record<StockReceiptType, string> = {
  '일반입고': 'text-slate-700 bg-slate-50 border-slate-200',
  '직납입고': 'text-amber-700 bg-amber-50 border-amber-200',
}

// 자재 표시 라벨 — 자재명 + (규격) + 발주처 코드 (사급)
export function formatMaterialLabel(m: {
  name: string
  spec?: string | null
  default_spec?: string | null
  default_supplier?: string | null
  supplier_code?: string | null
}): string {
  const spec = m.spec ?? m.default_spec
  const supplier = m.default_supplier
  const code = m.supplier_code
  const parts = [m.name]
  if (spec) parts.push(`(${spec})`)
  if (supplier && code) parts.push(`· ${supplier}/${code}`)
  else if (supplier) parts.push(`· ${supplier}`)
  return parts.join(' ')
}

// 수량 + 단위 표시
export function formatQty(qty: number | string, unit?: string | null): string {
  const n = typeof qty === 'string' ? Number(qty) : qty
  if (!Number.isFinite(n)) return '?'
  // 정수면 정수, 아니면 소수점 절삭
  const s = Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, '')
  return unit ? `${s}${unit}` : s
}
