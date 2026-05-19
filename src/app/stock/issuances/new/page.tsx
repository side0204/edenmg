import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatMaterialLabel, formatQty, type StockSourceType } from '@/lib/stock'
import { createIssuance } from '../../actions'

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

export default async function IssuanceNewPage() {
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
  const me = meRow as
    | {
        id: string
        company_id: string
        permission: Permission
        is_active: boolean
        can_manage_stock: boolean
      }
    | null
  if (!me?.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  const canManage = me.permission === 'admin' || me.can_manage_stock
  if (!canManage) redirect('/?err=' + encodeURIComponent('자재 관리 권한이 없습니다'))

  const [{ data: lotsData }, { data: works }, { data: emps }] = await Promise.all([
    supabase
      .from('stock_lots')
      .select(
        `id, source_type, supplier, quantity_remaining,
         materials ( id, name, spec, unit, default_spec, default_supplier, supplier_code ),
         warehouses ( id, name )`,
      )
      .eq('company_id', me.company_id)
      .eq('is_depleted', false)
      .gt('quantity_remaining', 0)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('works')
      .select('id, name, order_id, client')
      .eq('company_id', me.company_id)
      .neq('status', '취소')
      .order('name'),
    supabase
      .from('employees')
      .select('id, name, position, team, work_type')
      .eq('company_id', me.company_id)
      .eq('is_active', true)
      .order('name'),
  ])

  const lots = (lotsData ?? []) as unknown as Array<{
    id: string
    source_type: StockSourceType
    supplier: string | null
    quantity_remaining: number
    materials: {
      id: string
      name: string
      spec: string | null
      unit: string | null
      default_spec: string | null
      default_supplier: string | null
      supplier_code: string | null
    } | null
    warehouses: { id: string; name: string } | null
  }>
  const workList = (works ?? []) as Array<{
    id: string
    name: string
    order_id: string | null
    client: string | null
  }>
  const employees = (emps ?? []) as Array<{
    id: string
    name: string
    position: string | null
    team: string | null
    work_type: string | null
  }>

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-xl space-y-5">
        <header>
          <Link
            href="/stock"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" /> 자재 관리
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">출고 등록</h1>
          <p className="mt-1 text-sm text-slate-500">
            창고 lot → 작업자 보유 자재. 작업자가 일보에서 사용하면 자동 차감됩니다.
          </p>
        </header>

        <form
          action={createIssuance}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6"
        >
          <Field label="자재(lot) *">
            <select name="lot_id" required defaultValue="" className={inputClass}>
              <option value="">자재 선택</option>
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
                return (
                  <option key={l.id} value={l.id}>
                    [{l.source_type}] {label} · 잔량 {formatQty(l.quantity_remaining, m?.unit)} · {l.warehouses?.name}
                  </option>
                )
              })}
            </select>
            {lots.length === 0 && (
              <p className="mt-1 text-xs text-amber-700">
                활성 lot 이 없습니다. 먼저 <Link href="/stock/receipts/new" className="underline">입고 등록</Link>
              </p>
            )}
          </Field>

          <Field label="작업 *">
            <select name="work_id" required defaultValue="" className={inputClass}>
              <option value="">작업 선택</option>
              {workList.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.order_id ? `[${w.order_id}] ` : ''}
                  {w.name}
                  {w.client ? ` · ${w.client}` : ''}
                </option>
              ))}
            </select>
          </Field>

          <Field label="작업자 *">
            <select name="employee_id" required defaultValue="" className={inputClass}>
              <option value="">작업자 선택</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                  {e.position ? ` · ${e.position}` : ''}
                  {e.team ? ` · ${e.team}` : ''}
                  {e.work_type ? ` · ${e.work_type}` : ''}
                </option>
              ))}
            </select>
          </Field>

          <Field label="수량 *">
            <input
              name="quantity"
              type="number"
              step="0.001"
              min="0.001"
              required
              className={inputClass}
            />
          </Field>

          <Field label="메모">
            <input name="notes" maxLength={200} className={inputClass} />
          </Field>

          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-medium text-white hover:bg-slate-800"
          >
            출고 등록
          </button>
        </form>
      </div>
    </main>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900'
