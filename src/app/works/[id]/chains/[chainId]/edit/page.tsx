import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft, Pencil, Trash2, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  CABLE_SPEC_VALUES,
  PLAN_NODE_TYPE_LABEL,
  type CableSpec,
  type PlanNodeType,
} from '@/lib/connection'
import { createNode, deleteChain, deleteNode, updateChain } from '../../../../chain-actions'

type ChainRow = {
  id: string
  work_id: string
  name: string | null
  notes: string | null
}

type NodeRow = {
  id: string
  chain_id: string
  parent_id: string | null
  position: number
  node_type: PlanNodeType
  name: string
  code: string | null
  spec: string | null
  spec_enum: CableSpec | null
  lat: number | null
  lng: number | null
  address: string | null
  notes: string | null
  added_during_report_id: string | null
}

export default async function ChainEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; chainId: string }>
  searchParams: Promise<{ parent?: string; between_child?: string; return_to?: string }>
}) {
  const { id, chainId } = await params
  const { parent: parentParam, between_child: betweenChildParam, return_to: returnToParam } = await searchParams
  const returnTo =
    returnToParam && returnToParam.startsWith('/') && !returnToParam.startsWith('//')
      ? returnToParam
      : ''
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, permission, can_manage_works, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | {
        id: string
        company_id: string
        permission: 'worker' | 'foreman' | 'admin' | 'ceo'
        can_manage_works: boolean
        is_active: boolean
      }
    | null
  if (!me || !me.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))

  const { data: workData } = await supabase
    .from('works')
    .select('id, company_id, name, worker_type, assignee_employee_id')
    .eq('id', id)
    .maybeSingle()
  const work = workData as
    | {
        id: string
        company_id: string
        name: string
        worker_type: string | null
        assignee_employee_id: string | null
      }
    | null
  if (!work || work.company_id !== me.company_id) notFound()

  const isAdmin = me.permission === 'admin' || me.permission === 'ceo'
  const isManager = isAdmin || me.can_manage_works || work.assignee_employee_id === me.id

  // 노드 CUD 권한: 매니저 OR 배정자 (ad-hoc 추가용)
  let canEditNodes = isManager
  if (!canEditNodes) {
    const { data: assigned } = await supabase
      .from('work_assignments')
      .select('id')
      .eq('work_id', id)
      .eq('employee_id', me.id)
      .limit(1)
    canEditNodes = (assigned ?? []).length > 0
  }
  if (!canEditNodes) {
    redirect(`/works/${id}?err=` + encodeURIComponent('chain 편집 권한이 없습니다'))
  }

  const { data: chainData } = await supabase
    .from('connection_chains')
    .select('id, work_id, name, notes')
    .eq('id', chainId)
    .maybeSingle()
  const chain = chainData as ChainRow | null
  if (!chain || chain.work_id !== work.id) notFound()

  const { data: nodesData } = await supabase
    .from('connection_plan_nodes')
    .select(
      'id, chain_id, parent_id, position, node_type, name, code, spec, spec_enum, lat, lng, address, notes, added_during_report_id',
    )
    .eq('chain_id', chainId)
    .order('position')
  const nodes = (nodesData ?? []) as NodeRow[]

  // 트리 빌드
  const childrenMap = new Map<string | null, NodeRow[]>()
  for (const n of nodes) {
    const arr = childrenMap.get(n.parent_id) ?? []
    arr.push(n)
    childrenMap.set(n.parent_id, arr)
  }
  const root = childrenMap.get(null)?.[0] ?? null

  // parent 선택 옵션: upper_station + 모든 box (lower_station 은 leaf 라 자식 가질 수 없음... 사실 가능은 함)
  const parentOptions = nodes.filter((n) => n.node_type !== 'lower_station')

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
            chain 편집
            {chain.name && <span className="ml-2 text-slate-500 text-base">「{chain.name}」</span>}
          </h1>
        </header>

        {/* chain 메타 편집 */}
        <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
          <h2 className="text-base font-semibold text-slate-700 tracking-tight">chain 정보</h2>
          <form action={updateChain} className="space-y-3">
            <input type="hidden" name="id" value={chain.id} />
            <input type="hidden" name="work_id" value={work.id} />
            <label className="block">
              <span className="block text-sm font-medium text-slate-700">chain 이름</span>
              <input
                name="name"
                defaultValue={chain.name ?? ''}
                maxLength={100}
                className={inputClass}
                placeholder="예: 강남 A동 ↔ B동"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-slate-700">메모</span>
              <textarea
                name="notes"
                rows={2}
                maxLength={500}
                defaultValue={chain.notes ?? ''}
                className={`${inputClass} resize-none`}
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              저장
            </button>
          </form>
        </section>

        {/* 트리 */}
        <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
          <h2 className="text-base font-semibold text-slate-700 tracking-tight">
            노드 트리 ({nodes.length}개)
          </h2>
          {!root ? (
            <p className="text-sm text-slate-500">노드가 없습니다.</p>
          ) : (
            <NodeBranch
              node={root}
              childrenMap={childrenMap}
              workId={work.id}
              chainId={chain.id}
              depth={0}
            />
          )}
        </section>

        {/* 노드 추가 */}
        <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
          <h2 className="text-base font-semibold text-slate-700 tracking-tight inline-flex items-center gap-1.5">
            <Plus className="h-4 w-4" />
            노드 추가
          </h2>
          <p className="text-xs text-slate-500">
            함체 또는 하위국을 추가합니다. 「사이 끼우기」 모드면 선택한 자식 노드의 parent 가 새 노드로 변경됩니다.
          </p>

          <form action={createNode} className="space-y-3">
            <input type="hidden" name="work_id" value={work.id} />
            <input type="hidden" name="chain_id" value={chain.id} />
            {returnTo && <input type="hidden" name="return_to" value={returnTo} />}

            <div className="grid grid-cols-2 gap-3">
              <Field label="노드 타입 *">
                <select name="node_type" required defaultValue="box" className={inputClass}>
                  <option value="box">함체</option>
                  <option value="lower_station">하위국</option>
                </select>
              </Field>
              <Field label="parent 노드 *">
                <select name="parent_id" required defaultValue={parentParam ?? ''} className={inputClass}>
                  <option value="">선택</option>
                  {parentOptions.map((n) => (
                    <option key={n.id} value={n.id}>
                      [{PLAN_NODE_TYPE_LABEL[n.node_type]}] {n.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="이름 *">
              <input
                name="name"
                required
                maxLength={100}
                placeholder="예: 1번 함체 / B동 2층"
                className={inputClass}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="함체ID (선택)">
                <input
                  name="code"
                  maxLength={50}
                  placeholder="예: H001"
                  className={inputClass}
                />
              </Field>
              <Field label="함체 규격 (선택)">
                <select name="spec_enum" defaultValue="" className={inputClass}>
                  <option value="">선택 안 함</option>
                  {CABLE_SPEC_VALUES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="위도 (선택)">
                <input
                  name="lat"
                  type="number"
                  step="any"
                  placeholder="37.4912"
                  className={inputClass}
                />
              </Field>
              <Field label="경도 (선택)">
                <input
                  name="lng"
                  type="number"
                  step="any"
                  placeholder="127.0231"
                  className={inputClass}
                />
              </Field>
            </div>

            <Field label="주소 (선택)">
              <input name="address" maxLength={200} className={inputClass} />
            </Field>

            <Field label="메모 (선택)">
              <textarea name="notes" rows={2} maxLength={500} className={`${inputClass} resize-none`} />
            </Field>

            {/* 사이 끼우기 모드 */}
            {betweenChildParam && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                <p className="font-medium">사이 끼우기 모드</p>
                <p className="mt-1">
                  선택한 노드의 parent 가 추가될 새 노드로 자동 변경됩니다.
                </p>
                <input type="hidden" name="insert_between" value="1" />
                <input type="hidden" name="target_child_id" value={betweenChildParam} />
              </div>
            )}

            <button
              type="submit"
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-base font-medium text-white hover:bg-slate-800"
            >
              노드 추가
            </button>
          </form>
        </section>

        {/* chain 삭제 */}
        {isManager && (
          <section className="rounded-2xl border border-rose-200 bg-rose-50/40 p-5">
            <h2 className="text-base font-semibold text-rose-700 tracking-tight">위험 구역</h2>
            <p className="mt-1 text-xs text-rose-600">
              chain 삭제 시 노드·일보 segment 모두 cascade 삭제됩니다.
            </p>
            <form action={deleteChain} className="mt-3">
              <input type="hidden" name="id" value={chain.id} />
              <input type="hidden" name="work_id" value={work.id} />
              <button
                type="submit"
                className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
              >
                chain 삭제
              </button>
            </form>
          </section>
        )}
      </div>
    </main>
  )
}

function NodeBranch({
  node,
  childrenMap,
  workId,
  chainId,
  depth,
}: {
  node: NodeRow
  childrenMap: Map<string | null, NodeRow[]>
  workId: string
  chainId: string
  depth: number
}) {
  const children = childrenMap.get(node.id) ?? []
  return (
    <div className="space-y-1">
      <NodeRowView node={node} workId={workId} chainId={chainId} depth={depth} />
      {children.length > 0 && (
        <div className="ml-4 border-l-2 border-slate-100 pl-2 space-y-1">
          {children.map((c) => (
            <div key={c.id} className="space-y-1">
              {/* inline 사이 끼우기 — 이 부모(node) 와 자식(c) edge 사이 */}
              <Link
                href={`/works/${workId}/chains/${chainId}/edit?parent=${node.id}&between_child=${c.id}#노드추가`}
                className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 px-2 py-1 text-[11px] text-slate-500 hover:border-slate-900 hover:text-slate-900"
              >
                <Plus className="h-3 w-3" />
                여기 끼우기 ({node.name} ↔ {c.name})
              </Link>
              <NodeBranch
                node={c}
                childrenMap={childrenMap}
                workId={workId}
                chainId={chainId}
                depth={depth + 1}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function NodeRowView({
  node,
  workId,
  chainId,
  depth,
}: {
  node: NodeRow
  workId: string
  chainId: string
  depth: number
}) {
  const meta = [
    node.code && `ID: ${node.code}`,
    node.spec_enum || node.spec, // enum 우선, 없으면 legacy text
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 mr-1.5">
            {PLAN_NODE_TYPE_LABEL[node.node_type]}
          </span>
          <span className="font-medium text-slate-900">{node.name}</span>
          {node.added_during_report_id && (
            <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-700">
              ★ 작업 중 추가
            </span>
          )}
        </p>
        {meta && <p className="mt-0.5 text-xs text-slate-500">{meta}</p>}
        {(node.lat || node.lng) && (
          <p className="text-xs text-slate-400">
            GPS: {node.lat?.toFixed(5) ?? '-'}, {node.lng?.toFixed(5) ?? '-'}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <Link
          href={`/works/${workId}/chains/${chainId}/edit?parent=${node.id}#노드추가`}
          className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
          title="이 노드를 parent 로 자식 추가"
        >
          <Plus className="h-3 w-3" />
          자식
        </Link>
        {depth > 0 && (
          <Link
            href={`/works/${workId}/chains/${chainId}/nodes/${node.id}/edit`}
            className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
          >
            <Pencil className="h-3 w-3" />
            수정
          </Link>
        )}
        {node.node_type !== 'upper_station' && (
          <form action={deleteNode}>
            <input type="hidden" name="id" value={node.id} />
            <input type="hidden" name="work_id" value={workId} />
            <input type="hidden" name="chain_id" value={chainId} />
            <button
              type="submit"
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs text-rose-600 hover:bg-rose-50"
            >
              <Trash2 className="h-3 w-3" />
              삭제
            </button>
          </form>
        )}
      </div>
    </div>
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
