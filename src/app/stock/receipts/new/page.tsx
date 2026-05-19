import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatMaterialLabel } from '@/lib/stock'
import { createReceipt } from '../../actions'

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

export default async function ReceiptNewPage() {
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

  const [{ data: wares }, { data: mats }, { data: works }] = await Promise.all([
    supabase
      .from('warehouses')
      .select('id, name, type')
      .eq('company_id', me.company_id)
      .eq('is_active', true)
      .order('type', { ascending: true })
      .order('name'),
    supabase
      .from('materials')
      .select('id, name, spec, unit, default_spec, default_supplier, supplier_code')
      .eq('company_id', me.company_id)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('works')
      .select('id, name, order_id, client')
      .eq('company_id', me.company_id)
      .order('name'),
  ])

  const warehouses = (wares ?? []) as Array<{ id: string; name: string; type: string }>
  const materials = (mats ?? []) as Array<{
    id: string
    name: string
    spec: string | null
    unit: string | null
    default_spec: string | null
    default_supplier: string | null
    supplier_code: string | null
  }>
  const workList = (works ?? []) as Array<{
    id: string
    name: string
    order_id: string | null
    client: string | null
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
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">입고 등록</h1>
          <p className="mt-1 text-sm text-slate-500">한 번의 입고 = 한 lot 생성</p>
        </header>

        <form
          action={createReceipt}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6"
        >
          <Field label="창고 *">
            <select name="warehouse_id" required className={inputClass}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.type === 'headquarters' ? '본사' : '현장'})
                </option>
              ))}
            </select>
          </Field>

          <Field label="자재 *">
            <select name="material_id" required defaultValue="" className={inputClass}>
              <option value="">자재 선택</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {formatMaterialLabel(m)}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              미등록 자재는 먼저 <Link href="/admin/materials/new" className="underline">자재 마스터</Link> 에 등록
            </p>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="사급/지입 *">
              <select name="source_type" required defaultValue="" className={inputClass}>
                <option value="">선택</option>
                <option value="사급">사급 (발주처제공)</option>
                <option value="지입">지입 (자체구매)</option>
              </select>
            </Field>
            <Field label="입고 형태 *">
              <select name="receipt_type" required defaultValue="일반입고" className={inputClass}>
                <option value="일반입고">일반입고</option>
                <option value="직납입고">직납입고</option>
              </select>
            </Field>
          </div>

          <Field label="발주처 (사급 시 필수)">
            <input
              name="supplier"
              maxLength={100}
              placeholder="예: KT, LG U+, SKB"
              className={inputClass}
            />
          </Field>

          <Field label="관련 작업 (직납 시 필수)">
            <select name="related_work_id" defaultValue="" className={inputClass}>
              <option value="">선택 안 함</option>
              {workList.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.order_id ? `[${w.order_id}] ` : ''}
                  {w.name}
                  {w.client ? ` · ${w.client}` : ''}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
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
            <Field label="단가 (지입 시)">
              <input
                name="unit_cost"
                type="number"
                step="1"
                min="0"
                placeholder="원"
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="메모">
            <textarea
              name="notes"
              rows={2}
              maxLength={500}
              className={`${inputClass} resize-none`}
            />
          </Field>

          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-medium text-white hover:bg-slate-800"
          >
            입고 등록
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
