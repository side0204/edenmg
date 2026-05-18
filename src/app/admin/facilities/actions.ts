'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { CABLE_SPEC_VALUES, type CableSpec } from '@/lib/connection'

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

export type FacilityType = 'station' | 'box'

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, permission, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | { id: string; company_id: string; permission: Permission; is_active: boolean }
    | null
  if (!me || !me.is_active) {
    redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  }
  if (me.permission !== 'admin') {
    redirect('/?err=' + encodeURIComponent('관리자 권한이 필요합니다'))
  }
  return { supabase, me }
}

function parseNumberOrNull(v: FormDataEntryValue | null): number | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function parseForm(formData: FormData) {
  const typeRaw = String(formData.get('facility_type') ?? '').trim()
  const facility_type: FacilityType =
    typeRaw === 'box' ? 'box' : typeRaw === 'station' ? 'station' : 'station'
  const name = String(formData.get('name') ?? '').trim()
  const code = String(formData.get('code') ?? '').trim() || null
  const specRaw = String(formData.get('spec_enum') ?? '').trim()
  const spec_enum = (CABLE_SPEC_VALUES.includes(specRaw as CableSpec)
    ? (specRaw as CableSpec)
    : null) as CableSpec | null
  const address = String(formData.get('address') ?? '').trim() || null
  const lat = parseNumberOrNull(formData.get('lat'))
  const lng = parseNumberOrNull(formData.get('lng'))
  const notes = String(formData.get('notes') ?? '').trim() || null

  return {
    facility_type,
    name,
    code,
    // 국사는 spec_enum 강제 null
    spec_enum: facility_type === 'box' ? spec_enum : null,
    address,
    lat,
    lng,
    notes,
  }
}

function validate(p: ReturnType<typeof parseForm>): string | null {
  if (!p.name) return '이름을 입력하세요.'
  if (p.name.length > 100) return '이름은 100자 이하로 입력하세요.'
  if (p.code && p.code.length > 100) return 'ID는 100자 이하로 입력하세요.'
  if (p.lat !== null && (p.lat < -90 || p.lat > 90)) return '위도(lat)는 -90~90 범위여야 합니다.'
  if (p.lng !== null && (p.lng < -180 || p.lng > 180)) return '경도(lng)는 -180~180 범위여야 합니다.'
  return null
}

export async function createFacility(formData: FormData) {
  const parsed = parseForm(formData)
  const errMsg = validate(parsed)
  if (errMsg) {
    redirect(
      `/admin/facilities/new?type=${parsed.facility_type}&err=` + encodeURIComponent(errMsg),
    )
  }

  const { supabase, me } = await requireAdmin()
  const { error } = await supabase
    .from('connection_facilities')
    .insert({ ...parsed, company_id: me.company_id })

  if (error) {
    const friendly =
      error.message.includes('unique') || error.message.includes('duplicate')
        ? '같은 ID 가 이미 등록되어 있습니다'
        : '등록 실패: ' + error.message
    redirect(
      `/admin/facilities/new?type=${parsed.facility_type}&err=` + encodeURIComponent(friendly),
    )
  }

  const label = parsed.facility_type === 'box' ? '함체' : '국사'
  revalidatePath('/admin/facilities')
  redirect(
    `/admin/facilities?type=${parsed.facility_type}&ok=` +
      encodeURIComponent(`${label} '${parsed.name}' 을 등록했습니다`),
  )
}

export async function updateFacility(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) redirect('/admin/facilities?err=' + encodeURIComponent('id 가 없습니다'))

  const parsed = parseForm(formData)
  const errMsg = validate(parsed)
  if (errMsg) redirect(`/admin/facilities/${id}?err=` + encodeURIComponent(errMsg))

  const { supabase } = await requireAdmin()
  const { error } = await supabase.from('connection_facilities').update(parsed).eq('id', id)
  if (error) {
    const friendly =
      error.message.includes('unique') || error.message.includes('duplicate')
        ? '같은 ID 가 이미 등록되어 있습니다'
        : '수정 실패: ' + error.message
    redirect(`/admin/facilities/${id}?err=` + encodeURIComponent(friendly))
  }

  revalidatePath('/admin/facilities')
  redirect(
    `/admin/facilities?type=${parsed.facility_type}&ok=` +
      encodeURIComponent('정보를 수정했습니다'),
  )
}

export async function toggleFacilityActive(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  const target = String(formData.get('target') ?? '').trim()
  if (!id) redirect('/admin/facilities?err=' + encodeURIComponent('id 가 없습니다'))

  const { supabase } = await requireAdmin()
  const { error } = await supabase
    .from('connection_facilities')
    .update({ is_active: target === 'true' })
    .eq('id', id)
  if (error) {
    redirect('/admin/facilities?err=' + encodeURIComponent('상태 변경 실패: ' + error.message))
  }

  revalidatePath('/admin/facilities')
  redirect(
    '/admin/facilities?ok=' +
      encodeURIComponent(target === 'true' ? '활성화했습니다' : '비활성화했습니다'),
  )
}
