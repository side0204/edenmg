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

// timestamptz(ISO) → KST 'YYYY-MM-DD HH:mm' 표시.
export function formatKstDateTime(iso: string | null): string {
  if (!iso) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`
}

// datetime-local input 기본값 — 현재 KST 'YYYY-MM-DDTHH:mm'.
export function nowKstInput(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`
}

// 출입기간 표시 (시·분 포함). 같은 값이면 하나로 축약.
export function formatAccessPeriod(start: string, end: string | null): string {
  const s = formatKstDateTime(start)
  if (!end || end === start) return s
  return `${s} ~ ${formatKstDateTime(end)}`
}
