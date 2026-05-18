import type { LucideIcon } from 'lucide-react'

/**
 * 빈 상태 공통 컴포넌트. 모바일 SaaS 표준 (Notion·Linear) 패턴.
 *
 * - 큰 아이콘(원형 배경 안) + 제목 + 설명 + 선택적 CTA
 * - 카드 안/페이지 메인 둘 다 사용 가능
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  cta,
}: {
  icon: LucideIcon
  title: string
  description?: string
  cta?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-white border border-dashed border-slate-300 px-6 py-10 text-center dark:bg-slate-900 dark:border-slate-700">
      <div className="rounded-full bg-slate-100 p-3 dark:bg-slate-800">
        <Icon className="h-7 w-7 text-slate-400 dark:text-slate-500" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-semibold text-slate-700 dark:text-slate-300">{title}</p>
        {description && (
          <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
        )}
      </div>
      {cta && <div className="mt-1">{cta}</div>}
    </div>
  )
}
