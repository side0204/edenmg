import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ReportPanel from './ReportPanel'

type Permission = 'worker' | 'foreman' | 'admin' | 'ceo'

function thisMonthKST(): string {
  // 'YYYY-MM' 형태로 KST 기준 현재 월.
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
  })
  return formatter.format(new Date()).slice(0, 7)
}

export default async function ReportsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: meRow } = await supabase
    .from('employees')
    .select('permission')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { permission: Permission } | null
  if (!me || me.permission === 'worker') {
    notFound()
  }

  const isAdmin = me.permission === 'admin' || me.permission === 'ceo'
  const scopeNote = isAdmin
    ? '전사 데이터를 받습니다.'
    : '본인이 관리하는 현장·1차 결재자로 지정된 신청서만 포함됩니다.'

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-5">
        <header>
          <Link href="/" className="text-xs text-slate-500 hover:text-slate-900">
            ← 홈
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">월별 리포트</h1>
          <p className="mt-1 text-sm text-slate-600">
            대상 월을 선택한 뒤 출퇴근·신청서 CSV 를 받아 엑셀에서 여세요.
          </p>
        </header>

        <section className="rounded-2xl bg-white shadow-sm border border-slate-200 p-6">
          <ReportPanel initialMonth={thisMonthKST()} scopeNote={scopeNote} />
        </section>

        <section className="rounded-2xl bg-slate-50 border border-slate-200 p-5 text-sm text-slate-600 space-y-2">
          <p className="font-medium text-slate-700">포함 기준</p>
          <ul className="list-disc list-inside space-y-1">
            <li>출퇴근: 해당 월의 근무일자(KST) 행</li>
            <li>신청서: 신청 기간이 해당 월과 겹치는 행 (월 경계 휴가도 양쪽 모두에 잡힘)</li>
          </ul>
        </section>
      </div>
    </main>
  )
}
