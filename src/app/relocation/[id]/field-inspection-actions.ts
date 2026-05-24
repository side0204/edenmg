'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// 지장이설 — 시설별 실사 내용 캡처 (마이그 0061).
//   실사 모드에서 그린 그림 + 텍스트를 포함한 화면 캡처를 시설에 첨부.
//   클라이언트가 PNG Blob 을 base64 로 보내거나 FormData 의 File 로 보냄.

const BUCKET = 'relocation-field-inspections'
const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp']

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

function isAuthError(
  v: RequireMemberOk | { error: string },
): v is { error: string } {
  return 'error' in v
}

function buildPath(facilityId: string, ext: string): string {
  // 경로: {facility_id}/{timestamp}-{random}.{ext}
  const rnd = Math.random().toString(36).slice(2, 8)
  return `${facilityId}/${Date.now()}-${rnd}.${ext}`
}

function extFromMime(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  return 'png'
}

export type SaveInspectionResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

/**
 * 실사 캡처 PNG 를 시설에 첨부.
 * 클라이언트가 FormData 로 file + project_id + facility_id + note 전송.
 */
export async function saveFieldInspection(
  formData: FormData,
): Promise<SaveInspectionResult> {
  const projectId = String(formData.get('project_id') ?? '').trim()
  const facilityId = String(formData.get('facility_id') ?? '').trim()
  const note = String(formData.get('note') ?? '').trim() || null
  if (!projectId || !facilityId) {
    return { ok: false, error: '프로젝트 또는 시설 id 가 없습니다' }
  }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: '캡처 이미지가 비어 있습니다' }
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: '이미지는 10MB 이하여야 합니다' }
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return { ok: false, error: '이미지(PNG/JPEG/WEBP) 만 저장할 수 있습니다' }
  }

  const auth = await requireMember()
  if (isAuthError(auth)) return { ok: false, error: auth.error }
  const { supabase, me } = auth
  void me

  // 시설 → 같은 프로젝트인지 RLS + 명시 검증
  const { data: facRow } = await supabase
    .from('relocation_facilities')
    .select('id, project_id')
    .eq('id', facilityId)
    .maybeSingle()
  const fac = facRow as { id: string; project_id: string } | null
  if (!fac || fac.project_id !== projectId) {
    return { ok: false, error: '시설을 찾을 수 없습니다' }
  }

  const path = buildPath(facilityId, extFromMime(file.type))
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (upErr) return { ok: false, error: '업로드 실패: ' + upErr.message }

  const { data: ins, error: insErr } = await supabase
    .from('relocation_field_inspections')
    .insert({
      project_id: projectId,
      facility_id: facilityId,
      image_path: path,
      note,
      uploaded_by: me.id,
    })
    .select('id')
    .maybeSingle()
  if (insErr || !ins) {
    // 고아 파일 방지로 즉시 삭제
    await supabase.storage.from(BUCKET).remove([path])
    return { ok: false, error: '메타 저장 실패: ' + (insErr?.message ?? '알 수 없음') }
  }

  revalidatePath(`/relocation/${projectId}`)
  return { ok: true, id: (ins as { id: string }).id }
}

/**
 * 한 시설의 모든 실사 캡처 — 최신순.
 */
export async function listFieldInspections(facilityId: string) {
  if (!facilityId) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('relocation_field_inspections')
    .select('id, image_path, note, captured_at, uploaded_by')
    .eq('facility_id', facilityId)
    .order('captured_at', { ascending: false })
  return (data ?? []) as Array<{
    id: string
    image_path: string
    note: string | null
    captured_at: string
    uploaded_by: string | null
  }>
}

/**
 * 인라인 표시용 signedUrl 일괄 발급 (30분).
 */
export async function getFieldInspectionUrls(
  paths: string[],
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  if (paths.length === 0) return result
  const supabase = await createClient()
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, 60 * 30)
  if (!data) return result
  for (const item of data) {
    if (item.signedUrl && item.path) result[item.path] = item.signedUrl
  }
  return result
}

/**
 * 실사 캡처 삭제 — DB row + storage 파일.
 */
export async function deleteFieldInspection(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const inspectionId = String(formData.get('inspection_id') ?? '').trim()
  const projectId = String(formData.get('project_id') ?? '').trim()
  if (!inspectionId) return { ok: false, error: '실사 id 가 없습니다' }

  const auth = await requireMember()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase } = auth

  const { data: row } = await supabase
    .from('relocation_field_inspections')
    .select('id, image_path, project_id')
    .eq('id', inspectionId)
    .maybeSingle()
  const insp = row as { id: string; image_path: string; project_id: string } | null
  if (!insp) return { ok: false, error: '실사 캡처를 찾을 수 없습니다' }

  const { error: delErr } = await supabase
    .from('relocation_field_inspections')
    .delete()
    .eq('id', inspectionId)
  if (delErr) return { ok: false, error: '삭제 실패: ' + delErr.message }

  // Storage 정리 (실패해도 메인 흐름 진행)
  await supabase.storage.from(BUCKET).remove([insp.image_path])

  if (projectId) revalidatePath(`/relocation/${projectId}`)
  return { ok: true }
}
