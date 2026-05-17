export default function Home() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const configured =
    !!url &&
    !!key &&
    !key.includes('여기에') &&
    !key.includes('PASTE')

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full p-8 bg-white rounded-2xl shadow-sm border border-slate-200">
        <h1 className="text-3xl font-bold text-slate-900">edenMG</h1>
        <p className="mt-1 text-sm text-slate-500">광케이블 시공 통합관리</p>

        <div className="mt-6 p-4 rounded-lg bg-slate-50 border border-slate-200">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            환경 설정 상태
          </p>
          {configured ? (
            <p className="mt-2 text-sm text-emerald-700 font-medium">
              ✅ Supabase 연결 준비 완료
            </p>
          ) : (
            <p className="mt-2 text-sm text-amber-700 font-medium">
              ⚠️ .env.local 파일에 anon 키를 입력하세요
            </p>
          )}
          {url && (
            <p className="mt-1 text-xs text-slate-400 font-mono break-all">
              {url}
            </p>
          )}
        </div>

        <p className="mt-6 text-xs text-slate-400">
          v0.1 · 사내 베타 준비 중
        </p>
      </div>
    </main>
  )
}
