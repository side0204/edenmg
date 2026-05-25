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
  | {
      ok: true
      supabase: Awaited<ReturnType<typeof createClient>>
      employeeId: string
      companyId: string
    }
  | { ok: false; error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: '로그인이 필요합니다' }

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | { id: string; company_id: string; is_active: boolean }
    | null
  if (!me || !me.is_active) return { ok: false, error: '계정이 활성 상태가 아닙니다' }

  return { ok: true, supabase, employeeId: me.id, companyId: me.company_id }
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

  // 마이그 0077 — unique 가 (facility_id, task_type_id, coalesce(order_no, '')) 로 변경.
  //   info panel 의 add 경로는 order_no 미지정 (null) — select-then-update/insert.
  const { data: existingRow } = await auth.supabase
    .from('relocation_facility_tasks')
    .select('id')
    .eq('facility_id', input.facility_id)
    .eq('task_type_id', input.task_type_id)
    .is('order_no', null)
    .maybeSingle()

  if (existingRow) {
    const { error } = await auth.supabase
      .from('relocation_facility_tasks')
      .update({ quantity: qty })
      .eq('id', (existingRow as { id: string }).id)
    if (error) return { ok: false, error: '공종 갱신 실패: ' + error.message }
  } else {
    const { error } = await auth.supabase.from('relocation_facility_tasks').insert({
      project_id: input.project_id,
      facility_id: input.facility_id,
      task_type_id: input.task_type_id,
      quantity: qty,
    })
    if (error) return { ok: false, error: '공종 추가 실패: ' + error.message }
  }

  revalidatePath(`/relocation/${input.project_id}`)
  return { ok: true }
}


/**
 * 캔버스 「작업내역입력」 popover 전용 — 공종 마스터 자동 생성 + 검증.
 *
 * 동작 (owner 2026-05-25 — 청약 도식 모드):
 *   1) task_type_id 주어지면 그대로 사용 (저장된 공종 선택).
 *   2) task_type_id 없고 (code/name 주어지면): 같은 회사 안 (company_id, code) 또는
 *      이름으로 기존 행 찾아 재사용. 없으면 새로 insert.
 *   3) 공종이 「코어접속」 인 경우: 시설(접속함체) 에 연결된 케이블 양쪽 worker 코어가
 *      모두 있는지 검증. 누락 시 출발/도착 시설명을 포함한 에러 메시지.
 */
export async function addFacilityTaskFromPopover(input: {
  project_id: string
  facility_id: string
  task_type_id: string | null
  manual_code: string | null
  manual_name: string | null
  manual_unit: string | null
  quantity: number
  order_no: string | null
}): Promise<ActionResult> {
  if (!input.project_id || !input.facility_id) {
    return { ok: false, error: '대상이 올바르지 않습니다' }
  }
  const qty = Number(input.quantity)
  if (!Number.isInteger(qty) || qty < 1 || qty > 9999) {
    return { ok: false, error: '수량은 1 이상의 정수로 입력하세요' }
  }
  const orderNo = (input.order_no ?? '').trim() || null
  if (orderNo && orderNo.length > 100) {
    return { ok: false, error: '작업번호는 100자 이하' }
  }

  const auth = await requireMember()
  if (!auth.ok) return auth
  const { supabase, companyId: meCompanyId } = auth

  // 시설 — 같은 프로젝트인지 + 종류(접속함체 여부 판정용)
  const { data: facRow } = await supabase
    .from('relocation_facilities')
    .select('id, project_id, closure_type, seq_no, name')
    .eq('id', input.facility_id)
    .maybeSingle()
  const facility = facRow as
    | {
        id: string
        project_id: string
        closure_type: string
        seq_no: number
        name: string
      }
    | null
  if (!facility || facility.project_id !== input.project_id) {
    return { ok: false, error: '시설을 찾을 수 없습니다' }
  }

  // task_type 확정 — id 우선, 그 다음 code, 그 다음 name 으로 재사용·생성
  let taskTypeId: string | null = input.task_type_id?.trim() || null
  let taskName: string | null = null
  if (!taskTypeId) {
    const code = input.manual_code?.trim() || null
    const name = input.manual_name?.trim() || ''
    const unit = input.manual_unit?.trim() || '식'
    if (!name) {
      return { ok: false, error: '공종명을 입력하거나 기존 공종을 선택하세요' }
    }
    if (name.length > 100) return { ok: false, error: '공종명은 100자 이하' }
    if (code && code.length > 50) return { ok: false, error: '공종코드는 50자 이하' }

    // 1) 코드로 기존 행 찾기
    if (code) {
      const { data: byCode } = await supabase
        .from('relocation_task_type_master')
        .select('id, name')
        .eq('company_id', meCompanyId)
        .eq('code', code)
        .maybeSingle()
      if (byCode) {
        taskTypeId = (byCode as { id: string }).id
        taskName = (byCode as { name: string }).name
      }
    }
    // 2) 코드로 못 찾으면 이름으로
    if (!taskTypeId) {
      const { data: byName } = await supabase
        .from('relocation_task_type_master')
        .select('id, name')
        .eq('company_id', meCompanyId)
        .eq('name', name)
        .maybeSingle()
      if (byName) {
        taskTypeId = (byName as { id: string }).id
        taskName = (byName as { name: string }).name
      }
    }
    // 3) 그래도 없으면 새로 생성
    if (!taskTypeId) {
      const { data: created, error: cErr } = await supabase
        .from('relocation_task_type_master')
        .insert({
          company_id: meCompanyId,
          name,
          code,
          unit_label: unit,
          standard_minutes_per_unit: 0,
          is_active: true,
          position: 0,
        })
        .select('id, name')
        .single()
      if (cErr || !created) {
        return {
          ok: false,
          error: '공종 마스터 생성 실패: ' + (cErr?.message ?? '알 수 없음'),
        }
      }
      taskTypeId = (created as { id: string }).id
      taskName = (created as { name: string }).name
    }
  } else {
    // 선택된 task type 의 이름 가져오기 (코어접속 판정용)
    const { data: ttRow } = await supabase
      .from('relocation_task_type_master')
      .select('name')
      .eq('id', taskTypeId)
      .maybeSingle()
    taskName = (ttRow as { name: string } | null)?.name ?? null
  }

  if (!taskTypeId) return { ok: false, error: '공종 결정 실패' }

  // 코어접속 검증 — 시설에 연결된 케이블 모두 worker 코어가 있어야 함
  if (taskName && taskName.includes('코어접속')) {
    const { data: cableRows } = await supabase
      .from('relocation_cables')
      .select('id, from_facility_id, to_facility_id')
      .eq('project_id', input.project_id)
      .or(
        `from_facility_id.eq.${input.facility_id},to_facility_id.eq.${input.facility_id}`,
      )
    const cables = (cableRows ?? []) as {
      id: string
      from_facility_id: string
      to_facility_id: string
    }[]
    if (cables.length === 0) {
      return {
        ok: false,
        error: '이 시설에 연결된 케이블이 없습니다. 코어접속을 적용할 수 없습니다.',
      }
    }
    // 케이블별 worker 코어 확인
    const cableIds = cables.map((c) => c.id)
    const { data: assignRows } = await supabase
      .from('relocation_core_assignments')
      .select('cable_id')
      .eq('project_id', input.project_id)
      .in('cable_id', cableIds)
      .eq('entered_role', 'worker')
      .eq('lifecycle', 'new')
    const hasWorkerCore = new Set(
      ((assignRows ?? []) as { cable_id: string }[]).map((a) => a.cable_id),
    )
    const missing = cables.filter((c) => !hasWorkerCore.has(c.id))
    if (missing.length > 0) {
      // 다른 끝 시설명 조회
      const otherIds = new Set<string>()
      for (const c of missing) {
        otherIds.add(c.from_facility_id)
        otherIds.add(c.to_facility_id)
      }
      otherIds.delete(input.facility_id)
      const { data: facRows } = await supabase
        .from('relocation_facilities')
        .select('id, name')
        .in('id', Array.from(otherIds))
      const nameById = new Map(
        ((facRows ?? []) as { id: string; name: string }[]).map((f) => [f.id, f.name]),
      )
      const startName = facility.name
      const ends = missing
        .map((c) => {
          const otherId =
            c.from_facility_id === input.facility_id
              ? c.to_facility_id
              : c.from_facility_id
          return nameById.get(otherId) ?? '(미상)'
        })
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(', ')
      return {
        ok: false,
        error: `출발접속함체(${startName})~도착접속함체(${ends})의 선번입력을 확인 후 다시 확정하세요`,
      }
    }
  }

  // facility_task — (facility_id, task_type_id, coalesce(order_no, '')) unique
  //   (마이그 0077). 같은 시설·공종이라도 작업번호 다르면 별도 행.
  //   coalesce 가 들어가 onConflict 컬럼 타깃이 안 통하므로 select-then-update/insert.
  const existingQ = supabase
    .from('relocation_facility_tasks')
    .select('id')
    .eq('facility_id', input.facility_id)
    .eq('task_type_id', taskTypeId)
  const { data: existingRow } = await (orderNo
    ? existingQ.eq('order_no', orderNo)
    : existingQ.is('order_no', null)
  ).maybeSingle()

  if (existingRow) {
    const { error } = await supabase
      .from('relocation_facility_tasks')
      .update({ quantity: qty })
      .eq('id', (existingRow as { id: string }).id)
    if (error) return { ok: false, error: '작업내역 갱신 실패: ' + error.message }
  } else {
    const { error } = await supabase.from('relocation_facility_tasks').insert({
      project_id: input.project_id,
      facility_id: input.facility_id,
      task_type_id: taskTypeId,
      quantity: qty,
      order_no: orderNo,
    })
    if (error) return { ok: false, error: '작업내역 저장 실패: ' + error.message }
  }

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
