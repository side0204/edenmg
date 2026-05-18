'use client'

import { CABLE_SPEC_VALUES, type CableSpec } from '@/lib/connection'
import type { FacilityType } from './actions'

export type FacilityFormValues = {
  id: string | null
  facility_type: FacilityType
  name: string
  code: string
  spec_enum: CableSpec | ''
  address: string
  lat: string
  lng: string
  notes: string
}

export function FacilityForm({
  initial,
  action,
  submitLabel,
  typeLocked,
}: {
  initial: FacilityFormValues
  action: (formData: FormData) => void
  submitLabel: string
  typeLocked?: boolean // 편집 모드에서는 타입 변경 못 함
}) {
  const isBox = initial.facility_type === 'box'

  return (
    <form
      action={action}
      className="space-y-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200"
    >
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <Field label="종류 *">
        {typeLocked ? (
          <>
            <input type="hidden" name="facility_type" value={initial.facility_type} />
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
              {isBox ? '함체' : '국사'} (변경 불가)
            </p>
          </>
        ) : (
          <select
            name="facility_type"
            defaultValue={initial.facility_type}
            className={inputClass}
          >
            <option value="station">국사</option>
            <option value="box">함체</option>
          </select>
        )}
      </Field>

      <Field label="이름 *">
        <input
          name="name"
          required
          defaultValue={initial.name}
          maxLength={100}
          placeholder={isBox ? '예: 강남A 1F 함체' : '예: 강남국사'}
          className={inputClass}
        />
      </Field>

      <Field label="ID (선택)">
        <input
          name="code"
          defaultValue={initial.code}
          maxLength={100}
          placeholder="고유 식별자가 있으면 입력"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-slate-500">같은 회사 안에서 같은 종류 내 unique</p>
      </Field>

      {isBox && (
        <Field label="규격 (선택)">
          <select name="spec_enum" defaultValue={initial.spec_enum} className={inputClass}>
            <option value="">선택 안 함</option>
            {CABLE_SPEC_VALUES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="주소 (선택)">
        <input
          name="address"
          defaultValue={initial.address}
          maxLength={200}
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="위도 (선택)">
          <input
            name="lat"
            type="number"
            step="0.0000001"
            min="-90"
            max="90"
            defaultValue={initial.lat}
            placeholder="37.5"
            className={inputClass}
          />
        </Field>
        <Field label="경도 (선택)">
          <input
            name="lng"
            type="number"
            step="0.0000001"
            min="-180"
            max="180"
            defaultValue={initial.lng}
            placeholder="127.0"
            className={inputClass}
          />
        </Field>
      </div>

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
