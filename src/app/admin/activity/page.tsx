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

export default async function ActivityPage() {
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
