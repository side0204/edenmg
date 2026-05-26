'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { X, Loader2, Send } from 'lucide-react'
import {
  createScheduleChangeRequest,
  approveScheduleChangeRequest,
  rejectScheduleChangeRequest,
} from '../schedule-actions'
import type { CalendarWork } from './WorkScheduleCalendar'

// 일정 변경 요청 모달 (owner 2026-05-26).
//   - 작업자(본인 배정) → 변경 사유 + 새 일자 입력 → 요청.
//   - 작업 담당자(assignee) 면 기존 pending 요청을 승인/반려 가능.

export default function ScheduleChangeRequestModal({
  work,
  myName,
  onClose,
  onRequested,
}: {
  work: CalendarWork
  myName: string
  onClose: () => void
  onRequested: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [start, setStart] = useState<string>(work.start_date ?? '')
  const [end, setEnd] = useState<string>(work.end_date ?? work.start_date ?? '')
  const [reason, setReason] = useState('')
  const [responseNote, setResponseNote] = useState('')

  async function onSubmit() {
    if (busy) return
    if (!reason.trim()) {
      toast.error('변경 사유를 입력하세요')
      return
    }
    if (!start && !end) {
      toast.error('변경 희망 일자를 하나 이상 입력하세요')
      return
    }
    setBusy(true)
    const result = await createScheduleChangeRequest({
      work_id: work.id,
      requested_start: start || null,
      requested_end: end || start || null,
      reason: reason.trim(),
    })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success('일정 변경을 요청했습니다 — 작업 담당자에게 알림이 전달됩니다')
    setReason('')
    onRequested()
  }

  async function onApprove(reqId: string) {
    if (busy) return
    if (!confirm('이 요청을 승인하시겠습니까? 승인 시 작업 일정도 갱신됩니다.')) return
    setBusy(true)
    const result = await approveScheduleChangeRequest({
      request_id: reqId,
      note: responseNote.trim() || null,
    })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success('요청을 승인했습니다')
    setResponseNote('')
    onRequested()
  }

  async function onReject(reqId: string) {
    if (busy) return
    if (!confirm('이 요청을 반려하시겠습니까?')) return
    setBusy(true)
    const result = await rejectScheduleChangeRequest({
      request_id: reqId,
      note: responseNote.trim() || null,
    })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success('요청을 반려했습니다')
    setResponseNote('')
    onRequested()
  }

  const pendingReqs = work.requests.filter((r) => r.status === 'pending')
  const historyReqs = work.requests.filter((r) => r.status !== 'pending')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="min-w-0">
            <p className="text-base font-extrabold text-slate-900">일정 변경 요청</p>
            <p className="text-xs text-slate-600 truncate">{work.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="shrink-0 text-slate-500 hover:text-slate-900"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-3 text-sm">
          {/* 현재 일정 */}
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
            <p>
              <span className="font-bold text-slate-700">현재 일정:</span>{' '}
              {work.start_date ?? '미정'}
              {work.end_date && work.end_date !== work.start_date ? ` ~ ${work.end_date}` : ''}
            </p>
            <p>
              <span className="font-bold text-slate-700">담당자:</span>{' '}
              {work.assignee_name ?? '미지정'}
            </p>
            {work.worker_names.length > 0 && (
              <p>
                <span className="font-bold text-slate-700">작업자:</span>{' '}
                {work.worker_names.join(', ')}
              </p>
            )}
          </div>

          {/* 요청 폼 */}
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-bold text-slate-700">
              새 일정 요청 (요청자: {myName})
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[11px] font-medium text-slate-600">시작일</span>
                <input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  disabled={busy}
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-slate-600">종료일 (단일이면 비움)</span>
                <input
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  disabled={busy}
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
            </div>
            <label className="block">
              <span className="text-[11px] font-medium text-slate-600">
                변경 사유 <span className="text-rose-600">*</span>
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="예: 자재 입고 지연으로 3일 연기 요청"
                disabled={busy}
                className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-sm resize-none"
              />
            </label>
            <button
              type="button"
              onClick={onSubmit}
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-1 rounded bg-emerald-600 hover:bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:bg-slate-300"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              요청 보내기
            </button>
            <p className="text-[10px] text-slate-500">
              담당자가 「작업 캘린더」 페이지의 알림 배지로 확인하고 승인/반려합니다.
            </p>
          </div>

          {/* 대기 중인 요청 */}
          {pendingReqs.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-700">대기 중인 요청 ({pendingReqs.length})</p>
              {pendingReqs.map((r) => (
                <div
                  key={r.id}
                  className="rounded-lg border-2 border-amber-300 bg-amber-50 p-2 space-y-1"
                >
                  <p className="text-xs">
                    <span className="font-bold text-amber-900">{r.requested_by_name}</span>
                    {' → '}
                    <span className="font-mono">
                      {r.requested_start ?? '?'}
                      {r.requested_end && r.requested_end !== r.requested_start
                        ? ` ~ ${r.requested_end}`
                        : ''}
                    </span>
                  </p>
                  <p className="text-[11px] text-slate-700 whitespace-pre-wrap">{r.reason}</p>
                  <p className="text-[10px] text-slate-500">
                    {new Date(r.created_at).toLocaleString('ko-KR')}
                  </p>
                  <div className="flex items-center gap-1 pt-1">
                    <input
                      type="text"
                      placeholder="처리 의견 (선택)"
                      value={responseNote}
                      onChange={(e) => setResponseNote(e.target.value)}
                      disabled={busy}
                      className="flex-1 rounded border border-amber-300 px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => onApprove(r.id)}
                      disabled={busy}
                      className="rounded bg-emerald-600 hover:bg-emerald-700 px-2 py-1 text-xs font-bold text-white disabled:bg-slate-300"
                    >
                      승인
                    </button>
                    <button
                      type="button"
                      onClick={() => onReject(r.id)}
                      disabled={busy}
                      className="rounded bg-rose-600 hover:bg-rose-700 px-2 py-1 text-xs font-bold text-white disabled:bg-slate-300"
                    >
                      반려
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 처리 이력 */}
          {historyReqs.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs font-bold text-slate-700">
                처리 이력 ({historyReqs.length})
              </summary>
              <div className="mt-1 space-y-1">
                {historyReqs.map((r) => (
                  <div
                    key={r.id}
                    className="rounded border border-slate-200 bg-slate-50 p-2 text-xs"
                  >
                    <p>
                      <span className="font-bold">{r.requested_by_name}</span>
                      {' → '}
                      <span className="font-mono">
                        {r.requested_start ?? '?'}
                        {r.requested_end && r.requested_end !== r.requested_start
                          ? ` ~ ${r.requested_end}`
                          : ''}
                      </span>
                      <span
                        className={
                          'ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold ' +
                          (r.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800')
                        }
                      >
                        {r.status === 'approved' ? '승인' : '반려'}
                      </span>
                    </p>
                    <p className="text-[10px] text-slate-600 whitespace-pre-wrap">{r.reason}</p>
                    {r.responded_by_name && (
                      <p className="text-[10px] text-slate-500">
                        {r.responded_at && new Date(r.responded_at).toLocaleString('ko-KR')} ·{' '}
                        {r.responded_by_name}
                        {r.response_note ? ` — ${r.response_note}` : ''}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}
