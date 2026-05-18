import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { updateWork } from '../../actions'
import { WorkForm, type WorkFormValues } from '../../WorkForm'
import type { EmployeeOption } from '../../../requests/new/EmployeeCombobox'
import type {
  WorkCategory,
  WorkStatus,
  WorkSubcategory,
  WorkWorkerType,
} from '@/lib/work'

type WorkRow = {
  id: string
  company_id: string
  name: string
  client: string | null
  address: string | null
  category: WorkCategory
  subcategory: WorkSubcategory | null
  order_id: string | null
  worker_type: WorkWorkerType | null
  worker_type_custom: string | null
  assignee_employee_id: string | null
  expected_volume: string | null
  start_date: string | null
  end_date: string | null
  status: WorkStatus
  notes: string | null
  instructions: string | null
}

export default async function EditWorkPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('company_id, permission, can_manage_works, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | {
        company_id: string
        permission: 'worker' | 'team_member' | 'team_leader' | 'admin'
        can_manage_works: boolean
        is_active: boolean
      }
    | null
  if (!me || !me.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  const canManage = me.permission === 'admin' || me.can_manage_works
  if (!canManage) redirect('/works?err=' + encodeURIComponent('작업관리 권한이 없습니다'))

  const { data: workData } = await supabase
    .from('works')
    .select(
      'id, company_id, name, client, address, category, subcategory, order_id, worker_type, worker_type_custom, assignee_employee_id, expected_volume, start_date, end_date, status, notes, instructions',
    )
    .eq('id', id)
    .maybeSingle()
  const work = workData as WorkRow | null
  if (!work || work.company_id !== me.company_id) notFound()

  const { data: candidatesData } = await supabase
    .from('employees')
    .select('id, name, position, team, work_type')
    .eq('company_id', me.company_id)
    .eq('is_active', true)
    .order('name')
  const candidates = (candidatesData ?? []) as EmployeeOption[]

  let initialAssignee: EmployeeOption | null = null
  if (work.assignee_employee_id) {
    const found = candidates.find((c) => c.id === work.assignee_employee_id)
    if (found) initialAssignee = found
    else {
      // 비활성·다른 회사 등으로 후보 리스트에 없는 경우 단독 조회
      const { data: lone } = await supabase
        .from('employees')
        .select('id, name, position, team, work_type')
        .eq('id', work.assignee_employee_id)
        .maybeSingle()
      if (lone) initialAssignee = lone as EmployeeOption
    }
  }

  const initial: WorkFormValues = {
    id: work.id,
    name: work.name,
    client: work.client,
    address: work.address,
    category: work.category,
    subcategory: work.subcategory,
    order_id: work.order_id,
    worker_type: work.worker_type,
    worker_type_custom: work.worker_type_custom,
    assignee_employee_id: work.assignee_employee_id,
    expected_volume: work.expected_volume,
    start_date: work.start_date,
    end_date: work.end_date,
    status: work.status,
    notes: work.notes,
    instructions: work.instructions,
  }

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
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">작업 수정</h1>
        </header>

        <WorkForm
          initial={initial}
          action={updateWork}
          submitLabel="저장"
          candidates={candidates}
          initialAssignee={initialAssignee}
        />
      </div>
    </main>
  )
}
