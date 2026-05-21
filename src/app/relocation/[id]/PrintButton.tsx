'use client'

import { Printer } from 'lucide-react'

// 인쇄 버튼 — 작업 지시서 등 출력용. 인쇄 시 자기 자신은 숨김(print:hidden).
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 print:hidden"
    >
      <Printer className="h-4 w-4" />
      인쇄
    </button>
  )
}
