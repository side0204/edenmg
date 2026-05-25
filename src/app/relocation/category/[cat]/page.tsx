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

type RawProjectRow = {
  id: string
  title: string
  status: string
  category: string
  subcategory: string | null
  region: string | null
  subscription_id: string | null
  order_no: string | null
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
    .select('id, company_id, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { id: string; company_id: string; is_active: boolean } | null
  if (!me || !me.is_active) {
    redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  }

  const { data: rawRows, error: listError } = await supabase
    .from('relocation_projects')
    .select(
      'id, title, status, category, subcategory, region, subscription_id, order_no, subscriber_name, subscriber_address, branch_manager, branch_contact, subscribed_at, desired_open_at, surveyed_at, expected_completion_at, completion_at, outside_worker_ids, splice_worker_ids, designer_id, notes, created_at',
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
    subscriber_name: p.subscriber_name,
    subscriber_address: p.subscriber_address,
    branch_manager: p.branch_manager,
    branch_contact: p.branch_contact,
    subscribed_at: p.subscribed_at,
    desired_open_at: p.desired_open_at,
    surveyed_at: p.surveyed_at,
    expected_completion_at: p.expected_completion_at,
    completion_at: p.completion_at,
    outside_worker_names: safeIdArr(p.outside_worker_ids)
      .map((id) => nameById.get(id))
      .filter((n): n is string => !!n),
    splice_worker_names: safeIdArr(p.splice_worker_ids)
      .map((id) => nameById.get(id))
      .filter((n): n is string => !!n),
    designer_name: p.designer_id ? nameById.get(p.designer_id) ?? null : null,
    notes: p.notes,
    created_at: p.created_at,
  }))

  const newProjectHref = `/relocation/new?cat=${catRaw}`

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-[100rem] space-y-5">
        <header className="space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
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
          <SubscriptionProjectsTable rows={rows} category={category} />
        )}
      </div>
    </main>
  )
}
