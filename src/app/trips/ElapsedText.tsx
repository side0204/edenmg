'use client'

import { formatElapsed } from '@/lib/trips'
import { useNow } from './useNow'

/** "1시간 20분 경과" — 1분마다 갱신. 마운트 전엔 빈 문자열 (hydration 안전) */
export default function ElapsedText({ fromIso, prefix = '' }: { fromIso: string; prefix?: string }) {
  const now = useNow(60_000)
  if (now === 0) return null
  const t = formatElapsed(fromIso, now)
  if (!t) return null
  return (
    <span>
      {prefix}
      {t}
    </span>
  )
}
