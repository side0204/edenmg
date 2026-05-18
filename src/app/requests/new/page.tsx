import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { RequestForm, type ForemanOption } from './RequestForm'
import type { EmployeeOption } from './EmployeeCombobox'

type Permission = 'worker' | 'foreman' | 'admin' | 'ceo'

const PERMISSION_LABEL: Record<Permission, string> = {
  worker: '작업자',
  foreman: '소장',
  admin: '관리자',
  ceo: '대표',
}

function todayInSeoul(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
}

export default async function NewRequestPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; company_id: string; is_active: boolean } | null
  if (!me || !me.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))

  // 결재자 후보: 본인 제외, 같은 회사 활성, foreman/admin/ceo 권한
  const { data: foremenData } = await supabase
    .from('employees')
    .select('id, name, permission')
    .in('permission', ['foreman', 'admin', 'ceo'])
    .eq('is_active', true)
    .neq('id', me.id)
    .order('name')

  const foremen: ForemanOption[] = ((foremenData ?? []) as { id: string; name: string; permission: Permission }[]).map(
    (e) => ({ id: e.id, name: e.name, permission_label: PERMISSION_LABEL[e.permission] }),
  )

  // 대무자 후보: 본인 제외, 같은 회사 활성 직원 전원 (권한 무관)
  // RLS 가 같은 회사 직원 select 만 허용하므로 회사 스코프는 자동 적용.
  const { data: substituteData } = await supabase
    .from('employees')
    .select('id, name, position, team, work_type')
    .eq('is_active', true)
    .neq('id', me.id)
    .order('name')

  const substituteCandidates: EmployeeOption[] = (substituteData ?? []) as EmployeeOption[]

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-md space-y-5">
        <header>
          <Link href="/requests" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
            <ChevronLeft className="h-4 w-4" />
            내 신청
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">신청 작성</h1>
          <p className="mt-1 text-sm text-slate-500">휴가·외근·기타 결재 신청서를 작성합니다.</p>
        </header>


        <RequestForm
          foremen={foremen}
          substituteCandidates={substituteCandidates}
          defaultDate={todayInSeoul()}
        />
      </div>
    </main>
  )
}
