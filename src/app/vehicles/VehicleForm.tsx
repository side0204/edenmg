import type { ReactNode } from 'react'

export type VehicleFormValues = {
  id: string | null
  plate_number: string
  name: string
  is_active: boolean
  notes: string | null
}

export function VehicleForm({
  defaults,
  action,
  submitLabel,
}: {
  defaults: VehicleFormValues
  action: (formData: FormData) => void
  submitLabel: string
}) {
  return (
    <form
      action={action}
      className="space-y-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200"
    >
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}

      <Field label="차량번호 *">
        <input
          name="plate_number"
          required
          maxLength={20}
          defaultValue={defaults.plate_number}
          placeholder="예: 12가 3456"
          className={inputClass}
        />
      </Field>

      <Field label="차명 *">
        <input
          name="name"
          required
          maxLength={50}
          defaultValue={defaults.name}
          placeholder="예: 포터2"
          className={inputClass}
        />
      </Field>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={defaults.is_active}
          className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
        />
        <span className="text-sm text-slate-700">활성 (비활성 시 출고 화면에 안 보임)</span>
      </label>

      <Field label="비고">
        <textarea
          name="notes"
          rows={3}
          maxLength={500}
          defaultValue={defaults.notes ?? ''}
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900'
