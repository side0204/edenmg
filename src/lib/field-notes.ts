// 현장관리 (Phase A) — 노트 종류·표시 메타.
// server/client 양쪽에서 사용 (use server 파일에서는 import 가능하나 export 는 async 만 허용 — 여기는 lib 라 무관).

export const FIELD_NOTE_KIND_VALUES = ['일반', '주의', '위험'] as const
export type FieldNoteKind = (typeof FIELD_NOTE_KIND_VALUES)[number]

export function isFieldNoteKind(v: unknown): v is FieldNoteKind {
  return typeof v === 'string' && (FIELD_NOTE_KIND_VALUES as readonly string[]).includes(v)
}

// 표시 색 — 일반 slate · 주의 amber · 위험 rose. SVG 마커·배지·테두리 모두 같은 톤.
export const FIELD_NOTE_KIND_COLOR: Record<FieldNoteKind, {
  fill: string
  stroke: string
  text: string
  badgeBg: string
  badgeText: string
  badgeBorder: string
}> = {
  일반: {
    fill: '#7c3aed',
    stroke: '#5b21b6',
    text: '#f5f3ff',
    badgeBg: 'bg-violet-100',
    badgeText: 'text-violet-700',
    badgeBorder: 'border-violet-300',
  },
  주의: {
    fill: '#f59e0b',
    stroke: '#b45309',
    text: '#fffbeb',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-800',
    badgeBorder: 'border-amber-300',
  },
  위험: {
    fill: '#e11d48',
    stroke: '#9f1239',
    text: '#fff1f2',
    badgeBg: 'bg-rose-100',
    badgeText: 'text-rose-700',
    badgeBorder: 'border-rose-300',
  },
}

export const FIELD_NOTE_PHOTO_BUCKET = 'relocation-field-notes'
export const FIELD_NOTE_PHOTO_MAX_BYTES = 10 * 1024 * 1024
export const FIELD_NOTE_PHOTO_MIME_WHITELIST = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

// Haversine — 미터 단위. 모든 마커에 「내 위치까지 거리」 표시용.
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6371_000
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

// 거리 표시 — 1km 미만 m, 그 외 km.
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '—'
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(meters < 10_000 ? 2 : 1)} km`
}

// 당일 KST — 본인 삭제 가능 여부 클라이언트 판단 (서버 RLS 가 최종 결정).
export function isSameKstDate(iso: string): boolean {
  const seoul = new Date(
    new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Seoul' }),
  )
  const todaySeoul = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }),
  )
  return (
    seoul.getFullYear() === todaySeoul.getFullYear() &&
    seoul.getMonth() === todaySeoul.getMonth() &&
    seoul.getDate() === todaySeoul.getDate()
  )
}
