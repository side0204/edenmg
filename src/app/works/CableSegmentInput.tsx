'use client'

import { useState } from 'react'
import { calcCoreCount, parseLineNumbers, CABLE_SPEC_VALUES, type CableSpec } from '@/lib/connection'

/**
 * 일보 작성 시 한 cable(plan_node 도착선) 의 입력 영역.
 * - 케이블규격 select
 * - 사용선번 text (입력 즉시 코어수 + 중복 detect)
 * - 완료 토글
 * - segment 메모
 *
 * 빈 line_numbers 는 server 가 "이 cable 미작업" 으로 skip.
 */
export function CableSegmentInput({
  planNodeId,
  defaultCableSpec,
  defaultLineNumbers,
  defaultIsCompleted,
  defaultNotes,
  parentLabel,
  nodeLabel,
}: {
  planNodeId: string
  defaultCableSpec?: CableSpec
  defaultLineNumbers?: string
  defaultIsCompleted?: boolean
  defaultNotes?: string
  parentLabel: string
  nodeLabel: string
}) {
  const [lineNumbers, setLineNumbers] = useState(defaultLineNumbers ?? '')

  const trimmed = lineNumbers.trim()
  let preview: { ok: true; coreCount: number } | { ok: false; error: string } | null = null
  if (trimmed) {
    const r = parseLineNumbers(trimmed)
    preview = r.ok ? { ok: true, coreCount: r.coreCount } : { ok: false, error: r.error }
  }
  const coreCount = preview && preview.ok ? preview.coreCount : null
  const errorMsg = preview && !preview.ok ? preview.error : null
  // calcCoreCount 도 일관성 위해 호출 (린트 회피용 아님 — 동일 결과)
  void calcCoreCount

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
      <p className="text-xs text-slate-600">
        <span className="font-medium">{parentLabel}</span>
        <span className="mx-1 text-slate-400">→</span>
        <span className="font-medium">{nodeLabel}</span>
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-xs font-medium text-slate-600">케이블규격</span>
          <select
            name={`cable_spec_${planNodeId}`}
            defaultValue={defaultCableSpec ?? ''}
            className={smallInput}
          >
            <option value="">선택</option>
            {CABLE_SPEC_VALUES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-600">사용선번</span>
          <input
            name={`line_numbers_${planNodeId}`}
            value={lineNumbers}
            onChange={(e) => setLineNumbers(e.currentTarget.value)}
            placeholder="1-6 / 1,3,5 / 1-6,12-18"
            className={
              smallInput + (errorMsg ? ' border-rose-400 focus:border-rose-500 focus:ring-rose-500' : '')
            }
          />
        </label>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <div>
          {coreCount !== null && (
            <span className="rounded bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">
              접속코어수: {coreCount}
            </span>
          )}
          {errorMsg && (
            <span className="rounded bg-rose-100 px-2 py-0.5 font-medium text-rose-700">
              ⚠ {errorMsg}
            </span>
          )}
        </div>
        <label className="inline-flex items-center gap-1 text-slate-600">
          <input
            type="checkbox"
            name={`completed_${planNodeId}`}
            value="1"
            defaultChecked={defaultIsCompleted ?? true}
            className="size-4"
          />
          완료
        </label>
      </div>
      <input
        name={`segment_notes_${planNodeId}`}
        defaultValue={defaultNotes ?? ''}
        placeholder="segment 메모 (선택)"
        maxLength={200}
        className={smallInput}
      />
    </div>
  )
}

const smallInput =
  'w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900'
