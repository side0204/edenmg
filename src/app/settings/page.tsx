import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, ChevronRight, LayoutGrid, UserCog } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

export default async function SettingsIndexPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-md space-y-5">
        <header>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
            홈
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">설정</h1>
        </header>

        <ul className="space-y-3">
          <li>
            <Link
              href="/settings/profile"
              className="flex items-center gap-3 rounded-2xl bg-white border border-slate-200 p-5 hover:border-slate-900"
            >
              <div className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                <UserCog className="h-5 w-5 text-slate-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-slate-900">내 프로필</p>
                <p className="text-xs text-slate-500">
                  이름·휴대폰·입사일·차량번호 등 본인 정보 수정
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-400" />
            </Link>
          </li>
          <li>
            <Link
              href="/settings/home"
              className="flex items-center gap-3 rounded-2xl bg-white border border-slate-200 p-5 hover:border-slate-900"
            >
              <div className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                <LayoutGrid className="h-5 w-5 text-slate-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-slate-900">홈 화면 카드</p>
                <p className="text-xs text-slate-500">홈 카드 순서·표시 여부 조정</p>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-400" />
            </Link>
          </li>
        </ul>
      </div>
    </main>
  )
}
