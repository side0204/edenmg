'use client'

import { useState } from 'react'

type Props = {
  initialMonth: string
  scopeNote: string
}

export default function ReportPanel({ initialMonth, scopeNote }: Props) {
  const [month, setMonth] = useState(initialMonth)

  const valid = /^\d{4}-\d{2}$/.test(month)
  const attendanceHref = valid ? `/api/reports/attendance?month=${month}` : '#'
  const leavesHref = valid ? `/api/reports/leaves?month=${month}` : '#'
  const connSummaryHref = valid ? `/api/reports/connection-reports?mode=summary&month=${month}` : '#'
  const connSegmentHref = valid ? `/api/reports/connection-reports?mode=segment&month=${month}` : '#'
  const connTasksHref = valid ? `/api/reports/connection-reports?mode=tasks&month=${month}` : '#'
  const connMaterialsHref = valid
    ? `/api/reports/connection-reports?mode=materials&month=${month}`
    : '#'

  return (
    <div className="space-y-5">
      <label className="block">
        <span className="text-sm font-medium text-slate-700">대상 월</span>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
        <span className="mt-1 block text-xs text-slate-500">{scopeNote}</span>
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <a
          href={attendanceHref}
          aria-disabled={!valid}
          className={
            valid
              ? 'block rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-slate-700 px-4 py-4 text-center text-base font-bold text-white'
              : 'block rounded-xl bg-slate-300 px-4 py-4 text-center text-base font-bold text-white cursor-not-allowed'
          }
          onClick={(e) => {
            if (!valid) e.preventDefault()
          }}
          download
        >
          출퇴근 CSV 받기
        </a>
        <a
          href={leavesHref}
          aria-disabled={!valid}
          className={
            valid
              ? 'block rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-slate-700 px-4 py-4 text-center text-base font-bold text-white'
              : 'block rounded-xl bg-slate-300 px-4 py-4 text-center text-base font-bold text-white cursor-not-allowed'
          }
          onClick={(e) => {
            if (!valid) e.preventDefault()
          }}
          download
        >
          신청서 CSV 받기
        </a>
      </div>

      <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <p className="text-sm font-semibold text-slate-700">접속일보 (M3 Phase 2-B)</p>
        <div className="grid grid-cols-2 gap-2">
          <DownloadButton href={connSummaryHref} valid={valid} label="일보별" />
          <DownloadButton href={connSegmentHref} valid={valid} label="세그먼트별" />
          <DownloadButton href={connTasksHref} valid={valid} label="공종별" />
          <DownloadButton href={connMaterialsHref} valid={valid} label="자재별" />
        </div>
      </div>

      <p className="text-xs text-slate-400">
        파일은 UTF-8(BOM) 인코딩으로, 한글 Windows · Mac Excel 어디서 열어도 깨지지 않습니다.
      </p>
    </div>
  )
}

function DownloadButton({ href, valid, label }: { href: string; valid: boolean; label: string }) {
  return (
    <a
      href={href}
      aria-disabled={!valid}
      className={
        valid
          ? 'block rounded-lg border border-slate-300 bg-white px-3 py-2 text-center text-sm font-medium text-slate-800 hover:bg-slate-100'
          : 'block rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-sm font-medium text-slate-400 cursor-not-allowed'
      }
      onClick={(e) => {
        if (!valid) e.preventDefault()
      }}
      download
    >
      {label}
    </a>
  )
}
