'use client'

import { useSyncExternalStore } from 'react'

/**
 * 현재 시각(ms) 을 intervalMs 마다 갱신. 서버 스냅샷은 0 → 마운트 전엔 0 으로 렌더돼 hydration 안전.
 * (effect 안 setState 대신 useSyncExternalStore — react-hooks/set-state-in-effect 회피)
 */
export function useNow(intervalMs: number): number {
  return useSyncExternalStore(
    (onChange) => {
      const id = setInterval(onChange, intervalMs)
      return () => clearInterval(id)
    },
    () => Math.floor(Date.now() / intervalMs) * intervalMs,
    () => 0,
  )
}
