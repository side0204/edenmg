// 현장관리 — 국사현황 (Phase D) 공용 상수.
// server/client 양쪽에서 사용 (lib 라 export 제약 없음).

import { R2_BUCKETS } from '@/lib/r2'

// 사진은 기존 현장 노트 버킷 재사용 (키 prefix 'stations/'). 별도 R2 버킷 생성 불필요.
export const STATION_PHOTO_BUCKET = R2_BUCKETS.RELOCATION_FIELD_NOTES
export const STATION_PHOTO_MAX_BYTES = 10 * 1024 * 1024
export const STATION_PHOTO_MIME_WHITELIST = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

// 국사 생성 시 기본으로 만들어지는 항목(섹션). 이름은 이후 자유 변경 가능.
export const DEFAULT_STATION_SECTIONS = [
  '상면도',
  '장비랙정보',
  'OFD랙정보',
  '추가정보',
] as const
