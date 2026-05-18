'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

/**
 * URL 의 ?ok=... / ?err=... 쿼리 파라미터를 감지해 sonner 토스트로 띄우고
 * 해당 키만 URL 에서 제거한다. 다른 쿼리 파라미터는 보존.
 *
 * server action 들이 redirect('/page?ok=메시지' | '/page?err=메시지') 형태로
 * 일관되게 응답하면 이 컴포넌트 하나가 전사 토스트를 처리.
 */
export default function ToastBridge() {
  const sp = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const ok = sp.get('ok')
    const err = sp.get('err')
    if (!ok && !err) return

    if (ok) toast.success(ok)
    if (err) toast.error(err)

    const next = new URLSearchParams(sp.toString())
    next.delete('ok')
    next.delete('err')
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [sp, pathname, router])

  return null
}
