import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { setPassword } from './actions'

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: meRow } = await supabase
    .from('employees')
    .select('name, accepted_at, companies(name)')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | { name: string; accepted_at: string | null; companies: { name: string } | null }
    | null

  // 이미 가입을 마친 사용자는 홈으로.
  if (me?.accepted_at) {
    redirect('/')
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <form
        action={setPassword}
        className="w-full max-w-sm space-y-5 bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-slate-200"
      >
        <div>
          <p className="text-xs text-slate-500">{me?.companies?.name ?? '(주)이든정보기술'}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            환영합니다{me?.name ? `, ${me.name}님` : ''}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            비밀번호를 설정하면 가입이 완료됩니다.
          </p>
        </div>

        <label className="block">
          <span className="block text-sm font-medium text-slate-700">비밀번호 (8자 이상)</span>
          <input
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </label>

        <label className="block">
          <span className="block text-sm font-medium text-slate-700">비밀번호 확인</span>
          <input
            type="password"
            name="confirm"
            required
            minLength={8}
            autoComplete="new-password"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </label>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-base font-medium text-white hover:bg-slate-800 active:bg-slate-700"
        >
          비밀번호 설정 완료
        </button>
      </form>
    </main>
  )
}
