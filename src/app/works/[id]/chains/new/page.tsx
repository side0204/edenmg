import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createChain } from '../../../chain-actions'
import { ChainSetupForm } from '../../../ChainSetupForm'

export default async function NewChainPage({
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
  if (work.worker_type !== '접속팀') {
    redirect(`/works/${id}?err=` + encodeURIComponent('접속팀 작업만 작업구간을 가질 수 있습니다'))
  }

  const isAdmin = me.permission === 'admin' || me.permission === 'ceo'
  const canManage = isAdmin || me.can_manage_works || work.assignee_employee_id === me.id
  if (!canManage) {
    redirect(`/works/${id}?err=` + encodeURIComponent('작업구간 관리 권한이 없습니다'))
  }

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
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">작업구간 등록</h1>
          <p className="mt-1 text-sm text-slate-500">
            상위국·접속함체·하위국을 한번에 입력하세요. 함체는 0개 이상이며 작성 순서대로 직선 작업구간이 만들어집니다. 일보 작성 단계에서도 함체 끼우기·수정이 가능합니다.
          </p>
        </header>

        <ChainSetupForm workId={work.id} action={createChain} />
      </div>
    </main>
  )
}
