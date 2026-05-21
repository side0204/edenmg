import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, Plus, Cable } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { EmptyState } from '@/components/EmptyState'

// 지장이설 프로젝트 목록
// 권한: 회사 직원 누구나 (RLS 가 회사 스코프 강제).
// 본 모듈은 데스크톱 우선 — 모바일은 읽기만 자동 허용.

type ProjectRow = {
  id: string
  title: string
  client: string
  region: string | null
  surveyed_at: string | null
  status: string
  notes: string | null
  designer_id: string | null
  created_at: string
}

type EmployeeMini = {
  id: string
  name: string | null
}

export default async function RelocationListPage() {
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

  const { data: rows, error: listError } = await supabase
    .from('relocation_projects')
    .select('id, title, client, region, surveyed_at, status, notes, designer_id, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  const projects = (rows ?? []) as ProjectRow[]

  // 설계자 이름 매핑 — 한 번에 fetch
  const designerIds = Array.from(
    new Set(projects.map((p) => p.designer_id).filter((v): v is string => v !== null)),
  )
  const designerMap = new Map<string, string>()
  if (designerIds.length > 0) {
    const { data: emps } = await supabase
      .from('employees')
      .select('id, name')
      .in('id', designerIds)
    for (const e of (emps ?? []) as EmployeeMini[]) {
      if (e.name) designerMap.set(e.id, e.name)
    }
  }

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
            >
              <ChevronLeft className="h-4 w-4" />
              홈
            </Link>
            <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">지장이설 설계</h1>
            <p className="mt-1 text-sm text-slate-500">
              LGU+ 광케이블 지장이설 코어구성도·직선도 설계 · {projects.length}건
            </p>
          </div>
          <Link
            href="/relocation/new"
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

        {projects.length === 0 ? (
          <EmptyState
            icon={Cable}
            title="아직 등록된 프로젝트가 없습니다"
            description="현장 답사 후 지장이설 안건을 새 프로젝트로 등록해주세요."
            cta={
              <Link
                href="/relocation/new"
                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
                프로젝트 생성
              </Link>
            }
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {projects.map((p) => {
              const designer = p.designer_id ? designerMap.get(p.designer_id) ?? null : null
              return (
                <li key={p.id}>
                  <Link
                    href={`/relocation/${p.id}`}
                    className="block rounded-2xl bg-white shadow-sm border border-slate-200 p-5 hover:border-slate-900 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-lg font-semibold text-slate-900 line-clamp-2">
                        {p.title}
                      </h2>
                      <span className="shrink-0 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {p.status}
                      </span>
                    </div>
                    <dl className="mt-3 space-y-1 text-sm text-slate-600">
                      {p.region && (
                        <div className="flex gap-2">
                          <dt className="w-16 shrink-0 text-slate-400">지역</dt>
                          <dd>{p.region}</dd>
                        </div>
                      )}
                      {p.surveyed_at && (
                        <div className="flex gap-2">
                          <dt className="w-16 shrink-0 text-slate-400">계약일</dt>
                          <dd>{p.surveyed_at}</dd>
                        </div>
                      )}
                      {designer && (
                        <div className="flex gap-2">
                          <dt className="w-16 shrink-0 text-slate-400">설계자</dt>
                          <dd>{designer}</dd>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <dt className="w-16 shrink-0 text-slate-400">발주처</dt>
                        <dd>{p.client}</dd>
                      </div>
                    </dl>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}
