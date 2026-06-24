import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { todayInSeoul } from '@/lib/work'
import { createAccessRequest } from '../actions'

type Station = { id: string; name: string; address: string | null }

export default async function NewStationAccessPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, name, phone, vehicle_plate, company_id, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | {
        id: string
        name: string
        phone: string | null
        vehicle_plate: string | null
        company_id: string
        is_active: boolean
      }
    | null
  if (!me || !me.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))

  const { data: stationsData } = await supabase
    .from('field_stations')
    .select('id, name, address')
    .eq('company_id', me.company_id)
    .order('name')
  const stations = (stationsData ?? []) as Station[]

  const today = todayInSeoul()

  const LABEL = 'block text-sm font-medium text-slate-700'
  const INPUT =
    'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-slate-900 focus:outline-none'

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-md space-y-5">
        <header>
          <Link
            href="/works/station-access"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
            국사출입등록
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">출입요청</h1>
          <p className="mt-1 text-sm text-slate-500">출입자는 로그인한 본인으로 등록됩니다.</p>
        </header>

        {stations.length === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            등록된 국사가 없습니다. 먼저{' '}
            <Link href="/field/stations" className="font-semibold underline">
              현장관리 → 국사현황
            </Link>{' '}
            에서 국사를 등록하세요.
          </div>
        ) : (
          <form action={createAccessRequest} className="space-y-4">
            {/* 출입자 (본인 — 읽기 전용 안내) */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">출입자</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">{me.name}</p>
              <p className="text-xs text-slate-500">
                {[me.phone, me.vehicle_plate].filter(Boolean).join(' · ') || '연락처·차량 미등록'}
              </p>
            </div>

            <div>
              <label htmlFor="station_id" className={LABEL}>
                국사 *
              </label>
              <select id="station_id" name="station_id" required defaultValue="" className={INPUT}>
                <option value="" disabled>
                  국사를 선택하세요
                </option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.address ? ` (${s.address})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="access_start_date" className={LABEL}>
                  출입 시작일 *
                </label>
                <input
                  id="access_start_date"
                  name="access_start_date"
                  type="date"
                  required
                  defaultValue={today}
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="access_end_date" className={LABEL}>
                  출입 종료일
                </label>
                <input
                  id="access_end_date"
                  name="access_end_date"
                  type="date"
                  defaultValue={today}
                  className={INPUT}
                />
              </div>
            </div>
            <p className="-mt-2 text-xs text-slate-400">하루만 출입하면 시작·종료일을 같게 두세요.</p>

            <div>
              <label htmlFor="purpose" className={LABEL}>
                출입 목적
              </label>
              <textarea
                id="purpose"
                name="purpose"
                rows={3}
                placeholder="예: 광케이블 접속작업"
                className={INPUT}
              />
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              제출하면 국사출입등록시스템에 자동으로 등록됩니다. 진행 상태는 목록·상세에서 확인하세요.
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-medium text-white hover:bg-slate-800"
            >
              출입요청 보내기
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
