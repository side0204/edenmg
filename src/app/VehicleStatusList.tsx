'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { checkoutVehicle } from './vehicles/actions'

type Row = {
  vehicleId: string
  plateNumber: string
  name: string
  status: 'in_use' | 'idle' | 'inactive'
  driverName: string | null
  departedAt: string | null
  startOdometerKm: number | null
  purpose: string | null
  isMine: boolean
  lastEndOdometerKm: number | null
}

const TIME_FMT = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function formatElapsed(fromIso: string, now: number): string {
  const diffMs = now - new Date(fromIso).getTime()
  if (diffMs < 0) return ''
  const totalMin = Math.floor(diffMs / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}분 경과`
  return `${h}시간 ${m}분 경과`
}

export default function VehicleStatusList({
  rows,
  hasMyActive,
}: {
  rows: Row[]
  hasMyActive: boolean
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const now = useNow(60_000)

  if (rows.length === 0) {
    return <p className="text-xs text-slate-500">등록된 차량이 없습니다.</p>
  }

  return (
    <div className="space-y-1.5">
      <p className="text-sm text-slate-500">운행 현황 (탭하여 자세히 보기·출고)</p>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {rows.map((r) => {
          const isExpanded = expandedId === r.vehicleId
          const isBlockedIdle = r.status === 'idle' && hasMyActive

          const onClick = () => {
            if (r.status === 'inactive') return
            if (isBlockedIdle) return
            setExpandedId(isExpanded ? null : r.vehicleId)
          }

          const clickable = r.status === 'in_use' || (r.status === 'idle' && !isBlockedIdle)

          return (
            <li key={r.vehicleId}>
              <div
                role="button"
                tabIndex={clickable ? 0 : -1}
                aria-disabled={!clickable}
                aria-expanded={clickable ? isExpanded : undefined}
                onClick={clickable ? onClick : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onClick()
                        }
                      }
                    : undefined
                }
                className={
                  'w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm select-none ' +
                  (clickable
                    ? 'hover:bg-slate-50 active:bg-slate-100 cursor-pointer'
                    : 'cursor-default')
                }
              >
                <div className="min-w-0 flex-1">
                  <p className={r.status === 'inactive' ? 'text-slate-400' : 'text-slate-900'}>
                    <span className="font-medium">{r.plateNumber}</span>
                    <span className="ml-1.5 text-slate-500">{r.name}</span>
                  </p>
                  {r.status === 'in_use' && r.driverName && r.departedAt && (
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {r.driverName} · 출고 {TIME_FMT.format(new Date(r.departedAt))}
                    </p>
                  )}
                  {isBlockedIdle && (
                    <p className="text-xs text-amber-700 mt-0.5">
                      먼저 본인 차량을 반납해야 출고 가능
                    </p>
                  )}
                </div>
                <StatusBadge status={r.status} isMine={r.isMine} />
              </div>

              {isExpanded && r.status === 'in_use' && (
                <div className="bg-slate-50 border-t border-slate-100 px-3 py-3 text-xs space-y-1.5">
                  <DetailRow label="운전자">
                    {r.driverName ?? '?'}
                    {r.isMine && <span className="ml-1.5 text-emerald-700 font-medium">(나)</span>}
                  </DetailRow>
                  {r.departedAt && (
                    <DetailRow label="출고">
                      {TIME_FMT.format(new Date(r.departedAt))}
                      {now > 0 && (
                        <span className="ml-2 text-slate-500">
                          · {formatElapsed(r.departedAt, now)}
                        </span>
                      )}
                    </DetailRow>
                  )}
                  {r.startOdometerKm !== null && (
                    <DetailRow label="출발 km">
                      {r.startOdometerKm.toLocaleString()} km
                    </DetailRow>
                  )}
                  {r.purpose && <DetailRow label="목적">{r.purpose}</DetailRow>}
                  {r.isMine && (
                    <Link
                      href={`/vehicles/${r.vehicleId}/return`}
                      className="mt-2 block rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 px-3 py-2 text-center text-sm font-medium text-white"
                    >
                      반납하기 →
                    </Link>
                  )}
                </div>
              )}

              {isExpanded && r.status === 'idle' && (
                <form
                  action={checkoutVehicle}
                  className="bg-slate-50 border-t border-slate-100 px-3 py-3 space-y-3"
                >
                  <input type="hidden" name="vehicle_id" value={r.vehicleId} />

                  <label className="block">
                    <span className="block text-xs font-medium text-slate-700">출발 km (선택)</span>
                    <input
                      name="start_odometer_km"
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      placeholder={
                        r.lastEndOdometerKm !== null
                          ? `이전 반납 ${r.lastEndOdometerKm.toLocaleString()} km`
                          : '예: 12345'
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                  </label>

                  <label className="block">
                    <span className="block text-xs font-medium text-slate-700">목적 (선택)</span>
                    <textarea
                      name="purpose"
                      rows={2}
                      maxLength={300}
                      placeholder="예: 강남현장 자재 운반"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 resize-none"
                    />
                  </label>

                  <button
                    type="submit"
                    className="w-full rounded-lg bg-slate-900 hover:bg-slate-800 active:bg-slate-700 px-3 py-2.5 text-sm font-bold text-white"
                  >
                    출고 →
                  </button>
                  <p className="text-[11px] text-slate-400 text-center">
                    출고 시각은 자동으로 지금으로 기록됩니다.
                  </p>
                </form>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(0)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const initial = setTimeout(tick, 0)
    const id = setInterval(tick, intervalMs)
    return () => {
      clearTimeout(initial)
      clearInterval(id)
    }
  }, [intervalMs])
  return now
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="flex gap-2">
      <span className="shrink-0 w-14 text-slate-500">{label}</span>
      <span className="text-slate-800 min-w-0 break-words">{children}</span>
    </p>
  )
}

function StatusBadge({
  status,
  isMine,
}: {
  status: Row['status']
  isMine: boolean
}) {
  if (status === 'inactive') {
    return (
      <span className="shrink-0 rounded-full bg-slate-100 text-slate-500 text-xs px-2 py-0.5">
        비활성
      </span>
    )
  }
  if (status === 'idle') {
    return (
      <span className="shrink-0 rounded-full bg-slate-200 text-slate-700 text-xs font-medium px-2 py-0.5">
        대기
      </span>
    )
  }
  return (
    <span
      className={
        isMine
          ? 'shrink-0 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-0.5'
          : 'shrink-0 rounded-full bg-indigo-100 text-indigo-800 text-xs font-bold px-2 py-0.5'
      }
    >
      사용중
    </span>
  )
}
