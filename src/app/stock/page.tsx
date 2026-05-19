import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  Boxes,
  CheckCircle2,
  ChevronLeft,
  Download,
  FileSpreadsheet,
  PackagePlus,
  Send,
  ShoppingBag,
  Truck,
  User,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

export default async function StockHomePage() {
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

  const isAdmin = me.permission === 'admin'
  const canManage = isAdmin || me.can_manage_stock

  // 통계 — lot · 내 자재 · 승인 대기 카운트
  const [{ count: activeLotsCount }, { count: depletedLotsCount }, { count: myHoldingsCount }, { count: pendingApprovalsCount }] =
    await Promise.all([
      supabase
        .from('stock_lots')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', me.company_id)
        .eq('is_depleted', false),
      supabase
        .from('stock_lots')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', me.company_id)
        .eq('is_depleted', true),
      supabase
        .from('worker_holdings')
        .select('id', { count: 'exact', head: true })
        .eq('employee_id', me.id)
        .gt('quantity_remaining', 0),
      canManage
        ? supabase
            .from('daily_report_materials')
            .select('id', { count: 'exact', head: true })
            .eq('approval_status', '대기')
        : Promise.resolve({ count: 0 }),
    ])

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <header>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />홈
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">자재 관리</h1>
          <p className="mt-1 text-sm text-slate-500">
            입고·재고·출고·내 자재 관리. 일보 작성 시 사용된 자재가 자동 차감됩니다.
          </p>
        </header>

        {/* 통계 카드 */}
        <section className="grid grid-cols-3 gap-3">
          <StatCard label="활성 lot" value={activeLotsCount ?? 0} icon={Boxes} color="text-blue-700 bg-blue-50" />
          <StatCard label="소진 lot" value={depletedLotsCount ?? 0} icon={Boxes} color="text-slate-500 bg-slate-50" />
          <StatCard label="내 자재" value={myHoldingsCount ?? 0} icon={User} color="text-emerald-700 bg-emerald-50" />
        </section>

        {/* 메인 액션 */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link
            href="/stock/my"
            className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 hover:border-emerald-500"
          >
            <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
              <User className="h-4 w-4" /> 내 자재
            </div>
            <p className="mt-2 text-base font-medium text-slate-900">출고 받은 자재 보기 →</p>
            <p className="mt-0.5 text-xs text-slate-600">일보 작성 시 자재 선택용</p>
          </Link>
          <Link
            href="/stock/lots"
            className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-slate-400"
          >
            <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <Boxes className="h-4 w-4" /> 재고
            </div>
            <p className="mt-2 text-base font-medium text-slate-900">전체 lot 목록 →</p>
            <p className="mt-0.5 text-xs text-slate-600">자재·발주처·창고 검색</p>
          </Link>
        </section>

        {/* 관리자/구매담당 액션 */}
        {canManage && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-600 tracking-wider uppercase">관리</h2>

            {/* 승인 대기 카드 — 카운트가 0이라도 표시해서 진입점 유지 */}
            <Link
              href="/stock/approvals"
              className={
                'flex items-center justify-between gap-2 rounded-xl border p-4 ' +
                ((pendingApprovalsCount ?? 0) > 0
                  ? 'border-amber-300 bg-amber-50 hover:border-amber-500'
                  : 'border-slate-200 bg-white hover:border-slate-400')
              }
            >
              <div className="inline-flex items-center gap-2">
                <CheckCircle2
                  className={
                    'h-5 w-5 ' +
                    ((pendingApprovalsCount ?? 0) > 0 ? 'text-amber-600' : 'text-slate-400')
                  }
                />
                <span className="text-base font-semibold text-slate-900">자재 사용 승인</span>
              </div>
              <span
                className={
                  'rounded-full px-2.5 py-1 text-sm font-bold ' +
                  ((pendingApprovalsCount ?? 0) > 0
                    ? 'bg-amber-200 text-amber-900'
                    : 'bg-slate-100 text-slate-500')
                }
              >
                대기 {pendingApprovalsCount ?? 0}
              </span>
            </Link>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <ActionLink href="/stock/receipts/new" icon={PackagePlus} label="입고 등록" />
              <ActionLink href="/stock/issuances/new" icon={Send} label="출고 등록" />
              <ActionLink href="/stock/receipts" icon={ShoppingBag} label="입고 이력" />
              <ActionLink href="/stock/issuances" icon={Truck} label="출고 이력" />
              <ActionLink href="/stock/import" icon={FileSpreadsheet} label="보유자재 CSV 등록" />
              <ActionLink href="/admin/materials/import" icon={Download} label="자재 마스터 CSV 등록" />
            </div>
          </section>
        )}
      </div>
    </main>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: number
  icon: typeof Boxes
  color: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${color}`}>
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="mt-1.5 text-2xl font-bold text-slate-900">{value.toLocaleString()}</p>
    </div>
  )
}

function ActionLink({
  href,
  icon: Icon,
  label,
}: {
  href: string
  icon: typeof Boxes
  label: string
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
    >
      <Icon className="h-4 w-4 text-slate-500" />
      {label}
    </Link>
  )
}
