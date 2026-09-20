'use client'

import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { VEHICLE_LOG_KINDS, todayKST, type VehicleLogKind } from '@/lib/trips'
import { addVehicleLog } from '../../../actions'

const INPUT =
  'w-full rounded-xl bg-slate-50 px-3.5 py-3 text-base text-slate-900 shadow-[inset_0_0_0_1px_#e2e8f0] placeholder:text-slate-400 focus:outline-none focus:shadow-[inset_0_0_0_1.5px_#0f172a] dark:bg-slate-800 dark:text-slate-100'
const LABEL = 'block text-[13px] font-semibold tracking-tight text-slate-700 dark:text-slate-300'

/** 차계부 「기록 추가」 — 풀스크린 모달 (항상 mount + hidden 토글, 모바일 안전 패턴) */
export function LogEntryForm({
  targetKind,
  targetId,
  defaultOdometer,
}: {
  targetKind: 'vehicle' | 'personal'
  targetId: string
  defaultOdometer: number | null
}) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<VehicleLogKind>('정비')

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const showDue = kind === '정비' || kind === '검사' || kind === '보험'
  const vendorLabel = kind === '보험' ? '보험사' : kind === '정비' ? '정비소' : kind === '검사' ? '검사소' : '업체·비고'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-[10px] bg-slate-900 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-slate-800"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
        기록 추가
      </button>

      <div className={'fixed inset-0 z-50 flex flex-col bg-black/40 ' + (open ? '' : 'hidden pointer-events-none')}>
        <button type="button" className="flex-1" onClick={() => setOpen(false)} aria-label="닫기" />
        <form action={addVehicleLog} className="flex max-h-[90vh] flex-col rounded-t-2xl bg-white shadow-xl dark:bg-slate-900">
          <input type="hidden" name="target_kind" value={targetKind} />
          <input type="hidden" name="target_id" value={targetId} />
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">차계부 기록 추가</p>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full p-1 text-slate-400 hover:text-slate-900" aria-label="닫기">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="space-y-4 overflow-y-auto px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="space-y-1.5">
              <span className={LABEL}>종류</span>
              <input type="hidden" name="kind" value={kind} />
              <div className="flex flex-wrap gap-1.5">
                {VEHICLE_LOG_KINDS.map((k) => {
                  const on = k === kind
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKind(k)}
                      className={
                        'rounded-full px-3 py-1.5 text-[13px] font-medium ' +
                        (on ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 shadow-[0_0_0_1px_rgba(15,23,42,0.1)] hover:bg-slate-50')
                      }
                    >
                      {k}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className={LABEL}>일자</span>
                <input name="occurred_on" type="date" required defaultValue={todayKST()} className={INPUT} />
              </label>
              <label className="block space-y-1.5">
                <span className={LABEL}>금액 (원)</span>
                <input name="amount_krw" type="number" min={0} step={100} inputMode="numeric" placeholder="0" className={INPUT} />
              </label>
            </div>

            <label className="block space-y-1.5">
              <span className={LABEL}>내용</span>
              <input
                name="title"
                required
                maxLength={100}
                placeholder={kind === '정비' ? '예: 엔진오일 교환' : kind === '보험' ? '예: 자동차보험 갱신' : kind === '검사' ? '예: 정기검사' : '예: 고속도로 통행료'}
                className={INPUT}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className={LABEL}>당시 km</span>
                <input
                  name="odometer_km"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  placeholder={defaultOdometer !== null ? defaultOdometer.toLocaleString() : '계기판 km'}
                  className={INPUT}
                />
              </label>
              <label className="block space-y-1.5">
                <span className={LABEL}>{vendorLabel}</span>
                <input name="vendor" maxLength={100} className={INPUT} />
              </label>
            </div>

            {showDue && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1.5">
                  <span className={LABEL}>다음 예정 km</span>
                  <input name="next_due_km" type="number" min={0} step={1} inputMode="numeric" placeholder="예: 49800" className={INPUT} />
                </label>
                <label className="block space-y-1.5">
                  <span className={LABEL}>다음 예정일</span>
                  <input name="next_due_on" type="date" className={INPUT} />
                </label>
              </div>
            )}

            <label className="block space-y-1.5">
              <span className={LABEL}>메모</span>
              <textarea name="memo" rows={2} maxLength={500} className={INPUT + ' resize-none'} />
            </label>

            <button type="submit" className="w-full rounded-[14px] bg-slate-900 px-4 py-[15px] text-base font-bold text-white hover:bg-slate-800">
              저장
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
