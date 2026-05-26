'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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
import {
  isRelocationCategory,
  RELOCATION_CATEGORY_SLUG,
  type RelocationCategory,
} from '@/lib/relocation'

// 청약 카테고리에 한해 허용되는 subcategory 값 (works.subcategory enum 미러)
const SUBSCRIPTION_SUBCATEGORIES = [
  '소호',
  'FTTH',
  '모바일',
  '전용회선',
  '다회선',
  '아파트',
] as const
type SubscriptionSubcategory = (typeof SUBSCRIPTION_SUBCATEGORIES)[number]
function isSubscriptionSubcategory(v: string): v is SubscriptionSubcategory {
  return (SUBSCRIPTION_SUBCATEGORIES as readonly string[]).includes(v)
}

function parseIdArray(raw: unknown): string[] {
  if (!raw) return []
  // FormData 는 JSON string 으로 전달됨 (picker hidden input)
  if (typeof raw === 'string') {
    if (raw.trim().length === 0) return []
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed
          .filter((v): v is string => typeof v === 'string')
          .map((v) => v.trim())
          .filter((v) => /^[0-9a-f-]{36}$/i.test(v))
      }
    } catch {
      return []
    }
  }
  return []
}

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
      .select('id, closure_type, seq_no, name, closure_spec, install_status')
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
  category: RelocationCategory
  region: string | null
  surveyed_at: string | null // YYYY-MM-DD
  designer_id: string | null
  status: string
  notes: string | null
  // 청약 카테고리 전용 (다른 카테고리는 모두 null 저장)
  subscription_id: string | null
  subscriber_name: string | null
  subscriber_address: string | null
  branch_contact: string | null
  branch_manager: string | null
  subscribed_at: string | null
  desired_open_at: string | null
  order_no: string | null
  order_nos: string[]
  expected_completion_at: string | null
  completion_at: string | null
  outside_workers: string | null
  splice_workers: string | null
  subcategory: SubscriptionSubcategory | null
  subcategory_major: string | null // 대분류 (마이그 0083, 청약 전용 자유 텍스트)
  outside_worker_ids: string[]
  splice_worker_ids: string[]
}

function parseDate(v: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}

function parseProjectForm(formData: FormData): ProjectFormParsed {
  const title = String(formData.get('title') ?? '').trim()
  const categoryRaw = String(formData.get('category') ?? '').trim()
  const category: RelocationCategory = isRelocationCategory(categoryRaw) ? categoryRaw : '지장이설'
  const region = String(formData.get('region') ?? '').trim() || null
  const surveyed_at = parseDate(String(formData.get('surveyed_at') ?? '').trim())
  const designerRaw = String(formData.get('designer_id') ?? '').trim()
  const designer_id = designerRaw.length > 0 ? designerRaw : null
  const statusRaw = String(formData.get('status') ?? '').trim()
  const status = statusRaw.length > 0 ? statusRaw : '설계중'
  const notes = String(formData.get('notes') ?? '').trim() || null

  // 청약 전용 — 청약 카테고리일 때만 폼에서 받음. 그 외 카테고리는 모두 null 로 저장
  const isSubscription = category === '청약'
  const pick = (key: string) =>
    isSubscription ? String(formData.get(key) ?? '').trim() || null : null
  const pickDate = (key: string) =>
    isSubscription ? parseDate(String(formData.get(key) ?? '').trim()) : null

  // 작업요청일(work_request_start/end)은 프로젝트 폼이 아니라 목록 인라인
  //   캘린더에서만 설정 — 별도 server action setProjectWorkRequestRange 가 처리.
  //   createProject/updateProject 는 이 필드를 건드리지 않음 (덮어쓰기 회피).

  return {
    title,
    category,
    region,
    surveyed_at,
    designer_id,
    status,
    notes,
    subscription_id: pick('subscription_id'),
    subscriber_name: pick('subscriber_name'),
    subscriber_address: pick('subscriber_address'),
    branch_contact: pick('branch_contact'),
    branch_manager: pick('branch_manager'),
    subscribed_at: pickDate('subscribed_at'),
    desired_open_at: pickDate('desired_open_at'),
    order_no: null, // legacy 단일 컬럼 — 아래 order_nos[0] 으로 backfill (createProject/updateProject 직전)
    order_nos: isSubscription
      ? (() => {
          // 다중 입력 — 「order_no_list」 hidden 에 JSON array string 으로 전달.
          //   비어있으면 단일 order_no 입력 폴백 (한 칸짜리 폼 호환).
          const raw = String(formData.get('order_no_list') ?? '').trim()
          if (raw) {
            try {
              const parsed = JSON.parse(raw)
              if (Array.isArray(parsed)) {
                return parsed
                  .map((v) => String(v ?? '').trim())
                  .filter((v) => v.length > 0 && v.length <= 100)
                  .slice(0, 50)
              }
            } catch {
              // ignore
            }
          }
          const single = String(formData.get('order_no') ?? '').trim()
          return single ? [single] : []
        })()
      : [],
    expected_completion_at: pickDate('expected_completion_at'),
    completion_at: pickDate('completion_at'),
    outside_workers: pick('outside_workers'),
    splice_workers: pick('splice_workers'),
    subcategory: (() => {
      if (!isSubscription) return null
      const raw = String(formData.get('subcategory') ?? '').trim()
      return isSubscriptionSubcategory(raw) ? raw : null
    })(),
    subcategory_major: isSubscription
      ? (String(formData.get('subcategory_major') ?? '').trim().slice(0, 100) || null)
      : null,
    outside_worker_ids: isSubscription ? parseIdArray(formData.get('outside_worker_ids')) : [],
    splice_worker_ids: isSubscription ? parseIdArray(formData.get('splice_worker_ids')) : [],
  }
}

function validateProject(p: ProjectFormParsed): string | null {
  if (!p.title) return '프로젝트 제목을 입력하세요.'
  if (p.title.length > 200) return '제목은 200자 이하로 입력하세요.'
  // 청약 — 작업 동기화에 subcategory 가 필요해 강제 (works.subcategory CHECK 와 정합)
  if (p.category === '청약' && !p.subcategory) {
    return '청약 분류(소호·FTTH·모바일·전용회선·다회선·아파트)를 선택하세요.'
  }
  return null
}

/**
 * 청약 프로젝트 → 작업관리(works) 자동 동기화.
 *
 *   1. 청약 프로젝트당 works row 1개 (relocation_project_id 로 1:1 연결)
 *   2. 외선/접속 작업자 배정도 work_assignments 와 동기화
 *      - outside_worker_ids → worker_type = '외선팀'
 *      - splice_worker_ids  → worker_type = '접속팀'
 *      - 양쪽 모두 회사 직원 id 만 허용 (cross-company 차단)
 *   3. 작성자에게 works 관리 권한이 없을 수 있으므로 admin client (service role) 사용
 *      — 같은 회사 직원이 만든 청약 프로젝트의 부산물이라 인가 OK
 *   4. 청약 아닐 때 / subcategory 없을 때는 skip
 */
async function syncLinkedWork(input: {
  projectId: string
  companyId: string
  designerId: string | null
  parsed: ProjectFormParsed
}): Promise<void> {
  const { projectId, companyId, designerId, parsed } = input
  if (parsed.category !== '청약' || !parsed.subcategory) return

  const admin = createAdminClient()

  // 회사 직원만 배정 가능 — RLS 우회한 admin 이라 cross-company 안전망 직접 검증
  const allIds = Array.from(
    new Set([...parsed.outside_worker_ids, ...parsed.splice_worker_ids]),
  )
  let validIds = new Set<string>()
  if (allIds.length > 0) {
    const { data: empRows } = await admin
      .from('employees')
      .select('id')
      .in('id', allIds)
      .eq('company_id', companyId)
    validIds = new Set(((empRows ?? []) as { id: string }[]).map((r) => r.id))
  }
  const outsideIds = parsed.outside_worker_ids.filter((id) => validIds.has(id))
  const spliceIds = parsed.splice_worker_ids.filter((id) => validIds.has(id))

  // works 상태 매핑: 프로젝트 상태와 동기 (간단 매핑)
  const workStatus: '예정' | '진행중' | '완료' | '취소' =
    parsed.status === '완료'
      ? '완료'
      : parsed.status === '취소'
        ? '취소'
        : parsed.status === '시공중'
          ? '진행중'
          : '예정'

  const workRow = {
    company_id: companyId,
    name: parsed.title,
    client: 'LGU+',
    address: parsed.subscriber_address,
    category: '청약' as const,
    subcategory: parsed.subcategory,
    start_date: parsed.surveyed_at,
    end_date: parsed.expected_completion_at ?? parsed.completion_at,
    status: workStatus,
    notes:
      [
        parsed.subscriber_name ? `가입자: ${parsed.subscriber_name}` : null,
        parsed.subscription_id ? `청약ID: ${parsed.subscription_id}` : null,
        parsed.order_nos.length > 0
          ? `작업번호: ${parsed.order_nos.join(', ')}`
          : parsed.order_no
            ? `공사번호: ${parsed.order_no}`
            : null,
        parsed.branch_manager
          ? `하위국: ${parsed.branch_manager}${parsed.branch_contact ? ` (${parsed.branch_contact})` : ''}`
          : null,
        parsed.notes,
      ]
        .filter(Boolean)
        .join('\n') || null,
    assignee_employee_id: designerId,
    relocation_project_id: projectId,
    worker_type: null,
    worker_type_custom: null,
  }

  // upsert by relocation_project_id (unique partial index 가 한 row 보장)
  const { data: existing } = await admin
    .from('works')
    .select('id')
    .eq('relocation_project_id', projectId)
    .maybeSingle()

  let workId: string
  if (existing) {
    workId = (existing as { id: string }).id
    await admin.from('works').update(workRow).eq('id', workId)
  } else {
    const { data: inserted } = await admin
      .from('works')
      .insert(workRow)
      .select('id')
      .single()
    workId = (inserted as { id: string }).id
  }

  // 배정 동기화 — 기존 배정 vs 신규 outsideIds ∪ spliceIds 차집합 계산
  const desired = new Map<string, '외선팀' | '접속팀'>()
  for (const id of outsideIds) desired.set(id, '외선팀')
  for (const id of spliceIds) desired.set(id, '접속팀') // 외선·접속 중복 시 접속 우선

  const { data: existingAssignsData } = await admin
    .from('work_assignments')
    .select('id, employee_id, worker_type')
    .eq('work_id', workId)
  type ExAssign = { id: string; employee_id: string; worker_type: string | null }
  const existingAssigns = (existingAssignsData ?? []) as ExAssign[]
  const existingByEmp = new Map(existingAssigns.map((a) => [a.employee_id, a]))

  // 추가/유지/타입 변경.
  // 신규 배정은 confirmed_at = null (대기). 「확정」 버튼 누르기 전엔 작업자에게 안 보임.
  const upsertRows: {
    work_id: string
    employee_id: string
    worker_type: '외선팀' | '접속팀'
    confirmed_at: null
  }[] = []
  for (const [empId, wt] of desired) {
    const cur = existingByEmp.get(empId)
    if (!cur) {
      upsertRows.push({
        work_id: workId,
        employee_id: empId,
        worker_type: wt,
        confirmed_at: null,
      })
    } else if (cur.worker_type !== wt) {
      await admin
        .from('work_assignments')
        .update({ worker_type: wt })
        .eq('id', cur.id)
    }
  }
  if (upsertRows.length > 0) {
    await admin.from('work_assignments').insert(upsertRows)
  }

  // 삭제 — desired 에 없는 기존 배정 제거
  const removeIds = existingAssigns
    .filter((a) => !desired.has(a.employee_id))
    .map((a) => a.id)
  if (removeIds.length > 0) {
    await admin.from('work_assignments').delete().in('id', removeIds)
  }
}


export async function createProject(formData: FormData) {
  const parsed = parseProjectForm(formData)
  const slug = RELOCATION_CATEGORY_SLUG[parsed.category]
  const errMsg = validateProject(parsed)
  if (errMsg) {
    redirect(`/relocation/new?cat=${slug}&err=` + encodeURIComponent(errMsg))
  }

  const { supabase, me } = await requireMember()

  // designer_id 가 비어있으면 본인을 설계자로 자동 설정
  const designerId = parsed.designer_id ?? me.id

  // legacy order_no 컬럼은 order_nos[0] 으로 동기화 (다른 화면들이 아직 단일값 보고 있을 수 있음)
  const orderNoLegacy = parsed.order_nos[0] ?? null

  const { data: inserted, error } = await supabase
    .from('relocation_projects')
    .insert({
      ...parsed,
      order_no: orderNoLegacy,
      designer_id: designerId,
      company_id: me.company_id,
    })
    .select('id')
    .single()

  if (error) {
    redirect(
      `/relocation/new?cat=${slug}&err=` + encodeURIComponent('등록 실패: ' + error.message),
    )
  }

  // 청약: 작업관리(works) 자동 동기화 — 배정 작업자에게 작업이 보이게
  try {
    await syncLinkedWork({
      projectId: inserted!.id,
      companyId: me.company_id,
      designerId,
      parsed,
    })
  } catch (e) {
    // 동기화 실패해도 프로젝트 생성 자체는 유지 — 상세 페이지에서 재시도 안내
    console.error('syncLinkedWork failed on create', e)
  }

  revalidatePath('/relocation')
  revalidatePath(`/relocation/category/${slug}`)
  revalidatePath('/works')
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

  // legacy order_no 도 동기화 (parsed.order_no 는 null 로 비워뒀음)
  const updateRow = { ...parsed, order_no: parsed.order_nos[0] ?? null }
  const { error } = await supabase.from('relocation_projects').update(updateRow).eq('id', id)
  if (error) {
    redirect(`/relocation/${id}?err=` + encodeURIComponent('수정 실패: ' + error.message))
  }

  // 업데이트 후 다시 fetch 해 designer_id·company_id 확보 (parsed 에 designer_id 만 있고 null 가능)
  const { data: refreshed } = await supabase
    .from('relocation_projects')
    .select('id, company_id, designer_id')
    .eq('id', id)
    .maybeSingle()
  if (refreshed) {
    const r = refreshed as { company_id: string; designer_id: string | null }
    try {
      await syncLinkedWork({
        projectId: id,
        companyId: r.company_id,
        designerId: r.designer_id,
        parsed,
      })
    } catch (e) {
      console.error('syncLinkedWork failed on update', e)
    }
  }

  const slug = RELOCATION_CATEGORY_SLUG[parsed.category]
  revalidatePath('/relocation')
  revalidatePath(`/relocation/category/${slug}`)
  revalidatePath(`/relocation/${id}`)
  revalidatePath('/works')
  redirect(`/relocation/${id}?ok=` + encodeURIComponent('프로젝트 정보를 수정했습니다'))
}


// ===== 작업 배정 확정/취소 =====================================
// /relocation/[id] 의 배정 작업자 옆 「확정」/「취소」 버튼.
//   - 확정: work_assignments.confirmed_at = now(). 작업자에게 작업이 보이게 됨.
//   - 취소: work_assignments 삭제 + relocation_projects.{outside|splice}_worker_ids 에서 제거.
// 권한: 회사 직원 누구나 (relocation 모듈은 권한 제한 없음 — RLS 가 회사 스코프 강제).
// admin client 사용 — work_assignments / works 권한이 없어도 같은 회사 자기 프로젝트의 부산물이라 OK.

export async function confirmWorkAssignment(formData: FormData) {
  const projectId = String(formData.get('project_id') ?? '').trim()
  const employeeId = String(formData.get('employee_id') ?? '').trim()
  if (!projectId || !employeeId) {
    return { ok: false as const, error: '잘못된 요청입니다' }
  }
  const { supabase, me } = await requireMember()

  // 회사 스코프 확인 — 이 프로젝트가 본인 회사 것인지
  const { data: proj } = await supabase
    .from('relocation_projects')
    .select('id, company_id')
    .eq('id', projectId)
    .maybeSingle()
  if (!proj || (proj as { company_id: string }).company_id !== me.company_id) {
    return { ok: false as const, error: '권한이 없습니다' }
  }

  const admin = createAdminClient()
  const { data: workRow } = await admin
    .from('works')
    .select('id')
    .eq('relocation_project_id', projectId)
    .maybeSingle()
  if (!workRow) {
    return {
      ok: false as const,
      error: '연동된 작업이 없습니다. 프로젝트를 저장하면 자동 생성됩니다.',
    }
  }
  const workId = (workRow as { id: string }).id

  const { error } = await admin
    .from('work_assignments')
    .update({ confirmed_at: new Date().toISOString() })
    .eq('work_id', workId)
    .eq('employee_id', employeeId)
    .is('confirmed_at', null)
  if (error) return { ok: false as const, error: '확정 실패: ' + error.message }

  revalidatePath(`/relocation/${projectId}`)
  revalidatePath('/works')
  return { ok: true as const }
}

export async function cancelWorkAssignment(formData: FormData) {
  const projectId = String(formData.get('project_id') ?? '').trim()
  const employeeId = String(formData.get('employee_id') ?? '').trim()
  if (!projectId || !employeeId) {
    return { ok: false as const, error: '잘못된 요청입니다' }
  }
  const { supabase, me } = await requireMember()

  // 회사 스코프 + 현재 worker_ids 조회
  const { data: proj } = await supabase
    .from('relocation_projects')
    .select('id, company_id, outside_worker_ids, splice_worker_ids')
    .eq('id', projectId)
    .maybeSingle()
  if (!proj || (proj as { company_id: string }).company_id !== me.company_id) {
    return { ok: false as const, error: '권한이 없습니다' }
  }
  type ProjRow = {
    company_id: string
    outside_worker_ids: unknown
    splice_worker_ids: unknown
  }
  const p = proj as ProjRow
  const filterOut = (raw: unknown): string[] => {
    const arr = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : []
    return arr.filter((id) => id !== employeeId)
  }
  const nextOutside = filterOut(p.outside_worker_ids)
  const nextSplice = filterOut(p.splice_worker_ids)

  // 프로젝트의 worker_ids 갱신 (relocation_projects RLS = 회사 직원 누구나)
  const { error: updErr } = await supabase
    .from('relocation_projects')
    .update({ outside_worker_ids: nextOutside, splice_worker_ids: nextSplice })
    .eq('id', projectId)
  if (updErr) return { ok: false as const, error: '취소 실패: ' + updErr.message }

  // work_assignments 도 삭제
  const admin = createAdminClient()
  const { data: workRow } = await admin
    .from('works')
    .select('id')
    .eq('relocation_project_id', projectId)
    .maybeSingle()
  if (workRow) {
    const workId = (workRow as { id: string }).id
    await admin
      .from('work_assignments')
      .delete()
      .eq('work_id', workId)
      .eq('employee_id', employeeId)
  }

  revalidatePath(`/relocation/${projectId}`)
  revalidatePath('/works')
  return { ok: true as const }
}


/**
 * 작업요청일(work_request_start/end) — 공사 목록 인라인 캘린더에서 호출 (owner 2026-05-26).
 *   start, end: 'YYYY-MM-DD' 또는 null. end 가 null 이면 단일 일자(end=start 저장).
 *   둘 다 null 이면 두 컬럼 모두 null 로 초기화.
 *   redirect 안 함 — JSON 결과 반환 (인라인 컴포넌트 UX).
 */
export async function setProjectWorkRequestRange(input: {
  project_id: string
  start: string | null
  end: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const projectId = String(input.project_id ?? '').trim()
  if (!projectId) return { ok: false, error: '프로젝트 id 가 없습니다' }
  const start = input.start && /^\d{4}-\d{2}-\d{2}$/.test(input.start) ? input.start : null
  const endRaw = input.end && /^\d{4}-\d{2}-\d{2}$/.test(input.end) ? input.end : null
  // end 없으면 단일 일자 — start 와 같은 값
  const end = endRaw ?? start
  // start 가 end 보다 늦으면 swap
  let s = start
  let e = end
  if (s && e && s > e) {
    const t = s
    s = e
    e = t
  }

  const { supabase, me } = await requireMember()

  // 회사 스코프 확인
  const { data: proj } = await supabase
    .from('relocation_projects')
    .select('id, company_id, category')
    .eq('id', projectId)
    .maybeSingle()
  if (!proj || (proj as { company_id: string }).company_id !== me.company_id) {
    return { ok: false, error: '권한이 없습니다' }
  }

  const { error } = await supabase
    .from('relocation_projects')
    .update({ work_request_start: s, work_request_end: e })
    .eq('id', projectId)
  if (error) return { ok: false, error: '저장 실패: ' + error.message }

  const cat = (proj as { category: string }).category
  if (isRelocationCategory(cat)) {
    revalidatePath(`/relocation/category/${RELOCATION_CATEGORY_SLUG[cat]}`)
  }
  return { ok: true }
}


export async function deleteProject(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) redirect('/relocation?err=' + encodeURIComponent('프로젝트 id 가 없습니다'))

  const { supabase } = await requireMember()

  // 삭제 전 카테고리 조회 — 삭제 후 같은 카테고리 목록으로 이동
  const { data: pRow } = await supabase
    .from('relocation_projects')
    .select('category')
    .eq('id', id)
    .maybeSingle()
  const cat = (pRow as { category: string } | null)?.category ?? '지장이설'
  const slug = isRelocationCategory(cat) ? RELOCATION_CATEGORY_SLUG[cat] : 'relocation'

  const { error } = await supabase.from('relocation_projects').delete().eq('id', id)
  if (error) {
    redirect(`/relocation/${id}?err=` + encodeURIComponent('삭제 실패: ' + error.message))
  }

  revalidatePath('/relocation')
  revalidatePath(`/relocation/category/${slug}`)
  redirect(
    `/relocation/category/${slug}?ok=` + encodeURIComponent('프로젝트를 삭제했습니다'),
  )
}
