'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

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

function parseForm(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  const spec = String(formData.get('spec') ?? '').trim() || null
  const unit = String(formData.get('unit') ?? '').trim() || null
  return { name, spec, unit }
}

function validate(p: ReturnType<typeof parseForm>): string | null {
  if (!p.name) return '자재명을 입력하세요.'
  if (p.name.length > 100) return '자재명은 100자 이하로 입력하세요.'
  if (p.spec && p.spec.length > 100) return '규격은 100자 이하로 입력하세요.'
  if (p.unit && p.unit.length > 20) return '단위는 20자 이하로 입력하세요.'
  return null
}

export async function createMaterial(formData: FormData) {
  const parsed = parseForm(formData)
  const errMsg = validate(parsed)
  if (errMsg) redirect('/admin/materials/new?err=' + encodeURIComponent(errMsg))

  const { supabase, me } = await requireAdmin()

  const { error } = await supabase
    .from('materials')
    .insert({ ...parsed, company_id: me.company_id })

  if (error) {
    const friendly = error.message.includes('unique')
      ? '같은 이름·규격 자재가 이미 있습니다'
      : '등록 실패: ' + error.message
    redirect('/admin/materials/new?err=' + encodeURIComponent(friendly))
  }

  revalidatePath('/admin/materials')
  redirect('/admin/materials?ok=' + encodeURIComponent(`${parsed.name} 자재를 등록했습니다`))
}

export async function updateMaterial(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) redirect('/admin/materials?err=' + encodeURIComponent('자재 id 가 없습니다'))

  const parsed = parseForm(formData)
  const errMsg = validate(parsed)
  if (errMsg) redirect(`/admin/materials/${id}?err=` + encodeURIComponent(errMsg))

  const { supabase } = await requireAdmin()

  const { error } = await supabase.from('materials').update(parsed).eq('id', id)
  if (error) {
    redirect(`/admin/materials/${id}?err=` + encodeURIComponent('수정 실패: ' + error.message))
  }

  revalidatePath('/admin/materials')
  redirect('/admin/materials?ok=' + encodeURIComponent('자재 정보를 수정했습니다'))
}

export async function toggleMaterialActive(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  const target = String(formData.get('target') ?? '').trim() // 'true' | 'false'
  if (!id) redirect('/admin/materials?err=' + encodeURIComponent('자재 id 가 없습니다'))

  const { supabase } = await requireAdmin()
  const { error } = await supabase
    .from('materials')
    .update({ is_active: target === 'true' })
    .eq('id', id)
  if (error) {
    redirect('/admin/materials?err=' + encodeURIComponent('상태 변경 실패: ' + error.message))
  }

  revalidatePath('/admin/materials')
  redirect(
    '/admin/materials?ok=' +
      encodeURIComponent(target === 'true' ? '자재를 활성화했습니다' : '자재를 비활성화했습니다'),
  )
}
