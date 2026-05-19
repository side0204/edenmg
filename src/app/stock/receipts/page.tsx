import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, ShoppingBag } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { EmptyState } from '@/components/EmptyState'
import {
  RECEIPT_TYPE_COLOR,
  SOURCE_TYPE_COLOR,
  formatMaterialLabel,
  formatQty,
  type StockReceiptType,
  type StockSourceType,
} from '@/lib/stock'

type Row = {
  id: string
  source_type: StockSourceType
  receipt_type: StockReceiptType
  supplier: string | null
  quantity: number
  received_at: string
  notes: string | null
  warehouses: { name: string } | null
  materials: {
    name: string
    spec: string | null
    unit: string | null
    default_spec: string | null
    default_supplier: string | null
    supplier_code: string | null
  } | null
  related_work: { id: string; name: string; order_id: string | null } | null
  received_by_emp: { name: string } | null
}

export default async function ReceiptsHistoryPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; company_id: string; is_active: boolean } | null
  if (!me?.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))

  const { data } = await supabase
    .from('stock_receipts')
    .select(
      `id, source_type, receipt_type, supplier, quantity, received_at, notes,
       warehouses ( name ),
       materials ( name, spec, unit, default_spec, default_supplier, supplier_code ),
       related_work:works!stock_receipts_related_work_id_fkey ( id, name, order_id ),
       received_by_emp:employees!stock_receipts_received_by_fkey ( name )`,
    )
    .eq('company_id', me.company_id)
    .order('received_at', { ascending: false })
    .limit(200)

  const rows = (data ?? []) as unknown as Row[]

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <header>
          <Link
            href="/stock"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" /> 자재 관리
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">입고 이력</h1>
          <p className="mt-1 text-sm text-slate-500">최근 200건</p>
        </header>

        {rows.length === 0 ? (
          <EmptyState icon={ShoppingBag} title="입고 이력 없음" description="입고를 등록하면 여기에 표시됩니다." />
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const m = r.materials
              const label = m
                ? formatMaterialLabel({
                    name: m.name,
                    spec: m.spec,
                    default_spec: m.default_spec,
                    default_supplier: m.default_supplier,
                    supplier_code: m.supplier_code,
                  })
                : '?'
              return (
                <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">{label}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className={'rounded-full border px-2 py-0.5 ' + SOURCE_TYPE_COLOR[r.source_type]}>
                          {r.source_type}
                        </span>
                        <span className={'rounded-full border px-2 py-0.5 ' + RECEIPT_TYPE_COLOR[r.receipt_type]}>
                          {r.receipt_type}
                        </span>
                        {r.supplier && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                            {r.supplier}
                          </span>
                        )}
                        {r.related_work && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
                            {r.related_work.order_id ?? r.related_work.name}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {r.warehouses?.name} · {fmtDt(r.received_at)} · {r.received_by_emp?.name ?? '?'}
                      </p>
                      {r.notes && <p className="mt-0.5 text-xs text-slate-600">{r.notes}</p>}
                    </div>
                    <p className="shrink-0 text-lg font-bold text-slate-900">
                      {formatQty(r.quantity, m?.unit)}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}

function fmtDt(iso: string): string {
  try {
    const d = new Date(iso)
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
    return kst.toISOString().slice(0, 16).replace('T', ' ')
  } catch {
    return iso
  }
}
