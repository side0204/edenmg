import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createWork } from '../actions'
import { WorkForm, type WorkFormValues } from '../WorkForm'
import type { EmployeeOption } from '../../requests/new/EmployeeCombobox'

export default async function NewWorkPage() {
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
        permission: 'worker' | 'foreman' | 'admin' | 'ceo'
        can_manage_works: boolean
        is_active: boolean
      }
    | null
  if (!me || !me.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  const canManage = me.permission === 'admin' || me.permission === 'ceo' || me.can_manage_works
  if (!canManage) redirect('/works?err=' + encodeURIComponent('작업관리 권한이 없습니다'))

  const { data: candidatesData } = await supabase
    .from('employees')
    .select('id, name, position, team, work_type')
    .eq('company_id', me.company_id)
    .eq('is_active', true)
    .order('name')
  const candidates = (candidatesData ?? []) as EmployeeOption[]

  const initial: WorkFormValues = {
    id: null,
    name: '',
    client: null,
    address: null,
    category: '청약',
    subcategory: 'FTTH',
    order_id: null,
    worker_type: null,
    worker_type_custom: null,
    assignee_employee_id: null,
    expected_volume: null,
    start_date: null,
    end_date: null,
    status: '예정',
    notes: null,
  }

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-md space-y-5">
        <header>
          <Link
            href="/works"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
            작업 목록
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">작업 등록</h1>
        </header>

        <WorkForm
          initial={initial}
          action={createWork}
          submitLabel="등록"
          candidates={candidates}
          initialAssignee={null}
        />
      </div>
    </main>
  )
}
