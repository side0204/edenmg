'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'

// 작업번호 다중 입력. 청약 프로젝트 폼 안에서 사용.
//   - 추가/삭제 가능, 빈 칸 제거 후 JSON array string 으로 hidden input 에 직렬화
//   - 서버는 `order_no_list` 키로 받음 (actions.ts parseProjectForm)
//   - 최대 50개, 각 100자
export default function OrderNoList({
  initial,
  inputClassName,
}: {
  initial?: string[]
  inputClassName?: string
}) {
  const seed = (initial ?? []).filter((v) => v && v.length > 0)
  const [values, setValues] = useState<string[]>(seed.length > 0 ? seed : [''])

  const hidden = JSON.stringify(values.map((v) => v.trim()).filter((v) => v.length > 0))
  const cls =
    inputClassName ??
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-base lg:text-xs lg:px-2.5 lg:py-1.5 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900'

  return (
    <div className="space-y-1.5 lg:space-y-1">
      <input type="hidden" name="order_no_list" value={hidden} />
      {values.map((v, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            type="text"
            value={v}
            maxLength={100}
            placeholder={i === 0 ? '예: A-2026-001' : '추가 작업번호'}
            onChange={(e) => {
              const next = [...values]
              next[i] = e.target.value
              setValues(next)
            }}
            className={cls}
          />
          {values.length > 1 && (
            <button
              type="button"
              onClick={() => setValues(values.filter((_, j) => j !== i))}
              className="shrink-0 inline-flex items-center justify-center rounded-md border border-slate-300 h-9 w-9 lg:h-7 lg:w-7 text-slate-500 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300"
              aria-label="삭제"
            >
              <X className="h-4 w-4 lg:h-3 lg:w-3" />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => setValues([...values, ''])}
        disabled={values.length >= 50}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 px-2 py-1 text-xs lg:text-[10px] text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        <Plus className="h-3 w-3" />
        작업번호 추가
      </button>
    </div>
  )
}
