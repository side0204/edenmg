'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { r2Upload, r2SignedUrls, r2Remove } from '@/lib/r2'
import { isFacilityPhotoCategory } from './facility-photo-shared'

// 청약 시설별 작업사진 — 마이그 0078.
//   캔버스 작업내역 popover 「작업사진 입력」 + FacilityInfoPanel 갤러리에서 사용.
//   카테고리: 전경 / 랙전경 / MOFD / 전주명판 / 접속여장판 / 케이블번호(LOT/제작사) / 기타
//   ⚠️ 'use server' 파일은 async function 만 export 가능 — 상수·타입은 facility-photo-shared.ts

const BUCKET = 'relocation-facility-photos'
const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/heic']

type Me = { id: string; company_id: string; is_active: boolean }

async function requireMember() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: '로그인이 필요합니다' }
  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as Me | null
  if (!me || !me.is_active)
    return { ok: false as const, error: '계정이 활성 상태가 아닙니다' }
  return { ok: true as const, supabase, me }
}

function buildPath(facilityId: string, ext: string): string {
  const rnd = Math.random().toString(36).slice(2, 8)
  return `${facilityId}/${Date.now()}-${rnd}.${ext}`
}

function extFromMime(mime: string, originalName?: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/heic') return 'heic'
  // fallback — original filename extension
  if (originalName) {
    const m = originalName.toLowerCase().match(/\.(png|jpg|jpeg|webp|heic)$/)
    if (m) return m[1] === 'jpeg' ? 'jpg' : m[1]
  }
  return 'jpg'
}

type UploadFacilityPhotoResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

export async function uploadFacilityPhoto(
  formData: FormData,
): Promise<UploadFacilityPhotoResult> {
  const projectId = String(formData.get('project_id') ?? '').trim()
  const facilityId = String(formData.get('facility_id') ?? '').trim()
  const categoryRaw = String(formData.get('category') ?? '').trim()
  const customLabel = String(formData.get('custom_label') ?? '').trim() || null
  const takenAtRaw = String(formData.get('taken_at') ?? '').trim() || null
  if (!projectId || !facilityId) {
    return { ok: false, error: '프로젝트·시설 id 가 없습니다' }
  }
  if (!isFacilityPhotoCategory(categoryRaw)) {
    return { ok: false, error: '카테고리를 선택하세요' }
  }
  if (categoryRaw === '기타' && (!customLabel || customLabel.length === 0)) {
    return { ok: false, error: '「기타」 는 사진 이름을 입력하세요' }
  }
  if (customLabel && customLabel.length > 100) {
    return { ok: false, error: '사진 이름은 100자 이하' }
  }
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: '사진 파일이 비어 있습니다' }
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: '사진은 10MB 이하여야 합니다' }
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return { ok: false, error: '지원 형식: PNG/JPEG/WEBP/HEIC' }
  }

  const auth = await requireMember()
  if (!auth.ok) return auth
  const { supabase, me } = auth

  // 시설 검증
  const { data: facRow } = await supabase
    .from('relocation_facilities')
    .select('id, project_id')
    .eq('id', facilityId)
    .maybeSingle()
  const fac = facRow as { id: string; project_id: string } | null
  if (!fac || fac.project_id !== projectId) {
    return { ok: false, error: '시설을 찾을 수 없습니다' }
  }

  const path = buildPath(facilityId, extFromMime(file.type, file.name))
  const body = new Uint8Array(await file.arrayBuffer())
  const up = await r2Upload(BUCKET, path, body, file.type)
  if (!up.ok) return { ok: false, error: '업로드 실패: ' + up.error }

  // taken_at 검증 (ISO 8601 datetime)
  let takenAt: string | null = null
  if (takenAtRaw) {
    const d = new Date(takenAtRaw)
    if (!isNaN(d.getTime())) takenAt = d.toISOString()
  }

  const { data: ins, error: insErr } = await supabase
    .from('relocation_facility_photos')
    .insert({
      project_id: projectId,
      facility_id: facilityId,
      category: categoryRaw,
      custom_label: customLabel,
      image_path: path,
      original_filename: file.name || null,
      taken_at: takenAt,
      uploaded_by: me.id,
    })
    .select('id')
    .maybeSingle()
  if (insErr || !ins) {
    await r2Remove(BUCKET, [path])
    return {
      ok: false,
      error: '메타 저장 실패: ' + (insErr?.message ?? '알 수 없음'),
    }
  }

  revalidatePath(`/relocation/${projectId}`)
  return { ok: true, id: (ins as { id: string }).id }
}

export async function listFacilityPhotos(facilityId: string) {
  if (!facilityId) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('relocation_facility_photos')
    .select(
      'id, category, custom_label, image_path, original_filename, taken_at, created_at, uploaded_by',
    )
    .eq('facility_id', facilityId)
    .order('created_at', { ascending: false })
  return (data ?? []) as Array<{
    id: string
    category: string
    custom_label: string | null
    image_path: string
    original_filename: string | null
    taken_at: string | null
    created_at: string
    uploaded_by: string | null
  }>
}

export async function getFacilityPhotoUrls(
  paths: string[],
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  if (paths.length === 0) return result
  const map = await r2SignedUrls(BUCKET, paths, 60 * 30)
  for (const [path, url] of map.entries()) result[path] = url
  return result
}

export async function deleteFacilityPhoto(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const photoId = String(formData.get('photo_id') ?? '').trim()
  const projectId = String(formData.get('project_id') ?? '').trim()
  if (!photoId) return { ok: false, error: '사진 id 가 없습니다' }

  const auth = await requireMember()
  if (!auth.ok) return auth

  const { supabase } = auth
  const { data: row } = await supabase
    .from('relocation_facility_photos')
    .select('id, image_path')
    .eq('id', photoId)
    .maybeSingle()
  const photo = row as { id: string; image_path: string } | null
  if (!photo) return { ok: false, error: '사진을 찾을 수 없습니다' }

  const { error: delErr } = await supabase
    .from('relocation_facility_photos')
    .delete()
    .eq('id', photoId)
  if (delErr) return { ok: false, error: '삭제 실패: ' + delErr.message }

  await r2Remove(BUCKET, [photo.image_path])

  if (projectId) revalidatePath(`/relocation/${projectId}`)
  return { ok: true }
}
