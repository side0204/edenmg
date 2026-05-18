'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

// 폼 → DB row 매핑. 빈 문자열은 null 로.
function parseSiteForm(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  const address = String(formData.get('address') ?? '').trim()
  const latStr = String(formData.get('lat') ?? '').trim()
  const lngStr = String(formData.get('lng') ?? '').trim()
  const radiusStr = String(formData.get('radius_m') ?? '').trim()
  const managerId = String(formData.get('manager_employee_id') ?? '').trim()
  const startDate = String(formData.get('start_date') ?? '').trim()
  const endDate = String(formData.get('end_date') ?? '').trim()
  const isActive = formData.get('is_active') === 'on'
  const notes = String(formData.get('notes') ?? '').trim()

  const lat = latStr === '' ? null : Number(latStr)
  const lng = lngStr === '' ? null : Number(lngStr)
  const radius_m = radiusStr === '' ? 500 : Number(radiusStr)

  return {
    name,
    address: address || null,
    lat,
    lng,
    radius_m,
    manager_employee_id: managerId || null,
    start_date: startDate || null,
    end_date: endDate || null,
    is_active: isActive,
    notes: notes || null,
  }
}

// 검증: 이름 필수 / 좌표 한쪽만 채우면 안 됨 / 반경 범위 / 종료 ≥ 시작
function validate(parsed: ReturnType<typeof parseSiteForm>): string | null {
  if (!parsed.name) return '현장명을 입력하세요.'
  if (parsed.name.length > 80) return '현장명은 80자 이하로 입력하세요.'

  const hasLat = parsed.lat !== null && !Number.isNaN(parsed.lat)
  const hasLng = parsed.lng !== null && !Number.isNaN(parsed.lng)
  if (hasLat !== hasLng) return '위도·경도는 둘 다 입력하거나 둘 다 비워야 합니다.'
  if (hasLat && (parsed.lat! < -90 || parsed.lat! > 90)) return '위도는 -90 ~ 90 사이여야 합니다.'
  if (hasLng && (parsed.lng! < -180 || parsed.lng! > 180)) return '경도는 -180 ~ 180 사이여야 합니다.'

  if (Number.isNaN(parsed.radius_m) || parsed.radius_m < 50 || parsed.radius_m > 5000) {
    return '반경은 50 ~ 5000 m 사이여야 합니다.'
  }

  if (parsed.start_date && parsed.end_date && parsed.end_date < parsed.start_date) {
    return '종료일은 시작일 이후여야 합니다.'
  }
  return null
}

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, permission')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; company_id: string; permission: Permission } | null

  if (!me || (me.permission !== 'admin')) {
    redirect('/admin/sites?err=' + encodeURIComponent('권한이 없습니다'))
  }
  return { supabase, me }
}

export async function createSite(formData: FormData) {
  const parsed = parseSiteForm(formData)
  const errMsg = validate(parsed)
  if (errMsg) {
    redirect('/admin/sites/new?err=' + encodeURIComponent(errMsg))
  }

  const { supabase, me } = await requireAdmin()

  const { error } = await supabase.from('sites').insert({
    ...parsed,
    company_id: me.company_id,
  })

  if (error) {
    redirect('/admin/sites/new?err=' + encodeURIComponent('등록 실패: ' + error.message))
  }

  revalidatePath('/admin/sites')
  redirect('/admin/sites?ok=' + encodeURIComponent(`${parsed.name} 현장을 등록했습니다`))
}

export async function updateSite(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) redirect('/admin/sites?err=' + encodeURIComponent('현장 id 가 없습니다'))

  const parsed = parseSiteForm(formData)
  const errMsg = validate(parsed)
  if (errMsg) {
    redirect(`/admin/sites/${id}?err=` + encodeURIComponent(errMsg))
  }

  const { supabase } = await requireAdmin()

  const { error } = await supabase.from('sites').update(parsed).eq('id', id)

  if (error) {
    redirect(`/admin/sites/${id}?err=` + encodeURIComponent('수정 실패: ' + error.message))
  }

  revalidatePath('/admin/sites')
  revalidatePath(`/admin/sites/${id}`)
  redirect('/admin/sites?ok=' + encodeURIComponent(`${parsed.name} 현장 정보를 수정했습니다`))
}
