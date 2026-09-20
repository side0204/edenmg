// 외근·차량 화면 공용 프리미티브 (디자인 A — 연회색 바탕 + 테두리 없는 흰 면 + 점 상태)
// 서버·클라이언트 양쪽에서 쓰는 순수 표시 컴포넌트만 둔다.

import type { ReactNode } from 'react'
import { TRANSPORT_DOT, type TransportKind } from '@/lib/trips'

export const SURFACE =
  'rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5 dark:bg-slate-900 dark:ring-slate-800'

export function Surface({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`${SURFACE} p-5 space-y-3 ${className}`}>{children}</section>
}

export function SectionTitle({
  title,
  count,
  right,
}: {
  title: string
  count?: string | number | null
  right?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        {title}
        {count !== undefined && count !== null && (
          <span className="ml-1.5 text-[13px] font-medium text-slate-400">{count}</span>
        )}
      </h2>
      {right}
    </div>
  )
}

export function Dot({ className = 'bg-slate-300', size = 'h-2 w-2' }: { className?: string; size?: string }) {
  return <span className={`inline-block shrink-0 rounded-full ${size} ${className}`} />
}

export type StatusTone = 'emerald' | 'amber' | 'slate'

export function StatusText({ text, tone }: { text: string; tone: StatusTone }) {
  const color = { emerald: 'text-emerald-700', amber: 'text-amber-700', slate: 'text-slate-500' }[tone]
  const dotCls = { emerald: 'bg-emerald-600', amber: 'bg-amber-600', slate: 'bg-slate-300' }[tone]
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold ${color}`}>
      <Dot className={dotCls} size="h-[7px] w-[7px]" />
      {text}
    </span>
  )
}

/** 이동수단 점 + 라벨 (업무용 파랑 · 자차 보라 · 기타 회색) */
export function TransportTag({ transport, label }: { transport: TransportKind; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Dot className={TRANSPORT_DOT[transport]} size="h-1.5 w-1.5" />
      <span>{label}</span>
    </span>
  )
}

export function TransportLegend() {
  return (
    <div className="flex gap-4 text-[11px] text-slate-500">
      <span className="inline-flex items-center gap-1.5">
        <Dot className={TRANSPORT_DOT.업무용} size="h-1.5 w-1.5" />
        업무용
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Dot className={TRANSPORT_DOT.자차} size="h-1.5 w-1.5" />
        자차
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Dot className={TRANSPORT_DOT.기타} size="h-1.5 w-1.5" />
        기타
      </span>
    </div>
  )
}

/** 표 셀 두 줄 (위 진하게 · 아래 작게 회색). wrap=true 면 아랫줄 줄바꿈 허용 */
export function TwoLine({
  top,
  bottom,
  wrap = false,
}: {
  top: ReactNode
  bottom?: ReactNode
  wrap?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate">{top}</span>
      {bottom ? (
        <span className={`text-[11px] leading-[14px] text-slate-500 ${wrap ? '' : 'truncate'}`}>{bottom}</span>
      ) : null}
    </div>
  )
}

/** 큰 출발→도착 시각 + 진행선 (방향 B 에서 가져온 강조) */
export function BigTimes({
  dep,
  arr,
  depLabel,
  arrLabel,
  progress = 0.55,
  size = 'text-[30px] leading-[34px]',
}: {
  dep: string
  arr: string
  depLabel: ReactNode
  arrLabel: ReactNode
  progress?: number
  size?: string
}) {
  const pct = Math.max(0, Math.min(100, Math.round(progress * 100)))
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <div className={`font-extrabold tracking-[-0.04em] text-slate-900 dark:text-slate-100 ${size}`}>{dep}</div>
        <div className="flex flex-1 items-center">
          <Dot className="bg-emerald-600" />
          <div
            className="h-0.5 flex-1"
            style={{
              background: `linear-gradient(90deg, #059669 0%, #059669 ${pct}%, #e2e8f0 ${pct}%, #e2e8f0 100%)`,
            }}
          />
          <span className="inline-block h-2 w-2 rounded-full bg-white shadow-[inset_0_0_0_2px_#cbd5e1]" />
        </div>
        <div className={`font-extrabold tracking-[-0.04em] text-slate-500 ${size}`}>{arr}</div>
      </div>
      <div className="flex justify-between text-[11px] text-slate-500">
        <span>{depLabel}</span>
        <span>{arrLabel}</span>
      </div>
    </div>
  )
}

/** 표 공통 — 세로선 없이 가로 구분선만. 컬럼은 <colgroup> 로 폭 지정. */
export function Table({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full table-fixed border-collapse text-xs">{children}</table>
    </div>
  )
}

export const TH = 'px-1.5 pb-2 text-left text-[11px] font-medium text-slate-500 border-b border-slate-100 whitespace-nowrap'
export const TD = 'px-1.5 py-2.5 align-top text-xs text-slate-800 border-b border-slate-100 dark:text-slate-200'
