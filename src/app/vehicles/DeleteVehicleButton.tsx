'use client'

import { Trash2 } from 'lucide-react'
import { deleteVehicle } from './actions'

// 운행 이력 0건 차량 영구 삭제용 confirm 가드 버튼.
// confirm 동의 시 server action 호출. server 단에서 이력 0건 재확인.
export default function DeleteVehicleButton({
  vehicleId,
  vehicleLabel,
}: {
  vehicleId: string
  vehicleLabel: string
}) {
  return (
    <form
      action={deleteVehicle}
      onSubmit={(e) => {
        if (!confirm(`${vehicleLabel} 을(를) 영구 삭제할까요? 되돌릴 수 없습니다.`)) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="id" value={vehicleId} />
      <button
        type="submit"
        className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
        title="영구 삭제 (운행 이력 0건만)"
      >
        <Trash2 className="h-3.5 w-3.5" />
        삭제
      </button>
    </form>
  )
}
