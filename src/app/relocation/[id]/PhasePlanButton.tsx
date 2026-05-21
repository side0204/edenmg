'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarClock } from 'lucide-react'
import { runPhasePlanning } from './phase-actions'
import { formatMinutes } from '@/lib/relocation-phase-planner'

// 차수 탭의 「차수 자동 분할」 버튼.
//   시설별 공종량 합계로 차수를 나눈다. 재실행 시 기존 차수를 다시 계산.

export default function PhasePlanButton({
  projectId,
  hasExisting,
}: {
  projectId: string
  hasExisting: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function onRun() {
    if (busy) return
    if (
      !confirm(
        (hasExisting ? '기존 차수 계획을 다시 계산합니다.\n\n' : '') +
          '시설별 공종량 합계를 작업시간으로 보고 차수(새벽 02~05시 시공 단위)를 자동으로 나눕니다.',
      )
    ) {
      return
    }
    setBusy(true)
    const res = await runPhasePlanning(projectId)
    setBusy(false)

    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(
      `${res.phaseCount}개 차수로 분할 — ${res.teams}팀 · 시설 ${res.facilityCount}곳 · 총 ${formatMinutes(res.totalMinutes)}`,
    )
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={onRun}
      disabled={busy}
      className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-slate-300"
    >
      <CalendarClock className="h-4 w-4" />
      {busy ? '계산 중…' : hasExisting ? '차수 다시 분할' : '차수 자동 분할'}
    </button>
  )
}
