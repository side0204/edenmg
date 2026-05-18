'use client'

import { CABLE_SPEC_VALUES, type CableSpec } from '@/lib/connection'

export type CableFormValues = {
  id: string | null
  code: string
  spec_enum: CableSpec | ''
  notes: string
}

export function CableForm({
  initial,
  action,
  submitLabel,
}: {
  initial: CableFormValues
  action: (formData: FormData) => void
  submitLabel: string
}) {
  return (
    <form
      action={action}
      className="space-y-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200"
    >
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <Field label="케이블ID *">
        <input
          name="code"
          required
          defaultValue={initial.code}
          maxLength={100}
          placeholder="예: KT-12C-001"
          className={inputClass}
        />
      </Field>

      <Field label="케이블 규격 (선택)">
        <select name="spec_enum" defaultValue={initial.spec_enum} className={inputClass}>
          <option value="">선택 안 함</option>
          {CABLE_SPEC_VALUES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">
          규격을 지정하면 일보 작성 시 이 케이블ID 선택만으로 자동으로 규격이 채워집니다.
        </p>
      </Field>

      <Field label="메모 (선택)">
        <textarea
          name="notes"
          rows={2}
          maxLength={500}
          defaultValue={initial.notes}
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
