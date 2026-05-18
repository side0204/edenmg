import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PLAN_NODE_TYPE_LABEL, type PlanNodeType } from '@/lib/connection'
import { updateNode } from '../../../../../../chain-actions'

type NodeRow = {
  id: string
  chain_id: string
  node_type: PlanNodeType
  name: string
  code: string | null
  spec: string | null
  lat: number | null
  lng: number | null
  address: string | null
  notes: string | null
}

export default async function EditNodePage({
  params,
}: {
  params: Promise<{ id: string; chainId: string; nodeId: string }>
}) {
  const { id, chainId, nodeId } = await params
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
    .select('id, company_id, name, assignee_employee_id')
    .eq('id', id)
    .maybeSingle()
  const work = workData as
    | { id: string; company_id: string; name: string; assignee_employee_id: string | null }
    | null
  if (!work || work.company_id !== me.company_id) notFound()

  const { data: chainData } = await supabase
    .from('connection_chains')
    .select('id, work_id, name')
    .eq('id', chainId)
    .maybeSingle()
  const chain = chainData as { id: string; work_id: string; name: string | null } | null
  if (!chain || chain.work_id !== work.id) notFound()

  const { data: nodeData } = await supabase
    .from('connection_plan_nodes')
    .select('id, chain_id, node_type, name, code, spec, lat, lng, address, notes')
    .eq('id', nodeId)
    .maybeSingle()
  const node = nodeData as NodeRow | null
  if (!node || node.chain_id !== chain.id) notFound()

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-md space-y-5">
        <header>
          <Link
            href={`/works/${work.id}/chains/${chain.id}/edit`}
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
            chain 편집
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">노드 수정</h1>
          <p className="mt-1 text-sm text-slate-500">
            [{PLAN_NODE_TYPE_LABEL[node.node_type]}] {node.name}
          </p>
        </header>

        <form
          action={updateNode}
          className="space-y-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200"
        >
          <input type="hidden" name="id" value={node.id} />
          <input type="hidden" name="work_id" value={work.id} />
          <input type="hidden" name="chain_id" value={chain.id} />

          <Field label="이름 *">
            <input
              name="name"
              required
              maxLength={100}
              defaultValue={node.name}
              className={inputClass}
            />
          </Field>

          {node.node_type === 'box' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="함체ID (선택)">
                  <input
                    name="code"
                    maxLength={50}
                    defaultValue={node.code ?? ''}
                    className={inputClass}
                  />
                </Field>
                <Field label="함체 규격 (선택)">
                  <input
                    name="spec"
                    maxLength={50}
                    defaultValue={node.spec ?? ''}
                    className={inputClass}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="위도 (선택)">
                  <input
                    name="lat"
                    type="number"
                    step="any"
                    defaultValue={node.lat ?? ''}
                    className={inputClass}
                  />
                </Field>
                <Field label="경도 (선택)">
                  <input
                    name="lng"
                    type="number"
                    step="any"
                    defaultValue={node.lng ?? ''}
                    className={inputClass}
                  />
                </Field>
              </div>

              <Field label="주소 (선택)">
                <input
                  name="address"
                  maxLength={200}
                  defaultValue={node.address ?? ''}
                  className={inputClass}
                />
              </Field>
            </>
          )}

          <Field label="메모 (선택)">
            <textarea
              name="notes"
              rows={2}
              maxLength={500}
              defaultValue={node.notes ?? ''}
              className={`${inputClass} resize-none`}
            />
          </Field>

          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-base font-medium text-white hover:bg-slate-800"
          >
            저장
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
