import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  REPORT_PROGRESS_COLOR,
  REPORT_STATUS_COLOR,
  reportLabel,
  type WorkReportProgress,
  type WorkReportStatus,
  type WorkWorkerType,
} from '@/lib/work'
import { formatQty, type StockSourceType } from '@/lib/stock'
import { approveReport, rejectReport, updateReport } from '../../../report-actions'
import { removeDailyReportMaterial } from '../../../daily-material-actions'
import { ReportForm, type ReportFormValues } from '../../../ReportForm'
import DailyMaterialsClient from '../../../DailyMaterialsClient'
import type { HoldingOption } from '../../../HoldingPicker'

type WorkRow = {
  id: string
  company_id: string
  name: string
  worker_type: WorkWorkerType | null
  assignee_employee_id: string | null
}

type ReportRow = {
  id: string
  work_id: string
  author_employee_id: string
  report_date: string
  content: string
  materials_used: string | null
  progress: WorkReportProgress
  notes: string | null
  status: WorkReportStatus
  reviewed_by: string | null
  reviewed_at: string | null
  review_comment: string | null
  created_at: string
  updated_at: string
}

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string; reportId: string }>
}) {
  const { id, reportId } = await params
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
    | {
        id: string
        company_id: string
        permission: 'worker' | 'team_member' | 'team_leader' | 'admin'
        is_active: boolean
      }
    | null
  if (!me || !me.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))

  const { data: workData } = await supabase
    .from('works')
    .select('id, company_id, name, worker_type, assignee_employee_id')
    .eq('id', id)
    .maybeSingle()
  const work = workData as WorkRow | null
  if (!work || work.company_id !== me.company_id) notFound()

  const { data: reportData } = await supabase
    .from('work_daily_reports')
    .select(
      'id, work_id, author_employee_id, report_date, content, materials_used, progress, notes, status, reviewed_by, reviewed_at, review_comment, created_at, updated_at',
    )
    .eq('id', reportId)
    .maybeSingle()
  const report = reportData as ReportRow | null
  if (!report || report.work_id !== work.id) notFound()

  // 직원 이름 매핑
  const ids = new Set<string>([report.author_employee_id])
  if (report.reviewed_by) ids.add(report.reviewed_by)
  const { data: emps } = await supabase
    .from('employees')
    .select('id, name, position, team')
    .in('id', Array.from(ids))
  const empMap = new Map<
    string,
    { name: string; position: string | null; team: string | null }
  >()
  for (const e of (emps ?? []) as { id: string; name: string; position: string | null; team: string | null }[]) {
    empMap.set(e.id, { name: e.name, position: e.position, team: e.team })
  }

  const author = empMap.get(report.author_employee_id)
  const reviewer = report.reviewed_by ? empMap.get(report.reviewed_by) : null

  const isAdmin = me.permission === 'admin'
  const isAuthor = report.author_employee_id === me.id
  const isAssignee = work.assignee_employee_id === me.id
  const canEdit = isAuthor && report.status === '대기'
  const canReview = (isAdmin || isAssignee) && report.status === '대기'

  // 자재 사용 (구조화) + 작성자 holding (picker 용)
  const [{ data: matRows }, { data: myHoldings }, { data: masterList }] = await Promise.all([
    supabase
      .from('daily_report_materials')
      .select(
        `id, holding_id, material_id, custom_name, custom_spec, custom_unit, quantity, notes, created_at,
         materials ( id, name, spec, unit ),
         worker_holdings (
           id, employee_id, work_id, quantity_remaining,
           stock_lots ( source_type, supplier, materials ( name, spec, unit, default_spec, default_supplier, supplier_code ) )
         )`,
      )
      .eq('report_id', reportId)
      .order('created_at'),
    supabase
      .from('worker_holdings')
      .select(
        `id, work_id, quantity_remaining,
         stock_lots (
           source_type, supplier,
           materials ( id, name, spec, unit, default_spec, default_supplier, supplier_code )
         ),
         works ( id, name, order_id )`,
      )
      .eq('employee_id', report.author_employee_id)
      .gt('quantity_remaining', 0),
    supabase
      .from('materials')
      .select('id, name, spec, unit')
      .eq('company_id', me.company_id)
      .eq('is_active', true)
      .order('name'),
  ])

  type MaterialRow = {
    id: string
    holding_id: string | null
    material_id: string | null
    custom_name: string | null
    custom_spec: string | null
    custom_unit: string | null
    quantity: number
    notes: string | null
    materials: { name: string; spec: string | null; unit: string | null } | null
    worker_holdings: {
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
        } | null
      } | null
    } | null
  }
  const reportMaterials = (matRows ?? []) as unknown as MaterialRow[]

  type HoldingRaw = {
    id: string
    work_id: string
    quantity_remaining: number
    stock_lots: {
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
    works: { id: string; name: string; order_id: string | null } | null
  }
  const holdingOptions: HoldingOption[] = ((myHoldings ?? []) as unknown as HoldingRaw[])
    .filter((h) => h.stock_lots?.materials && h.works)
    .map((h) => ({
      id: h.id,
      work_id: h.work_id,
      work_name: h.works!.name,
      work_order_id: h.works!.order_id,
      quantity_remaining: Number(h.quantity_remaining),
      source_type: h.stock_lots!.source_type,
      supplier: h.stock_lots!.supplier,
      material: h.stock_lots!.materials!,
    }))
  const masters = (masterList ?? []) as Array<{
    id: string
    name: string
    spec: string | null
    unit: string | null
  }>

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-md space-y-5">
        <header>
          <Link
            href={`/works/${work.id}`}
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
            {work.name}
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">
            {report.report_date} {reportLabel(work.worker_type)}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {author?.name ?? '?'}
            {author?.position ? ` · ${author.position}` : ''}
            {author?.team ? ` · ${author.team}팀` : ''}
          </p>
        </header>

        <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span
              className={
                'rounded-full border px-3 py-1 text-sm font-medium ' +
                REPORT_STATUS_COLOR[report.status]
              }
            >
              {report.status}
            </span>
            <span
              className={
                'rounded-full border px-3 py-1 text-sm font-medium ' +
                REPORT_PROGRESS_COLOR[report.progress]
              }
            >
              {report.progress}
            </span>
          </div>

          {canEdit ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              결재 전(대기)이라 수정할 수 있습니다. 결재가 시작되면 잠깁니다.
            </p>
          ) : null}

          <InfoRow label="작업내역">
            <span className="whitespace-pre-wrap">{report.content}</span>
          </InfoRow>
          {report.materials_used && (
            <InfoRow label="사용 자재 (메모)">
              <span className="whitespace-pre-wrap">{report.materials_used}</span>
            </InfoRow>
          )}
          {report.notes && (
            <InfoRow label="특이사항">
              <span className="whitespace-pre-wrap">{report.notes}</span>
            </InfoRow>
          )}
        </section>

        {/* 사용 자재 (구조화) */}
        <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
          <h2 className="text-base font-semibold text-slate-700 tracking-tight">
            사용 자재 ({reportMaterials.length})
          </h2>

          {reportMaterials.length === 0 ? (
            <p className="text-sm text-slate-400">기록된 자재 없음</p>
          ) : (
            <ul className="space-y-1">
              {reportMaterials.map((m) => {
                const lotMat = m.worker_holdings?.stock_lots?.materials
                const masterMat = m.materials
                const name = lotMat?.name ?? masterMat?.name ?? m.custom_name ?? '?'
                const spec = lotMat?.spec ?? lotMat?.default_spec ?? masterMat?.spec ?? m.custom_spec
                const unit = lotMat?.unit ?? masterMat?.unit ?? m.custom_unit
                const isHolding = !!m.holding_id
                const isMaster = !isHolding && !!m.material_id
                return (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-slate-50/60 px-2.5 py-1.5 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-slate-900">{name}</span>
                      {spec && <span className="ml-1 text-slate-500">({spec})</span>}
                      <span className="ml-2 font-semibold">{formatQty(m.quantity, unit)}</span>
                      {isHolding && (
                        <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700">
                          내 자재
                        </span>
                      )}
                      {isMaster && (
                        <span className="ml-1.5 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">
                          마스터
                        </span>
                      )}
                      {!isHolding && !isMaster && (
                        <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
                          직접
                        </span>
                      )}
                      {m.notes && <span className="ml-2 text-xs text-slate-500">· {m.notes}</span>}
                    </div>
                    {canEdit && (
                      <form action={removeDailyReportMaterial}>
                        <input type="hidden" name="id" value={m.id} />
                        <input type="hidden" name="report_id" value={report.id} />
                        <input type="hidden" name="work_id" value={work.id} />
                        <button
                          type="submit"
                          className="rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          aria-label="삭제"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </form>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {canEdit && (
            <DailyMaterialsClient
              reportId={report.id}
              workId={work.id}
              holdings={holdingOptions}
              masters={masters}
            />
          )}
        </section>

        {report.status !== '대기' && (
          <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-2">
            <h2 className="text-base font-semibold text-slate-700 tracking-tight">결재 결과</h2>
            <InfoRow label="처리자">
              {reviewer?.name ?? '?'}
              {reviewer?.position ? ` · ${reviewer.position}` : ''}
            </InfoRow>
            <InfoRow label="처리시각">
              {report.reviewed_at ? formatDateTime(report.reviewed_at) : '-'}
            </InfoRow>
            {report.review_comment && (
              <InfoRow label="의견">
                <span className="whitespace-pre-wrap">{report.review_comment}</span>
              </InfoRow>
            )}
          </section>
        )}

        {canEdit && (
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-slate-700 tracking-tight">
              {reportLabel(work.worker_type)} 수정
            </h2>
            <ReportForm
              initial={
                {
                  id: report.id,
                  work_id: work.id,
                  report_date: report.report_date,
                  content: report.content,
                  materials_used: report.materials_used ?? '',
                  progress: report.progress,
                  notes: report.notes ?? '',
                } satisfies ReportFormValues
              }
              action={updateReport}
              submitLabel="수정 저장"
              dateLocked
            />
          </section>
        )}

        {canReview && (
          <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
            <h2 className="text-base font-semibold text-slate-700 tracking-tight">결재</h2>
            <p className="text-xs text-slate-500">
              담당자로서 {reportLabel(work.worker_type)}를 승인하거나 반려합니다. 반려 시 사유를 작성자에게 전달하세요.
            </p>

            <form action={approveReport} className="space-y-2">
              <input type="hidden" name="id" value={report.id} />
              <input type="hidden" name="work_id" value={work.id} />
              <button
                type="submit"
                className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-base font-medium text-white hover:bg-emerald-700"
              >
                승인
              </button>
            </form>

            <form action={rejectReport} className="space-y-2 pt-2 border-t border-slate-100">
              <input type="hidden" name="id" value={report.id} />
              <input type="hidden" name="work_id" value={work.id} />
              <textarea
                name="review_comment"
                rows={2}
                maxLength={500}
                required
                placeholder="반려 사유 (필수)"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 resize-none"
              />
              <button
                type="submit"
                className="w-full rounded-lg bg-rose-600 px-4 py-2.5 text-base font-medium text-white hover:bg-rose-700"
              >
                반려
              </button>
            </form>
          </section>
        )}
      </div>
    </main>
  )
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
    return kst.toISOString().slice(0, 16).replace('T', ' ')
  } catch {
    return iso
  }
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="shrink-0 w-20 text-slate-500">{label}</span>
      <span className="text-slate-800 min-w-0 break-words flex-1">{children}</span>
    </div>
  )
}
