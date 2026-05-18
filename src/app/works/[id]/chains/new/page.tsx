import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createChain } from '../../../chain-actions'

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
    redirect(`/works/${id}?err=` + encodeURIComponent('접속팀 작업만 chain 을 가질 수 있습니다'))
  }

  const isAdmin = me.permission === 'admin' || me.permission === 'ceo'
  const canManage = isAdmin || me.can_manage_works || work.assignee_employee_id === me.id
  if (!canManage) {
    redirect(`/works/${id}?err=` + encodeURIComponent('chain 관리 권한이 없습니다'))
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
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">chain 등록</h1>
          <p className="mt-1 text-sm text-slate-500">
            상위국 ↔ 하위국 골격을 만든 뒤, 편집 화면에서 사이에 함체를 추가하세요.
          </p>
        </header>

        <form
          action={createChain}
          className="space-y-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200"
        >
          <input type="hidden" name="work_id" value={work.id} />

          <Field label="chain 이름 (선택)">
            <input
              name="name"
              maxLength={100}
              placeholder="예: 강남 A동 ↔ B동"
              className={inputClass}
            />
          </Field>

          <Field label="상위국명 *">
            <input
              name="upper_station_name"
              required
              maxLength={100}
              placeholder="예: 강남A국"
              className={inputClass}
            />
          </Field>

          <Field label="하위국명 *">
            <input
              name="lower_station_name"
              required
              maxLength={100}
              placeholder="예: B동 1층"
              className={inputClass}
            />
          </Field>

          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-base font-medium text-white hover:bg-slate-800 active:bg-slate-700"
          >
            등록 후 편집
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
