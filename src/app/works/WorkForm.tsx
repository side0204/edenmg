'use client'

import { useState } from 'react'
import {
  SUBCATEGORY_BY_CATEGORY,
  WORK_CATEGORY_VALUES,
  WORK_STATUS_VALUES,
  type WorkCategory,
  type WorkStatus,
  type WorkSubcategory,
} from '@/lib/work'

export type WorkFormValues = {
  id: string | null
  name: string
  client: string | null
  address: string | null
  category: WorkCategory
  subcategory: WorkSubcategory | null
  expected_volume: string | null
  start_date: string | null
  end_date: string | null
  status: WorkStatus
  notes: string | null
}

export function WorkForm({
  initial,
  action,
  submitLabel,
}: {
  initial: WorkFormValues
  action: (formData: FormData) => void
  submitLabel: string
}) {
  const [category, setCategory] = useState<WorkCategory>(initial.category)
  const [subcategory, setSubcategory] = useState<WorkSubcategory | ''>(initial.subcategory ?? '')

  // 대분류 바뀌면 소분류 reset (기타는 빈 값으로)
  const handleCategory = (next: WorkCategory) => {
    setCategory(next)
    if (next === '기타') setSubcategory('')
    else if (!SUBCATEGORY_BY_CATEGORY[next].includes(subcategory as WorkSubcategory)) {
      setSubcategory('')
    }
  }

  const allowedSubs = SUBCATEGORY_BY_CATEGORY[category]

  return (
    <form
      action={action}
      className="space-y-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200"
    >
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <Field label="작업명 *">
        <input
          name="name"
          required
          defaultValue={initial.name}
          maxLength={100}
          placeholder="예: 강남 OO아파트 FTTH"
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="대분류 *">
          <select
            name="category"
            value={category}
            onChange={(e) => handleCategory(e.currentTarget.value as WorkCategory)}
            className={inputClass}
          >
            {WORK_CATEGORY_VALUES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label={category === '기타' ? '소분류 (없음)' : '소분류 *'}>
          <select
            name="subcategory"
            value={subcategory}
            onChange={(e) => setSubcategory(e.currentTarget.value as WorkSubcategory | '')}
            disabled={category === '기타'}
            className={`${inputClass} disabled:bg-slate-100 disabled:text-slate-400`}
          >
            <option value="">{category === '기타' ? '없음' : '선택'}</option>
            {allowedSubs.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="발주처 (선택)">
        <input
          name="client"
          defaultValue={initial.client ?? ''}
          maxLength={50}
          placeholder="예: KT, SKB"
          className={inputClass}
        />
      </Field>

      <Field label="주소 (선택)">
        <input
          name="address"
          defaultValue={initial.address ?? ''}
          maxLength={200}
          placeholder="예: 서울 강남구 …"
          className={inputClass}
        />
      </Field>

      <Field label="예상물량 (선택)">
        <input
          name="expected_volume"
          defaultValue={initial.expected_volume ?? ''}
          maxLength={100}
          placeholder="예: 100세대, 광케이블 500m"
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="시작일 (선택)">
          <input
            name="start_date"
            type="date"
            defaultValue={initial.start_date ?? ''}
            className={inputClass}
          />
        </Field>
        <Field label="종료일 (선택)">
          <input
            name="end_date"
            type="date"
            defaultValue={initial.end_date ?? ''}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="상태 *">
        <select name="status" defaultValue={initial.status} className={inputClass}>
          {WORK_STATUS_VALUES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      <Field label="비고 (선택)">
        <textarea
          name="notes"
          rows={3}
          maxLength={500}
          defaultValue={initial.notes ?? ''}
          placeholder="특이사항·메모"
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
