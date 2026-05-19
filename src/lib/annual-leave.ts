// 연차 모듈 공통 — 근로기준법 부여 공식 + leave_type → 일수 매핑.
// server/client 양쪽에서 import.

import type { LeaveType } from './leave'

/** 휴가 종류 → 연차 차감 일수 (단일일 기준). 0 이면 차감 대상 아님. */
export const LEAVE_TYPE_PER_DAY_COST: Record<LeaveType, number> = {
  '연차': 1,
  '반차_오전': 0.5,
  '반차_오후': 0.5,
  '반반차_오전': 0.25,
  '반반차_오후': 0.25,
  '병가': 0,   // 차감 안 함
  '공가': 0,   // 차감 안 함
  '외근': 0,   // 차감 안 함
}

/**
 * 한 신청건의 총 차감 일수.
 *   - 연차: (end_date - start_date + 1) 일
 *   - 반차·반반차: 0.5 / 0.25 (당일만)
 *   - 그 외: 0
 */
export function calcLeaveUsage(
  type: LeaveType,
  startDate: string,
  endDate: string,
): number {
  const perDay = LEAVE_TYPE_PER_DAY_COST[type]
  if (perDay === 0) return 0
  if (type === '연차') {
    const start = new Date(startDate + 'T00:00:00Z')
    const end = new Date(endDate + 'T00:00:00Z')
    const days = Math.floor((end.getTime() - start.getTime()) / (24 * 3600 * 1000)) + 1
    return Math.max(1, days)
  }
  return perDay
}

/** 두 날짜 사이 만 년수 (입사일 → 기준일). 1주년·2주년 시점에 +1 증가. */
export function yearsBetween(hireDate: string, asOf: Date = new Date()): number {
  const hire = new Date(hireDate + 'T00:00:00Z')
  const asOfUtc = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate())
  const asOfDate = new Date(asOfUtc)
  let years = asOfDate.getUTCFullYear() - hire.getUTCFullYear()
  const m = asOfDate.getUTCMonth() - hire.getUTCMonth()
  if (m < 0 || (m === 0 && asOfDate.getUTCDate() < hire.getUTCDate())) {
    years -= 1
  }
  return Math.max(0, years)
}

/** N년차 (1주년 도달 = 1, 2주년 도달 = 2 ...) 의 부여 일수. 근로기준법. */
export function legalGrantForYear(yearSeq: number): number {
  if (yearSeq < 1) return 0
  // 1~2년차: 15일. 3년차부터 2년마다 +1 (최대 25일까지 = 21년차).
  const extra = Math.floor((yearSeq - 1) / 2)
  return Math.min(25, 15 + Math.min(10, extra))
}

/** 한 회차의 입사 N주년 시작·종료 날짜 (YYYY-MM-DD). seq=0 은 1년 미만 회차 (입사일 ~ 1주년). */
export function periodDates(hireDate: string, seq: number): { start: string; end: string } {
  const hire = new Date(hireDate + 'T00:00:00Z')
  const startUtc = new Date(hire)
  startUtc.setUTCFullYear(hire.getUTCFullYear() + seq)
  const endUtc = new Date(hire)
  endUtc.setUTCFullYear(hire.getUTCFullYear() + seq + 1)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { start: fmt(startUtc), end: fmt(endUtc) }
}

/**
 * 입사일과 기준일 기준으로 현재까지 만들어져야 할 회차(period_seq) 목록과
 * 각 회차의 권장 granted 일수를 계산.
 *   - seq=0 (1년 미만): 매월 1일씩 누적, 최대 11일. 기준일까지 경과한 만월 수.
 *   - seq>=1: legalGrantForYear(seq).
 * 이미 미래의 회차(예: 5년차 도달 전인데 5년차 row)는 만들지 않는다.
 */
export function plannedPeriods(
  hireDate: string,
  asOf: Date = new Date(),
): { seq: number; start: string; end: string; granted: number }[] {
  const yrs = yearsBetween(hireDate, asOf)
  const periods: { seq: number; start: string; end: string; granted: number }[] = []

  for (let seq = 0; seq <= yrs; seq++) {
    const { start, end } = periodDates(hireDate, seq)
    if (seq === 0) {
      // 1년 미만: 입사 후 만월수 (최대 11일)
      // 만월수 = (오늘 - 입사일) 기준 완성된 1개월 단위
      const monthsCompleted = monthsBetween(hireDate, asOf)
      const granted = Math.min(11, Math.max(0, monthsCompleted))
      periods.push({ seq: 0, start, end, granted })
    } else {
      periods.push({ seq, start, end, granted: legalGrantForYear(seq) })
    }
  }
  return periods
}

/** 입사일 기준 만월수 (1개월 = day-of-month 이 입사일의 day 와 같거나 큰 다음달부터 카운트). */
export function monthsBetween(hireDate: string, asOf: Date): number {
  const hire = new Date(hireDate + 'T00:00:00Z')
  const asOfUtc = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate())
  const asOfDate = new Date(asOfUtc)
  let months =
    (asOfDate.getUTCFullYear() - hire.getUTCFullYear()) * 12 +
    (asOfDate.getUTCMonth() - hire.getUTCMonth())
  if (asOfDate.getUTCDate() < hire.getUTCDate()) months -= 1
  return Math.max(0, months)
}

/** 오늘 기준 현재 회차 (start <= today < end 인 seq). 입사 안 됐으면 null. */
export function currentPeriodSeq(hireDate: string, asOf: Date = new Date()): number | null {
  const hire = new Date(hireDate + 'T00:00:00Z')
  const asOfUtc = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()),
  )
  if (asOfUtc < hire) return null
  return yearsBetween(hireDate, asOf)
}

/** 잔여 = granted - used. 음수 가능 (음수 허용 정책). */
export function calcRemaining(granted: number, used: number): number {
  return Number((granted - used).toFixed(2))
}

export function formatLeaveDays(n: number): string {
  if (Number.isInteger(n)) return `${n}일`
  return `${n.toFixed(2)}일`
}

/** period_end 는 exclusive (다음 회차 시작일). 사용자 표시용 -1일 inclusive 날짜. */
export function inclusiveEndDate(periodEnd: string): string {
  const d = new Date(periodEnd + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** 회차 라벨 (근로기준법 기준 인지 명시). 예: "근로기준법 1년 미만 회차" / "근로기준법 2주년 회차" */
export function periodLabel(seq: number): string {
  if (seq === 0) return '근로기준법 1년 미만 회차'
  return `근로기준법 ${seq}주년 회차`
}

/** 회차 기간을 사람이 읽기 좋은 형태로. */
export function formatPeriodRange(periodStart: string, periodEnd: string): string {
  return `${periodStart} ~ ${inclusiveEndDate(periodEnd)}`
}
