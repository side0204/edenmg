import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import type { CableSpec, PlanNodeType } from '@/lib/connection'
import { submitConnectionReport } from '../../../connection-report-actions'
import {
  UnifiedReportForm,
  type CableMaster,
  type MaterialMaster,
  type UnifiedNode,
} from '../../../UnifiedReportForm'
import { InstructionsBanner } from '../../../InstructionsBanner'

type ChainRow = { id: string; work_id: string; name: string | null }
type NodeRow = {
  id: string
  chain_id: string
  parent_id: string | null
  position: number
  node_type: PlanNodeType
  name: string
  code: string | null
  spec_enum: CableSpec | null
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
    .select('id, company_id, name, worker_type, assignee_employee_id, instructions')
    .eq('id', id)
    .maybeSingle()
  const work = workData as
    | {
        id: string
        company_id: string
        name: string
        worker_type: string | null
        assignee_employee_id: string | null
        instructions: string | null
      }
    | null
  if (!work || work.company_id !== me.company_id) notFound()
  if (work.worker_type !== '접속팀') {
    redirect(`/works/${id}?err=` + encodeURIComponent('접속팀 작업만 접속일보를 작성합니다'))
  }

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

  const { data: chainsData } = await supabase
    .from('connection_chains')
    .select('id, work_id, name')
    .eq('work_id', id)
    .order('position')
  const chains = (chainsData ?? []) as ChainRow[]
  if (chains.length === 0) {
    redirect(
      `/works/${id}?err=` + encodeURIComponent('작업구간이 등록되지 않았습니다. 먼저 작업구간을 추가하세요'),
    )
  }

  const activeChainId = chainParam && chains.some((c) => c.id === chainParam) ? chainParam : chains[0].id
  const activeChain = chains.find((c) => c.id === activeChainId)!

  const { data: nodesData } = await supabase
    .from('connection_plan_nodes')
    .select('id, chain_id, parent_id, position, node_type, name, code, spec_enum')
    .eq('chain_id', activeChainId)
    .order('position')
  const nodes = (nodesData ?? []) as NodeRow[]
  // 모든 노드(상위국 root + 함체 + 하위국) 를 폼에 전달 — 노드별 자재·공종 입력 대상
  const planNodes: UnifiedNode[] = nodes.map((n) => ({
    id: n.id,
    parent_id: n.parent_id,
    node_type: n.node_type,
    name: n.name,
    code: n.code,
    spec_enum: n.spec_enum,
  }))
  const nodeMap: Record<string, UnifiedNode> = {}
  for (const n of planNodes) {
    nodeMap[n.id] = n
  }

  const { data: mastersData } = await supabase
    .from('materials')
    .select('id, name, spec, unit')
    .eq('company_id', me.company_id)
    .eq('is_active', true)
    .order('name')
  const masters = (mastersData ?? []) as MaterialMaster[]

  const { data: cableMastersData } = await supabase
    .from('cables')
    .select('id, code, spec_enum')
    .eq('company_id', me.company_id)
    .eq('is_active', true)
    .order('code')
  const cableMasters = (cableMastersData ?? []) as CableMaster[]

  // 권한 분리:
  //  - canEditNode: 기존 노드의 정보(이름·규격·메모 등) 수정 — admin/ceo/담당자
  //  - canAddNode : 작업구간 사이에 새 함체 끼우기 — admin/ceo/담당자 + 배정 작업자
  //                 (owner: "일보작성자는 등록된 작업구간에서 추가되는 부분만 추가하도록")
  const isAdminLike = me.permission === 'admin' || me.permission === 'ceo'
  const isAssignee = work.assignee_employee_id === me.id
  const canEditNode = isAdminLike || isAssignee
  // assigned 여부는 위 권한 체크에서 redirect 로 컷팅된 상태 — 여기 도달했다는 건 isAdminLike OR 배정자
  const canAddNode = true

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
            각 cable 별로 케이블·선번 + 그 노드의 공종·자재까지 한번에 입력하세요.
          </p>
        </header>

        <InstructionsBanner instructions={work.instructions} />

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
                {c.name || '작업구간'}
              </Link>
            ))}
          </nav>
        )}

        <UnifiedReportForm
          workId={work.id}
          chainId={activeChain.id}
          chainName={activeChain.name}
          planNodes={planNodes}
          nodeMap={nodeMap}
          masters={masters}
          cableMasters={cableMasters}
          defaultReportDate={reportDate}
          action={submitConnectionReport}
          returnTo={`/works/${work.id}/connection-reports/new?chain=${activeChain.id}`}
          canEditNode={canEditNode}
          canAddNode={canAddNode}
        />
      </div>
    </main>
  )
}
