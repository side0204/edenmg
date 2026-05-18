'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { CABLE_SPEC_VALUES, type CableSpec } from '@/lib/connection'

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
  const code = String(formData.get('code') ?? '').trim()
  const specRaw = String(formData.get('spec_enum') ?? '').trim()
  const spec_enum = (CABLE_SPEC_VALUES.includes(specRaw as CableSpec)
    ? (specRaw as CableSpec)
    : null) as CableSpec | null
  const notes = String(formData.get('notes') ?? '').trim() || null
  return { code, spec_enum, notes }
}

function validate(p: ReturnType<typeof parseForm>): string | null {
  if (!p.code) return '케이블ID를 입력하세요.'
  if (p.code.length > 100) return '케이블ID는 100자 이하로 입력하세요.'
  return null
}

export async function createCable(formData: FormData) {
  const parsed = parseForm(formData)
  const errMsg = validate(parsed)
  if (errMsg) redirect('/admin/cables/new?err=' + encodeURIComponent(errMsg))

  const { supabase, me } = await requireAdmin()

  const { error } = await supabase
    .from('cables')
    .insert({ ...parsed, company_id: me.company_id })

  if (error) {
    const friendly = error.message.includes('unique') || error.message.includes('duplicate')
      ? '같은 케이블ID 가 이미 등록되어 있습니다'
      : '등록 실패: ' + error.message
    redirect('/admin/cables/new?err=' + encodeURIComponent(friendly))
  }

  revalidatePath('/admin/cables')
  redirect('/admin/cables?ok=' + encodeURIComponent(`${parsed.code} 케이블을 등록했습니다`))
}

export async function updateCable(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) redirect('/admin/cables?err=' + encodeURIComponent('케이블 id 가 없습니다'))

  const parsed = parseForm(formData)
  const errMsg = validate(parsed)
  if (errMsg) redirect(`/admin/cables/${id}?err=` + encodeURIComponent(errMsg))

  const { supabase } = await requireAdmin()

  const { error } = await supabase.from('cables').update(parsed).eq('id', id)
  if (error) {
    redirect(`/admin/cables/${id}?err=` + encodeURIComponent('수정 실패: ' + error.message))
  }

  revalidatePath('/admin/cables')
  redirect('/admin/cables?ok=' + encodeURIComponent('케이블 정보를 수정했습니다'))
}

export async function toggleCableActive(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  const target = String(formData.get('target') ?? '').trim()
  if (!id) redirect('/admin/cables?err=' + encodeURIComponent('케이블 id 가 없습니다'))

  const { supabase } = await requireAdmin()
  const { error } = await supabase
    .from('cables')
    .update({ is_active: target === 'true' })
    .eq('id', id)
  if (error) {
    redirect('/admin/cables?err=' + encodeURIComponent('상태 변경 실패: ' + error.message))
  }

  revalidatePath('/admin/cables')
  redirect(
    '/admin/cables?ok=' +
      encodeURIComponent(target === 'true' ? '케이블을 활성화했습니다' : '케이블을 비활성화했습니다'),
  )
}
