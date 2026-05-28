'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home } from 'lucide-react'

// 전역 상단바 — 홈 진입점을 상단으로 올려 하단 탭바 공간 확보 (owner 2026-05-28).
//   얇은 sticky 바. 좌측 「홈」 + 앱 이름. 로그인·캔버스 전체화면 등에서는 숨김.

const HIDDEN_PREFIXES = ['/login', '/welcome', '/auth', '/signup']
const CANVAS_ROUTE = /^\/relocation\/[^/]+\/canvas\/?$/

export default function TopBar() {
  const pathname = usePathname() ?? '/'
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null
  if (CANVAS_ROUTE.test(pathname)) return null

  const isHome = pathname === '/'

  return (
    <header
      className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-1.5 dark:border-slate-800 dark:bg-slate-900"
      style={{ paddingTop: 'calc(0.375rem + env(safe-area-inset-top))' }}
    >
      <Link
        href="/"
        className={
          'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold ' +
          (isHome
            ? 'text-slate-900 dark:text-slate-100'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800')
        }
        aria-label="홈으로"
      >
        <Home className={'h-5 w-5 ' + (isHome ? 'stroke-[2.25]' : 'stroke-[1.75]')} />
        홈
      </Link>
      <span className="pr-1 text-xs font-medium tracking-tight text-slate-400 dark:text-slate-500">
        이든 통합관리
      </span>
    </header>
  )
}
