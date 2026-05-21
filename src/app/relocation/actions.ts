'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  runVerification,
  type VFacility,
  type VCable,
  type VCircuit,
  type VAssignment,
  type VSplice,
  type VSplitter,
  type VFacilityTask,
} from '@/lib/relocation-verify'

// 지장이설 프로젝트 CRUD — 회사 스코프 + 권한 제한 없음 (사양 § 2-6).
// 모든 회사 직원이 접근·생성·수정·삭제 가능 (RLS 가 회사 스코프 강제).

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

// 검증 빨강(오류) 건수 — '확정'·'시공중' 전환 게이트용.
async function projectRedCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
): Promise<number> {
  const [f, c, circ, a, spl, spt, ft] = await Promise.all([
    supabase
      .from('relocation_facilities')
      .select('id, closure_type, seq_no, name, closure_spec')
      .eq('project_id', projectId),
    supabase
      .from('relocation_cables')
      .select('id, from_facility_id, to_facility_id, spec, status, cable_code')
      .eq('project_id', projectId),
    supabase
      .from('relocation_circuits')
      .select('id, circuit_id, kind')
      .eq('project_id', projectId),
    supabase
      .from('relocation_core_assignments')
      .select('circuit_id, segment_idx, cable_id, is_terminal')
      .eq('project_id', projectId),
    supabase
      .from('relocation_splices')
      .select('facility_id, in_cable_id, in_core, out_cable_id, out_core')
      .eq('project_id', projectId),
    supabase
      .from('relocation_splitters')
      .select('facility_id, input_a_cable_id, input_b_cable_id')
      .eq('project_id', projectId),
    supabase
      .from('relocation_facility_tasks')
      .select('facility_id')
      .eq('project_id', projectId),
  ])
  const result = runVerification({
    facilities: (f.data ?? []) as VFacility[],
    cables: (c.data ?? []) as VCable[],
    circuits: (circ.data ?? []) as VCircuit[],
    assignments: (a.data ?? []) as VAssignment[],
    splices: (spl.data ?? []) as VSplice[],
    splitters: (spt.data ?? []) as VSplitter[],
    facilityTasks: (ft.data ?? []) as VFacilityTask[],
  })
  return result.redCount
}

type ProjectFormParsed = {
  title: string
  region: string | null
  surveyed_at: string | null // YYYY-MM-DD
  designer_id: string | null
  status: string
  notes: string | null
}

function parseProjectForm(formData: FormData): ProjectFormParsed {
  const title = String(formData.get('title') ?? '').trim()
  const region = String(formData.get('region') ?? '').trim() || null
  const surveyedRaw = String(formData.get('surveyed_at') ?? '').trim()
  const surveyed_at = /^\d{4}-\d{2}-\d{2}$/.test(surveyedRaw) ? surveyedRaw : null
  const designerRaw = String(formData.get('designer_id') ?? '').trim()
  const designer_id = designerRaw.length > 0 ? designerRaw : null
  const statusRaw = String(formData.get('status') ?? '').trim()
  const status = statusRaw.length > 0 ? statusRaw : '설계중'
  const notes = String(formData.get('notes') ?? '').trim() || null
  return { title, region, surveyed_at, designer_id, status, notes }
}

function validateProject(p: ProjectFormParsed): string | null {
  if (!p.title) return '프로젝트 제목을 입력하세요.'
  if (p.title.length > 200) return '제목은 200자 이하로 입력하세요.'
  return null
}


export async function createProject(formData: FormData) {
  const parsed = parseProjectForm(formData)
  const errMsg = validateProject(parsed)
  if (errMsg) redirect('/relocation/new?err=' + encodeURIComponent(errMsg))

  const { supabase, me } = await requireMember()

  // designer_id 가 비어있으면 본인을 설계자로 자동 설정
  const designerId = parsed.designer_id ?? me.id

  const { data: inserted, error } = await supabase
    .from('relocation_projects')
    .insert({
      ...parsed,
      designer_id: designerId,
      company_id: me.company_id,
    })
    .select('id')
    .single()

  if (error) {
    redirect('/relocation/new?err=' + encodeURIComponent('등록 실패: ' + error.message))
  }

  revalidatePath('/relocation')
  redirect(
    `/relocation/${inserted!.id}?ok=` +
      encodeURIComponent(`'${parsed.title}' 프로젝트를 생성했습니다`),
  )
}


export async function updateProject(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) redirect('/relocation?err=' + encodeURIComponent('프로젝트 id 가 없습니다'))

  const parsed = parseProjectForm(formData)
  const errMsg = validateProject(parsed)
  if (errMsg) redirect(`/relocation/${id}?err=` + encodeURIComponent(errMsg))

  const { supabase } = await requireMember()

  // 검증 오류(빨강)가 있으면 '확정'·'시공중' 으로 전환 차단 — 시공 사고 방지
  if (parsed.status === '확정' || parsed.status === '시공중') {
    const reds = await projectRedCount(supabase, id)
    if (reds > 0) {
      redirect(
        `/relocation/${id}?tab=verify&err=` +
          encodeURIComponent(
            `검증 오류 ${reds}건이 있어 '${parsed.status}' 상태로 변경할 수 없습니다. 검증 탭에서 오류를 해결한 뒤 다시 시도하세요.`,
          ),
      )
    }
  }

  const { error } = await supabase.from('relocation_projects').update(parsed).eq('id', id)
  if (error) {
    redirect(`/relocation/${id}?err=` + encodeURIComponent('수정 실패: ' + error.message))
  }

  revalidatePath('/relocation')
  revalidatePath(`/relocation/${id}`)
  redirect(`/relocation/${id}?ok=` + encodeURIComponent('프로젝트 정보를 수정했습니다'))
}


export async function deleteProject(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) redirect('/relocation?err=' + encodeURIComponent('프로젝트 id 가 없습니다'))

  const { supabase } = await requireMember()
  const { error } = await supabase.from('relocation_projects').delete().eq('id', id)
  if (error) {
    redirect(`/relocation/${id}?err=` + encodeURIComponent('삭제 실패: ' + error.message))
  }

  revalidatePath('/relocation')
  redirect('/relocation?ok=' + encodeURIComponent('프로젝트를 삭제했습니다'))
}
