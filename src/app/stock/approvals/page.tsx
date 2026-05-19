import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CheckCircle2, ChevronLeft, ClipboardCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { EmptyState } from '@/components/EmptyState'
import {
  APPROVAL_STATUS_COLOR,
  formatMaterialLabel,
  formatQty,
  type ApprovalStatus,
  type StockSourceType,
} from '@/lib/stock'
import {
  approveDailyMaterialUse,
  rejectDailyMaterialUse,
} from '../../works/daily-material-actions'

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

type Row = {
  id: string
  quantity: number
  over_quantity: number
  over_reason: string | null
  acquisition_reason: string | null
  approval_status: ApprovalStatus
  notes: string | null
  created_at: string
  worker_holdings: {
    work_id: string
    quantity_remaining: number
    works: { id: string; name: string; order_id: string | null; client: string | null } | null
    employees: { id: string; name: string; team: string | null } | null
    stock_lots: {
      source_type: StockSourceType
      supplier: string | null
      materials: {
        name: string
        spec: string | null
        unit: string | null
        default_spec: string | null
        default_supplier: string | null
        supplier_code: string | null
        low_value: boolean
      } | null
    } | null
  } | null
  work_daily_reports: {
    id: string
    report_date: string
    author_employee_id: string
    works: { id: string; name: string; order_id: string | null } | null
    author: { id: string; name: string } | null
  } | null
}

export default async function StockApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const sp = await searchParams
  const tab = sp.tab === 'all' ? 'all' : sp.tab === 'history' ? 'history' : 'pending'

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
  if (!canManage) redirect('/?err=' + encodeURIComponent('자재 관리 권한이 필요합니다'))

  let query = supabase
    .from('daily_report_materials')
    .select(
      `id, quantity, over_quantity, over_reason, acquisition_reason, approval_status, notes, created_at,
       worker_holdings (
         work_id, quantity_remaining,
         works ( id, name, order_id, client ),
         employees ( id, name, team ),
         stock_lots ( source_type, supplier, materials ( name, spec, unit, default_spec, default_supplier, supplier_code, low_value ) )
       ),
       work_daily_reports!inner (
         id, report_date, author_employee_id,
         works!inner ( id, name, order_id, company_id ),
         author:employees ( id, name )
       )`,
    )
    .order('created_at', { ascending: false })
    .limit(300)

  if (tab === 'pending') {
    query = query.eq('approval_status', '대기')
  } else if (tab === 'history') {
    query = query.in('approval_status', ['승인', '반려'])
  }
  // tab === 'all' : 모든 상태

  const { data, error } = await query
  // 회사 스코프 필터 (RLS 가 이미 막아주지만 명시적)
  let rows = (data ?? []) as unknown as Row[]
  rows = rows.filter(
    (r) =>
      (r.work_daily_reports?.works as { company_id?: string } | null)?.company_id === me.company_id,
  )

  const pendingCount = rows.filter((r) => r.approval_status === '대기').length

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
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">
            자재 사용 승인
            {pendingCount > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-base font-bold text-amber-800">
                {pendingCount}
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            작업 외 자재 사용 요청 + 사후 신고 + 미출고 자재 사용 audit
          </p>
        </header>

        {/* 탭 */}
        <div className="flex gap-1.5 text-xs">
          <TabLink href="/stock/approvals" active={tab === 'pending'} label={`대기 ${pendingCount}`} />
          <TabLink href="/stock/approvals?tab=history" active={tab === 'history'} label="처리완료" />
          <TabLink href="/stock/approvals?tab=all" active={tab === 'all'} label="전체" />
        </div>

        {error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            조회 실패: {error.message}
          </p>
        )}

        {rows.length === 0 && !error ? (
          <EmptyState
            icon={CheckCircle2}
            title="처리할 항목 없음"
            description="작업 외 자재 사용 요청·사후 신고·미출고 audit 가 여기 표시됩니다."
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => {
              const m = r.worker_holdings?.stock_lots?.materials
              const label = m
                ? formatMaterialLabel({
                    name: m.name,
                    spec: m.spec,
                    default_spec: m.default_spec,
                    default_supplier: m.default_supplier,
                    supplier_code: m.supplier_code,
                  })
                : '직접입력 자재'
              const unit = m?.unit ?? null
              const requester = r.work_daily_reports?.author
              const reportWork = r.work_daily_reports?.works
              const holdingWork = r.worker_holdings?.works
              const isOtherWork = !!holdingWork && holdingWork.id !== reportWork?.id
              return (
                <li
                  key={r.id}
                  className={
                    'rounded-2xl border bg-white p-4 space-y-2 ' +
                    (r.approval_status === '대기'
                      ? 'border-amber-300'
                      : 'border-slate-200')
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold text-slate-900">{label}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                        <span
                          className={
                            'rounded-full border px-2 py-0.5 ' +
                            APPROVAL_STATUS_COLOR[r.approval_status]
                          }
                        >
                          {r.approval_status}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                          {requester?.name ?? '?'}
                        </span>
                        {reportWork && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">
                            일보: {reportWork.order_id ?? reportWork.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="shrink-0 text-lg font-bold text-slate-900">
                      {formatQty(r.quantity, unit)}
                    </p>
                  </div>

                  {/* 메타 라인 */}
                  <div className="space-y-1 text-xs text-slate-600">
                    {isOtherWork && (
                      <p>
                        <span className="text-slate-400">출고처: </span>
                        <span className="text-amber-700">
                          {holdingWork!.order_id ?? holdingWork!.name}
                        </span>
                        <span className="ml-1 text-slate-400">→ 일보: </span>
                        <span>{reportWork?.order_id ?? reportWork?.name}</span>
                      </p>
                    )}
                    {r.worker_holdings?.stock_lots && (
                      <p>
                        <span className="text-slate-400">출처: </span>
                        {r.worker_holdings.stock_lots.source_type}
                        {r.worker_holdings.stock_lots.supplier && ` · ${r.worker_holdings.stock_lots.supplier}`}
                        {m?.low_value && ' · 저비용'}
                        <span className="ml-2 text-slate-400">잔량 </span>
                        {formatQty(r.worker_holdings.quantity_remaining, unit)}
                      </p>
                    )}
                    {r.over_quantity > 0 && (
                      <p className="text-rose-700">
                        초과 사용 {formatQty(r.over_quantity, unit)} · {r.over_reason}
                      </p>
                    )}
                    {r.acquisition_reason && (
                      <p className="text-amber-700">
                        취득사유: {r.acquisition_reason}
                      </p>
                    )}
                    {r.notes && <p className="text-slate-500">메모: {r.notes}</p>}
                    <p className="text-[10px] text-slate-400">{fmtDt(r.created_at)}</p>
                  </div>

                  {/* 승인/반려 액션 (대기 만) */}
                  {r.approval_status === '대기' && (
                    <div className="space-y-2 border-t border-slate-100 pt-2">
                      <form action={approveDailyMaterialUse} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={r.id} />
                        <input
                          name="comment"
                          placeholder="의견 (선택)"
                          maxLength={200}
                          className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        />
                        <button
                          type="submit"
                          className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                        >
                          승인
                        </button>
                      </form>
                      <form action={rejectDailyMaterialUse} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={r.id} />
                        <input
                          name="comment"
                          required
                          placeholder="반려 사유 *"
                          maxLength={200}
                          className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        />
                        <button
                          type="submit"
                          className="shrink-0 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                        >
                          반려
                        </button>
                      </form>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}

function TabLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={
        'inline-flex items-center gap-1 rounded-full px-3 py-1 ' +
        (active
          ? 'bg-slate-900 text-white'
          : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50')
      }
    >
      <ClipboardCheck className="h-3 w-3" />
      {label}
    </Link>
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
