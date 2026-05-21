'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// 지장이설 접속(splice) CRUD — 함체 안에서 입력 케이블 코어 ↔ 출력 케이블 코어 매핑.
//   직선도(§ 6-5)·검증 룰 U1·U2·차수 동시작업 페어링의 입력 데이터.
//   회사 스코프는 relocation_splices RLS 가 강제. redirect 안 함 — JSON 반환.

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

async function requireMember() {
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
  return { supabase, me }
}

export async function createSplice(input: {
  project_id: string
  facility_id: string
  in_cable_id: string
  in_core: number
  out_cable_id: string
  out_core: number
  is_continuous: boolean
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.project_id || !input.facility_id) {
    return { ok: false, error: '프로젝트·시설 정보가 없습니다' }
  }
  if (!input.in_cable_id || !input.out_cable_id) {
    return { ok: false, error: '입력·출력 케이블을 선택하세요' }
  }

  const inCore = Math.trunc(input.in_core)
  const outCore = Math.trunc(input.out_core)
  if (!Number.isFinite(inCore) || inCore < 1) {
    return { ok: false, error: '입력 코어 번호는 1 이상이어야 합니다' }
  }
  if (!Number.isFinite(outCore) || outCore < 1) {
    return { ok: false, error: '출력 코어 번호는 1 이상이어야 합니다' }
  }
  if (input.in_cable_id === input.out_cable_id && inCore === outCore) {
    return { ok: false, error: '같은 케이블의 같은 코어끼리는 접속할 수 없습니다' }
  }

  const { supabase } = await requireMember()

  const { error } = await supabase.from('relocation_splices').insert({
    project_id: input.project_id,
    facility_id: input.facility_id,
    in_cable_id: input.in_cable_id,
    in_core: inCore,
    out_cable_id: input.out_cable_id,
    out_core: outCore,
    is_continuous: input.is_continuous,
  })
  if (error) return { ok: false, error: '접속 등록 실패: ' + error.message }

  revalidatePath(`/relocation/${input.project_id}`)
  return { ok: true }
}

export async function deleteSplice(
  projectId: string,
  spliceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!projectId || !spliceId) return { ok: false, error: '대상이 올바르지 않습니다' }

  const { supabase } = await requireMember()

  const { error } = await supabase
    .from('relocation_splices')
    .delete()
    .eq('id', spliceId)
    .eq('project_id', projectId)
  if (error) return { ok: false, error: '삭제 실패: ' + error.message }

  revalidatePath(`/relocation/${projectId}`)
  return { ok: true }
}
