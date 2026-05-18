import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PLAN_NODE_TYPE_LABEL, type PlanNodeType } from '@/lib/connection'
import { REPORT_PROGRESS_VALUES } from '@/lib/work'
import { CableSegmentInput } from '../../../CableSegmentInput'
import { submitConnectionReport } from '../../../connection-report-actions'

type ChainRow = { id: string; work_id: string; name: string | null }
type NodeRow = {
  id: string
  chain_id: string
  parent_id: string | null
  position: number
  node_type: PlanNodeType
  name: string
  code: string | null
}

export default async function NewConnectionReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ chain?: string; date?: string }>
}) {
  const { id } = await params
  const { chain: chainParam, date: dateParam } = await searchParams
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
    .select('id, company_id, name, worker_type')
    .eq('id', id)
    .maybeSingle()
  const work = workData as
    | { id: string; company_id: string; name: string; worker_type: string | null }
    | null
  if (!work || work.company_id !== me.company_id) notFound()
  if (work.worker_type !== '접속팀') {
    redirect(`/works/${id}?err=` + encodeURIComponent('접속팀 작업만 접속일보를 작성합니다'))
  }

  // 배정자 확인
  const isAdmin = me.permission === 'admin' || me.permission === 'ceo'
  if (!isAdmin) {
    const { data: assigned } = await supabase
      .from('work_assignments')
      .select('id')
      .eq('work_id', id)
      .eq('employee_id', me.id)
      .limit(1)
    if (!assigned || assigned.length === 0) {
      redirect(`/works/${id}?err=` + encodeURIComponent('이 작업에 배정되지 않았습니다'))
    }
  }

  // chains
  const { data: chainsData } = await supabase
    .from('connection_chains')
    .select('id, work_id, name')
    .eq('work_id', id)
    .order('position')
  const chains = (chainsData ?? []) as ChainRow[]
  if (chains.length === 0) {
    redirect(
      `/works/${id}?err=` + encodeURIComponent('chain 이 등록되지 않았습니다. 먼저 chain 을 추가하세요'),
    )
  }

  // 선택된 chain
  const activeChainId = chainParam && chains.some((c) => c.id === chainParam) ? chainParam : chains[0].id
  const activeChain = chains.find((c) => c.id === activeChainId)!

  // 해당 chain 의 모든 노드
  const { data: nodesData } = await supabase
    .from('connection_plan_nodes')
    .select('id, chain_id, parent_id, position, node_type, name, code')
    .eq('chain_id', activeChainId)
    .order('position')
  const nodes = (nodesData ?? []) as NodeRow[]
  const nodeMap = new Map<string, NodeRow>(nodes.map((n) => [n.id, n]))
  // segment 가 있는 노드 = parent_id 가 있는 노드 (상위국 제외)
  const segmentNodes = nodes.filter((n) => n.parent_id !== null)

  // 기본 일자
  const today = new Date()
  const todayKST = new Date(today.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const reportDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayKST

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
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">접속일보 작성</h1>
          <p className="mt-1 text-sm text-slate-500">
            cable 마다 케이블규격·사용선번을 입력하세요. 빈 cable 은 미작업으로 처리. 노드별 공종·자재는 일보 제출 후 상세 페이지에서 추가합니다.
          </p>
        </header>

        {/* chain 선택 */}
        {chains.length > 1 && (
          <nav className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 text-sm">
            {chains.map((c) => (
              <Link
                key={c.id}
                href={`/works/${work.id}/connection-reports/new?chain=${c.id}`}
                className={
                  'shrink-0 rounded-lg px-3 py-1.5 font-medium ' +
                  (c.id === activeChainId
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900')
                }
              >
                {c.name || 'chain'}
              </Link>
            ))}
          </nav>
        )}

        <form action={submitConnectionReport} className="space-y-5">
          <input type="hidden" name="work_id" value={work.id} />

          <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
            <h2 className="text-base font-semibold text-slate-700 tracking-tight">일보 기본 정보</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-sm font-medium text-slate-700">일자 *</span>
                <input
                  type="date"
                  name="report_date"
                  defaultValue={reportDate}
                  required
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-slate-700">진행률 *</span>
                <select name="progress" defaultValue="진행중" className={inputClass}>
                  {REPORT_PROGRESS_VALUES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="block text-sm font-medium text-slate-700">비고 (선택)</span>
              <textarea
                name="notes"
                rows={2}
                maxLength={1000}
                placeholder="협업 메모·특이사항"
                className={`${inputClass} resize-none`}
              />
            </label>
          </section>

          <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
            <h2 className="text-base font-semibold text-slate-700 tracking-tight">
              cable 별 입력 ({activeChain.name ? `「${activeChain.name}」` : 'chain'})
            </h2>
            <p className="text-xs text-slate-500">
              빈 칸은 &lsquo;오늘 미작업&rsquo; 으로 처리됩니다. 사용선번은 한 cable 안에서 중복되면 안 됩니다.
            </p>
            {segmentNodes.length === 0 ? (
              <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                cable 이 없습니다. 먼저 chain 에 함체·하위국을 추가하세요.
              </p>
            ) : (
              <div className="space-y-2">
                {segmentNodes.map((n) => {
                  const parent = n.parent_id ? nodeMap.get(n.parent_id) : null
                  return (
                    <CableSegmentInput
                      key={n.id}
                      planNodeId={n.id}
                      parentLabel={`[${parent ? PLAN_NODE_TYPE_LABEL[parent.node_type] : '?'}] ${
                        parent?.name ?? '?'
                      }`}
                      nodeLabel={`[${PLAN_NODE_TYPE_LABEL[n.node_type]}] ${n.name}${
                        n.code ? ` (ID: ${n.code})` : ''
                      }`}
                    />
                  )
                })}
              </div>
            )}
          </section>

          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-medium text-white hover:bg-slate-800"
          >
            일보 제출 (이후 상세에서 공종·자재 추가)
          </button>
        </form>
      </div>
    </main>
  )
}

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900'
