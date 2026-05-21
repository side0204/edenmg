import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, Activity, LogIn, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

// 접속 현황 · 로그 — 관리자 전용.
//   베타 운영 중 사용자가 실제로 시스템을 쓰는지 모니터링하기 위한 페이지.
//   - 현재 접속 중: employees.last_seen_at 이 최근 10분 이내인 직원 (proxy 가 갱신)
//   - 로그인 기록: activity_logs 최근 100건 (로그인·로그아웃)

const ONLINE_WINDOW_MIN = 10

type OnlineRow = {
  id: string
  name: string | null
  position: string | null
  team: string | null
  work_type: string | null
  last_seen_at: string
}

type LogRow = {
  id: string
  employee_id: string
  action: 'login' | 'logout'
  created_at: string
}

function fmtKST(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

function relTime(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diffMin < 1) return '방금'
  if (diffMin < 60) return `${diffMin}분 전`
  const h = Math.floor(diffMin / 60)
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

function metaLine(r: OnlineRow): string {
  return [r.position, r.team, r.work_type].filter(Boolean).join(' · ')
}

// 경로 → 메뉴(섹션) 이름. "어느 메뉴를 많이 쓰는지" 집계용.
function pathSection(path: string): string {
  if (path === '/') return '홈'
  if (path.startsWith('/works')) return '작업관리'
  if (path.startsWith('/relocation')) return '지장이설'
  if (path.startsWith('/attendance')) return '근태'
  if (path.startsWith('/vehicles')) return '차량관리'
  if (path.startsWith('/requests') || path.startsWith('/approvals')) return '결재'
  if (path.startsWith('/leaves') || path.startsWith('/my-leaves')) return '휴가'
  if (path.startsWith('/stock')) return '자재관리'
  if (path.startsWith('/admin')) return '관리'
  if (path.startsWith('/settings')) return '설정'
  return '기타'
}

// 동적 경로의 UUID 를 :id 로 치환 — 세부 페이지 집계 시 같은 페이지로 묶기 위함.
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
function normalizePath(path: string): string {
  return path.replace(UUID_RE, ':id')
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  const { days: daysRaw } = await searchParams
  const days = daysRaw === '7' ? 7 : 30

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, permission, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | {
        id: string
        company_id: string
        permission: 'worker' | 'team_member' | 'team_leader' | 'admin'
        is_active: boolean
      }
    | null
  if (!me || !me.is_active) {
    redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  }
  if (me.permission !== 'admin') {
    redirect('/?err=' + encodeURIComponent('관리자 권한이 필요합니다'))
  }

  // 현재 접속 중 — 최근 10분 이내 활동
  const sinceIso = new Date(Date.now() - ONLINE_WINDOW_MIN * 60 * 1000).toISOString()
  const { data: onlineData } = await supabase
    .from('employees')
    .select('id, name, position, team, work_type, last_seen_at')
    .eq('company_id', me.company_id)
    .eq('is_active', true)
    .gte('last_seen_at', sinceIso)
    .order('last_seen_at', { ascending: false })
  const online = (onlineData ?? []) as OnlineRow[]

  // 로그인 기록 — 최근 100건 (RLS 가 같은 회사로 제한)
  const { data: logData } = await supabase
    .from('activity_logs')
    .select('id, employee_id, action, created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  const logs = (logData ?? []) as LogRow[]

  // 로그의 직원 이름 매핑
  const nameById = new Map<string, string>()
  const empIds = [...new Set(logs.map((l) => l.employee_id))]
  if (empIds.length > 0) {
    const { data: empData } = await supabase
      .from('employees')
      .select('id, name')
      .in('id', empIds)
    for (const e of (empData ?? []) as { id: string; name: string | null }[]) {
      nameById.set(e.id, e.name ?? '이름 미상')
    }
  }

  // 메뉴별 사용량 — page_view_summary RPC (경로별 방문수, RLS 가 회사로 제한)
  const usageSince = new Date(Date.now() - days * 86400000).toISOString()
  const { data: summaryData } = await supabase.rpc('page_view_summary', {
    _since: usageSince,
  })
  const summaryRows = (summaryData ?? []) as { path: string; cnt: number }[]

  const sectionCount = new Map<string, number>()
  const pageCount = new Map<string, number>()
  let totalViews = 0
  for (const r of summaryRows) {
    const c = Number(r.cnt) || 0
    totalViews += c
    const sec = pathSection(r.path)
    sectionCount.set(sec, (sectionCount.get(sec) ?? 0) + c)
    const np = normalizePath(r.path)
    pageCount.set(np, (pageCount.get(np) ?? 0) + c)
  }
  const sections = [...sectionCount.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
  const topPages = [...pageCount.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
  const maxSection = sections[0]?.count ?? 0

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <header>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
            홈
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold tracking-tight text-slate-900">
            <Activity className="h-7 w-7 text-slate-400" />
            접속 현황 · 로그
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            베타 운영 중 사용자의 접속 상태와 로그인 기록을 확인합니다.
          </p>
        </header>

        {/* 현재 접속 중 */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold tracking-tight text-slate-900">
              현재 접속 중
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-sm font-semibold text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {online.length}명
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            최근 {ONLINE_WINDOW_MIN}분 이내 활동한 사용자
          </p>

          {online.length === 0 ? (
            <p className="mt-3 py-4 text-center text-sm text-slate-400">
              현재 접속 중인 사용자가 없습니다.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {online.map((r) => {
                const meta = metaLine(r)
                return (
                  <li key={r.id} className="flex items-center gap-2 py-2.5">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {r.name ?? '이름 미상'}
                      </p>
                      {meta && <p className="truncate text-xs text-slate-500">{meta}</p>}
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">
                      {relTime(r.last_seen_at)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* 메뉴별 사용량 */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="space-y-2 sm:flex sm:items-center sm:justify-between sm:gap-3 sm:space-y-0">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-slate-900">
                메뉴별 사용량
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                최근 {days}일 · 총 {totalViews.toLocaleString()}회 방문
              </p>
            </div>
            <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-slate-300 text-sm">
              {[7, 30].map((d) => (
                <Link
                  key={d}
                  href={`/admin/activity?days=${d}`}
                  className={
                    'px-3 py-1.5 font-medium ' +
                    (days === d
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-50')
                  }
                >
                  {d}일
                </Link>
              ))}
            </div>
          </div>

          {sections.length === 0 ? (
            <p className="mt-3 py-4 text-center text-sm text-slate-400">
              아직 페이지 방문 기록이 없습니다.
            </p>
          ) : (
            <>
              <ul className="mt-3 space-y-2">
                {sections.map((s) => (
                  <li key={s.name} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-sm font-medium text-slate-700">
                      {s.name}
                    </span>
                    <div className="h-5 flex-1 overflow-hidden rounded bg-slate-100">
                      <div
                        className="h-full rounded bg-indigo-500"
                        style={{
                          width: `${maxSection ? (s.count / maxSection) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right text-sm font-semibold text-slate-900">
                      {s.count.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>

              {topPages.length > 0 && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-900">
                    세부 페이지 TOP {topPages.length}
                  </summary>
                  <ul className="mt-2 divide-y divide-slate-100">
                    {topPages.map((p) => (
                      <li
                        key={p.path}
                        className="flex items-center gap-2 py-1.5 text-xs"
                      >
                        <span className="min-w-0 flex-1 truncate font-mono text-slate-600">
                          {p.path}
                        </span>
                        <span className="shrink-0 font-semibold text-slate-900">
                          {p.count.toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </section>

        {/* 로그인 기록 */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold tracking-tight text-slate-900">
            로그인 기록
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">최근 100건 (로그인·로그아웃)</p>

          {logs.length === 0 ? (
            <p className="mt-3 py-4 text-center text-sm text-slate-400">
              아직 기록이 없습니다.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {logs.map((l) => {
                const isLogin = l.action === 'login'
                return (
                  <li key={l.id} className="flex items-center gap-2.5 py-2.5">
                    <span
                      className={
                        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ' +
                        (isLogin
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-slate-100 text-slate-500')
                      }
                    >
                      {isLogin ? (
                        <LogIn className="h-3.5 w-3.5" />
                      ) : (
                        <LogOut className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                      {nameById.get(l.employee_id) ?? '이름 미상'}
                    </span>
                    <span
                      className={
                        'shrink-0 text-xs font-medium ' +
                        (isLogin ? 'text-emerald-600' : 'text-slate-400')
                      }
                    >
                      {isLogin ? '로그인' : '로그아웃'}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-slate-400">
                      {fmtKST(l.created_at)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
