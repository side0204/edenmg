'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type SubTab = {
  href: string
  label: string
  /** 활성 판정 prefix 목록 */
  matchPrefixes: string[]
}

const SUB_TABS: SubTab[] = [
  { href: '/attendance', label: '근태', matchPrefixes: ['/attendance'] },
  { href: '/vehicles', label: '차량', matchPrefixes: ['/vehicles'] },
  // 결재는 내 신청(/requests) 과 결재함(/approvals) 둘 다 같은 서브탭으로 묶음
  { href: '/requests', label: '결재', matchPrefixes: ['/requests', '/approvals'] },
]

/**
 * 사무 그룹(근태·차량·결재) 경로에서만 상단에 sticky 로 표시되는 서브탭.
 * 그 외 경로(/, /admin, /login 등) 에서는 null.
 * hideOffice = 현장 직원이면 서브탭 자체 숨김 (라우트 직접 진입은 가능하지만 네비게이션은 비표시).
 */
export default function OfficeSubTabs({ hideOffice = false }: { hideOffice?: boolean }) {
  const pathname = usePathname() ?? '/'

  if (hideOffice) return null
  const isOffice = SUB_TABS.some((t) => t.matchPrefixes.some((p) => pathname.startsWith(p)))
  if (!isOffice) return null

  return (
    <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
      <ul className="mx-auto flex max-w-2xl">
        {SUB_TABS.map((tab) => {
          const active = tab.matchPrefixes.some((p) => pathname.startsWith(p))
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                className={
                  'block py-3 text-center text-sm font-medium border-b-2 transition-colors ' +
                  (active
                    ? 'border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100'
                    : 'border-transparent text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300')
                }
              >
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
