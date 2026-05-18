import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  LEAVE_TYPE_LABEL,
  formatPeriod,
  type LeaveStage,
  type LeaveType,
} from '@/lib/leave'

type Permission = 'worker' | 'foreman' | 'admin' | 'ceo'

type PendingRow = {
  id: string
  employee_id: string
  type: LeaveType
  start_date: string
  end_date: string
  start_time: string | null
  end_time: string | null
  reason: string
  is_urgent: boolean
  pending_stage: LeaveStage
  created_at: string
}

export default async function ApprovalsPage() {
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
    | { id: string; company_id: string; permission: Permission; is_active: boolean }
    | null
  if (!me || !me.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  if (me.permission === 'worker') notFound()

  const isAdmin = me.permission === 'admin' || me.permission === 'ceo'

  // 결재함 쿼리:
  //   - foreman: 본인 단계 + 본인이 지정 결재자
  //   - admin/ceo: 회사 안 모든 대기 (어느 단계든)
  let q = supabase
    .from('leave_requests')
    .select('id, employee_id, type, start_date, end_date, start_time, end_time, reason, is_urgent, pending_stage, created_at')
    .eq('status', '대기')
    .order('is_urgent', { ascending: false })
    .order('created_at', { ascending: true })

  if (isAdmin) {
    q = q.eq('company_id', me.company_id).not('pending_stage', 'is', null)
  } else {
    q = q.eq('assigned_foreman_id', me.id).eq('pending_stage', 'foreman')
  }

  const { data, error: listError } = await q
  const rows = (data ?? []) as PendingRow[]

  // 신청자 이름 매핑
  const empIds = Array.from(new Set(rows.map((r) => r.employee_id)))
  const nameById = new Map<string, string>()
  if (empIds.length > 0) {
    const { data: ppl } = await supabase.from('employees').select('id, name').in('id', empIds)
    for (const p of (ppl ?? []) as { id: string; name: string }[]) {
      nameById.set(p.id, p.name)
    }
  }

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-5">
        <header>
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-900">
            ← 홈
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">결재함</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isAdmin ? '회사의 모든 대기 신청을 처리할 수 있습니다.' : '본인이 1차 결재자로 지정된 대기 신청만 표시됩니다.'}
          </p>
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
              <Link href={`/approvals/${r.id}`} className="block p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 flex items-center gap-2">
                      {nameById.get(r.employee_id) ?? '?'} · {LEAVE_TYPE_LABEL[r.type]}
                      {r.is_urgent && (
                        <span className="rounded bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5">
                          긴급
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatPeriod(r.start_date, r.end_date, r.start_time, r.end_time)}
                    </p>
                    <p className="mt-1 text-xs text-slate-600 line-clamp-2">{r.reason}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${
                      r.pending_stage === 'foreman'
                        ? 'text-blue-700 bg-blue-50 border-blue-200'
                        : 'text-indigo-700 bg-indigo-50 border-indigo-200'
                    }`}
                  >
                    {r.pending_stage === 'foreman' ? '소장 단계' : '관리자 단계'}
                  </span>
                </div>
              </Link>
            </li>
          ))}

          {rows.length === 0 && !listError && (
            <li className="rounded-xl bg-white border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              대기 중인 결재가 없습니다.
            </li>
          )}
        </ul>
      </div>
    </main>
  )
}
