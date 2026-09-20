'use client'

import { useState } from 'react'
import type { TransportKind } from '@/lib/trips'
import { endTrip } from '../../actions'

const INPUT =
  'w-full rounded-xl bg-slate-50 px-3.5 py-3 text-base text-slate-900 shadow-[inset_0_0_0_1px_#e2e8f0] placeholder:text-slate-400 focus:outline-none focus:shadow-[inset_0_0_0_1.5px_#0f172a] dark:bg-slate-800 dark:text-slate-100'
const LABEL = 'block text-[13px] font-semibold tracking-tight text-slate-700 dark:text-slate-300'
const HINT = 'ml-1.5 font-medium text-slate-500'

function nowHm(): string {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date())
    .replace(/^24/, '00')
}

export function TripEndForm({
  tripId,
  transport,
  startKm,
}: {
  tripId: string
  transport: TransportKind
  startKm: number | null
}) {
  const [arrived, setArrived] = useState<string>(() => nowHm())
  const [endKm, setEndKm] = useState('')
  const [refueled, setRefueled] = useState(false)

  const endNum = endKm.trim() ? Number(endKm.replace(/,/g, '')) : NaN
  const dist = Number.isFinite(endNum) && startKm !== null && endNum >= startKm ? endNum - startKm : null
  const hasVehicle = transport !== '기타'

  return (
    <form
      action={endTrip}
      className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-900/5 dark:bg-slate-900 dark:ring-slate-800"
    >
      <input type="hidden" name="trip_id" value={tripId} />

      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <span className={LABEL}>
            도착시간 <span className="text-rose-600">*</span>
          </span>
          <input name="arrived_time" type="time" required value={arrived} onChange={(e) => setArrived(e.currentTarget.value)} className={INPUT} />
        </label>
        {hasVehicle && (
          <label className="block space-y-1.5">
            <span className={LABEL}>
              도착 km<span className={HINT}>선택</span>
            </span>
            <input
              name="end_odometer_km"
              type="number"
              min={startKm ?? 0}
              step={1}
              inputMode="numeric"
              value={endKm}
              onChange={(e) => setEndKm(e.currentTarget.value)}
              placeholder={startKm !== null ? `${startKm.toLocaleString()} 이상` : '계기판 누적 km'}
              className={INPUT}
            />
          </label>
        )}
      </div>

      {hasVehicle && dist !== null && (
        <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3.5 py-2.5">
          <span className="text-xs font-medium text-emerald-700">이번 운행 주행거리</span>
          <span className="text-lg font-extrabold tracking-tight text-emerald-700">{dist.toLocaleString()} km</span>
        </div>
      )}

      {hasVehicle && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className={LABEL}>주유함</span>
            <button
              type="button"
              role="switch"
              aria-checked={refueled}
              onClick={() => setRefueled((v) => !v)}
              className={'relative h-[26px] w-11 rounded-full transition-colors ' + (refueled ? 'bg-slate-900' : 'bg-slate-300')}
            >
              <span
                className={
                  'absolute top-[3px] h-5 w-5 rounded-full bg-white transition-all ' + (refueled ? 'left-[21px]' : 'left-[3px]')
                }
              />
            </button>
            <input type="checkbox" name="refueled" checked={refueled} readOnly className="hidden" />
          </div>
          {refueled && (
            <div className="relative">
              <input name="refuel_amount_krw" type="number" min={0} step={100} inputMode="numeric" placeholder="주유 금액" className={INPUT + ' pr-10'} />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] font-medium text-slate-400">원</span>
            </div>
          )}
        </div>
      )}

      {transport === '업무용' && (
        <label className="block space-y-1.5">
          <span className={LABEL}>
            반납 위치<span className={HINT}>선택</span>
          </span>
          <input name="return_location" maxLength={200} placeholder="예: 본사 주차장 B2-3" className={INPUT} />
          <p className="text-xs text-slate-500">다음 운전자가 차량을 찾는 힌트입니다.</p>
        </label>
      )}

      <label className="block space-y-1.5">
        <span className={LABEL}>
          메모<span className={HINT}>선택</span>
        </span>
        <textarea name="notes" rows={3} maxLength={300} placeholder="현장 특이사항, 다음 사용자 참고 등" className={INPUT + ' resize-none'} />
      </label>

      <button
        type="submit"
        className="w-full rounded-[14px] bg-emerald-600 px-4 py-[15px] text-base font-bold text-white hover:bg-emerald-700 active:bg-emerald-800"
      >
        {transport === '업무용' ? '도착 기록 · 반납하기' : '도착 기록'}
      </button>
    </form>
  )
}
