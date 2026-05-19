'use client'

import { useRef } from 'react'
import { updateWorkplaceType } from './actions'

export default function WorkplaceToggle({
  id,
  current,
}: {
  id: string
  current: '본사' | '현장' | string
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const isField = current === '현장'

  return (
    <form ref={formRef} action={updateWorkplaceType}>
      <input type="hidden" name="id" value={id} />
      <select
        name="workplace_type"
        defaultValue={current === '현장' ? '현장' : '본사'}
        onChange={() => formRef.current?.requestSubmit()}
        className={
          'rounded-full border px-2 py-0.5 text-xs font-medium ' +
          (isField
            ? 'border-amber-300 bg-amber-50 text-amber-700'
            : 'border-blue-300 bg-blue-50 text-blue-700')
        }
      >
        <option value="본사">본사</option>
        <option value="현장">현장</option>
      </select>
    </form>
  )
}
