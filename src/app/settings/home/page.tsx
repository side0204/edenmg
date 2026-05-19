import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronDown, ChevronLeft, ChevronUp, RotateCcw } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  HOME_CARD_DESCRIPTION,
  HOME_CARD_LABEL,
  resolveHomeCardPrefs,
} from '@/lib/home-cards'
import {
  moveHomeCard,
  resetHomeCardPrefs,
  toggleHomeCardVisible,
} from './actions'

export default async function HomeSettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('home_card_prefs, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { home_card_prefs: unknown; is_active: boolean } | null
  if (!me || !me.is_active) {
    redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  }

  const prefs = resolveHomeCardPrefs(me.home_card_prefs)
  const visibleCount = prefs.order.length - prefs.hidden.length

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-5">
        <header>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
            홈
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">홈 화면 설정</h1>
          <p className="mt-1 text-sm text-slate-500">
            카드 순서와 표시 여부를 조정할 수 있습니다 · 표시 {visibleCount} / {prefs.order.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            * 노출 대상이 본사·관리자 등으로 제한된 카드는 권한이 맞을 때만 실제로 보입니다.
            「내 자재」 처럼 데이터가 있을 때만 표시되는 카드도 있습니다.
          </p>
        </header>

        <ul className="space-y-2">
          {prefs.order.map((id, idx) => {
            const isHidden = prefs.hidden.includes(id)
            const isFirst = idx === 0
            const isLast = idx === prefs.order.length - 1
            return (
              <li
                key={id}
                className={
                  'rounded-xl border p-3 ' +
                  (isHidden
                    ? 'bg-slate-50 border-slate-200'
                    : 'bg-white border-slate-200')
                }
              >
                <div className="flex items-center gap-2">
                  <div className="flex flex-col items-center gap-0.5">
                    <form action={moveHomeCard}>
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="dir" value="up" />
                      <button
                        type="submit"
                        disabled={isFirst}
                        aria-label={`${HOME_CARD_LABEL[id]} 위로`}
                        className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        <ChevronUp className="h-5 w-5" />
                      </button>
                    </form>
                    <form action={moveHomeCard}>
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="dir" value="down" />
                      <button
                        type="submit"
                        disabled={isLast}
                        aria-label={`${HOME_CARD_LABEL[id]} 아래로`}
                        className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        <ChevronDown className="h-5 w-5" />
                      </button>
                    </form>
                  </div>

                  <span className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-600 tabular-nums">
                    {idx + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p
                      className={
                        'font-medium ' + (isHidden ? 'text-slate-400 line-through' : 'text-slate-900')
                      }
                    >
                      {HOME_CARD_LABEL[id]}
                    </p>
                    <p className="text-xs text-slate-500">{HOME_CARD_DESCRIPTION[id]}</p>
                  </div>

                  <form action={toggleHomeCardVisible}>
                    <input type="hidden" name="id" value={id} />
                    <button
                      type="submit"
                      className={
                        'shrink-0 rounded-full px-3 py-1 text-xs font-bold ' +
                        (isHidden
                          ? 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                          : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200')
                      }
                    >
                      {isHidden ? '숨김' : '표시'}
                    </button>
                  </form>
                </div>
              </li>
            )
          })}
        </ul>

        <form action={resetHomeCardPrefs}>
          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw className="h-4 w-4" />
            기본 설정으로 초기화
          </button>
        </form>
      </div>
    </main>
  )
}
