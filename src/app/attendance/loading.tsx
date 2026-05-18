import { SkeletonHeader, SkeletonCard } from '@/components/Skeleton'

export default function AttendanceLoading() {
  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-md space-y-5">
        <SkeletonHeader />
        <SkeletonCard height="h-64" />
      </div>
    </main>
  )
}
