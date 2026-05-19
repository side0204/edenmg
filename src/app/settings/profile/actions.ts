'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// 본인 정보 수정. RLS 의 employees_update_self 가 본인 row 만 허용 + permission
// 변경 차단. 여기서는 추가로 name·phone·hire_date·vehicle_plate 만 화이트리스트.
export async function updateMyProfile(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  const phone = String(formData.get('phone') ?? '').trim() || null
  const hireDateRaw = String(formData.get('hire_date') ?? '').trim()
  const hireDate = hireDateRaw || null
  const vehiclePlateRaw = String(formData.get('vehicle_plate') ?? '').trim()
  const vehiclePlate = vehiclePlateRaw || null

  if (!name) {
    redirect('/settings/profile?err=' + encodeURIComponent('이름을 입력하세요'))
  }
  if (name.length > 30) {
    redirect('/settings/profile?err=' + encodeURIComponent('이름은 30자 이내로 입력하세요'))
  }
  if (phone && phone.length > 30) {
    redirect('/settings/profile?err=' + encodeURIComponent('휴대폰 번호가 너무 깁니다'))
  }
  if (hireDate && !/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) {
    redirect('/settings/profile?err=' + encodeURIComponent('입사일 형식이 올바르지 않습니다'))
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 접속팀이면 차량번호 필수 (admin 페이지와 동일 정책)
  const { data: meRow } = await supabase
    .from('employees')
    .select('id, work_type')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; work_type: string | null } | null
  if (!me) redirect('/?err=' + encodeURIComponent('직원 정보 없음'))

  if (me.work_type === '접속팀' && !vehiclePlate) {
    redirect(
      '/settings/profile?err=' + encodeURIComponent('접속팀은 차량번호가 필수입니다'),
    )
  }

  const { error } = await supabase
    .from('employees')
    .update({
      name,
      phone,
      hire_date: hireDate,
      vehicle_plate: vehiclePlate,
    })
    .eq('auth_user_id', user.id)

  if (error) {
    redirect(
      '/settings/profile?err=' + encodeURIComponent('저장 실패: ' + error.message),
    )
  }

  revalidatePath('/settings/profile')
  revalidatePath('/')
  revalidatePath('/admin/employees')
  revalidatePath('/admin/annual-leaves')
  revalidatePath('/my-leaves')
  redirect('/settings/profile?ok=' + encodeURIComponent('저장됐습니다'))
}
