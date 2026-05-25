import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, FileText, Map, Network } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  RELOCATION_CATEGORY_VALUES,
  RELOCATION_CATEGORY_SLUG,
  RELOCATION_CATEGORY_LABEL,
  RELOCATION_CATEGORY_DESCRIPTION,
  type RelocationCategory,
} from '@/lib/relocation'

// 공사 설계 허브 — 청약 / 계획 / 지장이설 3 카테고리 진입점.
// 권한: 회사 직원 누구나 (RLS 가 회사 스코프 강제).
// 본 모듈은 데스크톱 우선 — 모바일은 읽기만 자동 허용.

const CATEGORY_ICON: Record<RelocationCategory, typeof FileText> = {
  청약: FileText,
  계획: Map,
  지장이설: Network,
}

const CATEGORY_TONE: Record<
  RelocationCategory,
  { border: string; bg: string; iconBg: string; iconText: string }
> = {
  청약: {
    border: 'hover:border-emerald-600',
    bg: 'bg-emerald-50',
    iconBg: 'bg-emerald-100',
    iconText: 'text-emerald-700',
  },
  계획: {
    border: 'hover:border-blue-600',
    bg: 'bg-blue-50',
    iconBg: 'bg-blue-100',
    iconText: 'text-blue-700',
  },
  지장이설: {
    border: 'hover:border-amber-600',
    bg: 'bg-amber-50',
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-700',
  },
}

export default async function RelocationHubPage() {
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
  if (!me || !me.is_active) {
    redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  }

  // 카테고리별 프로젝트 카운트 (회사 스코프 — RLS 가 한 번 더 막아줌)
  const { data: rows } = await supabase
    .from('relocation_projects')
    .select('category')
    .eq('company_id', me.company_id)
  const countByCategory: Record<RelocationCategory, number> = {
    청약: 0,
    계획: 0,
    지장이설: 0,
  }
  for (const r of (rows ?? []) as { category: RelocationCategory | string }[]) {
    if (r.category === '청약' || r.category === '계획' || r.category === '지장이설') {
      countByCategory[r.category]++
    }
  }

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <header>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
            홈
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">공사 설계</h1>
          <p className="mt-1 text-sm text-slate-500">
            모든 공사의 행정도·코어구성도·직선도 설계 (데스크톱 권장).
          </p>
        </header>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {RELOCATION_CATEGORY_VALUES.map((cat) => {
            const Icon = CATEGORY_ICON[cat]
            const tone = CATEGORY_TONE[cat]
            const slug = RELOCATION_CATEGORY_SLUG[cat]
            const count = countByCategory[cat]
            return (
              <li key={cat}>
                <Link
                  href={`/relocation/category/${slug}`}
                  className={
                    'block rounded-2xl bg-white shadow-sm border border-slate-200 p-6 transition-colors ' +
                    tone.border
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={
                        'inline-flex h-12 w-12 items-center justify-center rounded-xl ' +
                        tone.iconBg
                      }
                    >
                      <Icon className={'h-6 w-6 ' + tone.iconText} />
                    </div>
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                      {count}건
                    </span>
                  </div>
                  <h2 className="mt-4 text-xl font-bold text-slate-900 tracking-tight">
                    {RELOCATION_CATEGORY_LABEL[cat]}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {RELOCATION_CATEGORY_DESCRIPTION[cat]}
                  </p>
                  <p className="mt-4 text-sm font-medium text-slate-700">
                    프로젝트 목록 →
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </main>
  )
}
