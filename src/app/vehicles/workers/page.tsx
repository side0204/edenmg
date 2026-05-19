import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Car, ChevronLeft, Phone } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { EmptyState } from '@/components/EmptyState'

type Row = {
  id: string
  name: string
  position: string | null
  team: string | null
  work_type: string | null
  phone: string | null
  vehicle_plate: string | null
  is_active: boolean
}

const WORK_TYPE_TABS: { key: '' | '접속팀' | '외선팀'; label: string }[] = [
  { key: '', label: '전체' },
  { key: '접속팀', label: '접속팀' },
  { key: '외선팀', label: '외선팀' },
]

export default async function WorkersVehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ wt?: string }>
}) {
  const sp = await searchParams
  const wt = sp.wt === '접속팀' || sp.wt === '외선팀' ? sp.wt : ''

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
  if (!me?.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))

  // 차량번호가 있는 활성 직원 — 접속팀·외선팀 위주
  let query = supabase
    .from('employees')
    .select('id, name, position, team, work_type, phone, vehicle_plate, is_active')
    .eq('company_id', me.company_id)
    .eq('is_active', true)
    .not('vehicle_plate', 'is', null)

  if (wt) query = query.eq('work_type', wt)

  const { data, error } = await query.order('work_type').order('name')
  let rows = (data ?? []) as Row[]
  // 추가 안전망 — vehicle_plate 빈 문자열도 걸러내기
  rows = rows.filter((r) => (r.vehicle_plate ?? '').trim().length > 0)

  // 통계 카드용 카운트 — 전체 (필터와 무관)
  const { data: allRows } = await supabase
    .from('employees')
    .select('work_type, vehicle_plate')
    .eq('company_id', me.company_id)
    .eq('is_active', true)
    .not('vehicle_plate', 'is', null)
  const counts: Record<string, number> = {}
  for (const e of (allRows ?? []) as { work_type: string | null; vehicle_plate: string | null }[]) {
    if (!(e.vehicle_plate ?? '').trim()) continue
    const k = e.work_type ?? '미지정'
    counts[k] = (counts[k] ?? 0) + 1
  }
  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <header>
          <Link
            href="/vehicles"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
            업무용 차량
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">작업차량 전체</h1>
          <p className="mt-1 text-sm text-slate-500">
            작업자 본인이 등록한 운행 차량. 회사 업무용 차량(출고·반납)과는 별개의 운행자 파악용
            정보입니다.
          </p>
        </header>

        {/* 통계 카드 */}
        <section className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[11px] text-slate-500">전체</p>
            <p className="mt-0.5 text-2xl font-bold text-slate-900">{totalCount}</p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
            <p className="text-[11px] text-blue-700">접속팀</p>
            <p className="mt-0.5 text-2xl font-bold text-blue-900">{counts['접속팀'] ?? 0}</p>
          </div>
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
            <p className="text-[11px] text-orange-700">외선팀</p>
            <p className="mt-0.5 text-2xl font-bold text-orange-900">{counts['외선팀'] ?? 0}</p>
          </div>
        </section>

        {/* 직무 탭 */}
        <div className="flex gap-1.5 text-xs">
          {WORK_TYPE_TABS.map((t) => (
            <Link
              key={t.key}
              href={t.key ? `/vehicles/workers?wt=${encodeURIComponent(t.key)}` : '/vehicles/workers'}
              className={
                'rounded-full px-3 py-1 ' +
                (wt === t.key
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50')
              }
            >
              {t.label}
            </Link>
          ))}
        </div>

        {error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            조회 실패: {error.message}
          </p>
        )}

        {rows.length === 0 && !error ? (
          <EmptyState
            icon={Car}
            title="등록된 작업차량 없음"
            description="작업자가 회원가입 시 차량번호를 입력하면 여기 표시됩니다."
          />
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-slate-200 bg-white p-3 space-y-1.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">
                      {r.name}
                      {r.work_type && (
                        <span
                          className={
                            'ml-1.5 rounded-full border px-1.5 py-0.5 text-[11px] ' +
                            badgeColor(r.work_type)
                          }
                        >
                          {r.work_type}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {[r.position, r.team ? `${r.team}팀` : null].filter(Boolean).join(' · ') ||
                        '미지정'}
                    </p>
                    {r.phone && (
                      <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-slate-500">
                        <Phone className="h-3 w-3" />
                        <a href={`tel:${r.phone}`} className="underline">
                          {r.phone}
                        </a>
                      </p>
                    )}
                  </div>
                  <p className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-bold text-slate-900">
                    {r.vehicle_plate}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}

function badgeColor(workType: string): string {
  if (workType === '접속팀') return 'border-blue-200 bg-blue-50 text-blue-700'
  if (workType === '외선팀') return 'border-orange-200 bg-orange-50 text-orange-700'
  if (workType === '사무') return 'border-violet-200 bg-violet-50 text-violet-700'
  if (workType === '자재담당') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (workType === '장비팀') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (workType === '신호수') return 'border-rose-200 bg-rose-50 text-rose-700'
  return 'border-slate-200 bg-slate-50 text-slate-600'
}
