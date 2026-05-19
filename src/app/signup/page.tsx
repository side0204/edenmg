import Link from 'next/link'
import SignupForm from './SignupForm'

export const metadata = {
  title: '회원가입 — (주)이든정보기술',
}

export default function SignupPage() {
  return (
    <main className="min-h-screen p-4 sm:p-6 flex items-center justify-center">
      <div className="w-full max-w-md space-y-5">
        <header className="text-center">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">회원가입</h1>
          <p className="mt-1 text-sm text-slate-500">
            (주)이든정보기술 통합관리시스템 가입 신청
          </p>
        </header>

        <SignupForm />

        <p className="text-center text-sm text-slate-600">
          이미 계정이 있나요?{' '}
          <Link href="/login" className="font-medium text-slate-900 underline">
            로그인
          </Link>
        </p>
      </div>
    </main>
  )
}
