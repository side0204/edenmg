import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AttendanceForm } from './AttendanceForm'
import { checkIn, checkOut } from './actions'
import type { ActiveSite } from './geo'

function todayInSeoul(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
}

function fmtHourMin(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

type Attendance = {
  id: string
  site_id: string | null
  check_in_at: string | null
  check_out_at: string | null
  check_in_outside_reason: string | null
  check_out_outside_reason: string | null
}

export default async function AttendancePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, name, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; name: string; is_active: boolean } | null
  if (!me || !me.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))

  const workDate = todayInSeoul()

  const [{ data: todayRow }, { data: sitesData }, { data: siteNamesData }] = await Promise.all([
    supabase
      .from('attendances')
      .select('id, site_id, check_in_at, check_out_at, check_in_outside_reason, check_out_outside_reason')
      .eq('employee_id', me.id)
      .eq('work_date', workDate)
      .maybeSingle(),
    supabase
      .from('sites')
      .select('id, name, lat, lng, radius_m')
      .eq('is_active', true)
      .not('lat', 'is', null)
      .not('lng', 'is', null),
    supabase.from('sites').select('id, name'),
  ])

  const today = todayRow as Attendance | null
  const sites = ((sitesData ?? []) as { id: string; name: string; lat: number; lng: number; radius_m: number }[])
    .filter((s) => s.lat !== null && s.lng !== null) as ActiveSite[]
  const siteNameById = new Map<string, string>()
  for (const s of (siteNamesData ?? []) as { id: string; name: string }[]) {
    siteNameById.set(s.id, s.name)
  }

  const checkedIn = !!today?.check_in_at
  const checkedOut = !!today?.check_out_at

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-md space-y-5">
        <header>
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-900">
            ← 홈
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">출퇴근</h1>
          <p className="mt-1 text-sm text-slate-500">{me.name} · {formatWorkDate(workDate)}</p>
        </header>

        {sites.length === 0 && (
          <Banner kind="warn">
            등록된 활성 현장이 없습니다. 출퇴근은 가능하지만 사유 입력이 필요합니다.
            {' '}(관리자에게 현장 등록을 요청하세요.)
          </Banner>
        )}

        <section className="rounded-2xl bg-white shadow-sm border border-slate-200 p-6 space-y-4">
          {checkedIn && (
            <SummaryLine
              label="출근"
              time={fmtHourMin(today!.check_in_at!)}
              siteName={today!.site_id ? siteNameById.get(today!.site_id) ?? '?' : null}
              reason={today!.check_in_outside_reason}
            />
          )}
          {checkedOut && (
            <SummaryLine
              label="퇴근"
              time={fmtHourMin(today!.check_out_at!)}
              siteName={null /* 퇴근은 현장 매칭 별도 표시 안 함 */}
              reason={today!.check_out_outside_reason}
            />
          )}

          {!checkedIn && <AttendanceForm mode="in" action={checkIn} sites={sites} />}
          {checkedIn && !checkedOut && <AttendanceForm mode="out" action={checkOut} sites={sites} />}
          {checkedOut && (
            <p className="text-center text-sm text-slate-500 py-2">
              오늘 근무가 마감됐습니다.
            </p>
          )}
        </section>

        <p className="text-center text-xs text-slate-400">
          위치 정보는 출퇴근 외 용도로 추적되지 않습니다.
        </p>
      </div>
    </main>
  )
}

function SummaryLine({
  label,
  time,
  siteName,
  reason,
}: {
  label: string
  time: string
  siteName: string | null
  reason: string | null
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="shrink-0 inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
        {label}
      </span>
      <div className="min-w-0">
        <p className="font-medium text-slate-900">{time}</p>
        {siteName && <p className="text-xs text-slate-500">{siteName}</p>}
        {reason && <p className="text-xs text-amber-700 mt-0.5">사유: {reason}</p>}
      </div>
    </div>
  )
}

function Banner({ kind, children }: { kind: 'ok' | 'warn' | 'err'; children: React.ReactNode }) {
  const cls =
    kind === 'ok'
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : kind === 'warn'
        ? 'text-amber-700 bg-amber-50 border-amber-200'
        : 'text-red-600 bg-red-50 border-red-200'
  return <p className={`text-sm border rounded-lg p-3 ${cls}`}>{children}</p>
}

function formatWorkDate(yyyymmdd: string): string {
  // 'YYYY-MM-DD' → '5월 17일 (토)' 같은 한국식 짧은 표기
  const [y, m, d] = yyyymmdd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const weekday = new Intl.DateTimeFormat('ko-KR', { weekday: 'short', timeZone: 'UTC' }).format(dt)
  return `${m}월 ${d}일 (${weekday})`
}
