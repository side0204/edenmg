import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Boxes, ChevronLeft, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { EmptyState } from '@/components/EmptyState'
import {
  SOURCE_TYPE_COLOR,
  formatMaterialLabel,
  formatQty,
  type StockSourceType,
} from '@/lib/stock'

type LotRow = {
  id: string
  warehouse_id: string
  material_id: string
  source_type: StockSourceType
  supplier: string | null
  related_work_id: string | null
  quantity_initial: number
  quantity_remaining: number
  is_depleted: boolean
  created_at: string
  warehouses: { id: string; name: string } | null
  materials: {
    id: string
    name: string
    spec: string | null
    unit: string | null
    default_spec: string | null
    default_supplier: string | null
    supplier_code: string | null
  } | null
  related_work: { id: string; name: string; order_id: string | null } | null
}

export default async function StockLotsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; src?: string; show?: string }>
}) {
  const sp = await searchParams
  const q = (sp.q ?? '').trim()
  const src = sp.src === '사급' || sp.src === '지입' ? sp.src : ''
  const showDepleted = sp.show === 'all'

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
    | { id: string; company_id: string; permission: string; is_active: boolean }
    | null
  if (!me?.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))

  let query = supabase
    .from('stock_lots')
    .select(
      `id, warehouse_id, material_id, source_type, supplier, related_work_id,
       quantity_initial, quantity_remaining, is_depleted, created_at,
       warehouses ( id, name ),
       materials ( id, name, spec, unit, default_spec, default_supplier, supplier_code ),
       related_work:works!stock_lots_related_work_id_fkey ( id, name, order_id )`,
    )
    .eq('company_id', me.company_id)
    .order('created_at', { ascending: false })
    .limit(500)

  if (!showDepleted) query = query.eq('is_depleted', false)
  if (src) query = query.eq('source_type', src)

  const { data, error } = await query
  let lots = (data ?? []) as unknown as LotRow[]

  // 클라이언트 측 검색 (자재명·발주처·발주처코드)
  if (q) {
    const lower = q.toLowerCase()
    lots = lots.filter((l) => {
      const m = l.materials
      const fields = [
        m?.name,
        m?.spec,
        m?.default_spec,
        m?.default_supplier,
        m?.supplier_code,
        l.supplier,
        l.related_work?.name,
        l.related_work?.order_id,
      ]
      return fields.some((f) => (f ?? '').toLowerCase().includes(lower))
    })
  }

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
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">재고 lot</h1>
          <p className="mt-1 text-sm text-slate-500">총 {lots.length}건 표시 (최대 500)</p>
        </header>

        {/* 필터 + 검색 */}
        <form
          action="/stock/lots"
          method="GET"
          className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2"
        >
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              name="q"
              defaultValue={q}
              placeholder="자재명·발주처·코드·공사번호"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              검색
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <FilterPill href="/stock/lots" active={!src && !showDepleted} label="전체 활성" />
            <FilterPill href="/stock/lots?src=사급" active={src === '사급' && !showDepleted} label="사급" />
            <FilterPill href="/stock/lots?src=지입" active={src === '지입' && !showDepleted} label="지입" />
            <FilterPill href="/stock/lots?show=all" active={showDepleted} label="소진 포함" />
          </div>
        </form>

        {error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            조회 실패: {error.message}
          </p>
        )}

        {!error && lots.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title="lot 없음"
            description="입고 등록 또는 보유자재 CSV 등록으로 자재를 추가하세요."
          />
        ) : (
          <ul className="space-y-2">
            {lots.map((l) => {
              const m = l.materials
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
              return (
                <li
                  key={l.id}
                  className={
                    'rounded-xl border bg-white p-3 ' +
                    (l.is_depleted ? 'border-slate-200 opacity-60' : 'border-slate-200')
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">{label}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                        <span
                          className={
                            'rounded-full border px-2 py-0.5 ' + SOURCE_TYPE_COLOR[l.source_type]
                          }
                        >
                          {l.source_type}
                        </span>
                        {l.supplier && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                            {l.supplier}
                          </span>
                        )}
                        {l.warehouses && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                            {l.warehouses.name}
                          </span>
                        )}
                        {l.related_work && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
                            직납: {l.related_work.order_id ?? l.related_work.name}
                          </span>
                        )}
                        {l.is_depleted && (
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-slate-600">
                            소진
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-bold text-slate-900">
                        {formatQty(l.quantity_remaining, unit)}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        / {formatQty(l.quantity_initial, unit)}
                      </p>
                    </div>
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

function FilterPill({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={
        'rounded-full border px-2.5 py-1 ' +
        (active
          ? 'border-slate-900 bg-slate-900 text-white'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50')
      }
    >
      {label}
    </Link>
  )
}
