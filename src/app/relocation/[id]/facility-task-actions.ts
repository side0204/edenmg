'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// 접속함체(및 작업 발생 시설)의 공종량·사용 자재 관리.
// 캔버스 우측 FacilityInfoPanel 에서 호출 — JSON 결과 반환 (redirect 안 함).
//   - 공종량: relocation_facility_tasks  (마이그 0037, facility_id+task_type_id unique)
//   - 자재  : relocation_facility_materials (마이그 0044)
// 회사 스코프는 RLS 가 강제 — 여기서는 활성 직원만 확인.

type ActionResult = { ok: true } | { ok: false; error: string }

async function requireMember(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: '로그인이 필요합니다' }

  const { data: meRow } = await supabase
    .from('employees')
    .select('is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { is_active: boolean } | null
  if (!me || !me.is_active) return { ok: false, error: '계정이 활성 상태가 아닙니다' }

  return { ok: true, supabase }
}


// ===== 공종량 (relocation_facility_tasks) =============================

/**
 * 시설에 공종+수량 추가. (facility_id, task_type_id) unique 이므로 upsert —
 * 같은 공종을 다시 추가하면 수량만 갱신된다.
 */
export async function addFacilityTask(input: {
  project_id: string
  facility_id: string
  task_type_id: string
  quantity: number
}): Promise<ActionResult> {
  if (!input.project_id || !input.facility_id) {
    return { ok: false, error: '대상이 올바르지 않습니다' }
  }
  if (!input.task_type_id) return { ok: false, error: '공종을 선택하세요' }
  const qty = Number(input.quantity)
  if (!Number.isInteger(qty) || qty < 1 || qty > 9999) {
    return { ok: false, error: '수량은 1 이상의 정수로 입력하세요' }
  }

  const auth = await requireMember()
  if (!auth.ok) return auth

  const { error } = await auth.supabase
    .from('relocation_facility_tasks')
    .upsert(
      {
        project_id: input.project_id,
        facility_id: input.facility_id,
        task_type_id: input.task_type_id,
        quantity: qty,
      },
      { onConflict: 'facility_id,task_type_id' },
    )

  if (error) return { ok: false, error: '공종 추가 실패: ' + error.message }

  revalidatePath(`/relocation/${input.project_id}`)
  return { ok: true }
}


export async function removeFacilityTask(input: {
  project_id: string
  id: string
}): Promise<ActionResult> {
  if (!input.id) return { ok: false, error: 'id 가 없습니다' }

  const auth = await requireMember()
  if (!auth.ok) return auth

  const { error } = await auth.supabase
    .from('relocation_facility_tasks')
    .delete()
    .eq('id', input.id)

  if (error) return { ok: false, error: '공종 삭제 실패: ' + error.message }

  revalidatePath(`/relocation/${input.project_id}`)
  return { ok: true }
}


// ===== 사용 자재 (relocation_facility_materials) ======================

export async function addFacilityMaterial(input: {
  project_id: string
  facility_id: string
  name: string
  spec: string | null
  unit: string
  quantity: number
}): Promise<ActionResult> {
  if (!input.project_id || !input.facility_id) {
    return { ok: false, error: '대상이 올바르지 않습니다' }
  }
  const name = (input.name ?? '').trim()
  if (!name) return { ok: false, error: '자재명을 입력하세요' }
  if (name.length > 200) return { ok: false, error: '자재명은 200자 이하로 입력하세요' }

  const spec = (input.spec ?? '').trim() || null
  if (spec && spec.length > 100) return { ok: false, error: '규격은 100자 이하로 입력하세요' }

  const unit = (input.unit ?? '').trim() || '개'
  if (unit.length > 20) return { ok: false, error: '단위는 20자 이하로 입력하세요' }

  const qty = Number(input.quantity)
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: '수량은 0 보다 큰 값으로 입력하세요' }
  }

  const auth = await requireMember()
  if (!auth.ok) return auth

  const { error } = await auth.supabase.from('relocation_facility_materials').insert({
    project_id: input.project_id,
    facility_id: input.facility_id,
    name,
    spec,
    unit,
    quantity: qty,
  })

  if (error) return { ok: false, error: '자재 추가 실패: ' + error.message }

  revalidatePath(`/relocation/${input.project_id}`)
  return { ok: true }
}


export async function removeFacilityMaterial(input: {
  project_id: string
  id: string
}): Promise<ActionResult> {
  if (!input.id) return { ok: false, error: 'id 가 없습니다' }

  const auth = await requireMember()
  if (!auth.ok) return auth

  const { error } = await auth.supabase
    .from('relocation_facility_materials')
    .delete()
    .eq('id', input.id)

  if (error) return { ok: false, error: '자재 삭제 실패: ' + error.message }

  revalidatePath(`/relocation/${input.project_id}`)
  return { ok: true }
}
