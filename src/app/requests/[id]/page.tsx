import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  ATTACHMENT_ALLOWED_TYPES,
  LEAVE_TYPE_LABEL,
  STATUS_COLOR,
  formatPeriod,
  type LeaveAction,
  type LeaveStage,
  type LeaveStatus,
  type LeaveType,
} from '@/lib/leave'
import {
  cancelRequest,
  getAttachmentUrl,
  removeAttachment,
  replaceAttachment,
} from '../actions'

type RequestRow = {
  id: string
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
  final_actor_id: string | null
  final_acted_at: string | null
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

export default async function RequestDetailPage({
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
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string } | null
  if (!me) redirect('/')

  const { data: reqRow } = await supabase
    .from('leave_requests')
    .select('id, employee_id, type, start_date, end_date, start_time, end_time, reason, is_urgent, status, pending_stage, assigned_foreman_id, substitute_employee_id, final_actor_id, final_acted_at, attachment_path, attachment_filename, created_at')
    .eq('id', id)
    .maybeSingle()
  const req = reqRow as RequestRow | null
  if (!req) notFound()

  const { data: approvalsData } = await supabase
    .from('leave_request_approvals')
    .select('id, actor_employee_id, action, comment, acted_at')
    .eq('leave_request_id', id)
    .order('acted_at', { ascending: true })
  const approvals = (approvalsData ?? []) as ApprovalRow[]

  // 등장한 사람들 이름 한 번에 조회
  const personIds = Array.from(
    new Set([req.employee_id, req.assigned_foreman_id, req.substitute_employee_id, req.final_actor_id, ...approvals.map((a) => a.actor_employee_id)].filter((v): v is string => !!v)),
  )
  const nameById = new Map<string, string>()
  if (personIds.length > 0) {
    const { data: people } = await supabase.from('employees').select('id, name').in('id', personIds)
    for (const p of (people ?? []) as { id: string; name: string }[]) {
      nameById.set(p.id, p.name)
    }
  }

  const isMine = req.employee_id === me.id
  const canCancel = isMine && req.status === '대기'
  const attachmentAllowed = ATTACHMENT_ALLOWED_TYPES.includes(req.type)
  const canEditAttachment = isMine && req.status === '대기' && attachmentAllowed
  const attachmentLink = req.attachment_path ? await getAttachmentUrl(req.id) : null

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-md space-y-5">
        <header>
          <Link href="/requests" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
            <ChevronLeft className="h-4 w-4" />
            내 신청
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            {LEAVE_TYPE_LABEL[req.type]}
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
              {req.pending_stage === 'foreman' && ' (소장 결재 대기)'}
              {req.pending_stage === 'admin' && ' (관리자 결재 대기)'}
            </span>
          </div>

          <InfoRow label="신청자">{nameById.get(req.employee_id) ?? '?'}</InfoRow>
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

        {(attachmentAllowed || req.attachment_path) && (
          <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
            <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wider">
              증빙 첨부
            </h2>
            {attachmentLink ? (
              <a
                href={attachmentLink.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 hover:border-slate-900 px-4 py-3 text-sm font-medium text-slate-900"
              >
                <span className="truncate">{attachmentLink.filename}</span>
                <span className="shrink-0 text-xs text-slate-500">다운로드</span>
              </a>
            ) : (
              <p className="text-sm text-slate-500">첨부된 파일이 없습니다.</p>
            )}

            {canEditAttachment && (
              <>
                <form action={replaceAttachment} className="space-y-2 border-t border-slate-100 pt-3">
                  <input type="hidden" name="id" value={req.id} />
                  <input
                    name="attachment"
                    type="file"
                    required
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
                    className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-50"
                  />
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    {req.attachment_path ? '새 파일로 교체' : '파일 업로드'}
                  </button>
                </form>
                {req.attachment_path && (
                  <form action={removeAttachment}>
                    <input type="hidden" name="id" value={req.id} />
                    <button
                      type="submit"
                      className="w-full rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                    >
                      첨부 삭제
                    </button>
                  </form>
                )}
                <p className="text-xs text-slate-400">이미지·PDF, 10MB 이하. 대기 중에만 바꿀 수 있습니다.</p>
              </>
            )}
          </section>
        )}

        {canCancel && (
          <form action={cancelRequest}>
            <input type="hidden" name="id" value={req.id} />
            <button
              type="submit"
              className="w-full rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              신청 취소
            </button>
          </form>
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
