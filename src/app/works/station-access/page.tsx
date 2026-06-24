import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, ChevronRight, DoorOpen, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  ACCESS_STATUS_COLOR,
  formatAccessPeriod,
  isAccessStatus,
  type AccessStatus,
} from '@/lib/station-access'

type RequestRow = {
  id: string
  station_name: string
  visitor_name: string
  access_start_date: string
  access_end_date: string
  status: string
  created_at: string
}

export default async function StationAccessListPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; is_active: boolean } | null
  if (!me || !me.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))

  // RLS 가 회사 스코프 강제
  const { data: rowsData } = await supabase
    .from('station_access_requests')
    .select('id, station_name, visitor_name, access_start_date, access_end_date, status, created_at')
    .order('created_at', { ascending: false })
    .limit(200)
  const rows = (rowsData ?? []) as RequestRow[]

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <header className="space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
          <div>
            <Link
              href="/works"
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
            >
              <ChevronLeft className="h-4 w-4" />
              작업
            </Link>
            <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">국사출입등록</h1>
            <p className="mt-1 text-sm text-slate-500">국사 출입을 요청하면 자동으로 등록됩니다 · {rows.length}건</p>
          </div>
          <Link
            href="/works/station-access/new"
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            출입요청
          </Link>
        </header>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <DoorOpen className="h-6 w-6 text-slate-400" />
            </div>
            <p className="mt-3 text-sm font-medium text-slate-700">아직 출입요청이 없습니다</p>
            <p className="mt-1 text-xs text-slate-500">「출입요청」으로 국사·기간을 입력하세요.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const status: AccessStatus = isAccessStatus(r.status) ? r.status : '대기'
              return (
                <li key={r.id}>
                  <Link
                    href={`/works/station-access/${r.id}`}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-300 hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-900">{r.station_name}</p>
                        <span
                          className={
                            'shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ' +
                            ACCESS_STATUS_COLOR[status]
                          }
                        >
                          {status}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {r.visitor_name} · {formatAccessPeriod(r.access_start_date, r.access_end_date)}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}
