import { SkeletonHeader, SkeletonListItem } from '@/components/Skeleton'

export default function VehiclesLoading() {
  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <SkeletonHeader />
        <div className="space-y-3">
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
        </div>
      </div>
    </main>
  )
}
