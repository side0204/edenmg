'use client'

export type MaterialFormValues = {
  id: string | null
  name: string
  spec: string
  unit: string
}

export function MaterialForm({
  initial,
  action,
  submitLabel,
}: {
  initial: MaterialFormValues
  action: (formData: FormData) => void
  submitLabel: string
}) {
  return (
    <form
      action={action}
      className="space-y-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200"
    >
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <Field label="자재명 *">
        <input
          name="name"
          required
          defaultValue={initial.name}
          maxLength={100}
          placeholder="예: 광커넥터 SC/APC"
          className={inputClass}
        />
      </Field>

      <Field label="규격 (선택)">
        <input
          name="spec"
          defaultValue={initial.spec}
          maxLength={100}
          placeholder="예: 4코어, KT-12C, SM-9/125"
          className={inputClass}
        />
      </Field>

      <Field label="단위 (선택)">
        <input
          name="unit"
          defaultValue={initial.unit}
          maxLength={20}
          placeholder="예: EA, m, 식"
          className={inputClass}
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
