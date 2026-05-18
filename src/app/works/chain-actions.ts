'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { CABLE_SPEC_VALUES, type CableSpec, type PlanNodeType } from '@/lib/connection'

type Permission = 'worker' | 'foreman' | 'admin' | 'ceo'

type Me = {
  id: string
  company_id: string
  permission: Permission
  is_active: boolean
  can_manage_works: boolean
}

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, permission, is_active, can_manage_works')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as Me | null
  if (!me || !me.is_active) {
    redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  }
  return { supabase, me }
}

// chain CUD 권한: admin/ceo OR can_manage_works OR 작업의 담당자
async function ensureChainManager(
  supabase: Awaited<ReturnType<typeof createClient>>,
  me: Me,
  workId: string,
) {
  const { data: workRow } = await supabase
    .from('works')
    .select('id, company_id, assignee_employee_id')
    .eq('id', workId)
    .maybeSingle()
  const work = workRow as
    | { id: string; company_id: string; assignee_employee_id: string | null }
    | null
  if (!work || work.company_id !== me.company_id) {
    redirect('/works?err=' + encodeURIComponent('잘못된 작업입니다'))
  }
  const isAdmin = me.permission === 'admin' || me.permission === 'ceo'
  const isAssignee = work.assignee_employee_id === me.id
  if (!isAdmin && !me.can_manage_works && !isAssignee) {
    redirect(`/works/${workId}?err=` + encodeURIComponent('chain 관리 권한이 없습니다'))
  }
  return work
}

// 노드 CUD 권한: chain 관리자 OR 작업의 배정자(ad-hoc 추가)
async function ensureNodeAuthor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  me: Me,
  workId: string,
): Promise<{ isAdHoc: boolean }> {
  const { data: workRow } = await supabase
    .from('works')
    .select('id, company_id, assignee_employee_id')
    .eq('id', workId)
    .maybeSingle()
  const work = workRow as
    | { id: string; company_id: string; assignee_employee_id: string | null }
    | null
  if (!work || work.company_id !== me.company_id) {
    redirect('/works?err=' + encodeURIComponent('잘못된 작업입니다'))
  }
  const isAdmin = me.permission === 'admin' || me.permission === 'ceo'
  const isAssignee = work.assignee_employee_id === me.id
  const isManager = isAdmin || me.can_manage_works || isAssignee
  if (isManager) return { isAdHoc: false }

  // 배정자 확인 (ad-hoc 추가용)
  const { data: assigned } = await supabase
    .from('work_assignments')
    .select('id')
    .eq('work_id', workId)
    .eq('employee_id', me.id)
    .limit(1)
  if (assigned && assigned.length > 0) return { isAdHoc: true }

  redirect(`/works/${workId}?err=` + encodeURIComponent('함체 추가 권한이 없습니다'))
}

// ===== chain CRUD =======================================================

export async function createChain(formData: FormData) {
  const workId = String(formData.get('work_id') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim() || null
  const upperStationName = String(formData.get('upper_station_name') ?? '').trim()
  const lowerStationName = String(formData.get('lower_station_name') ?? '').trim()

  if (!workId) redirect('/works?err=' + encodeURIComponent('작업 id 가 없습니다'))
  if (!upperStationName) {
    redirect(`/works/${workId}/chains/new?err=` + encodeURIComponent('상위국명을 입력하세요'))
  }
  if (!lowerStationName) {
    redirect(`/works/${workId}/chains/new?err=` + encodeURIComponent('하위국명을 입력하세요'))
  }

  const { supabase, me } = await requireUser()
  await ensureChainManager(supabase, me, workId)

  // chain insert
  const { data: chain, error: chainErr } = await supabase
    .from('connection_chains')
    .insert({ work_id: workId, name })
    .select('id')
    .single()
  if (chainErr || !chain) {
    redirect(
      `/works/${workId}/chains/new?err=` +
        encodeURIComponent('chain 등록 실패: ' + (chainErr?.message ?? '')),
    )
  }

  // 상위국 + 하위국 노드 자동 생성
  const { data: upper, error: upperErr } = await supabase
    .from('connection_plan_nodes')
    .insert({
      chain_id: chain.id,
      parent_id: null,
      node_type: 'upper_station' as PlanNodeType,
      name: upperStationName,
      position: 0,
    })
    .select('id')
    .single()
  if (upperErr || !upper) {
    redirect(
      `/works/${workId}/chains/new?err=` +
        encodeURIComponent('상위국 노드 생성 실패: ' + (upperErr?.message ?? '')),
    )
  }

  // 하위국은 상위국의 직접 자식으로 일단 생성 (사용자가 함체 끼워넣기로 트리 키움)
  await supabase.from('connection_plan_nodes').insert({
    chain_id: chain.id,
    parent_id: upper.id,
    node_type: 'lower_station' as PlanNodeType,
    name: lowerStationName,
    position: 0,
  })

  revalidatePath(`/works/${workId}`)
  redirect(
    `/works/${workId}/chains/${chain.id}/edit?ok=` +
      encodeURIComponent('chain 을 등록했습니다. 사이에 함체를 추가하세요'),
  )
}

export async function updateChain(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  const workId = String(formData.get('work_id') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim() || null
  const notes = String(formData.get('notes') ?? '').trim() || null
  if (!id || !workId) redirect('/works?err=' + encodeURIComponent('chain id 가 없습니다'))

  const { supabase, me } = await requireUser()
  await ensureChainManager(supabase, me, workId)

  const { error } = await supabase
    .from('connection_chains')
    .update({ name, notes })
    .eq('id', id)
  if (error) {
    redirect(
      `/works/${workId}/chains/${id}/edit?err=` +
        encodeURIComponent('chain 수정 실패: ' + error.message),
    )
  }

  revalidatePath(`/works/${workId}`)
  redirect(`/works/${workId}/chains/${id}/edit?ok=` + encodeURIComponent('chain 을 수정했습니다'))
}

export async function deleteChain(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  const workId = String(formData.get('work_id') ?? '').trim()
  if (!id || !workId) redirect('/works?err=' + encodeURIComponent('chain id 가 없습니다'))

  const { supabase, me } = await requireUser()
  await ensureChainManager(supabase, me, workId)

  const { error } = await supabase.from('connection_chains').delete().eq('id', id)
  if (error) {
    redirect(`/works/${workId}?err=` + encodeURIComponent('chain 삭제 실패: ' + error.message))
  }

  revalidatePath(`/works/${workId}`)
  redirect(`/works/${workId}?ok=` + encodeURIComponent('chain 을 삭제했습니다'))
}

// ===== 노드 CRUD ========================================================

function parseNodeForm(formData: FormData) {
  const specEnumRaw = String(formData.get('spec_enum') ?? '').trim()
  const specEnum = (CABLE_SPEC_VALUES.includes(specEnumRaw as CableSpec)
    ? (specEnumRaw as CableSpec)
    : null) as CableSpec | null
  return {
    name: String(formData.get('name') ?? '').trim(),
    node_type: String(formData.get('node_type') ?? '').trim() as PlanNodeType,
    code: String(formData.get('code') ?? '').trim() || null,
    spec: String(formData.get('spec') ?? '').trim() || null, // legacy text
    spec_enum: specEnum,
    lat: parseNum(formData.get('lat')),
    lng: parseNum(formData.get('lng')),
    address: String(formData.get('address') ?? '').trim() || null,
    notes: String(formData.get('notes') ?? '').trim() || null,
  }
}

function parseNum(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export async function createNode(formData: FormData) {
  const workId = String(formData.get('work_id') ?? '').trim()
  const chainId = String(formData.get('chain_id') ?? '').trim()
  const parentId = String(formData.get('parent_id') ?? '').trim() || null
  const insertBetween = String(formData.get('insert_between') ?? '').trim() === '1'
  // 사이에 끼우기: parent_id 와 child_id 사이에 새 노드. child 들의 parent_id 를 새 노드로 변경.
  const targetChildId = String(formData.get('target_child_id') ?? '').trim() || null

  const p = parseNodeForm(formData)
  if (!chainId || !workId) redirect('/works?err=' + encodeURIComponent('chain id 가 없습니다'))
  if (!p.name) {
    redirect(
      `/works/${workId}/chains/${chainId}/edit?err=` + encodeURIComponent('노드 이름을 입력하세요'),
    )
  }
  if (p.node_type !== 'box' && p.node_type !== 'lower_station') {
    redirect(
      `/works/${workId}/chains/${chainId}/edit?err=` +
        encodeURIComponent('함체 또는 하위국으로 추가할 수 있습니다'),
    )
  }
  if (!parentId) {
    redirect(
      `/works/${workId}/chains/${chainId}/edit?err=` +
        encodeURIComponent('parent 노드를 지정하세요 (상위국 추가 불가)'),
    )
  }

  const { supabase, me } = await requireUser()
  const { isAdHoc } = await ensureNodeAuthor(supabase, me, workId)

  // position: 같은 parent 안에서 마지막 다음
  const { data: siblings } = await supabase
    .from('connection_plan_nodes')
    .select('position')
    .eq('chain_id', chainId)
    .eq('parent_id', parentId)
  const nextPos = (siblings ?? []).reduce(
    (max, r) => Math.max(max, ((r as { position: number }).position ?? 0) + 1),
    0,
  )

  const insertPayload: Record<string, unknown> = {
    chain_id: chainId,
    parent_id: parentId,
    node_type: p.node_type,
    name: p.name,
    code: p.code,
    spec: p.spec,
    spec_enum: p.spec_enum,
    lat: p.lat,
    lng: p.lng,
    address: p.address,
    notes: p.notes,
    position: nextPos,
  }
  if (isAdHoc) {
    insertPayload.created_by_employee_id = me.id
  }

  const { data: inserted, error } = await supabase
    .from('connection_plan_nodes')
    .insert(insertPayload)
    .select('id')
    .single()
  if (error || !inserted) {
    redirect(
      `/works/${workId}/chains/${chainId}/edit?err=` +
        encodeURIComponent('노드 추가 실패: ' + (error?.message ?? '')),
    )
  }

  // 사이에 끼우기: targetChildId 의 parent_id 를 새 노드로 변경
  if (insertBetween && targetChildId) {
    const { error: moveErr } = await supabase
      .from('connection_plan_nodes')
      .update({ parent_id: inserted.id })
      .eq('id', targetChildId)
      .eq('chain_id', chainId)
    if (moveErr) {
      redirect(
        `/works/${workId}/chains/${chainId}/edit?err=` +
          encodeURIComponent('사이 끼우기 실패: ' + moveErr.message),
      )
    }
  }

  revalidatePath(`/works/${workId}/chains/${chainId}/edit`)
  revalidatePath(`/works/${workId}`)
  redirect(
    `/works/${workId}/chains/${chainId}/edit?ok=` + encodeURIComponent(`'${p.name}' 노드를 추가했습니다`),
  )
}

export async function updateNode(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  const workId = String(formData.get('work_id') ?? '').trim()
  const chainId = String(formData.get('chain_id') ?? '').trim()
  const p = parseNodeForm(formData)
  if (!id || !workId || !chainId) {
    redirect('/works?err=' + encodeURIComponent('노드 id 가 없습니다'))
  }
  if (!p.name) {
    redirect(
      `/works/${workId}/chains/${chainId}/edit?err=` + encodeURIComponent('노드 이름을 입력하세요'),
    )
  }

  const { supabase, me } = await requireUser()
  await ensureNodeAuthor(supabase, me, workId)

  const { error } = await supabase
    .from('connection_plan_nodes')
    .update({
      name: p.name,
      code: p.code,
      spec: p.spec,
      spec_enum: p.spec_enum,
      lat: p.lat,
      lng: p.lng,
      address: p.address,
      notes: p.notes,
    })
    .eq('id', id)
  if (error) {
    redirect(
      `/works/${workId}/chains/${chainId}/edit?err=` +
        encodeURIComponent('노드 수정 실패: ' + error.message),
    )
  }

  revalidatePath(`/works/${workId}/chains/${chainId}/edit`)
  redirect(
    `/works/${workId}/chains/${chainId}/edit?ok=` + encodeURIComponent('노드를 수정했습니다'),
  )
}

export async function deleteNode(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  const workId = String(formData.get('work_id') ?? '').trim()
  const chainId = String(formData.get('chain_id') ?? '').trim()
  if (!id || !workId || !chainId) {
    redirect('/works?err=' + encodeURIComponent('노드 id 가 없습니다'))
  }

  const { supabase, me } = await requireUser()
  await ensureNodeAuthor(supabase, me, workId)

  // 상위국은 삭제 못 함 (chain root)
  const { data: nodeRow } = await supabase
    .from('connection_plan_nodes')
    .select('node_type')
    .eq('id', id)
    .maybeSingle()
  if ((nodeRow as { node_type: PlanNodeType } | null)?.node_type === 'upper_station') {
    redirect(
      `/works/${workId}/chains/${chainId}/edit?err=` +
        encodeURIComponent('상위국은 삭제할 수 없습니다 (chain 자체를 삭제하세요)'),
    )
  }

  const { error } = await supabase.from('connection_plan_nodes').delete().eq('id', id)
  if (error) {
    redirect(
      `/works/${workId}/chains/${chainId}/edit?err=` +
        encodeURIComponent('노드 삭제 실패: ' + error.message + ' (자식이 있다면 cascade 됨)'),
    )
  }

  revalidatePath(`/works/${workId}/chains/${chainId}/edit`)
  redirect(
    `/works/${workId}/chains/${chainId}/edit?ok=` + encodeURIComponent('노드를 삭제했습니다'),
  )
}
