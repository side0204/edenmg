import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { EmptyState } from '@/components/EmptyState'
import { SOURCE_TYPE_COLOR, formatMaterialLabel, formatQty, type StockSourceType } from '@/lib/stock'

type HoldingRow = {
  id: string
  lot_id: string
  work_id: string
  quantity_remaining: number
  first_issued_at: string
  last_issued_at: string
  stock_lots: {
    id: string
    source_type: StockSourceType
    supplier: string | null
    materials: {
      id: string
      name: string
      spec: string | null
      unit: string | null
      default_spec: string | null
      default_supplier: string | null
      supplier_code: string | null
    } | null
  } | null
  works: { id: string; name: string; order_id: string | null; client: string | null } | null
}

export default async function MyStockPage() {
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
    .from('worker_holdings')
    .select(
      `id, lot_id, work_id, quantity_remaining, first_issued_at, last_issued_at,
       stock_lots (
         id, source_type, supplier,
         materials ( id, name, spec, unit, default_spec, default_supplier, supplier_code )
       ),
       works ( id, name, order_id, client )`,
    )
    .eq('employee_id', me.id)
    .gt('quantity_remaining', 0)
    .order('last_issued_at', { ascending: false })

  const holdings = (data ?? []) as unknown as HoldingRow[]

  // work_id 별 grouping
  const byWork = new Map<string, HoldingRow[]>()
  for (const h of holdings) {
    const arr = byWork.get(h.work_id) ?? []
    arr.push(h)
    byWork.set(h.work_id, arr)
  }

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-5">
        <header>
          <Link
            href="/stock"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" /> 자재 관리
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">내 자재</h1>
          <p className="mt-1 text-sm text-slate-500">
            출고받은 자재 {holdings.length}건. 일보 작성 시 여기서 자동 선택됩니다.
          </p>
        </header>

        {holdings.length === 0 ? (
          <EmptyState
            icon={User}
            title="보유 중인 자재 없음"
            description="자재 관리자가 출고 등록을 하면 여기에 표시됩니다."
          />
        ) : (
          <div className="space-y-4">
            {Array.from(byWork.entries()).map(([workId, items]) => {
              const w = items[0]?.works
              return (
                <section key={workId} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <header className="border-b border-slate-100 pb-2 mb-3">
                    <p className="font-medium text-slate-900">
                      {w?.order_id && (
                        <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
                          {w.order_id}
                        </span>
                      )}
                      {w?.name ?? '?'}
                    </p>
                    {w?.client && (
                      <p className="mt-0.5 text-xs text-slate-500">발주처: {w.client}</p>
                    )}
                  </header>
                  <ul className="space-y-2">
                    {items.map((h) => {
                      const m = h.stock_lots?.materials
                      const label = m
                        ? formatMaterialLabel({
                            name: m.name,
                            spec: m.spec,
                            default_spec: m.default_spec,
                            default_supplier: m.default_supplier,
                            supplier_code: m.supplier_code,
                          })
                        : '?'
                      const unit = m?.unit ?? null
                      const src = h.stock_lots?.source_type
                      return (
                        <li
                          key={h.id}
                          className="flex items-center justify-between gap-2 rounded-lg bg-slate-50/60 p-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-slate-900">{label}</p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px]">
                              {src && (
                                <span
                                  className={
                                    'rounded-full border px-1.5 py-0.5 ' + SOURCE_TYPE_COLOR[src]
                                  }
                                >
                                  {src}
                                </span>
                              )}
                              {h.stock_lots?.supplier && (
                                <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-slate-600">
                                  {h.stock_lots.supplier}
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="shrink-0 text-base font-bold text-slate-900">
                            {formatQty(h.quantity_remaining, unit)}
                          </p>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
