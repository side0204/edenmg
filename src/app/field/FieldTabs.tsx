'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Map, Building2 } from 'lucide-react'

// 현장관리 서브탭 — 지도 노트(/field) ↔ 국사현황(/field/stations).
//   각 페이지 상단에 렌더. sticky 로 스크롤해도 유지.

const TABS = [
  { href: '/field', label: '지도 노트', icon: Map, exact: true },
  { href: '/field/stations', label: '국사현황', icon: Building2, exact: false },
] as const

export default function FieldTabs() {
  const pathname = usePathname() ?? '/field'

  return (
    <div className="flex gap-1 border-b border-slate-200">
      {TABS.map((t) => {
        const Icon = t.icon
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href)
        return (
          <Link
            key={t.href}
            href={t.href}
            className={
              'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px ' +
              (active
                ? 'border-rose-600 text-rose-700'
                : 'border-transparent text-slate-500 hover:text-slate-800')
            }
          >
            <Icon className="h-4 w-4" />
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
