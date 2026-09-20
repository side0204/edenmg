import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Bell, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  LOG_KIND_DOT,
  VEHICLE_LOG_KINDS,
  currentMonthKST,
  formatKm,
  formatKrw,
  hmKST,
  monthRangeKSTLocal,
  todayKST,
  type VehicleLogKind,
} from '@/lib/trips'
import { Dot, SURFACE, Surface } from '../../../ui'
import { LogEntryForm } from './LogEntryForm'
import DeleteLogButton from './DeleteLogButton'

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'
type EmbeddedEmployee = { name: string } | { name: string }[] | null
const pickName = (e: EmbeddedEmployee): string | null => {
  if (!e) return null
  if (Array.isArray(e)) return e[0]?.name ?? null
  return e.name ?? null
}

type TripRow = {
  id: string
  departed_at: string
  returned_at: string | null
  start_odometer_km: number | null
  end_odometer_km: number | null
  place: string | null
  purpose: string | null
  refueled: boolean
  refuel_amount_krw: number | null
  employees: EmbeddedEmployee
}

type LogRow = {
  id: string
  kind: VehicleLogKind
  occurred_on: string
  title: string
  amount_krw: number | null
  odometer_km: number | null
  vendor: string | null
  memo: string | null
  next_due_km: number | null
  next_due_on: string | null
  created_by: string | null
  employees: EmbeddedEmployee
}

type Entry = {
  key: string
  date: string // YYYY-MM-DD
  sortKey: string
  kind: VehicleLogKind | '운행'
  title: string
  amount: string
  meta: string
  auto: boolean
  logId?: string
  canDelete?: boolean
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function dDay(dateStr: string): number {
  const a = new Date(todayKST() + 'T00:00:00Z').getTime()
  const b = new Date(dateStr + 'T00:00:00Z').getTime()
  return Math.round((b - a) / 86_400_000)
}

function dateKST(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(iso))
}

export default async function LogbookPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string; id: string }>
  searchParams: Promise<{ month?: string; kind?: string }>
}) {
  const { kind: targetKind, id: targetId } = await params
  const sp = await searchParams
  if (targetKind !== 'vehicle' && targetKind !== 'personal') redirect('/trips')

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
  const me = meRow as { id: string; company_id: string; permission: Permission; is_active: boolean } | null
  if (!me || !me.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  const isAdmin = me.permission === 'admin'

  const month = /^\d{4}-\d{2}$/.test(sp.month ?? '') ? (sp.month as string) : currentMonthKST()
  const range = monthRangeKSTLocal(month)
  if (!range) redirect('/trips')
  const filterKind = VEHICLE_LOG_KINDS.includes(sp.kind as VehicleLogKind) ? (sp.kind as VehicleLogKind) : sp.kind === '운행' ? '운행' : ''

  // 대상 (업무용 차량 or 자차 직원)
  let title = ''
  let subtitle = ''
  if (targetKind === 'vehicle') {
    const { data: v } = await supabase.from('vehicles').select('plate_number, name, is_active').eq('id', targetId).maybeSingle()
    const vv = v as { plate_number: string; name: string; is_active: boolean } | null
    if (!vv) redirect('/trips?err=' + encodeURIComponent('차량을 찾을 수 없습니다'))
    title = `${vv.plate_number} ${vv.name}`
    subtitle = '업무용'
  } else {
    const { data: e } = await supabase.from('employees').select('name, vehicle_plate').eq('id', targetId).eq('company_id', me.company_id).maybeSingle()
    const ee = e as { name: string; vehicle_plate: string | null } | null
    if (!ee) redirect('/trips?err=' + encodeURIComponent('직원을 찾을 수 없습니다'))
    title = `${ee.vehicle_plate ?? '자차'} ${ee.name}`
    subtitle = `자차 · ${ee.name}`
  }

  const tripsQuery = supabase
    .from('vehicle_trips')
    .select('id, departed_at, returned_at, start_odometer_km, end_odometer_km, place, purpose, refueled, refuel_amount_krw, employees!driver_employee_id(name)')
    .gte('departed_at', range.startISO)
    .lt('departed_at', range.endISOExclusive)
    .order('departed_at', { ascending: false })
    .limit(500)
  const tripsQ = targetKind === 'vehicle' ? tripsQuery.eq('vehicle_id', targetId) : tripsQuery.eq('transport', '자차').eq('driver_employee_id', targetId)

  const logsQuery = supabase
    .from('vehicle_logs')
    .select('id, kind, occurred_on, title, amount_krw, odometer_km, vendor, memo, next_due_km, next_due_on, created_by, employees!created_by(name)')
    .gte('occurred_on', month + '-01')
    .lt('occurred_on', shiftMonth(month, 1) + '-01')
    .order('occurred_on', { ascending: false })
    .limit(500)
  const logsQ = targetKind === 'vehicle' ? logsQuery.eq('vehicle_id', targetId) : logsQuery.eq('personal_employee_id', targetId)

  // 다음 정비 (월 무관 · 최신 1건) + 누적 km (최근 도착 km)
  const dueQuery = supabase
    .from('vehicle_logs')
    .select('title, next_due_km, next_due_on, occurred_on')
    .or('next_due_on.not.is.null,next_due_km.not.is.null')
    .order('occurred_on', { ascending: false })
    .limit(1)
  const dueQ = targetKind === 'vehicle' ? dueQuery.eq('vehicle_id', targetId) : dueQuery.eq('personal_employee_id', targetId)

  const lastKmQuery = supabase
    .from('vehicle_trips')
    .select('end_odometer_km')
    .not('end_odometer_km', 'is', null)
    .order('returned_at', { ascending: false })
    .limit(1)
  const lastKmQ = targetKind === 'vehicle' ? lastKmQuery.eq('vehicle_id', targetId) : lastKmQuery.eq('transport', '자차').eq('driver_employee_id', targetId)

  const [tripsRes, logsRes, dueRes, lastKmRes] = await Promise.all([tripsQ, logsQ, dueQ, lastKmQ])
  const trips = (tripsRes.data ?? []) as unknown as TripRow[]
  const logs = (logsRes.data ?? []) as unknown as LogRow[]
  const due = ((dueRes.data ?? []) as { title: string; next_due_km: number | null; next_due_on: string | null }[])[0] ?? null
  const lastKm = ((lastKmRes.data ?? []) as { end_odometer_km: number }[])[0]?.end_odometer_km ?? null

  // 통계
  let monthKm = 0
  let tripCount = 0
  let fuelKrw = 0
  let fuelCount = 0
  for (const t of trips) {
    tripCount += 1
    if (t.start_odometer_km !== null && t.end_odometer_km !== null) monthKm += Math.max(0, t.end_odometer_km - t.start_odometer_km)
    if (t.refueled) {
      fuelCount += 1
      fuelKrw += t.refuel_amount_krw ?? 0
    }
  }
  for (const l of logs) {
    if (l.kind === '주유') {
      fuelCount += 1
      fuelKrw += l.amount_krw ?? 0
    }
  }

  // 타임라인 병합 — 운행(자동) + 주유(자동, 운행에서) + 수동 기록
  const entries: Entry[] = []
  for (const t of trips) {
    const d = dateKST(t.departed_at)
    const km = t.start_odometer_km !== null && t.end_odometer_km !== null ? t.end_odometer_km - t.start_odometer_km : null
    entries.push({
      key: `trip-${t.id}`,
      date: d,
      sortKey: t.departed_at,
      kind: '운행',
      title: t.place ?? t.purpose ?? '운행',
      amount: km !== null ? `${km.toLocaleString()} km` : '—',
      meta: `${pickName(t.employees) ?? '?'} · ${hmKST(t.departed_at)} ~ ${t.returned_at ? hmKST(t.returned_at) : '진행 중'}${t.purpose && t.place ? ` · ${t.purpose}` : ''}`,
      auto: true,
    })
    if (t.refueled) {
      entries.push({
        key: `fuel-${t.id}`,
        date: t.returned_at ? dateKST(t.returned_at) : d,
        sortKey: t.returned_at ?? t.departed_at,
        kind: '주유',
        title: '주유',
        amount: t.refuel_amount_krw !== null ? formatKrw(t.refuel_amount_krw) : '—',
        meta: `${t.end_odometer_km !== null ? `${t.end_odometer_km.toLocaleString()} km · ` : ''}${pickName(t.employees) ?? '?'}${t.place ? ` · ${t.place}` : ''}`,
        auto: true,
      })
    }
  }
  for (const l of logs) {
    const metaParts: string[] = []
    if (l.odometer_km !== null) metaParts.push(`${l.odometer_km.toLocaleString()} km`)
    if (l.vendor) metaParts.push(l.vendor)
    if (l.next_due_km !== null) metaParts.push(`다음 ${l.next_due_km.toLocaleString()} km`)
    if (l.next_due_on) metaParts.push(`다음 ${l.next_due_on}`)
    const who = pickName(l.employees)
    if (who) metaParts.push(who)
    if (l.memo) metaParts.push(l.memo)
    entries.push({
      key: `log-${l.id}`,
      date: l.occurred_on,
      sortKey: l.occurred_on + 'T12:00:00Z',
      kind: l.kind,
      title: l.title,
      amount: l.amount_krw !== null ? formatKrw(l.amount_krw) : '—',
      meta: metaParts.join(' · '),
      auto: false,
      logId: l.id,
      canDelete: isAdmin || l.created_by === me.id,
    })
  }
  entries.sort((a, b) => b.sortKey.localeCompare(a.sortKey))
  const shown = filterKind ? entries.filter((e) => e.kind === filterKind) : entries

  const base = `/trips/logbook/${targetKind}/${targetId}`
  const [y, m] = month.split('-').map(Number)
  const chips: { key: string; label: string }[] = [
    { key: '', label: '전체' },
    { key: '운행', label: '운행' },
    ...VEHICLE_LOG_KINDS.map((k) => ({ key: k, label: k })),
  ]

  let dueText: React.ReactNode = '—'
  let dueSub = '등록된 정비 예정 없음'
  let dueTone = 'text-slate-900'
  if (due?.next_due_on) {
    const d = dDay(due.next_due_on)
    dueText = d < 0 ? `D+${-d}` : `D-${d}`
    dueSub = due.title
    dueTone = d <= 3 ? 'text-rose-700' : d <= 14 ? 'text-amber-700' : 'text-slate-900'
  } else if (due?.next_due_km !== null && due?.next_due_km !== undefined) {
    dueText = formatKm(due.next_due_km)
    dueSub = due.title + (lastKm !== null ? ` · ${Math.max(0, due.next_due_km - lastKm).toLocaleString()} km 남음` : '')
    dueTone = lastKm !== null && due.next_due_km - lastKm <= 500 ? 'text-amber-700' : 'text-slate-900'
  }

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <header>
          <Link href="/trips" className="inline-flex items-center gap-0.5 text-[13px] font-medium text-slate-500 hover:text-slate-900">
            <ChevronLeft className="h-4 w-4" />
            외근·차량
          </Link>
          <h1 className="mt-0.5 text-2xl font-bold tracking-[-0.03em] text-slate-900 dark:text-slate-100">{title}</h1>
          <p className="mt-0.5 text-[13px] text-slate-500">
            차계부 · {subtitle}
            {lastKm !== null && ` · 누적 ${lastKm.toLocaleString()} km`}
          </p>
        </header>

        {/* 통계 3칸 */}
        <div className="grid grid-cols-3 gap-2">
          <div className={`${SURFACE} px-3 py-3.5 space-y-0.5`}>
            <p className="text-[11px] text-slate-500">이달 주행</p>
            <p className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-100">{formatKm(monthKm)}</p>
            <p className="text-[11px] text-slate-500">운행 {tripCount}건</p>
          </div>
          <div className={`${SURFACE} px-3 py-3.5 space-y-0.5`}>
            <p className="text-[11px] text-slate-500">이달 주유</p>
            <p className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-100">{formatKrw(fuelKrw)}</p>
            <p className="text-[11px] text-slate-500">{fuelCount}회</p>
          </div>
          <div className={`${SURFACE} px-3 py-3.5 space-y-0.5`}>
            <p className="text-[11px] text-slate-500">다음 정비</p>
            <p className={`text-lg font-extrabold tracking-tight ${dueTone}`}>{dueText}</p>
            <p className="truncate text-[11px] text-slate-500">{dueSub}</p>
          </div>
        </div>

        {due && (
          <div className={`${SURFACE} flex items-center gap-2.5 px-3.5 py-3`}>
            <Bell className="h-4 w-4 shrink-0 text-amber-600" />
            <p className="flex-1 text-[13px] text-slate-700 dark:text-slate-300">
              <b>정비 알림</b> · {due.title}
              {due.next_due_on && ` · ${due.next_due_on}`}
              {due.next_due_km !== null && ` · ${due.next_due_km.toLocaleString()} km`}
            </p>
          </div>
        )}

        <Surface className="p-[18px]">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Link href={`${base}?month=${shiftMonth(month, -1)}${filterKind ? `&kind=${encodeURIComponent(filterKind)}` : ''}`} className="rounded p-0.5 text-slate-400 hover:text-slate-900" aria-label="이전 달">
                <ChevronLeft className="h-4 w-4" />
              </Link>
              {y}년 {m}월
              <Link href={`${base}?month=${shiftMonth(month, 1)}${filterKind ? `&kind=${encodeURIComponent(filterKind)}` : ''}`} className="rounded p-0.5 text-slate-400 hover:text-slate-900" aria-label="다음 달">
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="flex gap-1.5">
              {targetKind === 'vehicle' && (
                <a
                  href={`/api/reports/vehicle-trips?mode=month&month=${month}&vehicle_id=${targetId}`}
                  className="inline-flex items-center gap-1 rounded-[10px] bg-white px-2.5 py-1.5 text-[13px] font-medium text-slate-700 shadow-[0_0_0_1px_rgba(15,23,42,0.08)] hover:bg-slate-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  CSV
                </a>
              )}
              <LogEntryForm targetKind={targetKind} targetId={targetId} defaultOdometer={lastKm} />
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => {
              const on = c.key === filterKind
              return (
                <Link
                  key={c.key || 'all'}
                  href={`${base}?month=${month}${c.key ? `&kind=${encodeURIComponent(c.key)}` : ''}`}
                  className={
                    'rounded-full px-3 py-1.5 text-[13px] font-medium ' +
                    (on ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 shadow-[0_0_0_1px_rgba(15,23,42,0.1)] hover:bg-slate-50')
                  }
                >
                  {c.label}
                </Link>
              )
            })}
          </div>

          {shown.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">이 달에는 기록이 없습니다.</p>
          ) : (
            <ul>
              {shown.map((e) => (
                <li key={e.key} className="flex gap-3 border-b border-slate-100 py-2.5 last:border-b-0">
                  <div className="w-10 shrink-0 pt-0.5 text-[11px] text-slate-500">{e.date.slice(5)}</div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex min-w-0 items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        <Dot className={LOG_KIND_DOT[e.kind]} size="h-[7px] w-[7px]" />
                        <span className="truncate">{e.title}</span>
                      </span>
                      <span className="shrink-0 text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">{e.amount}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span className="min-w-0 truncate">
                        {e.kind} · {e.meta}
                        {e.auto && <span className="text-slate-400"> · 자동</span>}
                      </span>
                      {e.logId && e.canDelete && <DeleteLogButton id={e.logId} targetKind={targetKind} targetId={targetId} />}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-slate-400">운행·주유(자동)는 외근 도착 폼에서 들어옵니다. 정비·보험·검사·세금·통행·주차는 「기록 추가」로 입력하세요.</p>
        </Surface>
      </div>
    </main>
  )
}
