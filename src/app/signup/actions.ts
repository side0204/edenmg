'use server'

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  VEHICLE_PLATE_REQUIRED_WORK_TYPES,
  WORK_TYPE_VALUES,
} from '@/app/admin/employees/fields'

// 회원가입 → 관리자 승인 흐름.
// 1) 입력 검증 (이름·이메일·비밀번호·전화번호·직무·차량번호)
// 2) admin client 로 auth user 생성 (email_confirm=true — 이메일 확인 단계 생략하고 즉시 활성 user. 관리자 승인 이전엔 employees.is_active=false 라 RLS 가 막음)
// 3) 트리거가 employees row 생성 (is_active=false, accepted_at=null)
// 4) 가입 신청 안내 화면으로
export async function signupRequest(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const phone = String(formData.get('phone') ?? '').trim() || null
  const workTypeRaw = String(formData.get('work_type') ?? '').trim()
  const workType = (WORK_TYPE_VALUES as readonly string[]).includes(workTypeRaw)
    ? workTypeRaw
    : null
  const vehiclePlate = String(formData.get('vehicle_plate') ?? '').trim() || null

  if (!name) return redirect('/signup?err=' + encodeURIComponent('이름을 입력하세요'))
  if (!email) return redirect('/signup?err=' + encodeURIComponent('이메일을 입력하세요'))
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return redirect('/signup?err=' + encodeURIComponent('이메일 형식이 올바르지 않습니다'))
  }
  if (password.length < 8) {
    return redirect('/signup?err=' + encodeURIComponent('비밀번호는 8자 이상이어야 합니다'))
  }
  if (!workType) {
    return redirect('/signup?err=' + encodeURIComponent('직무를 선택하세요'))
  }
  if (VEHICLE_PLATE_REQUIRED_WORK_TYPES.has(workType) && !vehiclePlate) {
    return redirect(
      '/signup?err=' + encodeURIComponent(`${workType}은(는) 차량번호 입력이 필수입니다`),
    )
  }

  // 회사 1개 가정 — 회사 ID 자동 매핑.
  // 회원가입은 비로그인 상태라 anon 으로는 RLS 가 companies 를 막는다.
  // service role 로 직접 조회.
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[signup] admin client init failed', msg)
    return redirect(
      '/signup?err=' + encodeURIComponent('서버 설정 오류: ' + msg.slice(0, 200)),
    )
  }

  const { data: companyRow, error: companyErr } = await admin
    .from('companies')
    .select('id')
    .order('created_at')
    .limit(1)
    .maybeSingle()
  if (companyErr) {
    console.error('[signup] companies select error', companyErr)
    return redirect(
      '/signup?err=' + encodeURIComponent('회사 조회 실패: ' + companyErr.message),
    )
  }
  const companyId = (companyRow as { id: string } | null)?.id
  if (!companyId) {
    return redirect(
      '/signup?err=' +
        encodeURIComponent('가입 가능한 회사가 없습니다 (companies 테이블이 비어있음)'),
    )
  }

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name,
      phone: phone ?? '',
      company_id: companyId,
      work_type: workType,
      vehicle_plate: vehiclePlate ?? '',
    },
  })
  if (error) {
    const msg = error.message.toLowerCase().includes('already')
      ? '이미 가입된 이메일입니다'
      : '가입 실패: ' + error.message
    return redirect('/signup?err=' + encodeURIComponent(msg))
  }

  redirect('/signup/pending?email=' + encodeURIComponent(email))
}
