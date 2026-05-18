'use client'

import { REPORT_PROGRESS_VALUES, type WorkReportProgress } from '@/lib/work'

export type ReportFormValues = {
  id: string | null
  work_id: string
  report_date: string
  content: string
  materials_used: string
  progress: WorkReportProgress
  notes: string
}

export function ReportForm({
  initial,
  action,
  submitLabel,
  dateLocked = false,
}: {
  initial: ReportFormValues
  action: (formData: FormData) => void
  submitLabel: string
  dateLocked?: boolean
}) {
  return (
    <form
      action={action}
      className="space-y-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200"
    >
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="work_id" value={initial.work_id} />
      {dateLocked && <input type="hidden" name="report_date" value={initial.report_date} />}

      {!dateLocked && (
        <Field label="일자 *">
          <input
            type="date"
            name="report_date"
            defaultValue={initial.report_date}
            required
            className={inputClass}
          />
        </Field>
      )}

      <Field label="작업내역 *">
        <textarea
          name="content"
          rows={5}
          required
          maxLength={2000}
          defaultValue={initial.content}
          placeholder="오늘 수행한 작업 내용을 적어주세요"
          className={`${inputClass} resize-none`}
        />
      </Field>

      <Field label="진행률 *">
        <select
          name="progress"
          defaultValue={initial.progress}
          className={inputClass}
        >
          {REPORT_PROGRESS_VALUES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>

      <Field label="사용 자재 (선택)">
        <textarea
          name="materials_used"
          rows={3}
          maxLength={1000}
          defaultValue={initial.materials_used}
          placeholder="예: 광케이블 100m, 광커넥터 6EA"
          className={`${inputClass} resize-none`}
        />
      </Field>

      <Field label="특이사항 (선택)">
        <textarea
          name="notes"
          rows={3}
          maxLength={1000}
          defaultValue={initial.notes}
          placeholder="이슈·메모"
          className={`${inputClass} resize-none`}
        />
      </Field>

      <button
        type="submit"
        className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-base font-medium text-white hover:bg-slate-800 active:bg-slate-700"
      >
        {submitLabel}
      </button>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900'
