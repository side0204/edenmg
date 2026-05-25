'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Check, X, Loader2 } from 'lucide-react'
import { confirmWorkAssignment, cancelWorkAssignment } from './actions'

// 청약 프로젝트 상세 페이지 — 배정 작업자 현황.
//   - 「확정」: 대기 상태(confirmed_at=null) 의 배정을 확정. 그 시점에 작업자에게 작업이 보임.
//   - 「취소」: 배정 삭제 (work_assignments + relocation_projects.{outside|splice}_worker_ids).
//   - 폼 picker 와 별개 컴포넌트 — 폼 저장과 무관하게 즉시 반영.

export type AssignmentEntry = {
  employeeId: string
  employeeName: string
  workerType: '외선팀' | '접속팀' | null
  confirmedAt: string | null
}

export default function WorkAssignmentStatus({
  projectId,
  assignments,
}: {
  projectId: string
  assignments: AssignmentEntry[]
}) {
  const [pending, startTransition] = useTransition()

  if (assignments.length === 0) {
    return (
      <p className="text-xs text-slate-500 lg:text-[11px]">
        아직 배정된 작업자가 없습니다. 아래 「작업자배정」 에서 추가 후 저장하면 여기 표시됩니다.
      </p>
    )
  }

  const onConfirm = (employeeId: string, name: string) => {
    const fd = new FormData()
    fd.append('project_id', projectId)
    fd.append('employee_id', employeeId)
    startTransition(async () => {
      const r = await confirmWorkAssignment(fd)
      if (r.ok) toast.success(`${name} — 배정 확정`)
      else toast.error(r.error)
    })
  }
  const onCancel = (employeeId: string, name: string) => {
    if (!confirm(`${name} 의 배정을 취소하시겠습니까?\n해당 작업자에게 작업이 더 이상 보이지 않습니다.`))
      return
    const fd = new FormData()
    fd.append('project_id', projectId)
    fd.append('employee_id', employeeId)
    startTransition(async () => {
      const r = await cancelWorkAssignment(fd)
      if (r.ok) toast.success(`${name} — 배정 취소`)
      else toast.error(r.error)
    })
  }

  return (
    <ul className="flex flex-wrap gap-1.5">
      {assignments.map((a) => {
        const isConfirmed = !!a.confirmedAt
        const tone =
          a.workerType === '접속팀'
            ? 'border-blue-200 bg-blue-50'
            : a.workerType === '외선팀'
              ? 'border-orange-200 bg-orange-50'
              : 'border-slate-200 bg-slate-50'
        return (
          <li
            key={a.employeeId}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs ${tone}`}
          >
            <span className="font-medium text-slate-900">{a.employeeName}</span>
            <span
              className={
                'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ' +
                (isConfirmed
                  ? 'bg-emerald-600 text-white'
                  : 'bg-amber-500 text-white')
              }
            >
              {isConfirmed ? '확정' : '대기'}
            </span>
            {!isConfirmed && (
              <button
                type="button"
                disabled={pending}
                onClick={() => onConfirm(a.employeeId, a.employeeName)}
                className="inline-flex items-center gap-0.5 rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {pending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3" />
                )}
                확정
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => onCancel(a.employeeId, a.employeeName)}
              className="inline-flex items-center gap-0.5 rounded-md border border-rose-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
            >
              <X className="h-3 w-3" />
              취소
            </button>
          </li>
        )
      })}
    </ul>
  )
}
