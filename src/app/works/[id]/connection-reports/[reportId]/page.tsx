import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  CONNECTION_TASK_TYPE_VALUES,
  PLAN_NODE_TYPE_LABEL,
  TASK_TYPE_COLOR,
  formatTaskLabel,
  type CableSpec,
  type ConnectionTaskType,
  type PlanNodeType,
  type WorkReportProgress,
  type WorkReportStatus,
} from '@/lib/connection'
import { REPORT_PROGRESS_COLOR, REPORT_STATUS_COLOR } from '@/lib/work'
import {
  addMaterial,
  addTask,
  approveConnectionReport,
  rejectConnectionReport,
  removeMaterial,
  removeTask,
  updateConnectionReportMeta,
} from '../../../connection-report-actions'

type ReportRow = {
  id: string
  work_id: string
  author_employee_id: string
  report_date: string
  notes: string | null
  progress: WorkReportProgress
  status: WorkReportStatus
  reviewed_by: string | null
  reviewed_at: string | null
  review_comment: string | null
}

type SegmentRow = {
  id: string
  plan_node_id: string
  cable_spec: CableSpec
  line_numbers: string
  cable_code: string | null
  is_completed: boolean
  segment_notes: string | null
}

type NodeRow = {
  id: string
  chain_id: string
  parent_id: string | null
  node_type: PlanNodeType
  name: string
  code: string | null
  spec: string | null
  spec_enum: CableSpec | null
  added_during_report_id: string | null
}

type TaskRow = {
  id: string
  plan_node_id: string
  task_type: ConnectionTaskType
  custom_task_name: string | null
  task_count: number
  notes: string | null
}

type MaterialRow = {
  id: string
  plan_node_id: string
  material_id: string | null
  custom_name: string | null
  custom_spec: string | null
  custom_unit: string | null
  quantity: number
  notes: string | null
}

type MaterialMaster = {
  id: string
  name: string
  spec: string | null
  unit: string | null
}

export default async function ConnectionReportDetailPage({
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
        permission: 'worker' | 'foreman' | 'admin' | 'ceo'
        is_active: boolean
      }
    | null
  if (!me || !me.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))

  const { data: workData } = await supabase
    .from('works')
    .select('id, company_id, name, assignee_employee_id')
    .eq('id', id)
    .maybeSingle()
  const work = workData as
    | { id: string; company_id: string; name: string; assignee_employee_id: string | null }
    | null
  if (!work || work.company_id !== me.company_id) notFound()

  const { data: reportData } = await supabase
    .from('connection_reports')
    .select(
      'id, work_id, author_employee_id, report_date, notes, progress, status, reviewed_by, reviewed_at, review_comment',
    )
    .eq('id', reportId)
    .maybeSingle()
  const report = reportData as ReportRow | null
  if (!report || report.work_id !== work.id) notFound()

  // 작성자·결재자 정보
  const empIds = new Set<string>([report.author_employee_id])
  if (report.reviewed_by) empIds.add(report.reviewed_by)
  const { data: empsData } = await supabase
    .from('employees')
    .select('id, name, position, team')
    .in('id', Array.from(empIds))
  const empMap = new Map<string, { name: string; position: string | null; team: string | null }>()
  for (const e of (empsData ?? []) as {
    id: string
    name: string
    position: string | null
    team: string | null
  }[]) {
    empMap.set(e.id, { name: e.name, position: e.position, team: e.team })
  }
  const author = empMap.get(report.author_employee_id)
  const reviewer = report.reviewed_by ? empMap.get(report.reviewed_by) : null

  // segments
  const { data: segsData } = await supabase
    .from('connection_report_segments')
    .select('id, plan_node_id, cable_spec, line_numbers, cable_code, is_completed, segment_notes')
    .eq('report_id', reportId)
  const segments = (segsData ?? []) as SegmentRow[]
  const segByNode = new Map<string, SegmentRow>(segments.map((s) => [s.plan_node_id, s]))

  // 일보의 segments 가 가리키는 chain 찾기 (segments → plan_nodes.chain_id)
  let activeChainId: string | null = null
  if (segments.length > 0) {
    const { data: firstNode } = await supabase
      .from('connection_plan_nodes')
      .select('chain_id')
      .eq('id', segments[0].plan_node_id)
      .maybeSingle()
    activeChainId = (firstNode as { chain_id: string } | null)?.chain_id ?? null
  }

  let chainName: string | null = null
  let nodes: NodeRow[] = []
  if (activeChainId) {
    const { data: chData } = await supabase
      .from('connection_chains')
      .select('id, name')
      .eq('id', activeChainId)
      .maybeSingle()
    chainName = (chData as { name: string | null } | null)?.name ?? null

    const { data: nodesData } = await supabase
      .from('connection_plan_nodes')
      .select('id, chain_id, parent_id, node_type, name, code, spec, spec_enum, added_during_report_id')
      .eq('chain_id', activeChainId)
      .order('position')
    nodes = (nodesData ?? []) as NodeRow[]
  }

  const childrenMap = new Map<string | null, NodeRow[]>()
  for (const n of nodes) {
    const arr = childrenMap.get(n.parent_id) ?? []
    arr.push(n)
    childrenMap.set(n.parent_id, arr)
  }
  const root = childrenMap.get(null)?.[0] ?? null

  // tasks + materials
  const { data: tasksData } = await supabase
    .from('connection_node_tasks')
    .select('id, plan_node_id, task_type, custom_task_name, task_count, notes')
    .eq('report_id', reportId)
  const tasks = (tasksData ?? []) as TaskRow[]
  const tasksByNode = new Map<string, TaskRow[]>()
  for (const t of tasks) {
    const arr = tasksByNode.get(t.plan_node_id) ?? []
    arr.push(t)
    tasksByNode.set(t.plan_node_id, arr)
  }

  const { data: materialsData } = await supabase
    .from('connection_node_materials')
    .select(
      'id, plan_node_id, material_id, custom_name, custom_spec, custom_unit, quantity, notes',
    )
    .eq('report_id', reportId)
  const materials = (materialsData ?? []) as MaterialRow[]
  const materialsByNode = new Map<string, MaterialRow[]>()
  for (const m of materials) {
    const arr = materialsByNode.get(m.plan_node_id) ?? []
    arr.push(m)
    materialsByNode.set(m.plan_node_id, arr)
  }

  // 자재 마스터 (활성)
  const { data: mastersData } = await supabase
    .from('materials')
    .select('id, name, spec, unit')
    .eq('company_id', me.company_id)
    .eq('is_active', true)
    .order('name')
  const masters = (mastersData ?? []) as MaterialMaster[]
  const masterMap = new Map<string, MaterialMaster>(masters.map((m) => [m.id, m]))

  const isAdmin = me.permission === 'admin' || me.permission === 'ceo'
  const isAuthor = report.author_employee_id === me.id
  const isAssignee = work.assignee_employee_id === me.id
  const canEdit = isAuthor && report.status === '대기'
  const canReview = (isAdmin || isAssignee) && report.status === '대기'

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-5">
        <header>
          <Link
            href={`/works/${work.id}`}
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
            {work.name}
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">
            {report.report_date} 접속일보
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {author?.name ?? '?'}
            {author?.position ? ` · ${author.position}` : ''}
            {author?.team ? ` · ${author.team}팀` : ''}
            {chainName && <span className="ml-1.5">· 「{chainName}」</span>}
          </p>
        </header>

        {/* 상태 + 메타 */}
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
            <form action={updateConnectionReportMeta} className="space-y-3 pt-2 border-t border-slate-100">
              <input type="hidden" name="id" value={report.id} />
              <input type="hidden" name="work_id" value={work.id} />
              <label className="block">
                <span className="block text-sm font-medium text-slate-700">진행률</span>
                <select name="progress" defaultValue={report.progress} className={inputClass}>
                  <option value="시작전">시작전</option>
                  <option value="진행중">진행중</option>
                  <option value="완료">완료</option>
                </select>
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-slate-700">비고</span>
                <textarea
                  name="notes"
                  rows={2}
                  maxLength={1000}
                  defaultValue={report.notes ?? ''}
                  className={`${inputClass} resize-none`}
                />
              </label>
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                메타 저장
              </button>
            </form>
          ) : (
            report.notes && (
              <p className="whitespace-pre-wrap text-sm text-slate-700">{report.notes}</p>
            )
          )}
        </section>

        {/* 트리 시각화: 노드 라인 + indented cable 카드 */}
        {root && (
          <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-1.5">
            <h2 className="text-base font-semibold text-slate-700 tracking-tight">chain</h2>
            <div className="pt-2 space-y-1.5">
              <FlatTree
                root={root}
                childrenMap={childrenMap}
                segByNode={segByNode}
                tasksByNode={tasksByNode}
                materialsByNode={materialsByNode}
                masterMap={masterMap}
                masters={masters}
                canEdit={canEdit}
                report={report}
                workId={work.id}
              />
            </div>
          </section>
        )}

        {/* 결재 결과 */}
        {report.status !== '대기' && (
          <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-2">
            <h2 className="text-base font-semibold text-slate-700 tracking-tight">결재 결과</h2>
            <p className="text-sm text-slate-700">
              <span className="text-slate-500">처리자: </span>
              {reviewer?.name ?? '?'} {reviewer?.position ? `· ${reviewer.position}` : ''}
            </p>
            <p className="text-sm text-slate-700">
              <span className="text-slate-500">처리시각: </span>
              {report.reviewed_at ? formatDateTime(report.reviewed_at) : '-'}
            </p>
            {report.review_comment && (
              <p className="text-sm text-slate-700">
                <span className="text-slate-500">의견: </span>
                <span className="whitespace-pre-wrap">{report.review_comment}</span>
              </p>
            )}
          </section>
        )}

        {/* 결재 액션 */}
        {canReview && (
          <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
            <h2 className="text-base font-semibold text-slate-700 tracking-tight">결재</h2>

            <form action={approveConnectionReport} className="space-y-2">
              <input type="hidden" name="id" value={report.id} />
              <input type="hidden" name="work_id" value={work.id} />
              <button
                type="submit"
                className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-base font-medium text-white hover:bg-emerald-700"
              >
                승인
              </button>
            </form>

            <form action={rejectConnectionReport} className="space-y-2 pt-2 border-t border-slate-100">
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

type FlatItem =
  | { kind: 'node'; node: NodeRow }
  | { kind: 'cable'; childNode: NodeRow; parentNode: NodeRow }

function FlatTree(props: {
  root: NodeRow
  childrenMap: Map<string | null, NodeRow[]>
  segByNode: Map<string, SegmentRow>
  tasksByNode: Map<string, TaskRow[]>
  materialsByNode: Map<string, MaterialRow[]>
  masterMap: Map<string, MaterialMaster>
  masters: MaterialMaster[]
  canEdit: boolean
  report: ReportRow
  workId: string
}) {
  const items: FlatItem[] = []
  const visit = (node: NodeRow) => {
    items.push({ kind: 'node', node })
    const children = props.childrenMap.get(node.id) ?? []
    for (const c of children) {
      items.push({ kind: 'cable', childNode: c, parentNode: node })
      visit(c)
    }
  }
  visit(props.root)

  return (
    <>
      {items.map((item, idx) => {
        if (item.kind === 'node') {
          return <NodeLine key={`node-${item.node.id}-${idx}`} node={item.node} />
        }
        return (
          <CableInfo
            key={`cable-${item.childNode.id}-${idx}`}
            childNode={item.childNode}
            parentNode={item.parentNode}
            segByNode={props.segByNode}
            tasksByNode={props.tasksByNode}
            materialsByNode={props.materialsByNode}
            masterMap={props.masterMap}
            masters={props.masters}
            canEdit={props.canEdit}
            report={props.report}
            workId={props.workId}
          />
        )
      })}
    </>
  )
}

function NodeLine({ node }: { node: NodeRow }) {
  const meta = [node.code && `ID: ${node.code}`, node.spec_enum ?? node.spec]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="py-1">
      <p className="text-base font-semibold text-slate-900">
        <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
          {PLAN_NODE_TYPE_LABEL[node.node_type]}
        </span>
        {node.name}
        {node.added_during_report_id && (
          <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-700">
            ★ 작업 중 추가
          </span>
        )}
      </p>
      {meta && <p className="mt-0.5 text-xs text-slate-500">{meta}</p>}
    </div>
  )
}

function CableInfo({
  childNode,
  parentNode,
  segByNode,
  tasksByNode,
  materialsByNode,
  masterMap,
  masters,
  canEdit,
  report,
  workId,
}: {
  childNode: NodeRow
  parentNode: NodeRow
  segByNode: Map<string, SegmentRow>
  tasksByNode: Map<string, TaskRow[]>
  materialsByNode: Map<string, MaterialRow[]>
  masterMap: Map<string, MaterialMaster>
  masters: MaterialMaster[]
  canEdit: boolean
  report: ReportRow
  workId: string
}) {
  const seg = segByNode.get(childNode.id)
  const tasks = tasksByNode.get(childNode.id) ?? []
  const mats = materialsByNode.get(childNode.id) ?? []

  return (
    <div className="ml-6 border-l-2 border-slate-200 pl-3">
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-1.5">
        <p className="text-[11px] text-slate-500">
          <span>{parentNode.name}</span>
          <span className="mx-1 text-slate-400">→</span>
          <span>{childNode.name}</span>
        </p>

        {seg ? (
          <>
            <DetailRow label="케이블규격" value={seg.cable_spec} />
            {seg.cable_code && <DetailRow label="케이블ID" value={seg.cable_code} />}
            <DetailRow label="선번" value={seg.line_numbers} />
            {seg.segment_notes && <DetailRow label="cable 메모" value={seg.segment_notes} />}
            <DetailRow
              label="완료여부"
              value={
                <span
                  className={
                    'rounded px-1.5 py-0.5 text-[10px] ' +
                    (seg.is_completed
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-200 text-slate-600')
                  }
                >
                  {seg.is_completed ? '완료' : '진행중'}
                </span>
              }
            />
          </>
        ) : (
          <p className="text-xs text-slate-400">이 cable 미작업</p>
        )}

        {/* 사용자재 */}
        <DetailRow
          label="사용자재"
          value={
            <div className="space-y-1">
              {mats.length === 0 ? (
                <span className="text-xs text-slate-400">없음</span>
              ) : (
                <ul className="space-y-0.5">
                  {mats.map((m) => {
                    const master = m.material_id ? masterMap.get(m.material_id) : null
                    const name = master?.name ?? m.custom_name ?? '?'
                    const spec = master?.spec ?? m.custom_spec
                    const unit = master?.unit ?? m.custom_unit
                    return (
                      <li
                        key={m.id}
                        className="flex items-center justify-between gap-2 text-xs text-slate-700"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{name}</span>
                          {spec && <span className="ml-1 text-slate-500">({spec})</span>}
                          <span className="ml-2">
                            ×{m.quantity}
                            {unit && <span className="ml-0.5">{unit}</span>}
                          </span>
                          {!master && (
                            <span className="ml-1.5 text-[10px] rounded bg-amber-100 px-1 text-amber-700">
                              직접입력
                            </span>
                          )}
                          {m.notes && <span className="ml-2 text-slate-500">· {m.notes}</span>}
                        </span>
                        {canEdit && (
                          <form action={removeMaterial}>
                            <input type="hidden" name="material_row_id" value={m.id} />
                            <input type="hidden" name="report_id" value={report.id} />
                            <input type="hidden" name="work_id" value={workId} />
                            <button
                              type="submit"
                              className="rounded p-0.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
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
                <details>
                  <summary className="cursor-pointer text-[11px] text-blue-600">+ 자재 추가</summary>
                  <form action={addMaterial} className="mt-1 grid grid-cols-2 gap-1">
                    <input type="hidden" name="report_id" value={report.id} />
                    <input type="hidden" name="work_id" value={workId} />
                    <input type="hidden" name="plan_node_id" value={childNode.id} />
                    <select name="material_id" defaultValue="" className={smallInput + ' col-span-2'}>
                      <option value="">마스터 선택 (또는 직접 입력)</option>
                      {masters.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                          {m.spec ? ` (${m.spec})` : ''}
                          {m.unit ? ` · ${m.unit}` : ''}
                        </option>
                      ))}
                    </select>
                    <input
                      name="custom_name"
                      placeholder="명"
                      maxLength={100}
                      className={smallInput}
                    />
                    <input
                      name="custom_spec"
                      placeholder="규격"
                      maxLength={100}
                      className={smallInput}
                    />
                    <input
                      name="custom_unit"
                      placeholder="단위"
                      maxLength={20}
                      className={smallInput}
                    />
                    <input
                      name="quantity"
                      type="number"
                      step="0.001"
                      min="0.001"
                      required
                      placeholder="수량 *"
                      className={smallInput}
                    />
                    <input
                      name="notes"
                      placeholder="메모"
                      maxLength={200}
                      className={smallInput + ' col-span-2'}
                    />
                    <button
                      type="submit"
                      className="col-span-2 rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800"
                    >
                      자재 추가
                    </button>
                  </form>
                </details>
              )}
            </div>
          }
        />

        {/* 공종 */}
        <DetailRow
          label="공종"
          value={
            <div className="space-y-1">
              {tasks.length === 0 ? (
                <span className="text-xs text-slate-400">없음</span>
              ) : (
                <ul className="space-y-0.5">
                  {tasks.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="min-w-0 flex-1">
                        <span
                          className={
                            'rounded-full border px-1.5 py-0.5 text-[10px] ' +
                            TASK_TYPE_COLOR[t.task_type]
                          }
                        >
                          {formatTaskLabel(t.task_type, t.custom_task_name)}
                        </span>
                        <span className="ml-1 font-medium text-slate-700">×{t.task_count}</span>
                        {t.notes && <span className="ml-1.5 text-slate-500">· {t.notes}</span>}
                      </span>
                      {canEdit && (
                        <form action={removeTask}>
                          <input type="hidden" name="task_id" value={t.id} />
                          <input type="hidden" name="report_id" value={report.id} />
                          <input type="hidden" name="work_id" value={workId} />
                          <button
                            type="submit"
                            className="rounded p-0.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            aria-label="삭제"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canEdit && (
                <details>
                  <summary className="cursor-pointer text-[11px] text-blue-600">+ 공종 추가</summary>
                  <form action={addTask} className="mt-1 grid grid-cols-2 gap-1">
                    <input type="hidden" name="report_id" value={report.id} />
                    <input type="hidden" name="work_id" value={workId} />
                    <input type="hidden" name="plan_node_id" value={childNode.id} />
                    <select name="task_type" required className={smallInput}>
                      <option value="">공종 선택</option>
                      {CONNECTION_TASK_TYPE_VALUES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <input
                      name="task_count"
                      type="number"
                      min="1"
                      required
                      placeholder="수량"
                      className={smallInput}
                    />
                    <input
                      name="custom_task_name"
                      placeholder="기타 시 공종명"
                      maxLength={50}
                      className={smallInput + ' col-span-2'}
                    />
                    <input
                      name="notes"
                      placeholder="메모"
                      maxLength={200}
                      className={smallInput + ' col-span-2'}
                    />
                    <button
                      type="submit"
                      className="col-span-2 rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800"
                    >
                      공종 추가
                    </button>
                  </form>
                </details>
              )}
            </div>
          }
        />
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5rem_1fr] items-start gap-2">
      <span className="pt-0.5 text-xs font-medium text-slate-600">{label}</span>
      <div className="min-w-0 text-sm text-slate-800">{value}</div>
    </div>
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

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900'
const smallInput =
  'w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900'
