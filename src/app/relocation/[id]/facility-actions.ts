'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  CLOSURE_TYPE_VALUES,
  isInternalNode,
  type ClosureType,
} from '@/lib/relocation'
import type { CableSpec } from '@/lib/connection'
import { CABLE_SPEC_VALUES } from '@/lib/connection'

// 시설(facility) CRUD — 회사 스코프 + 권한 제한 없음.
// 번호 자동 부여: project × closure_type 카운터(relocation_facility_seq)에서 last_seq+1.
//   동시성: 두 요청이 같은 last_seq 를 가져갈 가능성 있지만 DB 의
//   unique(project_id, closure_type, seq_no) 가 막아준다. 충돌 시 1회 재시도.

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

function isClosureType(v: string): v is ClosureType {
  return (CLOSURE_TYPE_VALUES as readonly string[]).includes(v)
}

function isCableSpec(v: string): v is CableSpec {
  return (CABLE_SPEC_VALUES as readonly string[]).includes(v)
}

type FacilityFormParsed = {
  closure_type: ClosureType
  name: string
  install_address: string | null
  closure_spec: CableSpec | null
  parent_facility_id: string | null
  notes: string | null
  is_marked: boolean
}

function parseFacilityForm(formData: FormData): FacilityFormParsed | string {
  const closureTypeRaw = String(formData.get('closure_type') ?? '').trim()
  if (!isClosureType(closureTypeRaw)) return '시설 종류를 선택하세요.'
  const closure_type = closureTypeRaw

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return '시설 이름을 입력하세요.'
  if (name.length > 200) return '이름은 200자 이하로 입력하세요.'

  const install_address = String(formData.get('install_address') ?? '').trim() || null

  const specRaw = String(formData.get('closure_spec') ?? '').trim()
  const closure_spec = specRaw && isCableSpec(specRaw) ? specRaw : null

  const parentRaw = String(formData.get('parent_facility_id') ?? '').trim()
  const parent_facility_id = parentRaw.length > 0 ? parentRaw : null

  // 부모는 국사 내부 노드만 가질 수 있음
  if (parent_facility_id && !isInternalNode(closure_type)) {
    return '부모 시설은 MOFD·OJC·국사내장비만 가질 수 있습니다.'
  }

  const notes = String(formData.get('notes') ?? '').trim() || null
  const is_marked = formData.get('is_marked') === 'on'

  return {
    closure_type,
    name,
    install_address,
    closure_spec,
    parent_facility_id,
    notes,
    is_marked,
  }
}

/**
 * 카운터(relocation_facility_seq) 에서 다음 시설 번호를 할당.
 * 동시성: race 시 DB unique 제약이 막아준다. server action 에서 catch+retry.
 */
async function allocateNextFacilitySeq(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  closureType: ClosureType,
): Promise<number> {
  // 현재 last_seq 읽기
  const { data: row } = await supabase
    .from('relocation_facility_seq')
    .select('last_seq')
    .eq('project_id', projectId)
    .eq('closure_type', closureType)
    .maybeSingle()

  const currentSeq = (row as { last_seq: number } | null)?.last_seq ?? 0
  const nextSeq = currentSeq + 1

  // UPSERT 로 카운터 갱신 — 새 row 면 insert, 있으면 update
  const { error } = await supabase
    .from('relocation_facility_seq')
    .upsert({
      project_id: projectId,
      closure_type: closureType,
      last_seq: nextSeq,
    })
  if (error) throw new Error('번호 카운터 갱신 실패: ' + error.message)

  return nextSeq
}


export async function createFacility(formData: FormData) {
  const projectId = String(formData.get('project_id') ?? '').trim()
  if (!projectId) redirect('/relocation?err=' + encodeURIComponent('프로젝트 id 가 없습니다'))

  const parsed = parseFacilityForm(formData)
  if (typeof parsed === 'string') {
    redirect(
      `/relocation/${projectId}?tab=facilities&err=` + encodeURIComponent(parsed),
    )
  }

  const { supabase } = await requireMember()

  // 동시성 안전망: race 시 unique 충돌 → 1회 재시도
  let attempt = 0
  let lastErr: string | null = null
  while (attempt < 3) {
    attempt += 1
    try {
      const seqNo = await allocateNextFacilitySeq(supabase, projectId, parsed.closure_type)

      const { error } = await supabase.from('relocation_facilities').insert({
        project_id: projectId,
        closure_type: parsed.closure_type,
        seq_no: seqNo,
        name: parsed.name,
        install_address: parsed.install_address,
        closure_spec: parsed.closure_spec,
        parent_facility_id: parsed.parent_facility_id,
        is_marked: parsed.is_marked,
        notes: parsed.notes,
      })

      if (!error) {
        revalidatePath(`/relocation/${projectId}`)
        redirect(
          `/relocation/${projectId}?tab=facilities&ok=` +
            encodeURIComponent(`${parsed.name} 시설을 등록했습니다`),
        )
      }

      lastErr = error.message
      // unique 충돌이면 재시도
      if (
        error.message.includes('unique') ||
        error.message.includes('duplicate') ||
        error.code === '23505'
      ) {
        continue
      }
      // 그 외 에러는 즉시 중단
      break
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      // redirect() 는 throw 로 동작 — 그대로 전파
      if (msg.includes('NEXT_REDIRECT')) throw e
      lastErr = msg
      break
    }
  }

  redirect(
    `/relocation/${projectId}?tab=facilities&err=` +
      encodeURIComponent('등록 실패: ' + (lastErr ?? '알 수 없는 오류')),
  )
}


export async function updateFacility(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  const projectId = String(formData.get('project_id') ?? '').trim()
  if (!id || !projectId) {
    redirect('/relocation?err=' + encodeURIComponent('id 가 없습니다'))
  }

  const parsed = parseFacilityForm(formData)
  if (typeof parsed === 'string') {
    redirect(
      `/relocation/${projectId}?tab=facilities&err=` + encodeURIComponent(parsed),
    )
  }

  const { supabase } = await requireMember()

  // 종류는 변경 불가 (번호 prefix 가 종류 기반이라). closure_type 무시.
  const { error } = await supabase
    .from('relocation_facilities')
    .update({
      name: parsed.name,
      install_address: parsed.install_address,
      closure_spec: parsed.closure_spec,
      parent_facility_id: parsed.parent_facility_id,
      is_marked: parsed.is_marked,
      notes: parsed.notes,
    })
    .eq('id', id)

  if (error) {
    redirect(
      `/relocation/${projectId}?tab=facilities&err=` +
        encodeURIComponent('수정 실패: ' + error.message),
    )
  }

  revalidatePath(`/relocation/${projectId}`)
  redirect(
    `/relocation/${projectId}?tab=facilities&ok=` +
      encodeURIComponent('시설 정보를 수정했습니다'),
  )
}


export async function deleteFacility(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  const projectId = String(formData.get('project_id') ?? '').trim()
  if (!id || !projectId) {
    redirect('/relocation?err=' + encodeURIComponent('id 가 없습니다'))
  }

  const { supabase } = await requireMember()

  const { error } = await supabase.from('relocation_facilities').delete().eq('id', id)
  if (error) {
    // FK 위반 — 연결된 케이블 있음
    const friendly = error.message.includes('foreign key')
      ? '이 시설을 사용하는 케이블이 있어 삭제할 수 없습니다. 케이블을 먼저 제거해주세요.'
      : '삭제 실패: ' + error.message
    redirect(
      `/relocation/${projectId}?tab=facilities&err=` + encodeURIComponent(friendly),
    )
  }

  revalidatePath(`/relocation/${projectId}`)
  redirect(
    `/relocation/${projectId}?tab=facilities&ok=` +
      encodeURIComponent('시설을 삭제했습니다'),
  )
}
