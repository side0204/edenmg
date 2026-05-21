'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Zap } from 'lucide-react'
import { runAutoAssign } from './auto-assign-actions'

// 코어배정 탭의 「자동 배정 실행」 버튼.
//   종단 2개를 잇는 경유 케이블에 빈 코어를 자동 배정한다.
//   결과는 토스트로 요약 + 건너뛴 회선은 사유별로 표시.

export default function AutoAssignButton({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function onRun() {
    if (busy) return
    if (
      !confirm(
        '자동 코어 배정을 실행하시겠습니까?\n\n' +
          '종단으로 표시한 회선의 양 끝 사이 경유 케이블에 빈 코어를 자동으로 채웁니다.\n' +
          '이전 자동 배정 결과는 다시 계산되고, 사람이 입력·수정한 배정은 그대로 유지됩니다.',
      )
    ) {
      return
    }
    setBusy(true)
    const res = await runAutoAssign(projectId)
    setBusy(false)

    if (!res.ok) {
      toast.error(res.error)
      return
    }

    if (res.assignedCount === 0 && res.skippedCount === 0) {
      toast.info('자동 배정할 종단 회선이 없습니다.')
    } else if (res.skippedCount === 0) {
      toast.success(
        `회선 ${res.assignedCount}건 자동 배정 완료 (코어 배정 ${res.insertedRows}건 생성)`,
      )
    } else {
      toast.warning(
        `회선 ${res.assignedCount}건 배정 · ${res.skippedCount}건 건너뜀`,
      )
    }

    // 건너뛴 회선 사유 (최대 6건)
    const skipped = res.results.filter((r) => r.status === 'skipped')
    skipped.slice(0, 6).forEach((r) => {
      toast.error(`${r.label}: ${r.detail}`, { duration: 7000 })
    })
    if (skipped.length > 6) {
      toast.error(`그 외 ${skipped.length - 6}건 더 건너뜀`)
    }

    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={onRun}
      disabled={busy}
      className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:bg-slate-300"
    >
      <Zap className="h-4 w-4" />
      {busy ? '배정 중…' : '자동 배정 실행'}
    </button>
  )
}
