'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  CIRCUIT_KIND_VALUES,
  CIRCUIT_STATUS_VALUES,
  type CircuitKind,
  type CircuitStatus,
} from '@/lib/relocation'

// 회선(circuit) CRUD — 회사 스코프 + 권한 제한 없음.

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

function isCircuitKind(v: string): v is CircuitKind {
  return (CIRCUIT_KIND_VALUES as readonly string[]).includes(v)
}

function isCircuitStatus(v: string): v is CircuitStatus {
  return (CIRCUIT_STATUS_VALUES as readonly string[]).includes(v)
}

type CircuitFormParsed = {
  circuit_id: string
  subscriber_name: string | null
  kind: CircuitKind
  status: CircuitStatus
  notes: string | null
}

function parseCircuitForm(formData: FormData): CircuitFormParsed | string {
  const circuit_id = String(formData.get('circuit_id') ?? '').trim()
  if (!circuit_id) return '회선번호를 입력하세요.'
  if (circuit_id.length > 100) return '회선번호는 100자 이하여야 합니다.'

  const subscriber_name = String(formData.get('subscriber_name') ?? '').trim() || null

  const kindRaw = String(formData.get('kind') ?? '').trim()
  if (!isCircuitKind(kindRaw)) return '회선 종류를 선택하세요.'

  const statusRaw = String(formData.get('status') ?? '').trim() || 'OK'
  if (!isCircuitStatus(statusRaw)) return '상태가 올바르지 않습니다.'

  const notes = String(formData.get('notes') ?? '').trim() || null

  return { circuit_id, subscriber_name, kind: kindRaw, status: statusRaw, notes }
}


export async function createCircuit(formData: FormData) {
  const projectId = String(formData.get('project_id') ?? '').trim()
  if (!projectId) redirect('/relocation?err=' + encodeURIComponent('프로젝트 id 가 없습니다'))

  const parsed = parseCircuitForm(formData)
  if (typeof parsed === 'string') {
    redirect(`/relocation/${projectId}?tab=circuits&err=` + encodeURIComponent(parsed))
  }

  const { supabase } = await requireMember()

  const { error } = await supabase.from('relocation_circuits').insert({
    project_id: projectId,
    circuit_id: parsed.circuit_id,
    subscriber_name: parsed.subscriber_name,
    kind: parsed.kind,
    status: parsed.status,
    notes: parsed.notes,
  })

  if (error) {
    const friendly =
      error.message.includes('unique') || error.message.includes('duplicate') || error.code === '23505'
        ? `같은 회선번호 '${parsed.circuit_id}' 가 이미 등록되어 있습니다`
        : '등록 실패: ' + error.message
    redirect(`/relocation/${projectId}?tab=circuits&err=` + encodeURIComponent(friendly))
  }

  revalidatePath(`/relocation/${projectId}`)
  redirect(
    `/relocation/${projectId}?tab=circuits&ok=` +
      encodeURIComponent(`회선 ${parsed.circuit_id} 를 등록했습니다`),
  )
}


export async function updateCircuit(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  const projectId = String(formData.get('project_id') ?? '').trim()
  if (!id || !projectId) redirect('/relocation?err=' + encodeURIComponent('id 가 없습니다'))

  const parsed = parseCircuitForm(formData)
  if (typeof parsed === 'string') {
    redirect(`/relocation/${projectId}?tab=circuits&err=` + encodeURIComponent(parsed))
  }

  const { supabase } = await requireMember()

  const { error } = await supabase
    .from('relocation_circuits')
    .update({
      circuit_id: parsed.circuit_id,
      subscriber_name: parsed.subscriber_name,
      kind: parsed.kind,
      status: parsed.status,
      notes: parsed.notes,
    })
    .eq('id', id)

  if (error) {
    redirect(
      `/relocation/${projectId}?tab=circuits&err=` +
        encodeURIComponent('수정 실패: ' + error.message),
    )
  }

  revalidatePath(`/relocation/${projectId}`)
  redirect(
    `/relocation/${projectId}?tab=circuits&ok=` +
      encodeURIComponent('회선 정보를 수정했습니다'),
  )
}


export async function deleteCircuit(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  const projectId = String(formData.get('project_id') ?? '').trim()
  if (!id || !projectId) redirect('/relocation?err=' + encodeURIComponent('id 가 없습니다'))

  const { supabase } = await requireMember()

  // circuit 삭제는 cascade 로 core_assignments 도 함께 삭제됨
  const { error } = await supabase.from('relocation_circuits').delete().eq('id', id)
  if (error) {
    redirect(
      `/relocation/${projectId}?tab=circuits&err=` +
        encodeURIComponent('삭제 실패: ' + error.message),
    )
  }

  revalidatePath(`/relocation/${projectId}`)
  redirect(
    `/relocation/${projectId}?tab=circuits&ok=` +
      encodeURIComponent('회선을 삭제했습니다 (관련 코어 배정도 함께 삭제됨)'),
  )
}
