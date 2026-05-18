import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Bell, ChevronLeft, ChevronRight, FileText, Hammer, Plus, Search, Users } from 'lucide-react'
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
import { aggregateConnectionTotals } from '@/lib/connection-aggregate'
import { AggregationCard } from './AggregationCard'
import { DeleteWorkButton } from './DeleteWorkButton'

type WorkRow = {
  id: string
  name: string
  client: string | null
  category: WorkCategory
  subcategory: WorkSubcategory | null
  order_id: string | null
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

// 상태 탭 (owner: 전체/완료/진행중/예정). 취소는 전체에서만 노출.
const STATUS_TABS: { key: '' | WorkStatus; label: string }[] = [
  { key: '', label: '전체' },
  { key: '예정', label: '예정' },
  { key: '진행중', label: '진행중' },
  { key: '완료', label: '완료' },
]

// 신규 배정 판정 기준: 배정 created_at 이 최근 N일 이내
const NEW_ASSIGNMENT_DAYS = 3

export default async function WorksPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; wt?: string; status?: string; q?: string; mine?: string }>
}) {
  const { cat, wt, status: statusParam, q, mine } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, permission, can_manage_works, can_delete_works, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | {
        id: string
        permission: 'worker' | 'foreman' | 'admin' | 'ceo'
        can_manage_works: boolean
        can_delete_works: boolean
        is_active: boolean
      }
    | null
  if (!me || !me.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))

  const isAdminLike = me.permission === 'admin' || me.permission === 'ceo'
  const canManage = isAdminLike || me.can_manage_works
  const canDelete = isAdminLike || me.can_delete_works

  // 활성 카테고리 / worker_type / status 결정
  const activeCat: '' | WorkCategory = (CATEGORY_TABS.find((t) => t.key === cat)?.key ?? '') as
    | ''
    | WorkCategory
  const showSubtabs = activeCat !== '' && SUBTAB_CATEGORIES.includes(activeCat as WorkCategory)
  const activeWt: '' | '외선' | '접속' = showSubtabs
    ? ((WT_TABS.find((t) => t.key === wt)?.key ?? '') as '' | '외선' | '접속')
    : ''
  const activeWtDb = WT_TABS.find((t) => t.key === activeWt)?.dbValue ?? null
  const activeStatus: '' | WorkStatus = (STATUS_TABS.find((t) => t.key === statusParam)?.key ?? '') as
    | ''
    | WorkStatus
  const query = (q ?? '').trim()
  const isMineMode = mine === '1'

  // 본인이 배정된 작업 ID + 가장 최근 배정 created_at 매핑 (신규 배지·정렬용)
  const myAssignmentByWork = new Map<string, string>() // work_id → latest assigned_at
  {
    const { data: myAssigns } = await supabase
      .from('work_assignments')
      .select('work_id, created_at')
      .eq('employee_id', me.id)
    for (const a of (myAssigns ?? []) as { work_id: string; created_at: string }[]) {
      const prev = myAssignmentByWork.get(a.work_id)
      if (!prev || prev < a.created_at) myAssignmentByWork.set(a.work_id, a.created_at)
    }
  }
  const myWorkIds = Array.from(myAssignmentByWork.keys())

  let dbQuery = supabase
    .from('works')
    .select('id, name, client, category, subcategory, order_id, worker_type, start_date, end_date, status, is_active')
    .order('is_active', { ascending: false })
    .order('start_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (activeCat) dbQuery = dbQuery.eq('category', activeCat)
  if (activeWtDb) dbQuery = dbQuery.eq('worker_type', activeWtDb)
  if (activeStatus) dbQuery = dbQuery.eq('status', activeStatus)

  if (query) {
    // 작업명 OR ID 부분일치. ilike 패턴은 % 이스케이프 필요.
    const escaped = query.replace(/[%_]/g, (m) => `\\${m}`)
    dbQuery = dbQuery.or(`name.ilike.%${escaped}%,order_id.ilike.%${escaped}%`)
  }

  if (isMineMode) {
    if (myWorkIds.length === 0) {
      // 배정된 작업 없음 — 빈 결과 강제 (UUID 매치 안 되는 더미)
      dbQuery = dbQuery.eq('id', '00000000-0000-0000-0000-000000000000')
    } else {
      dbQuery = dbQuery.in('id', myWorkIds)
    }
  }

  const { data, error: listError } = await dbQuery
  const rows = (data ?? []) as WorkRow[]

  // 신규 배정 cutoff (KST, NEW_ASSIGNMENT_DAYS 일 전)
  const newCutoff = new Date(
    new Date().getTime() - NEW_ASSIGNMENT_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()
  const isNewAssignment = (workId: string): boolean => {
    const at = myAssignmentByWork.get(workId)
    return !!at && at >= newCutoff
  }
  // mine 모드의 신규 배정 카운트
  const newAssignmentCount = rows.filter((r) => isNewAssignment(r.id)).length

  // 각 작업의 본인 마지막 일보 일자 (mine 모드일 때만 fetch — 비용 절약)
  const myLastReportByWork = new Map<string, string>() // work_id → YYYY-MM-DD
  if (isMineMode && rows.length > 0) {
    const ids = rows.map((r) => r.id)
    const [wdr, cr] = await Promise.all([
      supabase
        .from('work_daily_reports')
        .select('work_id, report_date')
        .in('work_id', ids)
        .eq('author_employee_id', me.id),
      supabase
        .from('connection_reports')
        .select('work_id, report_date')
        .in('work_id', ids)
        .eq('author_employee_id', me.id),
    ])
    for (const r of (wdr.data ?? []) as { work_id: string; report_date: string }[]) {
      const prev = myLastReportByWork.get(r.work_id)
      if (!prev || prev < r.report_date) myLastReportByWork.set(r.work_id, r.report_date)
    }
    for (const r of (cr.data ?? []) as { work_id: string; report_date: string }[]) {
      const prev = myLastReportByWork.get(r.work_id)
      if (!prev || prev < r.report_date) myLastReportByWork.set(r.work_id, r.report_date)
    }
  }

  // 검색어가 있을 때 검색 결과 접속팀 작업의 자재·공종 합계 (공사번호별 보기 시나리오)
  const connWorkIds = rows.filter((r) => r.worker_type === '접속팀').map((r) => r.id)
  const searchTotals =
    query && connWorkIds.length > 0
      ? await aggregateConnectionTotals(supabase, connWorkIds)
      : null

  const buildHref = (next: {
    cat?: '' | WorkCategory
    wt?: '' | '외선' | '접속'
    status?: '' | WorkStatus
    q?: string
    mine?: boolean
  }) => {
    const params = new URLSearchParams()
    const finalCat = next.cat ?? activeCat
    const finalWt = next.wt ?? (showSubtabs ? activeWt : '')
    const finalStatus = next.status ?? activeStatus
    const finalQ = next.q ?? query
    const finalMine = next.mine ?? isMineMode
    if (finalCat) params.set('cat', finalCat)
    if (finalWt) params.set('wt', finalWt)
    if (finalStatus) params.set('status', finalStatus)
    if (finalQ) params.set('q', finalQ)
    if (finalMine) params.set('mine', '1')
    const qs = params.toString()
    return qs ? `/works?${qs}` : '/works'
  }

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
            >
              <ChevronLeft className="h-4 w-4" />
              홈
            </Link>
            <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">
              {isMineMode ? '내 작업 진행 목록' : '작업 관리'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {isMineMode
                ? `본인이 배정된 작업 · ${rows.length}건${newAssignmentCount > 0 ? ` · 신규 ${newAssignmentCount}건` : ''}`
                : `작업 카드를 탭하면 바로 일보 작성 · ${rows.length}건`}
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

        {/* 0차 토글: 전체 / 내 작업 */}
        <nav className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm">
          <Link
            href={buildHref({ mine: false })}
            className={
              'flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 font-medium transition-colors ' +
              (!isMineMode
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900')
            }
          >
            <Users className="h-4 w-4" />
            전체
          </Link>
          <Link
            href={buildHref({ mine: true })}
            className={
              'flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 font-medium transition-colors ' +
              (isMineMode
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900')
            }
          >
            <Bell className="h-4 w-4" />
            내 작업
            {!isMineMode && myWorkIds.length > 0 && (
              <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1 text-[10px] font-bold text-white">
                {myWorkIds.length}
              </span>
            )}
          </Link>
        </nav>

        {/* 검색 폼 (GET — URL 파라미터 q 로 반영, 기존 cat/wt/status/mine 유지) */}
        <form method="get" className="relative">
          {activeCat && <input type="hidden" name="cat" value={activeCat} />}
          {showSubtabs && activeWt && <input type="hidden" name="wt" value={activeWt} />}
          {activeStatus && <input type="hidden" name="status" value={activeStatus} />}
          {isMineMode && <input type="hidden" name="mine" value="1" />}
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="작업명 · ID 검색"
            className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-20 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
          <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {query && (
              <Link
                href={buildHref({ q: '' })}
                className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
              >
                지우기
              </Link>
            )}
            <button
              type="submit"
              className="rounded bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800"
            >
              검색
            </button>
          </div>
        </form>

        {/* 1차 탭: 카테고리 */}
        <nav className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 text-sm">
          {CATEGORY_TABS.map((t) => {
            const active = activeCat === t.key
            return (
              <Link
                key={t.key || 'all'}
                href={buildHref({ cat: t.key, wt: '' })}
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
                  href={buildHref({ wt: t.key })}
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

        {/* 3차 탭: 상태 */}
        <nav className="flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1 text-xs">
          {STATUS_TABS.map((t) => {
            const active = activeStatus === t.key
            return (
              <Link
                key={t.key || 'all'}
                href={buildHref({ status: t.key })}
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

        {listError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
            목록을 불러오지 못했습니다: {listError.message}
          </p>
        )}

        {rows.length === 0 && !listError ? (
          <EmptyState
            icon={Hammer}
            title={activeCat || activeWt || activeStatus || query ? '해당 조건의 작업 없음' : '등록된 작업 없음'}
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
            {rows.map((w, idx) => {
              const isConn = w.worker_type === '접속팀'
              const reportHref = isConn
                ? `/works/${w.id}/connection-reports/new`
                : `/works/${w.id}/reports/new`
              const newBadge = isNewAssignment(w.id)
              const lastReport = myLastReportByWork.get(w.id)
              return (
                <li
                  key={w.id}
                  className={
                    'relative rounded-xl bg-white border transition-colors ' +
                    (newBadge
                      ? 'border-amber-300 ring-2 ring-amber-100'
                      : w.is_active
                      ? 'border-slate-200 hover:border-slate-900'
                      : 'border-slate-200 opacity-70')
                  }
                >
                  {/* 메인 탭 영역 = 일보 작성 직행. absolute 로 카드 전체를 덮어 큰 클릭 영역 확보. */}
                  <Link
                    href={reportHref}
                    className="absolute inset-0 z-0 rounded-xl"
                    aria-label={`${w.name} 일보 작성`}
                  />
                  <div className="pointer-events-none relative z-10 flex items-start gap-3 p-4">
                    <span className="shrink-0 mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-slate-100 px-1.5 text-xs font-semibold text-slate-600 tabular-nums">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900 truncate inline-flex items-center gap-1.5">
                        {newBadge && (
                          <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                            <Bell className="h-2.5 w-2.5" />
                            신규
                          </span>
                        )}
                        <span className="truncate">{w.name}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 truncate">
                        {formatWorkLabel(w.category, w.subcategory)}
                        {w.client && <span className="ml-1.5">· {w.client}</span>}
                        {w.order_id && <span className="ml-1.5">· 공사 {w.order_id}</span>}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatWorkPeriod(w.start_date, w.end_date)}
                      </p>
                      {isMineMode && (
                        <p className="mt-0.5 text-xs text-slate-500">
                          {lastReport ? (
                            <span>
                              마지막 일보: <span className="font-medium text-slate-700">{lastReport}</span>
                            </span>
                          ) : (
                            <span className="text-amber-700 font-medium">아직 일보 미작성</span>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1.5">
                      <span
                        className={
                          'rounded-full border px-2 py-0.5 text-xs font-medium ' +
                          STATUS_COLOR[w.status]
                        }
                      >
                        {w.status}
                      </span>
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white">
                        <FileText className="h-3 w-3" />
                        일보 작성
                      </span>
                    </div>
                  </div>
                  {/* 푸터 — z-20 으로 main link 위에. 좌측 상세, 우측 삭제(권한자만). */}
                  <div className="pointer-events-auto relative z-20 flex items-center justify-between gap-2 border-t border-slate-100 px-2 py-1 rounded-b-xl">
                    <Link
                      href={`/works/${w.id}`}
                      className="inline-flex items-center gap-0.5 rounded px-2 py-1 text-xs text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                    >
                      상세 · 배정 · 작업구간
                      <ChevronRight className="h-3 w-3" />
                    </Link>
                    {canDelete && <DeleteWorkButton workId={w.id} workName={w.name} />}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {searchTotals && (
          <AggregationCard
            title={`검색 결과 합계 「${query}」`}
            subtitle={`검색 결과 중 접속팀 작업 ${connWorkIds.length}건의 일보 합산. 공사번호로 검색하면 그 공사 전체 자재·공종을 한눈에 볼 수 있습니다.`}
            aggregation={searchTotals}
          />
        )}
      </div>
    </main>
  )
}
