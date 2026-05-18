import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  LEAVE_TYPE_LABEL,
  STATUS_COLOR,
  formatPeriod,
  type LeaveStatus,
  type LeaveType,
} from '@/lib/leave'

type RequestRow = {
  id: string
  type: LeaveType
  start_date: string
  end_date: string
  start_time: string | null
  end_time: string | null
  status: LeaveStatus
  is_urgent: boolean
  created_at: string
}

export default async function MyRequestsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string } | null
  if (!me) redirect('/')

  const { data, error: listError } = await supabase
    .from('leave_requests')
    .select('id, type, start_date, end_date, start_time, end_time, status, is_urgent, created_at')
    .eq('employee_id', me.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const rows = (data ?? []) as RequestRow[]

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-5">
        <header className="flex items-center justify-between gap-3">
          <div>
            <Link href="/" className="text-sm text-slate-500 hover:text-slate-900">
              ← 홈
            </Link>
            <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">내 신청</h1>
          </div>
          <Link
            href="/requests/new"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            + 신청
          </Link>
        </header>

        {listError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
            목록을 불러오지 못했습니다: {listError.message}
          </p>
        )}

        <ul className="space-y-3">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-xl bg-white border border-slate-200 hover:border-slate-900 transition-colors"
            >
              <Link href={`/requests/${r.id}`} className="block p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 flex items-center gap-2">
                      {LEAVE_TYPE_LABEL[r.type]}
                      {r.is_urgent && (
                        <span className="rounded bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5">
                          긴급
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatPeriod(r.start_date, r.end_date, r.start_time, r.end_time)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[r.status]}`}
                  >
                    {r.status}
                  </span>
                </div>
              </Link>
            </li>
          ))}

          {rows.length === 0 && !listError && (
            <li className="rounded-xl bg-white border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              아직 신청 내역이 없습니다. 우측 상단 <span className="font-medium">+ 신청</span> 으로 시작하세요.
            </li>
          )}
        </ul>
      </div>
    </main>
  )
}
