import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, Plus, Hammer } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { EmptyState } from '@/components/EmptyState'
import {
  STATUS_COLOR,
  formatWorkLabel,
  formatWorkPeriod,
  type WorkCategory,
  type WorkStatus,
  type WorkSubcategory,
  type WorkWorkerType,
} from '@/lib/work'

type WorkRow = {
  id: string
  name: string
  client: string | null
  category: WorkCategory
  subcategory: WorkSubcategory | null
  worker_type: WorkWorkerType | null
  start_date: string | null
  end_date: string | null
  status: WorkStatus
  is_active: boolean
}

const CATEGORY_TABS: { key: '' | WorkCategory; label: string }[] = [
  { key: '', label: '전체' },
  { key: '청약', label: '청약' },
  { key: '계획', label: '계획' },
  { key: '지장이설', label: '지장이설' },
  { key: '기타', label: '기타' },
]

// 서브탭 노출 카테고리 (청약/계획/지장이설). 기타·전체는 서브탭 없음.
const SUBTAB_CATEGORIES: readonly WorkCategory[] = ['청약', '계획', '지장이설']

// URL 의 wt 파라미터 ↔ DB worker_type enum 매핑
const WT_TABS: { key: '' | '외선' | '접속'; label: string; dbValue: WorkWorkerType | null }[] = [
  { key: '', label: '전체', dbValue: null },
  { key: '외선', label: '외선', dbValue: '외선팀' },
  { key: '접속', label: '접속', dbValue: '접속팀' },
]

export default async function WorksPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; wt?: string }>
}) {
  const { cat, wt } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, permission, can_manage_works, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | { id: string; permission: 'worker' | 'foreman' | 'admin' | 'ceo'; can_manage_works: boolean; is_active: boolean }
    | null
  if (!me || !me.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))

  const canManage = me.permission === 'admin' || me.permission === 'ceo' || me.can_manage_works

  // 활성 카테고리 / worker_type 결정
  const activeCat: '' | WorkCategory = (CATEGORY_TABS.find((t) => t.key === cat)?.key ?? '') as
    | ''
    | WorkCategory
  const showSubtabs = activeCat !== '' && SUBTAB_CATEGORIES.includes(activeCat as WorkCategory)
  const activeWt: '' | '외선' | '접속' = showSubtabs
    ? ((WT_TABS.find((t) => t.key === wt)?.key ?? '') as '' | '외선' | '접속')
    : ''
  const activeWtDb = WT_TABS.find((t) => t.key === activeWt)?.dbValue ?? null

  let query = supabase
    .from('works')
    .select('id, name, client, category, subcategory, worker_type, start_date, end_date, status, is_active')
    .order('is_active', { ascending: false })
    .order('start_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (activeCat) query = query.eq('category', activeCat)
  if (activeWtDb) query = query.eq('worker_type', activeWtDb)

  const { data, error: listError } = await query
  const rows = (data ?? []) as WorkRow[]

  const buildHref = (nextCat: '' | WorkCategory, nextWt: '' | '외선' | '접속') => {
    const params = new URLSearchParams()
    if (nextCat) params.set('cat', nextCat)
    if (nextWt) params.set('wt', nextWt)
    const qs = params.toString()
    return qs ? `/works?${qs}` : '/works'
  }

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-center justify-between gap-3">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
            >
              <ChevronLeft className="h-4 w-4" />
              홈
            </Link>
            <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">작업 관리</h1>
            <p className="mt-1 text-sm text-slate-500">
              회사 작업(공사) 목록 · {rows.length}건
            </p>
          </div>
          {canManage && (
            <Link
              href="/works/new"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              작업 등록
            </Link>
          )}
        </header>

        {/* 1차 탭: 카테고리 */}
        <nav className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 text-sm">
          {CATEGORY_TABS.map((t) => {
            const active = activeCat === t.key
            return (
              <Link
                key={t.key || 'all'}
                href={buildHref(t.key, '')}
                className={
                  'shrink-0 rounded-lg px-3 py-1.5 font-medium transition-colors ' +
                  (active
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900')
                }
              >
                {t.label}
              </Link>
            )
          })}
        </nav>

        {/* 2차 탭: 작업자 구분 (청약/계획/지장이설 만) */}
        {showSubtabs && (
          <nav className="flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1 text-xs">
            {WT_TABS.map((t) => {
              const active = activeWt === t.key
              return (
                <Link
                  key={t.key || 'all'}
                  href={buildHref(activeCat, t.key)}
                  className={
                    'shrink-0 rounded-md px-3 py-1.5 font-medium transition-colors ' +
                    (active
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-50')
                  }
                >
                  {t.label}
                </Link>
              )
            })}
          </nav>
        )}

        {listError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
            목록을 불러오지 못했습니다: {listError.message}
          </p>
        )}

        {rows.length === 0 && !listError ? (
          <EmptyState
            icon={Hammer}
            title={activeCat || activeWt ? '해당 조건의 작업 없음' : '등록된 작업 없음'}
            description={
              canManage
                ? '공사 건을 등록하면 작업자 배정·일보 작성이 가능합니다.'
                : '관리자가 작업을 등록하면 여기에 표시됩니다.'
            }
            cta={
              canManage ? (
                <Link
                  href="/works/new"
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  <Plus className="h-4 w-4" />
                  작업 등록
                </Link>
              ) : null
            }
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((w) => (
              <li key={w.id}>
                <Link
                  href={`/works/${w.id}`}
                  className={
                    'block rounded-xl bg-white border p-4 transition-colors ' +
                    (w.is_active
                      ? 'border-slate-200 hover:border-slate-900'
                      : 'border-slate-200 opacity-70')
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900 truncate">{w.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500 truncate">
                        {formatWorkLabel(w.category, w.subcategory)}
                        {w.client && <span className="ml-1.5">· {w.client}</span>}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatWorkPeriod(w.start_date, w.end_date)}
                      </p>
                    </div>
                    <span
                      className={
                        'shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ' +
                        STATUS_COLOR[w.status]
                      }
                    >
                      {w.status}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
