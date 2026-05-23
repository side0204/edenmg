// 시나리오 페이지 공용 프레임 — 헤더(제목·소요시간·관련 메뉴)·푸터(점검일·피드백) 일관.
// 본문 children 은 시나리오별로 자유 작성.

import Link from 'next/link'
import { ChevronLeft, Clock, ExternalLink } from 'lucide-react'
import type { Scenario } from '@/lib/help-scenarios'

export function ScenarioFrame({
  scenario,
  children,
}: {
  scenario: Scenario
  children: React.ReactNode
}) {
  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-5">
        <Link
          href="/help"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
        >
          <ChevronLeft className="h-4 w-4" />
          사용법 목록
        </Link>

        <header className="space-y-3">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {scenario.title}
          </h1>
          <p className="text-base text-slate-600">{scenario.oneLiner}</p>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-4 w-4" />
              소요 {scenario.estMinutesMin}~{scenario.estMinutesMax}분
            </span>
            {scenario.routes.length > 0 && (
              <span className="inline-flex flex-wrap items-center gap-1">
                관련 메뉴:
                {scenario.routes.map((r) => (
                  <Link
                    key={r}
                    href={r}
                    className="inline-flex items-center gap-0.5 rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-xs font-mono text-slate-700 hover:border-slate-900"
                  >
                    {r}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                ))}
              </span>
            )}
          </div>
        </header>

        <article className="space-y-6 text-base leading-relaxed text-slate-800">
          {children}
        </article>

        <footer className="border-t border-slate-200 pt-4 text-xs text-slate-400">
          <p>마지막 점검: {scenario.lastReviewed}</p>
          <p className="mt-1">
            화면이 실제와 다르면 관리자에게 알려주세요. 사용 화면이 자주 바뀌는 베타
            기간입니다.
          </p>
        </footer>
      </div>
    </main>
  )
}

// 시나리오 본문에서 자주 쓰는 작은 컴포넌트들 — 일관 스타일로 묶음
export function Step({
  n,
  children,
}: {
  n: number
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-3">
      <span className="shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-full bg-slate-900 text-white text-sm font-bold">
        {n}
      </span>
      <div className="flex-1 pt-0.5 space-y-2">{children}</div>
    </div>
  )
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-semibold text-slate-900 tracking-tight pt-2">
      {children}
    </h2>
  )
}

export function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
      <p className="font-medium">💡 알아두기</p>
      <div className="mt-0.5">{children}</div>
    </div>
  )
}

export function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <p className="font-medium">⚠️ 주의</p>
      <div className="mt-0.5">{children}</div>
    </div>
  )
}

export function FaqItem({
  q,
  children,
}: {
  q: string
  children: React.ReactNode
}) {
  return (
    <details className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium text-slate-800">
        {q}
      </summary>
      <div className="mt-2 text-sm text-slate-700 space-y-1.5">{children}</div>
    </details>
  )
}
