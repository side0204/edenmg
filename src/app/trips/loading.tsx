import { SkeletonCard, SkeletonHeader } from '@/components/Skeleton'

export default function TripsLoading() {
  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-4 lg:max-w-[100rem]">
        <SkeletonHeader />
        <SkeletonCard height="h-56" />
        <SkeletonCard height="h-48" />
        <SkeletonCard height="h-48" />
      </div>
    </main>
  )
}
