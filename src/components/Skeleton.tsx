/**
 * Skeleton 로딩 블록. 페이지 데이터 로딩 중 placeholder 표시.
 * Next.js 16 의 loading.tsx 라우트 세그먼트에서 사용.
 */
export function SkeletonHeader() {
  return (
    <header className="animate-pulse space-y-2">
      <div className="h-4 w-16 rounded bg-slate-200 dark:bg-slate-800" />
      <div className="h-8 w-40 rounded bg-slate-300 dark:bg-slate-700" />
      <div className="h-4 w-56 rounded bg-slate-200 dark:bg-slate-800" />
    </header>
  )
}

export function SkeletonCard({ height = 'h-32' }: { height?: string }) {
  return (
    <div
      className={
        'animate-pulse rounded-2xl bg-white border border-slate-200 p-6 dark:bg-slate-900 dark:border-slate-800 ' +
        height
      }
    >
      <div className="h-5 w-24 rounded bg-slate-200 dark:bg-slate-800 mb-4" />
      <div className="space-y-2">
        <div className="h-4 w-full rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-4 w-3/4 rounded bg-slate-100 dark:bg-slate-800" />
      </div>
    </div>
  )
}

export function SkeletonListItem() {
  return (
    <div className="animate-pulse rounded-xl bg-white border border-slate-200 p-4 dark:bg-slate-900 dark:border-slate-800">
      <div className="flex items-center justify-between">
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-3 w-48 rounded bg-slate-100 dark:bg-slate-800" />
        </div>
        <div className="h-6 w-14 rounded-full bg-slate-100 dark:bg-slate-800" />
      </div>
    </div>
  )
}
