// 청약 시설별 작업사진 — 카테고리 상수 + 타입.
// 'use server' 파일은 async function 만 export 가능 (Next.js 16 Turbopack 규칙)
// 이라 상수·타입은 별도 파일에 둠.

export const FACILITY_PHOTO_CATEGORIES = [
  '전경',
  '랙전경',
  'MOFD',
  '전주명판',
  '접속여장판',
  '케이블번호(LOT/제작사)',
  '기타',
] as const

export type FacilityPhotoCategory = (typeof FACILITY_PHOTO_CATEGORIES)[number]

export function isFacilityPhotoCategory(v: string): v is FacilityPhotoCategory {
  return (FACILITY_PHOTO_CATEGORIES as readonly string[]).includes(v)
}
