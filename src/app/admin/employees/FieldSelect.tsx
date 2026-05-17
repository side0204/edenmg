'use client'

import { updateEmployeeField } from './actions'
import { labelFor, type EditableField } from './fields'

// employees 한 행의 한 필드를 인라인으로 변경하는 셀렉터.
// 선택 즉시 Server Action 으로 폼 제출 → revalidatePath → 페이지 갱신.
export function FieldSelect({
  id,
  field,
  current,
  options,
  allowEmpty = false,
  placeholder = '미지정',
  size = 'sm',
}: {
  id: string
  field: EditableField
  current: string | null
  options: readonly string[]
  allowEmpty?: boolean
  placeholder?: string
  size?: 'sm' | 'xs'
}) {
  const sizeClass =
    size === 'xs'
      ? 'px-1.5 py-0.5 text-[11px]'
      : 'px-2 py-1 text-xs'

  return (
    <form action={updateEmployeeField} className="inline-block">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="field" value={field} />
      <select
        name="value"
        defaultValue={current ?? ''}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={`rounded-md border border-slate-300 bg-white font-medium text-slate-700 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 ${sizeClass}`}
      >
        {allowEmpty && <option value="">{placeholder}</option>}
        {options.map((v) => (
          <option key={v} value={v}>
            {labelFor(field, v)}
          </option>
        ))}
      </select>
    </form>
  )
}
