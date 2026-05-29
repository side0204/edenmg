'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { r2Upload, r2SignedUrls, r2Remove } from '@/lib/r2'
import {
  STATION_PHOTO_BUCKET,
  STATION_PHOTO_MAX_BYTES,
  STATION_PHOTO_MIME_WHITELIST,
  DEFAULT_STATION_SECTIONS,
} from '@/lib/field-stations'

// 현장관리 — 국사현황 (Phase D) CRUD + 사진 첨부.
//   권한: 같은 회사 누구나 등록·수정·사진 추가. 국사 삭제는 작성자 OR admin,
//   사진 삭제는 업로더 OR admin (DB RLS 가 최종 강제).

type Me = {
  id: string
  company_id: string
  is_active: boolean
}

type RequireMemberOk = {
  supabase: Awaited<ReturnType<typeof createClient>>
  me: Me
}

async function requireMember(): Promise<RequireMemberOk | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: '로그인이 필요합니다' }
  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as Me | null
  if (!me || !me.is_active) return { error: '계정이 활성 상태가 아닙니다' }
  return { supabase, me }
}

function isAuthError(v: RequireMemberOk | { error: string }): v is { error: string } {
  return 'error' in v
}

function parseOptionalLatLng(formData: FormData): { lat: number; lng: number } | null {
  const latRaw = formData.get('lat')
  const lngRaw = formData.get('lng')
  if (latRaw == null || lngRaw == null || latRaw === '' || lngRaw === '') return null
  const lat = Number(latRaw)
  const lng = Number(lngRaw)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

function extFromMime(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/heic') return 'heic'
  if (mime === 'image/heif') return 'heif'
  return 'png'
}

function buildPhotoPath(stationId: string, sectionId: string, ext: string): string {
  const rnd = Math.random().toString(36).slice(2, 8)
  return `stations/${stationId}/${sectionId}/${Date.now()}-${rnd}.${ext}`
}

// =====================================================================
// 국사 CRUD
// =====================================================================

export type StationCreateResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

export async function createStation(formData: FormData): Promise<StationCreateResult> {
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { ok: false, error: '국사명을 입력하세요' }
  const address = String(formData.get('address') ?? '').trim() || null
  const coords = parseOptionalLatLng(formData)

  const auth = await requireMember()
  if (isAuthError(auth)) return { ok: false, error: auth.error }
  const { supabase, me } = auth

  const { data: ins, error } = await supabase
    .from('field_stations')
    .insert({
      company_id: me.company_id,
      name,
      address,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      created_by: me.id,
    })
    .select('id')
    .maybeSingle()
  if (error || !ins) {
    return { ok: false, error: '저장 실패: ' + (error?.message ?? '알 수 없음') }
  }
  const stationId = (ins as { id: string }).id

  // 기본 항목 seed (상면도/장비랙정보/OFD랙정보/추가정보)
  const rows = DEFAULT_STATION_SECTIONS.map((label, i) => ({
    station_id: stationId,
    company_id: me.company_id,
    label,
    sort_order: i,
  }))
  await supabase.from('field_station_sections').insert(rows)

  revalidatePath('/field/stations')
  return { ok: true, id: stationId }
}

export async function updateStation(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = String(formData.get('station_id') ?? '').trim()
  if (!id) return { ok: false, error: '국사 id 가 비어 있습니다' }
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { ok: false, error: '국사명을 입력하세요' }
  const address = String(formData.get('address') ?? '').trim() || null
  const coords = parseOptionalLatLng(formData)

  const auth = await requireMember()
  if (isAuthError(auth)) return { ok: false, error: auth.error }
  const { supabase } = auth

  const { error } = await supabase
    .from('field_stations')
    .update({ name, address, lat: coords?.lat ?? null, lng: coords?.lng ?? null })
    .eq('id', id)
  if (error) return { ok: false, error: '수정 실패: ' + error.message }

  revalidatePath('/field/stations')
  return { ok: true }
}

export async function deleteStation(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = String(formData.get('station_id') ?? '').trim()
  if (!id) return { ok: false, error: '국사 id 가 비어 있습니다' }

  const auth = await requireMember()
  if (isAuthError(auth)) return { ok: false, error: auth.error }
  const { supabase } = auth

  // 사진 path 미리 수집 (R2 정리용)
  const { data: photoRows } = await supabase
    .from('field_station_photos')
    .select('path')
    .eq('station_id', id)
  const paths = ((photoRows ?? []) as { path: string }[]).map((p) => p.path)

  const { error } = await supabase.from('field_stations').delete().eq('id', id)
  if (error) {
    const msg = /permission|policy|denied/i.test(error.message)
      ? '삭제 권한이 없습니다 (작성자 또는 관리자만 가능)'
      : '삭제 실패: ' + error.message
    return { ok: false, error: msg }
  }

  if (paths.length > 0) await r2Remove(STATION_PHOTO_BUCKET, paths)

  revalidatePath('/field/stations')
  return { ok: true }
}

// =====================================================================
// 항목(섹션) CRUD
// =====================================================================

export type SectionCreateResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

export async function addStationSection(
  formData: FormData,
): Promise<SectionCreateResult> {
  const stationId = String(formData.get('station_id') ?? '').trim()
  if (!stationId) return { ok: false, error: '국사 id 가 비어 있습니다' }
  const label = String(formData.get('label') ?? '').trim() || '추가정보'

  const auth = await requireMember()
  if (isAuthError(auth)) return { ok: false, error: auth.error }
  const { supabase, me } = auth

  // 정렬 끝에 추가
  const { data: maxRow } = await supabase
    .from('field_station_sections')
    .select('sort_order')
    .eq('station_id', stationId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextOrder = ((maxRow as { sort_order: number } | null)?.sort_order ?? -1) + 1

  const { data: ins, error } = await supabase
    .from('field_station_sections')
    .insert({
      station_id: stationId,
      company_id: me.company_id,
      label,
      sort_order: nextOrder,
    })
    .select('id')
    .maybeSingle()
  if (error || !ins) {
    return { ok: false, error: '항목 추가 실패: ' + (error?.message ?? '알 수 없음') }
  }

  revalidatePath('/field/stations')
  return { ok: true, id: (ins as { id: string }).id }
}

export async function updateStationSection(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = String(formData.get('section_id') ?? '').trim()
  if (!id) return { ok: false, error: '항목 id 가 비어 있습니다' }
  const label = String(formData.get('label') ?? '').trim()
  if (!label) return { ok: false, error: '항목 이름을 입력하세요' }
  const body = String(formData.get('body') ?? '').trim() || null

  const auth = await requireMember()
  if (isAuthError(auth)) return { ok: false, error: auth.error }
  const { supabase } = auth

  const { error } = await supabase
    .from('field_station_sections')
    .update({ label, body })
    .eq('id', id)
  if (error) return { ok: false, error: '수정 실패: ' + error.message }

  revalidatePath('/field/stations')
  return { ok: true }
}

export async function deleteStationSection(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = String(formData.get('section_id') ?? '').trim()
  if (!id) return { ok: false, error: '항목 id 가 비어 있습니다' }

  const auth = await requireMember()
  if (isAuthError(auth)) return { ok: false, error: auth.error }
  const { supabase } = auth

  const { data: photoRows } = await supabase
    .from('field_station_photos')
    .select('path')
    .eq('section_id', id)
  const paths = ((photoRows ?? []) as { path: string }[]).map((p) => p.path)

  const { error } = await supabase.from('field_station_sections').delete().eq('id', id)
  if (error) {
    const msg = /permission|policy|denied/i.test(error.message)
      ? '삭제 권한이 없습니다'
      : '삭제 실패: ' + error.message
    return { ok: false, error: msg }
  }

  if (paths.length > 0) await r2Remove(STATION_PHOTO_BUCKET, paths)

  revalidatePath('/field/stations')
  return { ok: true }
}

// =====================================================================
// 사진 첨부
// =====================================================================

export type UploadPhotoResult =
  | { ok: true; id: string; path: string }
  | { ok: false; error: string }

export async function uploadStationPhoto(
  formData: FormData,
): Promise<UploadPhotoResult> {
  const sectionId = String(formData.get('section_id') ?? '').trim()
  if (!sectionId) return { ok: false, error: '항목 id 가 비어 있습니다' }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: '첨부 파일이 비어 있습니다' }
  }
  if (file.size > STATION_PHOTO_MAX_BYTES) {
    return { ok: false, error: '사진은 10MB 이하여야 합니다' }
  }
  if (!(STATION_PHOTO_MIME_WHITELIST as readonly string[]).includes(file.type)) {
    return { ok: false, error: '지원하는 이미지 형식이 아닙니다' }
  }

  const caption = String(formData.get('caption') ?? '').trim() || null

  const takenAtRaw = String(formData.get('taken_at') ?? '').trim()
  const gpsLatRaw = formData.get('gps_lat')
  const gpsLngRaw = formData.get('gps_lng')
  const takenAt = takenAtRaw ? new Date(takenAtRaw) : null
  const gpsLat = gpsLatRaw != null && gpsLatRaw !== '' ? Number(gpsLatRaw) : null
  const gpsLng = gpsLngRaw != null && gpsLngRaw !== '' ? Number(gpsLngRaw) : null

  const auth = await requireMember()
  if (isAuthError(auth)) return { ok: false, error: auth.error }
  const { supabase, me } = auth

  // 섹션 → station_id + company_id 확인 (RLS 가 한 번 더 검증)
  const { data: sec } = await supabase
    .from('field_station_sections')
    .select('id, station_id, company_id')
    .eq('id', sectionId)
    .maybeSingle()
  const secRow = sec as
    | { id: string; station_id: string; company_id: string }
    | null
  if (!secRow) return { ok: false, error: '항목을 찾을 수 없습니다' }

  const path = buildPhotoPath(secRow.station_id, sectionId, extFromMime(file.type))
  const body = new Uint8Array(await file.arrayBuffer())
  const up = await r2Upload(STATION_PHOTO_BUCKET, path, body, file.type)
  if (!up.ok) return { ok: false, error: '업로드 실패: ' + up.error }

  const { data: ins, error } = await supabase
    .from('field_station_photos')
    .insert({
      section_id: sectionId,
      station_id: secRow.station_id,
      company_id: secRow.company_id,
      path,
      caption,
      taken_at: takenAt && !Number.isNaN(takenAt.getTime()) ? takenAt.toISOString() : null,
      gps_lat: gpsLat != null && Number.isFinite(gpsLat) ? gpsLat : null,
      gps_lng: gpsLng != null && Number.isFinite(gpsLng) ? gpsLng : null,
      uploaded_by: me.id,
    })
    .select('id')
    .maybeSingle()
  if (error || !ins) {
    await r2Remove(STATION_PHOTO_BUCKET, [path])
    return { ok: false, error: '메타 저장 실패: ' + (error?.message ?? '알 수 없음') }
  }

  revalidatePath('/field/stations')
  return { ok: true, id: (ins as { id: string }).id, path }
}

export async function deleteStationPhoto(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const photoId = String(formData.get('photo_id') ?? '').trim()
  if (!photoId) return { ok: false, error: '사진 id 가 비어 있습니다' }

  const auth = await requireMember()
  if (isAuthError(auth)) return { ok: false, error: auth.error }
  const { supabase } = auth

  const { data: photoRow } = await supabase
    .from('field_station_photos')
    .select('id, path')
    .eq('id', photoId)
    .maybeSingle()
  const photo = photoRow as { id: string; path: string } | null
  if (!photo) return { ok: false, error: '사진을 찾을 수 없습니다' }

  const { error } = await supabase.from('field_station_photos').delete().eq('id', photoId)
  if (error) {
    const msg = /permission|policy|denied/i.test(error.message)
      ? '사진 삭제 권한이 없습니다 (업로더 또는 관리자만 가능)'
      : '삭제 실패: ' + error.message
    return { ok: false, error: msg }
  }

  await r2Remove(STATION_PHOTO_BUCKET, [photo.path])
  revalidatePath('/field/stations')
  return { ok: true }
}

export async function updateStationPhotoCaption(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const photoId = String(formData.get('photo_id') ?? '').trim()
  const caption = String(formData.get('caption') ?? '').trim() || null
  if (!photoId) return { ok: false, error: '사진 id 가 비어 있습니다' }

  const auth = await requireMember()
  if (isAuthError(auth)) return { ok: false, error: auth.error }
  const { supabase } = auth

  const { error } = await supabase
    .from('field_station_photos')
    .update({ caption })
    .eq('id', photoId)
  if (error) {
    const msg = /permission|policy|denied/i.test(error.message)
      ? '설명 수정 권한이 없습니다 (업로더 또는 관리자만 가능)'
      : '수정 실패: ' + error.message
    return { ok: false, error: msg }
  }

  revalidatePath('/field/stations')
  return { ok: true }
}

/** 사진 path → signedUrl 일괄 발급 (30분). 갤러리 렌더용. */
export async function getStationPhotoUrls(
  paths: string[],
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  if (paths.length === 0) return result
  const map = await r2SignedUrls(STATION_PHOTO_BUCKET, paths, 60 * 30)
  for (const [path, url] of map.entries()) result[path] = url
  return result
}
