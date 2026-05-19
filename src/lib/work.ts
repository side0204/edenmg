// 작업 모듈 공통 상수·헬퍼. server/client 양쪽에서 import.

export type WorkCategory = '청약' | '계획' | '지장이설' | '기타'
export type WorkSubcategory =
  | '소호'
  | 'FTTH'
  | '모바일'
  | '전용회선'
  | '다회선'
  | '아파트'
  | '망보강'
  | '코어분산'
  | '이원화'
  | '단순'
  | '일반'
  | '원인자'
export type WorkStatus = '예정' | '진행중' | '완료' | '취소'
export type WorkWorkerType = '접속팀' | '외선팀' | '기타'
export type WorkReportProgress = '시작전' | '진행중' | '완료'
export type WorkReportStatus = '대기' | '승인' | '반려'
export type DailyCheckDecision = '진행중' | '완료' | '이월'

export const WORK_CATEGORY_VALUES: readonly WorkCategory[] = [
  '청약',
  '계획',
  '지장이설',
  '기타',
]

export const WORK_STATUS_VALUES: readonly WorkStatus[] = ['예정', '진행중', '완료', '취소']

export const WORKER_TYPE_VALUES: readonly WorkWorkerType[] = ['접속팀', '외선팀', '기타']

export const REPORT_PROGRESS_VALUES: readonly WorkReportProgress[] = [
  '시작전',
  '진행중',
  '완료',
]

export const REPORT_STATUS_VALUES: readonly WorkReportStatus[] = ['대기', '승인', '반려']

// 카테고리별 소분류. owner 결정 사항 (CLAUDE.md 표 참조).
export const SUBCATEGORY_BY_CATEGORY: Record<WorkCategory, readonly WorkSubcategory[]> = {
  청약: ['소호', 'FTTH', '모바일', '전용회선', '다회선', '아파트'],
  계획: ['망보강', '코어분산', '이원화'],
  지장이설: ['단순', '일반', '원인자'],
  기타: [],
}

export const STATUS_COLOR: Record<WorkStatus, string> = {
  예정: 'text-slate-600 bg-slate-100 border-slate-200',
  진행중: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  완료: 'text-indigo-700 bg-indigo-50 border-indigo-200',
  취소: 'text-slate-400 bg-slate-50 border-slate-200',
}

export const REPORT_STATUS_COLOR: Record<WorkReportStatus, string> = {
  대기: 'text-amber-700 bg-amber-50 border-amber-200',
  승인: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  반려: 'text-rose-700 bg-rose-50 border-rose-200',
}

export const REPORT_PROGRESS_COLOR: Record<WorkReportProgress, string> = {
  시작전: 'text-slate-600 bg-slate-100 border-slate-200',
  진행중: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  완료: 'text-indigo-700 bg-indigo-50 border-indigo-200',
}

export const DAILY_CHECK_COLOR: Record<DailyCheckDecision, string> = {
  진행중: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  완료: 'text-indigo-700 bg-indigo-50 border-indigo-200',
  이월: 'text-amber-700 bg-amber-50 border-amber-200',
}

/** Asia/Seoul 기준 오늘 날짜 (YYYY-MM-DD). server/client 양쪽 동일. */
export function todayInSeoul(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
}

export function formatWorkerType(
  workerType: WorkWorkerType | null,
  custom: string | null,
): string {
  if (!workerType) return '미지정'
  if (workerType === '기타') return custom || '기타'
  return workerType
}

/**
 * 작업 종류별 일보 라벨.
 *   접속팀 → '접속일보'
 *   외선팀 → '외선일보'
 *   그 외 → '일보'
 * 카드 배지·페이지 타이틀·섹션 헤더 모두 동일 규칙으로 사용.
 */
export function reportLabel(workerType: WorkWorkerType | null): string {
  if (workerType === '접속팀') return '접속일보'
  if (workerType === '외선팀') return '외선일보'
  return '일보'
}

export function formatWorkPeriod(start: string | null, end: string | null): string {
  if (!start && !end) return '기간 미정'
  if (start && end) {
    if (start === end) return start
    return `${start} ~ ${end}`
  }
  if (start) return `${start} ~`
  return `~ ${end}`
}

export function formatWorkLabel(
  category: WorkCategory,
  subcategory: WorkSubcategory | null,
): string {
  if (category === '기타' || !subcategory) return category
  return `${category} · ${subcategory}`
}
