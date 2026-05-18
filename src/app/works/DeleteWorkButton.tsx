'use client'

import { Trash2 } from 'lucide-react'
import { deleteWork } from './actions'

/**
 * 작업 삭제 버튼 — confirm() 1단계 가드 후 server action 호출.
 * RLS 가 한 번 더 막아주는 이중 안전망.
 */
export function DeleteWorkButton({ workId, workName }: { workId: string; workName: string }) {
  return (
    <form
      action={deleteWork}
      onSubmit={(e) => {
        const ok = window.confirm(
          `「${workName}」 작업을 삭제할까요?\n\n` +
            '배정·일보·작업구간·일보 자재·공종 모두 함께 삭제됩니다.\n되돌릴 수 없습니다.',
        )
        if (!ok) e.preventDefault()
      }}
    >
      <input type="hidden" name="work_id" value={workId} />
      <button
        type="submit"
        className="inline-flex items-center gap-0.5 rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
        aria-label="작업 삭제"
      >
        <Trash2 className="h-3.5 w-3.5" />
        삭제
      </button>
    </form>
  )
}
