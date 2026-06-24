import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { ChevronLeft, RefreshCw, Ban } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  ACCESS_STATUS_COLOR,
  formatAccessPeriod,
  isAccessStatus,
  type AccessStatus,
} from '@/lib/station-access'
import { retryAccessRequest, cancelAccessRequest } from '../actions'

type RequestDetail = {
  id: string
  company_id: string
  requested_by: string | null
  station_name: string
  access_start_date: string
  access_end_date: string
  visitor_name: string
  visitor_phone: string | null
  status: string
  rpa_result: string | null
  rpa_completed_at: string | null
  created_at: string
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2">
      <span className="w-24 shrink-0 text-sm text-slate-500">{label}</span>
      <span className="min-w-0 flex-1 text-sm text-slate-900">{value || '—'}</span>
    </div>
  )
}

export default async function StationAccessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, permission, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; permission: string; is_active: boolean } | null
  if (!me || !me.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))

  const { data: row } = await supabase
    .from('station_access_requests')
    .select(
      'id, company_id, requested_by, station_name, access_start_date, access_end_date, visitor_name, visitor_phone, status, rpa_result, rpa_completed_at, created_at',
    )
    .eq('id', id)
    .maybeSingle()
  const req = row as RequestDetail | null
  if (!req) notFound()

  const status: AccessStatus = isAccessStatus(req!.status) ? req!.status : '대기'
  const isOwnerOrAdmin = req!.requested_by === me.id || me.permission === 'admin'
  const canRetry = isOwnerOrAdmin && status !== '등록중'
  const canCancel = isOwnerOrAdmin && status !== '완료' && status !== '취소'

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
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{req!.station_name}</h1>
            <span
              className={
                'shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ' +
                ACCESS_STATUS_COLOR[status]
              }
            >
              {status}
            </span>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 divide-y divide-slate-100">
          <InfoRow label="국사" value={req!.station_name} />
          <InfoRow
            label="출입기간"
            value={formatAccessPeriod(req!.access_start_date, req!.access_end_date)}
          />
          <InfoRow label="출입자" value={req!.visitor_name} />
          <InfoRow label="연락처" value={req!.visitor_phone} />
        </section>

        {/* RPA 결과 */}
        {(req!.rpa_result || req!.rpa_completed_at) && (
          <section
            className={
              'rounded-2xl border p-4 ' +
              (status === '실패'
                ? 'border-rose-200 bg-rose-50'
                : status === '완료'
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-slate-200 bg-white')
            }
          >
            <p className="text-xs font-semibold text-slate-600">자동등록 결과</p>
            {req!.rpa_result && <p className="mt-1 text-sm text-slate-900">{req!.rpa_result}</p>}
            {req!.rpa_completed_at && (
              <p className="mt-1 text-xs text-slate-500">
                처리시각 {new Date(req!.rpa_completed_at).toLocaleString('ko-KR')}
              </p>
            )}
          </section>
        )}

        {/* 액션 */}
        <div className="space-y-2">
          {canRetry && (
            <form action={retryAccessRequest}>
              <input type="hidden" name="id" value={req!.id} />
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className="h-4 w-4" />
                다시 전송 (재시도)
              </button>
            </form>
          )}
          {canCancel && (
            <form action={cancelAccessRequest}>
              <input type="hidden" name="id" value={req!.id} />
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
              >
                <Ban className="h-4 w-4" />
                출입요청 취소
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-slate-400">
          요청일시 {new Date(req!.created_at).toLocaleString('ko-KR')}
        </p>
      </div>
    </main>
  )
}
