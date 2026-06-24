// 국사출입등록 — 공통 상수·헬퍼.
// 'use server' 가 아니므로 상수·타입 export 가능 (server/client 양쪽 import).

export const ACCESS_STATUS_VALUES = ['대기', '등록중', '완료', '실패', '취소'] as const
export type AccessStatus = (typeof ACCESS_STATUS_VALUES)[number]

export const ACCESS_STATUS_COLOR: Record<AccessStatus, string> = {
  대기: 'border-slate-200 bg-slate-50 text-slate-600',
  등록중: 'border-blue-200 bg-blue-50 text-blue-700',
  완료: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  실패: 'border-rose-200 bg-rose-50 text-rose-700',
  취소: 'border-slate-200 bg-slate-100 text-slate-400 line-through',
}

export function isAccessStatus(v: string): v is AccessStatus {
  return (ACCESS_STATUS_VALUES as readonly string[]).includes(v)
}

// 출입기간 표시. 같은 날이면 하루로 축약.
export function formatAccessPeriod(start: string, end: string | null): string {
  if (!end || end === start) return start
  return `${start} ~ ${end}`
}
