'use client'

import { deleteVehicleLog } from '../../../actions'

export default function DeleteLogButton({
  id,
  targetKind,
  targetId,
}: {
  id: string
  targetKind: string
  targetId: string
}) {
  return (
    <form
      action={deleteVehicleLog}
      onSubmit={(e) => {
        if (!confirm('이 기록을 삭제할까요?')) e.preventDefault()
      }}
      className="shrink-0"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="target_kind" value={targetKind} />
      <input type="hidden" name="target_id" value={targetId} />
      <button type="submit" className="text-[11px] font-medium text-rose-600 underline-offset-2 hover:underline">
        삭제
      </button>
    </form>
  )
}
