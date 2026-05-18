import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { submitReport } from '../../../report-actions'
import { ReportForm, type ReportFormValues } from '../../../ReportForm'
import { InstructionsBanner } from '../../../InstructionsBanner'

type WorkRow = {
  id: string
  company_id: string
  name: string
  instructions: string | null
}

export default async function NewReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ date?: string }>
}) {
  const { id } = await params
  const { date } = await searchParams
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
    .select('id, company_id, name, instructions')
    .eq('id', id)
    .maybeSingle()
  const work = workData as WorkRow | null
  if (!work || work.company_id !== me.company_id) notFound()

  // 작성 권한: 배정 OR admin/ceo
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

  // 기본 일자: ?date= 쿼리 또는 오늘(KST)
  const today = new Date()
  const todayKST = new Date(today.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const reportDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayKST

  const initial: ReportFormValues = {
    id: null,
    work_id: work.id,
    report_date: reportDate,
    content: '',
    materials_used: '',
    progress: '진행중',
    notes: '',
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
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">일보 작성</h1>
        </header>

        <InstructionsBanner instructions={work.instructions} />

        <ReportForm initial={initial} action={submitReport} submitLabel="제출" />
      </div>
    </main>
  )
}
