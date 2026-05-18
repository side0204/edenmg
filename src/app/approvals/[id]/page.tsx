import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  LEAVE_TYPE_LABEL,
  STATUS_COLOR,
  formatPeriod,
  type LeaveAction,
  type LeaveStage,
  type LeaveStatus,
  type LeaveType,
} from '@/lib/leave'
import { approveRequest, rejectRequest } from '../actions'
import { getAttachmentUrl } from '@/app/requests/actions'

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

type RequestRow = {
  id: string
  company_id: string
  employee_id: string
  type: LeaveType
  start_date: string
  end_date: string
  start_time: string | null
  end_time: string | null
  reason: string
  is_urgent: boolean
  status: LeaveStatus
  pending_stage: LeaveStage | null
  assigned_foreman_id: string | null
  substitute_employee_id: string | null
  attachment_path: string | null
  attachment_filename: string | null
  created_at: string
}

type ApprovalRow = {
  id: string
  actor_employee_id: string
  action: LeaveAction
  comment: string | null
  acted_at: string
}

function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

const ACTION_COLOR: Record<LeaveAction, string> = {
  '신청': 'text-slate-600 bg-slate-100',
  '승인': 'text-emerald-700 bg-emerald-50',
  '반려': 'text-red-700 bg-red-50',
  '전결': 'text-indigo-700 bg-indigo-50',
  '취소': 'text-slate-500 bg-slate-100',
}

export default async function ApprovalDetailPage({
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
    .select('id, company_id, permission, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | { id: string; company_id: string; permission: Permission; is_active: boolean }
    | null
  if (!me || !me.is_active) redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  if (me.permission === 'worker') notFound()

  const { data: reqRow } = await supabase
    .from('leave_requests')
    .select('id, company_id, employee_id, type, start_date, end_date, start_time, end_time, reason, is_urgent, status, pending_stage, assigned_foreman_id, substitute_employee_id, attachment_path, attachment_filename, created_at')
    .eq('id', id)
    .maybeSingle()
  const req = reqRow as RequestRow | null
  if (!req) notFound()
  if (req.company_id !== me.company_id) notFound()

  const { data: approvalsData } = await supabase
    .from('leave_request_approvals')
    .select('id, actor_employee_id, action, comment, acted_at')
    .eq('leave_request_id', id)
    .order('acted_at', { ascending: true })
  const approvals = (approvalsData ?? []) as ApprovalRow[]

  // 이름 매핑
  const personIds = Array.from(
    new Set([req.employee_id, req.assigned_foreman_id, req.substitute_employee_id, ...approvals.map((a) => a.actor_employee_id)].filter((v): v is string => !!v)),
  )
  const nameById = new Map<string, string>()
  if (personIds.length > 0) {
    const { data: people } = await supabase.from('employees').select('id, name').in('id', personIds)
    for (const p of (people ?? []) as { id: string; name: string }[]) {
      nameById.set(p.id, p.name)
    }
  }

  const attachmentLink = req.attachment_path ? await getAttachmentUrl(req.id) : null

  // 본인이 결재 가능한지 + 승인 버튼 라벨 결정
  const isAdmin = me.permission === 'admin'
  const isPending = req.status === '대기' && req.pending_stage !== null
  const canApproveAsForeman =
    me.permission === 'team_leader' && req.pending_stage === 'foreman' && req.assigned_foreman_id === me.id
  const canAct = isPending && (isAdmin || canApproveAsForeman)
  // foreman 단계인데 admin/ceo 가 승인 → "전결" 라벨로 보여줌
  const approveLabel = isAdmin && req.pending_stage === 'foreman' ? '전결' : '승인'

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-md space-y-5">
        <header>
          <Link href="/approvals" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
            <ChevronLeft className="h-4 w-4" />
            결재함
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            {nameById.get(req.employee_id) ?? '?'} · {LEAVE_TYPE_LABEL[req.type]}
            {req.is_urgent && (
              <span className="rounded bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5">
                긴급
              </span>
            )}
          </h1>
        </header>


        <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className={`rounded-full border px-3 py-1 text-sm font-medium ${STATUS_COLOR[req.status]}`}>
              {req.status}
              {req.pending_stage === 'foreman' && ' (팀장 결재 대기)'}
              {req.pending_stage === 'admin' && ' (관리자 결재 대기)'}
            </span>
          </div>

          <InfoRow label="기간">
            {formatPeriod(req.start_date, req.end_date, req.start_time, req.end_time)}
          </InfoRow>
          <InfoRow label="지정 결재자">
            {req.assigned_foreman_id ? nameById.get(req.assigned_foreman_id) ?? '?' : '없음 (관리자 직행)'}
          </InfoRow>
          <InfoRow label="대무자">
            {req.substitute_employee_id ? nameById.get(req.substitute_employee_id) ?? '?' : '미지정'}
          </InfoRow>
          <InfoRow label="사유">
            <span className="whitespace-pre-wrap">{req.reason}</span>
          </InfoRow>
          {attachmentLink && (
            <InfoRow label="증빙">
              <a
                href={attachmentLink.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-900 underline underline-offset-2 hover:text-slate-700"
              >
                {attachmentLink.filename}
              </a>
            </InfoRow>
          )}
          <InfoRow label="제출">{fmtDateTime(req.created_at)}</InfoRow>
        </section>

        <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
          <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wider">결재 이력</h2>
          <ul className="space-y-2">
            {approvals.map((a) => (
              <li key={a.id} className="flex items-start gap-3 text-sm">
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${ACTION_COLOR[a.action]}`}>
                  {a.action}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-slate-900">
                    {nameById.get(a.actor_employee_id) ?? '?'}
                    <span className="ml-2 text-xs text-slate-400">{fmtDateTime(a.acted_at)}</span>
                  </p>
                  {a.comment && <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-wrap">{a.comment}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>

        {canAct ? (
          <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
            <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wider">결재 처리</h2>
            <textarea
              form="approveForm"
              name="comment"
              rows={3}
              maxLength={500}
              placeholder="코멘트 (선택)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 resize-none"
            />
            <div className="grid grid-cols-2 gap-3">
              <form id="approveForm" action={approveRequest}>
                <input type="hidden" name="id" value={req.id} />
                <button
                  type="submit"
                  className={`w-full rounded-lg px-4 py-2.5 text-base font-medium text-white ${
                    approveLabel === '전결'
                      ? 'bg-indigo-700 hover:bg-indigo-800'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {approveLabel}
                </button>
              </form>
              <form action={rejectRequest}>
                <input type="hidden" name="id" value={req.id} />
                <button
                  type="submit"
                  className="w-full rounded-lg border border-red-300 px-4 py-2.5 text-base font-medium text-red-700 hover:bg-red-50"
                >
                  반려
                </button>
              </form>
            </div>
            {approveLabel === '전결' && (
              <p className="text-xs text-slate-500">
                현재 팀장 결재 대기 중인 건입니다. 승인 시 팀장 단계를 건너뛰고 <span className="font-medium">전결</span> 로 기록됩니다.
              </p>
            )}
          </section>
        ) : (
          <p className="text-center text-xs text-slate-400">
            이 신청은 이미 처리되었거나 본인이 결재할 수 있는 단계가 아닙니다.
          </p>
        )}
      </div>
    </main>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="shrink-0 w-20 text-slate-500">{label}</span>
      <span className="min-w-0 text-slate-900">{children}</span>
    </div>
  )
}
