import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'

export const metadata = {
  title: '가입 신청 완료 — 관리자 승인 대기',
}

export default async function SignupPendingPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const sp = await searchParams
  const email = sp.email ?? ''

  return (
    <main className="min-h-screen p-4 sm:p-6 flex items-center justify-center">
      <div className="w-full max-w-md space-y-5 rounded-2xl bg-white border border-slate-200 p-6 sm:p-8 text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-7 w-7 text-emerald-700" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">가입 신청 완료</h1>
        {email && (
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-900">{email}</span>
            <br />
            계정으로 신청을 접수했습니다.
          </p>
        )}
        <p className="text-sm text-slate-600">
          관리자가 권한 부여 후 활성화하면 로그인이 가능합니다.
        </p>
        <Link
          href="/login"
          className="inline-block rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          로그인 화면으로
        </Link>
      </div>
    </main>
  )
}
