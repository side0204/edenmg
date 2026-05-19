import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { ChevronLeft, Cable, Network, Layers, Calendar, AlertCircle, Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { updateProject, deleteProject } from '../actions'

// 지장이설 프로젝트 상세 — 메인 작업 화면.
// 사양 § 7: 시설·케이블·코어배정·직선도·차수·검증·내보내기 7 탭.
// 본 화면은 Phase 1 골격 — 탭 콘텐츠는 Phase 2+ 에서 채움.
//
// 모바일은 § 7-3 정책에 따라 읽기 전용으로 자동 노출 (탭 콘텐츠 단순화).

type TabId = 'facilities' | 'cables' | 'cores' | 'splice' | 'phases' | 'verify' | 'export'

const TABS: { id: TabId; label: string; icon: typeof Cable }[] = [
  { id: 'facilities', label: '시설', icon: Network },
  { id: 'cables', label: '케이블', icon: Cable },
  { id: 'cores', label: '코어배정', icon: Layers },
  { id: 'splice', label: '직선도', icon: Layers },
  { id: 'phases', label: '차수', icon: Calendar },
  { id: 'verify', label: '검증', icon: AlertCircle },
  { id: 'export', label: '내보내기', icon: Download },
]

function isTabId(v: string): v is TabId {
  return TABS.some((t) => t.id === v)
}

type ProjectRow = {
  id: string
  company_id: string
  title: string
  client: string
  region: string | null
  surveyed_at: string | null
  designer_id: string | null
  status: string
  notes: string | null
  created_at: string
  updated_at: string
}

type EmployeeMini = { id: string; name: string | null }

export default async function RelocationProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab: tabRaw } = await searchParams
  const tab: TabId = tabRaw && isTabId(tabRaw) ? tabRaw : 'facilities'

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

  const { data: pRow } = await supabase
    .from('relocation_projects')
    .select(
      'id, company_id, title, client, region, surveyed_at, designer_id, status, notes, created_at, updated_at',
    )
    .eq('id', id)
    .maybeSingle()
  const project = pRow as ProjectRow | null
  if (!project) notFound()

  let designerName: string | null = null
  if (project.designer_id) {
    const { data: e } = await supabase
      .from('employees')
      .select('id, name')
      .eq('id', project.designer_id)
      .maybeSingle()
    designerName = ((e as EmployeeMini | null)?.name) ?? null
  }

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <header>
          <Link
            href="/relocation"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
            지장이설 목록
          </Link>
          <div className="mt-1 space-y-2 sm:space-y-0 sm:flex sm:items-start sm:justify-between sm:gap-3">
            <div className="min-w-0">
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight break-keep">
                {project.title}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {project.client} · {project.region ?? '지역 미정'}
                {project.surveyed_at && ` · 답사 ${project.surveyed_at}`}
                {designerName && ` · 설계자 ${designerName}`}
              </p>
            </div>
            <span className="shrink-0 inline-flex items-center self-start rounded-full bg-slate-900 px-3 py-1 text-sm font-medium text-white">
              {project.status}
            </span>
          </div>
        </header>

        {/* 탭 바 */}
        <nav className="sticky top-0 z-10 -mx-4 sm:-mx-6 bg-slate-50/80 backdrop-blur border-b border-slate-200">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 flex overflow-x-auto gap-1 py-2">
            {TABS.map((t) => {
              const Icon = t.icon
              const active = tab === t.id
              return (
                <Link
                  key={t.id}
                  href={`/relocation/${id}?tab=${t.id}`}
                  className={
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium shrink-0 ' +
                    (active
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-200')
                  }
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </Link>
              )
            })}
          </div>
        </nav>

        {/* 탭 콘텐츠 — Phase 1 골격. 실제 내용은 후속 Phase 에서 구현. */}
        <section className="rounded-2xl bg-white shadow-sm border border-slate-200 p-6">
          <TabPlaceholder tab={tab} />
        </section>

        {/* 프로젝트 메타 편집 + 삭제 */}
        <section className="rounded-2xl bg-white shadow-sm border border-slate-200 p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 tracking-tight">프로젝트 정보</h2>

          <form action={updateProject} className="space-y-3">
            <input type="hidden" name="id" value={project.id} />

            <div>
              <label className="block text-sm font-medium text-slate-700">제목</label>
              <input
                type="text"
                name="title"
                required
                defaultValue={project.title}
                maxLength={200}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">지역</label>
                <input
                  type="text"
                  name="region"
                  defaultValue={project.region ?? ''}
                  maxLength={100}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">현장답사일</label>
                <input
                  type="date"
                  name="surveyed_at"
                  defaultValue={project.surveyed_at ?? ''}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">상태</label>
              <select
                name="status"
                defaultValue={project.status}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
              >
                <option value="설계중">설계중</option>
                <option value="검증중">검증중</option>
                <option value="확정">확정</option>
                <option value="시공중">시공중</option>
                <option value="완료">완료</option>
                <option value="취소">취소</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">비고</label>
              <textarea
                name="notes"
                rows={3}
                defaultValue={project.notes ?? ''}
                maxLength={1000}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
              />
            </div>

            <input type="hidden" name="designer_id" value={project.designer_id ?? ''} />

            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                저장
              </button>
            </div>
          </form>

          <details className="pt-3 border-t border-slate-200">
            <summary className="cursor-pointer text-sm text-rose-600 hover:underline">
              프로젝트 삭제
            </summary>
            <form action={deleteProject} className="mt-3 space-y-3">
              <input type="hidden" name="id" value={project.id} />
              <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
                ⚠ 삭제하면 시설·케이블·회선·코어배정·차수까지 모두 함께 삭제됩니다 (cascade).
                되돌릴 수 없습니다.
              </p>
              <button
                type="submit"
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
              >
                영구 삭제
              </button>
            </form>
          </details>
        </section>
      </div>
    </main>
  )
}


function TabPlaceholder({ tab }: { tab: TabId }) {
  const label = TABS.find((t) => t.id === tab)?.label ?? tab
  return (
    <div className="text-center py-12">
      <p className="text-sm text-slate-500">
        <strong className="font-semibold">{label}</strong> 탭 — Phase 2 에서 구현 예정
      </p>
      <p className="mt-2 text-xs text-slate-400">
        현재는 프로젝트 생성·정보 편집·삭제만 가능합니다.
        <br />
        설계 작업은 다음 단계에서 시설·케이블 입력 화면이 추가되면 시작할 수 있습니다.
      </p>
    </div>
  )
}
