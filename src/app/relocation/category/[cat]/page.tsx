import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { ChevronLeft, Plus, Cable } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { EmptyState } from '@/components/EmptyState'
import {
  isRelocationCategorySlug,
  RELOCATION_CATEGORY_FROM_SLUG,
  RELOCATION_CATEGORY_LABEL,
  RELOCATION_CATEGORY_DESCRIPTION,
} from '@/lib/relocation'
import {
  SubscriptionProjectsTable,
  type RelocationProjectRow,
} from './SubscriptionProjectsTable'

// 공사 설계 — 카테고리별 프로젝트 목록 (테이블 게시판형).
// 권한: 회사 직원 누구나 (RLS 가 회사 스코프 강제).
//
// 카테고리별 권장 색상 (허브 카드 색과 일치):
//   청약   = emerald (계약·청약의 진행성)
//   계획   = blue (망 설계의 정적)
//   지장이설 = amber (긴급·도로공사 주의)

type CategoryTheme = {
  pageBg: string
  headerAccent: string
  iconBg: string
  iconText: string
}
const CATEGORY_THEME: Record<'청약' | '계획' | '지장이설', CategoryTheme> = {
  청약: {
    pageBg: 'bg-emerald-50/40',
    headerAccent: 'border-l-4 border-emerald-500',
    iconBg: 'bg-emerald-100',
    iconText: 'text-emerald-700',
  },
  계획: {
    pageBg: 'bg-blue-50/40',
    headerAccent: 'border-l-4 border-blue-500',
    iconBg: 'bg-blue-100',
    iconText: 'text-blue-700',
  },
  지장이설: {
    pageBg: 'bg-amber-50/40',
    headerAccent: 'border-l-4 border-amber-500',
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-700',
  },
}

type RawProjectRow = {
  id: string
  title: string
  status: string
  category: string
  subcategory: string | null
  region: string | null
  subscription_id: string | null
  order_no: string | null
  order_nos: unknown
  subscriber_name: string | null
  subscriber_address: string | null
  branch_manager: string | null
  branch_contact: string | null
  subscribed_at: string | null
  desired_open_at: string | null
  surveyed_at: string | null
  expected_completion_at: string | null
  completion_at: string | null
  outside_worker_ids: unknown
  splice_worker_ids: unknown
  designer_id: string | null
  notes: string | null
  created_at: string
}

type EmployeeMini = {
  id: string
  name: string | null
}

function safeIdArr(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string')
}

export default async function RelocationCategoryListPage({
  params,
}: {
  params: Promise<{ cat: string }>
}) {
  const { cat: catRaw } = await params
  if (!isRelocationCategorySlug(catRaw)) notFound()
  const category = RELOCATION_CATEGORY_FROM_SLUG[catRaw]
  const categoryLabel = RELOCATION_CATEGORY_LABEL[category]
  const categoryDescription = RELOCATION_CATEGORY_DESCRIPTION[category]

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, is_active, relocation_list_prefs')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as {
    id: string
    company_id: string
    is_active: boolean
    relocation_list_prefs: unknown
  } | null
  if (!me || !me.is_active) {
    redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  }

  // 사용자 컬럼 prefs (카테고리별) — 형식: { 청약: {...}, 계획: {...}, 지장이설: {...} }
  const initialPrefs = (() => {
    const raw = me.relocation_list_prefs
    if (!raw || typeof raw !== 'object') return null
    const byCat = raw as Record<string, unknown>
    const own = byCat[category]
    if (!own || typeof own !== 'object') return null
    const o = own as { order?: unknown; hidden?: unknown; widths?: unknown }
    return {
      order: Array.isArray(o.order)
        ? o.order.filter((v): v is string => typeof v === 'string')
        : [],
      hidden: Array.isArray(o.hidden)
        ? o.hidden.filter((v): v is string => typeof v === 'string')
        : [],
      widths:
        o.widths && typeof o.widths === 'object'
          ? Object.fromEntries(
              Object.entries(o.widths as Record<string, unknown>).filter(
                ([, v]) => typeof v === 'number' && isFinite(v as number),
              ) as [string, number][],
            )
          : {},
    }
  })()

  const { data: rawRows, error: listError } = await supabase
    .from('relocation_projects')
    .select(
      'id, title, status, category, subcategory, region, subscription_id, order_no, order_nos, subscriber_name, subscriber_address, branch_manager, branch_contact, subscribed_at, desired_open_at, surveyed_at, expected_completion_at, completion_at, outside_worker_ids, splice_worker_ids, designer_id, notes, created_at',
    )
    .eq('company_id', me.company_id)
    .eq('category', category)
    .order('created_at', { ascending: false })
    .limit(500)

  const projects = (rawRows ?? []) as RawProjectRow[]

  // 직원 이름 매핑 — 설계자 + 외선/접속 작업자 ID 일괄 fetch
  const empIds = new Set<string>()
  for (const p of projects) {
    if (p.designer_id) empIds.add(p.designer_id)
    for (const id of safeIdArr(p.outside_worker_ids)) empIds.add(id)
    for (const id of safeIdArr(p.splice_worker_ids)) empIds.add(id)
  }
  const nameById = new Map<string, string>()
  if (empIds.size > 0) {
    const { data: emps } = await supabase
      .from('employees')
      .select('id, name')
      .in('id', Array.from(empIds))
    for (const e of (emps ?? []) as EmployeeMini[]) {
      if (e.name) nameById.set(e.id, e.name)
    }
  }

  // 작업 배정 확정 상태 매핑 — 청약 카테고리만, project_id + employee_id 별 confirmed_at
  //   1) 청약 프로젝트의 linked works 찾기 (relocation_project_id FK)
  //   2) 그 works 의 work_assignments 가져와 confirmedAt 매핑
  const confirmedByKey = new Map<string, boolean>() // `${projectId}:${employeeId}` -> confirmed?
  if (category === '청약' && projects.length > 0) {
    const projectIds = projects.map((p) => p.id)
    const { data: workRows } = await supabase
      .from('works')
      .select('id, relocation_project_id')
      .in('relocation_project_id', projectIds)
    type WorkRow = { id: string; relocation_project_id: string }
    const works = (workRows ?? []) as WorkRow[]
    const projByWork = new Map(works.map((w) => [w.id, w.relocation_project_id]))
    if (works.length > 0) {
      const workIds = works.map((w) => w.id)
      const { data: asRows } = await supabase
        .from('work_assignments')
        .select('work_id, employee_id, confirmed_at')
        .in('work_id', workIds)
      type AsRow = {
        work_id: string
        employee_id: string
        confirmed_at: string | null
      }
      for (const a of (asRows ?? []) as AsRow[]) {
        const pid = projByWork.get(a.work_id)
        if (!pid) continue
        confirmedByKey.set(`${pid}:${a.employee_id}`, !!a.confirmed_at)
      }
    }
  }

  function workerEntries(projectId: string, ids: string[]) {
    return ids
      .map((id) => {
        const name = nameById.get(id)
        if (!name) return null
        return {
          id,
          name,
          confirmed: confirmedByKey.get(`${projectId}:${id}`) ?? false,
        }
      })
      .filter((v): v is { id: string; name: string; confirmed: boolean } => !!v)
  }

  const rows: RelocationProjectRow[] = projects.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    category: (p.category === '청약' || p.category === '계획' || p.category === '지장이설'
      ? p.category
      : '지장이설') as '청약' | '계획' | '지장이설',
    subcategory: p.subcategory,
    region: p.region,
    subscription_id: p.subscription_id,
    order_no: p.order_no,
    order_nos: Array.isArray(p.order_nos)
      ? (p.order_nos as unknown[]).filter(
          (v): v is string => typeof v === 'string',
        )
      : [],
    subscriber_name: p.subscriber_name,
    subscriber_address: p.subscriber_address,
    branch_manager: p.branch_manager,
    branch_contact: p.branch_contact,
    subscribed_at: p.subscribed_at,
    desired_open_at: p.desired_open_at,
    surveyed_at: p.surveyed_at,
    expected_completion_at: p.expected_completion_at,
    completion_at: p.completion_at,
    outside_workers: workerEntries(p.id, safeIdArr(p.outside_worker_ids)),
    splice_workers: workerEntries(p.id, safeIdArr(p.splice_worker_ids)),
    designer_name: p.designer_id ? nameById.get(p.designer_id) ?? null : null,
    notes: p.notes,
    created_at: p.created_at,
  }))

  const newProjectHref = `/relocation/new?cat=${catRaw}`
  const theme = CATEGORY_THEME[category]

  return (
    <main className={'min-h-screen p-3 sm:p-6 ' + theme.pageBg}>
      <div className="mx-auto max-w-[100rem] space-y-4 sm:space-y-5">
        <header
          className={
            'rounded-lg bg-white/70 px-4 py-3 sm:px-5 sm:py-4 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3 ' +
            theme.headerAccent
          }
        >
          <div>
            <Link
              href="/relocation"
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
            >
              <ChevronLeft className="h-4 w-4" />
              공사 설계
            </Link>
            <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">
              {categoryLabel}
            </h1>
            <p className="mt-1 text-sm text-slate-500">{categoryDescription}</p>
          </div>
          <Link
            href={newProjectHref}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            프로젝트 생성
          </Link>
        </header>

        {listError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
            목록을 불러오지 못했습니다: {listError.message}
          </p>
        )}

        {rows.length === 0 ? (
          <EmptyState
            icon={Cable}
            title="아직 등록된 프로젝트가 없습니다"
            description={`${categoryLabel} 안건을 새 프로젝트로 등록해주세요.`}
            cta={
              <Link
                href={newProjectHref}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
                프로젝트 생성
              </Link>
            }
          />
        ) : (
          <SubscriptionProjectsTable
            rows={rows}
            category={category}
            initialPrefs={initialPrefs}
            theme={{
              headerBg: {
                청약: 'bg-emerald-50',
                계획: 'bg-blue-50',
                지장이설: 'bg-amber-50',
              }[category],
              rowHover: {
                청약: 'hover:bg-emerald-50/70',
                계획: 'hover:bg-blue-50/70',
                지장이설: 'hover:bg-amber-50/70',
              }[category],
              cardBorder: {
                청약: 'border-l-2 border-l-emerald-400',
                계획: 'border-l-2 border-l-blue-400',
                지장이설: 'border-l-2 border-l-amber-400',
              }[category],
            }}
          />
        )}
      </div>
    </main>
  )
}
