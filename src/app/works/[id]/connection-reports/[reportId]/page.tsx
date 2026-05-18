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

  const nodeMap = new Map<string, NodeRow>(nodes.map((n) => [n.id, n]))
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

        {/* 트리 + 노드별 cable·공종·자재 */}
        {root && (
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-slate-700 tracking-tight">노드 트리</h2>
            <NodeTree
              node={root}
              childrenMap={childrenMap}
              nodeMap={nodeMap}
              segByNode={segByNode}
              tasksByNode={tasksByNode}
              materialsByNode={materialsByNode}
              masterMap={masterMap}
              masters={masters}
              canEdit={canEdit}
              report={report}
              workId={work.id}
            />
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

function NodeTree(props: {
  node: NodeRow
  childrenMap: Map<string | null, NodeRow[]>
  nodeMap: Map<string, NodeRow>
  segByNode: Map<string, SegmentRow>
  tasksByNode: Map<string, TaskRow[]>
  materialsByNode: Map<string, MaterialRow[]>
  masterMap: Map<string, MaterialMaster>
  masters: MaterialMaster[]
  canEdit: boolean
  report: ReportRow
  workId: string
}) {
  const { node, childrenMap } = props
  const children = childrenMap.get(node.id) ?? []
  return (
    <div className="space-y-2">
      <NodeCard {...props} />
      {children.length > 0 && (
        <div className="ml-4 border-l-2 border-slate-100 pl-2 space-y-2">
          {children.map((c) => (
            <NodeTree
              key={c.id}
              {...props}
              node={c}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function NodeCard({
  node,
  nodeMap,
  segByNode,
  tasksByNode,
  materialsByNode,
  masterMap,
  masters,
  canEdit,
  report,
  workId,
}: {
  node: NodeRow
  childrenMap: Map<string | null, NodeRow[]>
  nodeMap: Map<string, NodeRow>
  segByNode: Map<string, SegmentRow>
  tasksByNode: Map<string, TaskRow[]>
  materialsByNode: Map<string, MaterialRow[]>
  masterMap: Map<string, MaterialMaster>
  masters: MaterialMaster[]
  canEdit: boolean
  report: ReportRow
  workId: string
}) {
  const seg = segByNode.get(node.id)
  const parent = node.parent_id ? nodeMap.get(node.parent_id) : null
  const tasks = tasksByNode.get(node.id) ?? []
  const mats = materialsByNode.get(node.id) ?? []

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
      <p className="text-sm">
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 mr-1.5">
          {PLAN_NODE_TYPE_LABEL[node.node_type]}
        </span>
        <span className="font-medium text-slate-900">{node.name}</span>
        {node.code && <span className="ml-1.5 text-xs text-slate-500">ID: {node.code}</span>}
        {(node.spec_enum || node.spec) && (
          <span className="ml-1.5 text-xs text-slate-500">{node.spec_enum ?? node.spec}</span>
        )}
        {node.added_during_report_id && (
          <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-700">
            ★ 작업 중 추가
          </span>
        )}
      </p>

      {/* cable (parent → this node) */}
      {parent && seg && (
        <div className="rounded-md bg-slate-50 border border-slate-200 px-2.5 py-2 text-xs">
          <p className="text-slate-500">
            cable: {parent.name} → {node.name}
          </p>
          <p className="mt-0.5 text-slate-800">
            <span className="font-medium">{seg.cable_spec}</span>
            {seg.cable_code && (
              <>
                <span className="mx-1">·</span>
                <span className="text-slate-600">ID: {seg.cable_code}</span>
              </>
            )}
            <span className="mx-1">·</span>
            <span>선번 {seg.line_numbers}</span>
            <span className="mx-1">·</span>
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
          </p>
          {seg.segment_notes && (
            <p className="mt-0.5 text-slate-500 whitespace-pre-wrap">{seg.segment_notes}</p>
          )}
        </div>
      )}

      {/* 공종 리스트 */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-slate-600">공종 ({tasks.length})</p>
        {tasks.length === 0 ? (
          <p className="text-xs text-slate-400">없음</p>
        ) : (
          <ul className="space-y-1">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0 flex-1">
                  <span
                    className={
                      'rounded-full border px-2 py-0.5 ' + TASK_TYPE_COLOR[t.task_type]
                    }
                  >
                    {formatTaskLabel(t.task_type, t.custom_task_name)}
                  </span>
                  <span className="ml-2 font-medium">×{t.task_count}</span>
                  {t.notes && <span className="ml-2 text-slate-500">· {t.notes}</span>}
                </div>
                {canEdit && (
                  <form action={removeTask}>
                    <input type="hidden" name="task_id" value={t.id} />
                    <input type="hidden" name="report_id" value={report.id} />
                    <input type="hidden" name="work_id" value={workId} />
                    <button
                      type="submit"
                      className="rounded p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      aria-label="삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-blue-600">+ 공종 추가</summary>
            <form action={addTask} className="mt-2 grid grid-cols-2 gap-2">
              <input type="hidden" name="report_id" value={report.id} />
              <input type="hidden" name="work_id" value={workId} />
              <input type="hidden" name="plan_node_id" value={node.id} />
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
                placeholder="기타 선택 시 공종명"
                maxLength={50}
                className={smallInput + ' col-span-2'}
              />
              <input
                name="notes"
                placeholder="메모 (선택)"
                maxLength={200}
                className={smallInput + ' col-span-2'}
              />
              <button
                type="submit"
                className="col-span-2 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
              >
                공종 추가
              </button>
            </form>
          </details>
        )}
      </div>

      {/* 자재 리스트 */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-slate-600">자재 ({mats.length})</p>
        {mats.length === 0 ? (
          <p className="text-xs text-slate-400">없음</p>
        ) : (
          <ul className="space-y-1">
            {mats.map((m) => {
              const master = m.material_id ? masterMap.get(m.material_id) : null
              const name = master?.name ?? m.custom_name ?? '?'
              const spec = master?.spec ?? m.custom_spec
              const unit = master?.unit ?? m.custom_unit
              return (
                <li key={m.id} className="flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-slate-800">{name}</span>
                    {spec && <span className="ml-1 text-slate-500">({spec})</span>}
                    <span className="ml-2">
                      {m.quantity}
                      {unit && <span className="ml-0.5">{unit}</span>}
                    </span>
                    {!master && (
                      <span className="ml-1.5 text-[10px] rounded bg-amber-100 px-1 text-amber-700">
                        직접입력
                      </span>
                    )}
                    {m.notes && <span className="ml-2 text-slate-500">· {m.notes}</span>}
                  </div>
                  {canEdit && (
                    <form action={removeMaterial}>
                      <input type="hidden" name="material_row_id" value={m.id} />
                      <input type="hidden" name="report_id" value={report.id} />
                      <input type="hidden" name="work_id" value={workId} />
                      <button
                        type="submit"
                        className="rounded p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        aria-label="삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {canEdit && (
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-blue-600">+ 자재 추가</summary>
            <form action={addMaterial} className="mt-2 grid grid-cols-2 gap-2">
              <input type="hidden" name="report_id" value={report.id} />
              <input type="hidden" name="work_id" value={workId} />
              <input type="hidden" name="plan_node_id" value={node.id} />
              <select name="material_id" defaultValue="" className={smallInput + ' col-span-2'}>
                <option value="">마스터에서 선택 (또는 직접 입력)</option>
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
                placeholder="직접 입력: 명"
                maxLength={100}
                className={smallInput}
              />
              <input
                name="custom_spec"
                placeholder="직접 입력: 규격"
                maxLength={100}
                className={smallInput}
              />
              <input
                name="custom_unit"
                placeholder="직접 입력: 단위"
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
                placeholder="메모 (선택)"
                maxLength={200}
                className={smallInput + ' col-span-2'}
              />
              <button
                type="submit"
                className="col-span-2 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
              >
                자재 추가
              </button>
            </form>
          </details>
        )}
      </div>

      {/* segments 가 없는 cable 표시 (parent 있고 seg 없으면 "이 cable 미작업") */}
      {parent && !seg && canEdit && (
        <p className="text-[11px] text-slate-400">
          ↑ 이 cable 미작업. 일보 추가/수정에서 케이블규격·선번 입력 시 자동 생성.
        </p>
      )}

      {/* 함체에는 cable 추가 입력 폼 — canEdit 일 때만 (제출 시점에 segments 가 없던 cable 을 추가) */}
      {canEdit && parent && !seg && (
        <AddSegmentForm
          report={report}
          workId={workId}
          node={node}
          parentName={parent.name}
        />
      )}
    </div>
  )
}

function AddSegmentForm({
  report,
  workId,
  node,
  parentName,
}: {
  report: ReportRow
  workId: string
  node: NodeRow
  parentName: string
}) {
  // 미작업 cable 에 대해 ad-hoc 으로 segment 추가하는 폼.
  // 작성자+대기 시에만 노출됨. server action 은 addMaterial 패턴과 유사하게 별도 액션이 필요한데,
  // 일보 작성 흐름상 빈 cable 은 보통 다음 일보에서 채우므로 v1 은 안내문만 둠.
  void report
  void workId
  void node
  void parentName
  return null
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
