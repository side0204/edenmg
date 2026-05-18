import { SkeletonHeader, SkeletonCard } from '@/components/Skeleton'

export default function HomeLoading() {
  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <SkeletonHeader />
        <SkeletonCard height="h-40" />
        <SkeletonCard height="h-56" />
        <SkeletonCard height="h-40" />
        <SkeletonCard height="h-44" />
      </div>
    </main>
  )
}
