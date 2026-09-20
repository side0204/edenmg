'use client'

import { cancelTrip } from './actions'
import { useNow } from './useNow'

const WINDOW_MS = 10 * 60 * 1000

/** 출발 후 10분 안에만 보이는 취소 링크 (0084 RPC). 마운트 전엔 숨김 — SSR/CSR 시각 차이 회피 */
export default function TripCancelButton({ tripId, departedAt }: { tripId: string; departedAt: string }) {
  const now = useNow(1000)
  if (now === 0) return null
  const remainMs = WINDOW_MS - (now - new Date(departedAt).getTime())
  if (remainMs <= 0) return null
  const remainSec = Math.ceil(remainMs / 1000)
  const m = Math.floor(remainSec / 60)
  const s = remainSec % 60

  return (
    <form
      action={cancelTrip}
      onSubmit={(e) => {
        if (!confirm('외근 시작을 취소할까요?\n이 외근 기록이 삭제됩니다.')) e.preventDefault()
      }}
      className="inline-block"
    >
      <input type="hidden" name="trip_id" value={tripId} />
      <button type="submit" className="text-[11px] font-medium text-rose-600 underline-offset-2 hover:underline">
        시작 취소 ({m}:{s.toString().padStart(2, '0')})
      </button>
    </form>
  )
}
