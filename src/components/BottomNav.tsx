'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Briefcase, ClipboardList, Hammer, Package } from 'lucide-react'

type Tab = {
  href: string
  label: string
  icon: typeof Home
  /** 활성 판정 — pathname 이 이 prefix 중 하나로 시작하면 active. exact 모드는 isExact 로 마킹. */
  matchPrefixes: string[]
  isExact?: boolean
}

// 최상위 탭. 향후 M3 작업·M4 자재·M5 안전이 단일 페이지로 들어오면 여기 추가.
// 사무 그룹은 자체 서브탭(근태·차량·결재) 으로 세분화한다.
const TABS: Tab[] = [
  {
    href: '/',
    label: '홈',
    icon: Home,
    matchPrefixes: ['/'],
    isExact: true,
  },
  {
    href: '/attendance',
    label: '사무',
    icon: Briefcase,
    matchPrefixes: ['/attendance', '/vehicles', '/requests', '/approvals'],
  },
  {
    href: '/relocation',
    label: '공사설계',
    icon: ClipboardList,
    matchPrefixes: ['/relocation'],
  },
  {
    href: '/works',
    label: '작업',
    icon: Hammer,
    matchPrefixes: ['/works'],
  },
  {
    href: '/stock',
    label: '자재',
    icon: Package,
    matchPrefixes: ['/stock'],
  },
]

// 로그인/환영 등 인증 전 페이지에서는 탭 바를 숨긴다.
const HIDDEN_PREFIXES = ['/login', '/welcome', '/auth', '/signup']

// 지장이설 전체화면 캔버스 라우트(/relocation/[id]/canvas) — 앱 메뉴 없이 캔버스만.
const CANVAS_ROUTE = /^\/relocation\/[^/]+\/canvas\/?$/

export default function BottomNav({ hideOffice = false }: { hideOffice?: boolean }) {
  const pathname = usePathname() ?? '/'

  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null
  if (CANVAS_ROUTE.test(pathname)) return null

  // 현장 직원은 「사무」 탭 숨김. 키는 '사무' label 로 매칭.
  const tabs = hideOffice ? TABS.filter((t) => t.label !== '사무') : TABS

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-2xl">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const active = tab.isExact
            ? pathname === tab.matchPrefixes[0]
            : tab.matchPrefixes.some((p) => pathname.startsWith(p))
          return (
            <li key={tab.label} className="flex-1">
              <Link
                href={tab.href}
                className={
                  'flex flex-col items-center justify-center gap-0.5 px-2 py-2.5 text-xs ' +
                  (active
                    ? 'text-slate-900 font-semibold dark:text-slate-100'
                    : 'text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300')
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
