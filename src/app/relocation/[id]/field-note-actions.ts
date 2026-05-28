'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { r2Upload, r2SignedUrls, r2Remove } from '@/lib/r2'
import {
  FIELD_NOTE_PHOTO_BUCKET,
  FIELD_NOTE_PHOTO_MAX_BYTES,
  FIELD_NOTE_PHOTO_MIME_WHITELIST,
  isFieldNoteKind,
} from '@/lib/field-notes'

// 현장관리 (Phase A) — 노트 CRUD + 사진 첨부.
//   삭제 정책: 본인+당일 KST OR admin (DB RLS 강제).
//   업로드/조회는 server action 이 RLS 검증 후 R2 호출.

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

function parseLatLng(formData: FormData): { lat: number; lng: number } | null {
  const lat = Number(formData.get('lat'))
  const lng = Number(formData.get('lng'))
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

function buildPhotoPath(noteId: string, ext: string): string {
  const rnd = Math.random().toString(36).slice(2, 8)
  return `${noteId}/${Date.now()}-${rnd}.${ext}`
}

// =====================================================================
// 노트 CRUD
// =====================================================================

export type FieldNoteCreateResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

export async function createFieldNote(
  formData: FormData,
): Promise<FieldNoteCreateResult> {
  // project_id 가 비면 최상위(/field) 독립 노트.
  const projectId = String(formData.get('project_id') ?? '').trim() || null

  const kindRaw = String(formData.get('kind') ?? '').trim()
  if (!isFieldNoteKind(kindRaw)) {
    return { ok: false, error: '종류는 일반/주의/위험 중 하나여야 합니다' }
  }

  const coords = parseLatLng(formData)
  if (!coords) return { ok: false, error: '좌표가 비어 있거나 잘못되었습니다' }

  const title = String(formData.get('title') ?? '').trim() || null
  const body = String(formData.get('body') ?? '').trim() || null
  const address = String(formData.get('address') ?? '').trim() || null

  const auth = await requireMember()
  if (isAuthError(auth)) return { ok: false, error: auth.error }
  const { supabase, me } = auth

  // 회사 스코프 — 프로젝트 노트면 프로젝트의 company, 독립 노트면 본인 company.
  let companyId = me.company_id
  if (projectId) {
    const { data: proj } = await supabase
      .from('relocation_projects')
      .select('id, company_id')
      .eq('id', projectId)
      .maybeSingle()
    const projRow = proj as { id: string; company_id: string } | null
    if (!projRow) return { ok: false, error: '프로젝트를 찾을 수 없습니다' }
    companyId = projRow.company_id
  }

  const { data: ins, error } = await supabase
    .from('relocation_field_notes')
    .insert({
      project_id: projectId,
      company_id: companyId,
      kind: kindRaw,
      title,
      body,
      lat: coords.lat,
      lng: coords.lng,
      address,
      created_by: me.id,
    })
    .select('id')
    .maybeSingle()
  if (error || !ins) {
    return { ok: false, error: '저장 실패: ' + (error?.message ?? '알 수 없음') }
  }

  if (projectId) revalidatePath(`/relocation/${projectId}`)
  revalidatePath('/field')
  return { ok: true, id: (ins as { id: string }).id }
}

// 공사 노트를 최상위 현장관리(/field)에 노출/숨김 (명시적 보내기).
export async function setFieldNoteShared(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const noteId = String(formData.get('note_id') ?? '').trim()
  const projectId = String(formData.get('project_id') ?? '').trim() || null
  const shared = String(formData.get('shared') ?? '') === 'true'
  if (!noteId) return { ok: false, error: '노트 id 가 없습니다' }

  const auth = await requireMember()
  if (isAuthError(auth)) return { ok: false, error: auth.error }
  const { supabase } = auth

  const { error } = await supabase
    .from('relocation_field_notes')
    .update({ shared_to_field: shared })
    .eq('id', noteId)
  if (error) {
    const msg = /permission|policy|denied/i.test(error.message)
      ? '권한이 없습니다 (작성자 또는 관리자만 가능)'
      : '처리 실패: ' + error.message
    return { ok: false, error: msg }
  }

  if (projectId) revalidatePath(`/relocation/${projectId}`)
  revalidatePath('/field')
  return { ok: true }
}

export async function updateFieldNote(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const noteId = String(formData.get('note_id') ?? '').trim()
  const projectId = String(formData.get('project_id') ?? '').trim() || null
  if (!noteId) {
    return { ok: false, error: '노트 id 가 비어 있습니다' }
  }
  const kindRaw = String(formData.get('kind') ?? '').trim()
  if (!isFieldNoteKind(kindRaw)) {
    return { ok: false, error: '종류는 일반/주의/위험 중 하나여야 합니다' }
  }
  const title = String(formData.get('title') ?? '').trim() || null
  const body = String(formData.get('body') ?? '').trim() || null
  const address = String(formData.get('address') ?? '').trim() || null

  // 좌표는 선택 (위치 이동도 같은 폼에서 처리)
  const latRaw = formData.get('lat')
  const lngRaw = formData.get('lng')
  const moveCoords =
    latRaw != null && lngRaw != null ? parseLatLng(formData) : null

  const auth = await requireMember()
  if (isAuthError(auth)) return { ok: false, error: auth.error }
  const { supabase } = auth

  const patch: Record<string, unknown> = {
    kind: kindRaw,
    title,
    body,
    address,
  }
  if (moveCoords) {
    patch.lat = moveCoords.lat
    patch.lng = moveCoords.lng
  }
  const { error } = await supabase
    .from('relocation_field_notes')
    .update(patch)
    .eq('id', noteId)
  if (error) return { ok: false, error: '수정 실패: ' + error.message }

  if (projectId) revalidatePath(`/relocation/${projectId}`)
  revalidatePath('/field')
  return { ok: true }
}

export async function deleteFieldNote(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const noteId = String(formData.get('note_id') ?? '').trim()
  const projectId = String(formData.get('project_id') ?? '').trim() || null
  if (!noteId) return { ok: false, error: '노트 id 가 비어 있습니다' }

  const auth = await requireMember()
  if (isAuthError(auth)) return { ok: false, error: auth.error }
  const { supabase } = auth

  // 사진 path 미리 수집 (R2 정리용)
  const { data: photoRows } = await supabase
    .from('relocation_field_note_photos')
    .select('path')
    .eq('note_id', noteId)
  const paths = ((photoRows ?? []) as { path: string }[]).map((p) => p.path)

  const { error } = await supabase
    .from('relocation_field_notes')
    .delete()
    .eq('id', noteId)
  if (error) {
    // RLS 차단(당일 아님·본인 아님) 시 친절 메시지
    const msg = /permission|policy|denied/i.test(error.message)
      ? '삭제 권한이 없습니다. 당일 본인 또는 관리자만 삭제할 수 있습니다.'
      : '삭제 실패: ' + error.message
    return { ok: false, error: msg }
  }

  if (paths.length > 0) await r2Remove(FIELD_NOTE_PHOTO_BUCKET, paths)

  if (projectId) revalidatePath(`/relocation/${projectId}`)
  revalidatePath('/field')
  return { ok: true }
}

// =====================================================================
// 사진 첨부
// =====================================================================

export type UploadPhotoResult =
  | { ok: true; id: string; path: string }
  | { ok: false; error: string }

export async function uploadFieldNotePhoto(
  formData: FormData,
): Promise<UploadPhotoResult> {
  const noteId = String(formData.get('note_id') ?? '').trim()
  const projectId = String(formData.get('project_id') ?? '').trim() || null
  if (!noteId) {
    return { ok: false, error: '노트 id 가 비어 있습니다' }
  }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: '첨부 파일이 비어 있습니다' }
  }
  if (file.size > FIELD_NOTE_PHOTO_MAX_BYTES) {
    return { ok: false, error: '사진은 10MB 이하여야 합니다' }
  }
  if (!(FIELD_NOTE_PHOTO_MIME_WHITELIST as readonly string[]).includes(file.type)) {
    return { ok: false, error: '지원하는 이미지 형식이 아닙니다' }
  }

  // 설명 (선택)
  const caption = String(formData.get('caption') ?? '').trim() || null

  // EXIF (선택)
  const takenAtRaw = String(formData.get('taken_at') ?? '').trim()
  const gpsLatRaw = formData.get('gps_lat')
  const gpsLngRaw = formData.get('gps_lng')
  const takenAt = takenAtRaw ? new Date(takenAtRaw) : null
  const gpsLat = gpsLatRaw != null && gpsLatRaw !== '' ? Number(gpsLatRaw) : null
  const gpsLng = gpsLngRaw != null && gpsLngRaw !== '' ? Number(gpsLngRaw) : null

  const auth = await requireMember()
  if (isAuthError(auth)) return { ok: false, error: auth.error }
  const { supabase, me } = auth

  // 노트 → company_id 확인 (RLS 가 한 번 더 검증)
  const { data: note } = await supabase
    .from('relocation_field_notes')
    .select('id, company_id, project_id')
    .eq('id', noteId)
    .maybeSingle()
  const noteRow = note as
    | { id: string; company_id: string; project_id: string | null }
    | null
  if (!noteRow) return { ok: false, error: '노트를 찾을 수 없습니다' }

  const path = buildPhotoPath(noteId, extFromMime(file.type))
  const body = new Uint8Array(await file.arrayBuffer())
  const up = await r2Upload(FIELD_NOTE_PHOTO_BUCKET, path, body, file.type)
  if (!up.ok) return { ok: false, error: '업로드 실패: ' + up.error }

  const { data: ins, error } = await supabase
    .from('relocation_field_note_photos')
    .insert({
      note_id: noteId,
      company_id: noteRow.company_id,
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
    await r2Remove(FIELD_NOTE_PHOTO_BUCKET, [path])
    return {
      ok: false,
      error: '메타 저장 실패: ' + (error?.message ?? '알 수 없음'),
    }
  }

  if (projectId) revalidatePath(`/relocation/${projectId}`)
  revalidatePath('/field')
  return { ok: true, id: (ins as { id: string }).id, path }
}

export async function deleteFieldNotePhoto(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const photoId = String(formData.get('photo_id') ?? '').trim()
  const projectId = String(formData.get('project_id') ?? '').trim() || null
  if (!photoId) {
    return { ok: false, error: '사진 id 가 비어 있습니다' }
  }

  const auth = await requireMember()
  if (isAuthError(auth)) return { ok: false, error: auth.error }
  const { supabase } = auth

  const { data: photoRow } = await supabase
    .from('relocation_field_note_photos')
    .select('id, path')
    .eq('id', photoId)
    .maybeSingle()
  const photo = photoRow as { id: string; path: string } | null
  if (!photo) return { ok: false, error: '사진을 찾을 수 없습니다' }

  const { error } = await supabase
    .from('relocation_field_note_photos')
    .delete()
    .eq('id', photoId)
  if (error) {
    const msg = /permission|policy|denied/i.test(error.message)
      ? '사진 삭제 권한이 없습니다 (업로더 또는 관리자만 가능)'
      : '삭제 실패: ' + error.message
    return { ok: false, error: msg }
  }

  await r2Remove(FIELD_NOTE_PHOTO_BUCKET, [photo.path])
  if (projectId) revalidatePath(`/relocation/${projectId}`)
  revalidatePath('/field')
  return { ok: true }
}

// 사진 설명(caption) 수정 — 업로더 본인 OR admin (RLS 가 한 번 더 검증)
export async function updateFieldNotePhotoCaption(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const photoId = String(formData.get('photo_id') ?? '').trim()
  const projectId = String(formData.get('project_id') ?? '').trim() || null
  const caption = String(formData.get('caption') ?? '').trim() || null
  if (!photoId) return { ok: false, error: '사진 id 가 비어 있습니다' }

  const auth = await requireMember()
  if (isAuthError(auth)) return { ok: false, error: auth.error }
  const { supabase } = auth

  const { error } = await supabase
    .from('relocation_field_note_photos')
    .update({ caption })
    .eq('id', photoId)
  if (error) {
    const msg = /permission|policy|denied/i.test(error.message)
      ? '설명 수정 권한이 없습니다 (업로더 또는 관리자만 가능)'
      : '수정 실패: ' + error.message
    return { ok: false, error: msg }
  }

  if (projectId) revalidatePath(`/relocation/${projectId}`)
  revalidatePath('/field')
  return { ok: true }
}

/**
 * 노트 사진 path → signedUrl 일괄 발급 (30분). 갤러리 렌더용.
 */
export async function getFieldNotePhotoUrls(
  paths: string[],
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  if (paths.length === 0) return result
  const map = await r2SignedUrls(FIELD_NOTE_PHOTO_BUCKET, paths, 60 * 30)
  for (const [path, url] of map.entries()) result[path] = url
  return result
}
