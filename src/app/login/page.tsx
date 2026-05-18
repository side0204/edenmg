import { signIn } from './actions'

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <form
        action={signIn}
        className="w-full max-w-sm space-y-5 bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-slate-200"
      >
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">로그인</h1>
          <p className="mt-1 text-sm text-slate-500">(주)이든정보기술 통합관리</p>
        </div>

        <label className="block">
          <span className="block text-sm font-medium text-slate-700">이메일</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            inputMode="email"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </label>

        <label className="block">
          <span className="block text-sm font-medium text-slate-700">비밀번호</span>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </label>

        <button
          type="submit"
          className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-base font-medium text-white hover:bg-slate-800 active:bg-slate-700"
        >
          로그인
        </button>

        <p className="text-xs text-slate-500 text-center">
          계정이 없으시면 관리자에게 초대를 요청해주세요
        </p>
      </form>
    </main>
  )
}
