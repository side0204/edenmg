// 외근·차량 도메인 공유 상수·헬퍼. 서버·클라이언트 양쪽에서 import.
//
// 외근 1건 = vehicle_trips 1행. 이동수단(transport) 에 따라
//   업무용 → vehicle_id, 자차 → personal_plate, 기타 → other_note(도보·대중교통·동승)

export type TransportKind = '업무용' | '자차' | '기타'

export const TRANSPORT_VALUES: readonly TransportKind[] = ['업무용', '자차', '기타']

export const TRANSPORT_LABEL: Record<TransportKind, string> = {
  업무용: '업무용 차량',
  자차: '자차',
  기타: '기타',
}

// 상태 점 색 (디자인 A — 알약 배지 대신 점 + 글자)
export const TRANSPORT_DOT: Record<TransportKind, string> = {
  업무용: 'bg-blue-700',
  자차: 'bg-violet-700',
  기타: 'bg-slate-400',
}

export const OTHER_TRANSPORT_OPTIONS = ['도보', '대중교통', '동승'] as const

export const MAX_COMPANIONS = 4

// 차계부 수동 항목 종류. 운행·주유는 vehicle_trips 에서 자동 유입.
export type VehicleLogKind = '주유' | '정비' | '보험' | '검사' | '세금' | '통행' | '주차' | '기타'

export const VEHICLE_LOG_KINDS: readonly VehicleLogKind[] = [
  '주유',
  '정비',
  '보험',
  '검사',
  '세금',
  '통행',
  '주차',
  '기타',
]

export const LOG_KIND_DOT: Record<VehicleLogKind | '운행', string> = {
  운행: 'bg-slate-400',
  주유: 'bg-amber-600',
  정비: 'bg-teal-700',
  보험: 'bg-blue-700',
  검사: 'bg-violet-700',
  세금: 'bg-rose-600',
  통행: 'bg-slate-400',
  주차: 'bg-slate-400',
  기타: 'bg-slate-400',
}

// ===== 시간 헬퍼 (KST) =================================================

export function todayKST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
}

/** 'HH:MM' (Asia/Seoul) */
export function hmKST(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

/** 'MM-DD HH:MM' (Asia/Seoul) */
export function mdhmKST(iso: string | null | undefined): string {
  if (!iso) return '—'
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
}

/** 'YYYY-MM-DD' + 'HH:MM' (KST) → ISO. 시간이 비면 null. */
export function kstDateTimeToIso(date: string, hm: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(hm)) return null
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = hm.split(':').map(Number)
  // KST = UTC+9
  return new Date(Date.UTC(y, m - 1, d, hh - 9, mm, 0)).toISOString()
}

/** KST 기준 오늘 00:00 ~ 내일 00:00 (ISO, 끝은 exclusive) */
export function todayRangeKST(): { startISO: string; endISOExclusive: string } {
  const today = todayKST()
  const [y, m, d] = today.split('-').map(Number)
  return {
    startISO: new Date(Date.UTC(y, m - 1, d, -9, 0, 0)).toISOString(),
    endISOExclusive: new Date(Date.UTC(y, m - 1, d + 1, -9, 0, 0)).toISOString(),
  }
}

/** 'YYYY-MM' → KST 월 범위 */
export function monthRangeKSTLocal(month: string): { startISO: string; endISOExclusive: string } | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null
  const [y, m] = month.split('-').map(Number)
  if (m < 1 || m > 12) return null
  return {
    startISO: new Date(Date.UTC(y, m - 1, 1, -9, 0, 0)).toISOString(),
    endISOExclusive: new Date(Date.UTC(y, m, 1, -9, 0, 0)).toISOString(),
  }
}

export function currentMonthKST(): string {
  return todayKST().slice(0, 7)
}

export function formatElapsed(fromIso: string, nowMs: number): string {
  const diffMs = nowMs - new Date(fromIso).getTime()
  if (diffMs < 0) return ''
  const totalMin = Math.floor(diffMs / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}분 경과`
  return `${h}시간 ${m}분 경과`
}

export function formatKm(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return `${n.toLocaleString()} km`
}

export function formatKrw(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return `${n.toLocaleString()}원`
}

/** 외근 행의 이동수단 표시 텍스트 (차량번호 또는 자차번호 또는 기타 메모) */
export function transportText(t: {
  transport: TransportKind
  vehicleLabel?: string | null
  personal_plate?: string | null
  other_note?: string | null
}): string {
  if (t.transport === '업무용') return t.vehicleLabel ?? '업무용'
  if (t.transport === '자차') return t.personal_plate ? `자차 ${t.personal_plate}` : '자차'
  return t.other_note || '기타'
}
