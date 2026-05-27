'use client'

import { useEffect, useState } from 'react'
import { cancelCheckout } from './actions'

const WINDOW_MS = 10 * 60 * 1000

export default function CheckoutCancelButton({
  tripId,
  departedAt,
  variant = 'inline',
}: {
  tripId: string
  departedAt: string
  variant?: 'inline' | 'block'
}) {
  // 첫 렌더는 0 으로 시작 (SSR 일치). 마운트 후 실시간 갱신.
  const [now, setNow] = useState(0)
  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // 마운트 전엔 안전하게 숨김 (서버 시각과 클라이언트 시각 차이로 잘못 보이는 것 회피)
  if (now === 0) return null

  const remainMs = WINDOW_MS - (now - new Date(departedAt).getTime())
  if (remainMs <= 0) return null

  const remainSec = Math.ceil(remainMs / 1000)
  const m = Math.floor(remainSec / 60)
  const s = remainSec % 60
  const label = `출고 취소 (${m}:${s.toString().padStart(2, '0')} 남음)`

  return (
    <form
      action={cancelCheckout}
      onSubmit={(e) => {
        if (!confirm('이 출고를 취소하시겠습니까?\n운행 기록이 삭제됩니다.')) {
          e.preventDefault()
        }
      }}
      className={variant === 'block' ? 'block' : 'inline-block'}
    >
      <input type="hidden" name="trip_id" value={tripId} />
      <button
        type="submit"
        className={
          variant === 'block'
            ? 'w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50'
            : 'text-xs font-medium text-rose-600 underline-offset-2 hover:underline'
        }
      >
        {label}
      </button>
    </form>
  )
}
