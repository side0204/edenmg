// /help — 사용법 인덱스. 직무·권한 자동 감지로 「내게 해당」 시나리오를 위로 정렬.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BookOpen, ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  sortScenariosForViewer,
  matchesViewer,
  type Permission,
  type WorkType,
} from '@/lib/help-scenarios'

export default async function HelpPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: emp } = await supabase
    .from('employees')
    .select('permission, work_type')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const permission = (emp?.permission ?? 'worker') as Permission
  const workType = (emp?.work_type ?? null) as WorkType | null

  const list = sortScenariosForViewer(permission, workType)

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-5">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
        >
          <ChevronLeft className="h-4 w-4" />
          홈
        </Link>

        <header className="space-y-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 tracking-tight">
            <BookOpen className="h-6 w-6 text-slate-400" />
            사용법
          </h1>
          <p className="text-base text-slate-600">
            자주 쓰는 흐름을 직무·권한별 시나리오로 묶었습니다. 본인에게 해당하는 항목이
            맨 위에 표시됩니다.
          </p>
        </header>

        <ul className="space-y-2">
          {list.map((s) => {
            const mine = matchesViewer(s, permission, workType)
            return (
              <li key={s.slug}>
                <Link
                  href={`/help/${s.slug}`}
                  className={
                    'block rounded-2xl border bg-white p-4 transition ' +
                    (mine
                      ? 'border-emerald-300 hover:border-emerald-600 shadow-sm'
                      : 'border-slate-200 hover:border-slate-400')
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base font-semibold text-slate-900">
                          {s.title}
                        </h2>
                        {mine && (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5">
                            내게 해당
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{s.oneLiner}</p>
                      <p className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="h-3 w-3" />
                        소요 {s.estMinutesMin}~{s.estMinutesMax}분
                      </p>
                    </div>
                    <ChevronRight className="shrink-0 h-5 w-5 text-slate-400" />
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>

        <p className="text-xs text-slate-400 text-center pt-4">
          가이드는 화면 변경에 맞춰 업데이트됩니다. 마지막 점검 일자는 각 시나리오 페이지
          하단에 표시됩니다.
        </p>
      </div>
    </main>
  )
}
