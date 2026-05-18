'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Clock, Car, ClipboardCheck } from 'lucide-react'

type Tab = {
  href: string
  label: string
  // 활성 판정: pathname 이 이 prefix 로 시작하면 active
  matchPrefix: string
  icon: typeof Home
}

const TABS: Tab[] = [
  { href: '/', label: '홈', matchPrefix: '/', icon: Home },
  { href: '/attendance', label: '근태', matchPrefix: '/attendance', icon: Clock },
  { href: '/vehicles', label: '차량', matchPrefix: '/vehicles', icon: Car },
  { href: '/requests', label: '결재', matchPrefix: '/requests', icon: ClipboardCheck },
]

// 결재 탭은 두 경로(/requests, /approvals) 를 같이 활성으로 본다.
const APPROVAL_PATHS = ['/requests', '/approvals']

// 로그인/환영 등 인증 전 페이지에서는 탭 바를 숨긴다.
const HIDDEN_PREFIXES = ['/login', '/welcome', '/auth']

export default function BottomNav() {
  const pathname = usePathname() ?? '/'

  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-2xl">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isHome = tab.href === '/'
          // 홈은 정확히 매칭, 그 외는 prefix 매칭
          let active = isHome ? pathname === '/' : pathname.startsWith(tab.matchPrefix)
          // 결재 탭은 /approvals 도 활성으로
          if (tab.href === '/requests') {
            active = APPROVAL_PATHS.some((p) => pathname.startsWith(p))
          }
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                className={
                  'flex flex-col items-center justify-center gap-0.5 px-2 py-2.5 text-xs ' +
                  (active
                    ? 'text-slate-900 font-semibold'
                    : 'text-slate-400 hover:text-slate-700')
                }
              >
                <Icon
                  className={'h-6 w-6 ' + (active ? 'stroke-[2.25]' : 'stroke-[1.75]')}
                />
                <span>{tab.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
