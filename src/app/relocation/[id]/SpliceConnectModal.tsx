'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { X, Link2, Loader2 } from 'lucide-react'
import { createSplicesFromBoxes } from './splice-actions'

// 코어 연결창 — owner 2026-05-26.
//   도식 모드에서 접속함체 기준 양쪽 케이블의 배정된 코어 박스를 차례대로 클릭하면 열림.
//   같은 코어 수일 때 「연결」 → 성공 토스트 + splice N개 일괄 생성.
//   다른 코어 수일 때 「연결」 → "배정된 코어수가 다릅니다. 확인해 주세요." 토스트만.

export type SpliceConnectModalProps = {
  projectId: string
  facility: {
    id: string
    name: string
    code: string
  }
  side1: {
    cableId: string
    cableCode: string
    cableSpec: string
    cores: number[]
  }
  side2: {
    cableId: string
    cableCode: string
    cableSpec: string
    cores: number[]
  }
  onConnected: () => void
  onClose: () => void
}

export default function SpliceConnectModal({
  projectId,
  facility,
  side1,
  side2,
  onConnected,
  onClose,
}: SpliceConnectModalProps) {
  const [busy, setBusy] = useState(false)
  const countsMatch = side1.cores.length === side2.cores.length
  const sameCable = side1.cableId === side2.cableId

  async function onConnect() {
    if (busy) return
    if (sameCable) {
      toast.error('같은 케이블끼리는 접속할 수 없습니다')
      return
    }
    if (!countsMatch) {
      toast.error('배정된 코어수가 다릅니다. 확인해 주세요.')
      return
    }
    setBusy(true)
    const result = await createSplicesFromBoxes({
      project_id: projectId,
      facility_id: facility.id,
      in_cable_id: side1.cableId,
      in_cores: side1.cores,
      out_cable_id: side2.cableId,
      out_cores: side2.cores,
      is_continuous: true,
    })
    setBusy(false)
    if (!result.ok) {
      if (result.error === 'CORE_COUNT_MISMATCH') {
        toast.error('배정된 코어수가 다릅니다. 확인해 주세요.')
      } else {
        toast.error(result.error)
      }
      return
    }
    if (result.created === 0 && result.skipped > 0) {
      toast.info('모든 코어가 이미 접속되어 있습니다')
    } else if (result.skipped > 0) {
      toast.success(
        `성공적으로 연결되었습니다 (${result.created}개 신규, ${result.skipped}개 중복 스킵)`,
      )
    } else {
      toast.success(`성공적으로 연결되었습니다 (${result.created}개)`)
    }
    onConnected()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 bg-emerald-50 px-4 py-3">
          <div className="min-w-0">
            <p className="text-lg font-extrabold text-emerald-700">코어 연결</p>
            <p className="text-xs text-slate-600 truncate">
              {facility.code} · {facility.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="shrink-0 text-slate-500 hover:text-slate-900"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* 양 사이드 비교 */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="rounded-lg border-2 border-slate-300 bg-slate-50 p-3">
              <p className="text-[10px] font-medium text-slate-500">입력 케이블</p>
              <p className="text-sm font-bold text-slate-900 truncate">
                {side1.cableCode}
              </p>
              <p className="text-[10px] text-slate-500">{side1.cableSpec}</p>
              <p className="mt-1.5 text-base font-mono font-bold text-slate-900">
                {side1.cores.length > 0 ? side1.cores.join(', ') : '—'}
              </p>
              <p className="text-[10px] text-slate-500">{side1.cores.length}개 코어</p>
            </div>
            <div className="flex flex-col items-center">
              <Link2 className="h-6 w-6 text-emerald-600" />
              <p className="text-[10px] text-slate-500 mt-0.5">짝지어 접속</p>
            </div>
            <div className="rounded-lg border-2 border-slate-300 bg-slate-50 p-3">
              <p className="text-[10px] font-medium text-slate-500">출력 케이블</p>
              <p className="text-sm font-bold text-slate-900 truncate">
                {side2.cableCode}
              </p>
              <p className="text-[10px] text-slate-500">{side2.cableSpec}</p>
              <p className="mt-1.5 text-base font-mono font-bold text-slate-900">
                {side2.cores.length > 0 ? side2.cores.join(', ') : '—'}
              </p>
              <p className="text-[10px] text-slate-500">{side2.cores.length}개 코어</p>
            </div>
          </div>

          {/* 경고/안내 */}
          {sameCable ? (
            <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700">
              같은 케이블끼리는 접속할 수 없습니다.
            </div>
          ) : !countsMatch ? (
            <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700">
              배정된 코어수가 다릅니다. 확인해 주세요.
            </div>
          ) : (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">
              왼쪽 코어와 오른쪽 코어를 같은 순서로 1:1 매핑하여 {side1.cores.length}개 접속을 생성합니다.
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={onConnect}
              disabled={busy || sameCable}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 px-4 py-1.5 text-sm font-bold text-white disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              연결
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
