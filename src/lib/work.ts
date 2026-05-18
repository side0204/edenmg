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

export const WORK_CATEGORY_VALUES: readonly WorkCategory[] = [
  '청약',
  '계획',
  '지장이설',
  '기타',
]

export const WORK_STATUS_VALUES: readonly WorkStatus[] = ['예정', '진행중', '완료', '취소']

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
