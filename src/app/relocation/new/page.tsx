import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createProject } from '../actions'

// 지장이설 프로젝트 생성 폼
// 권한: 회사 직원 누구나

type EmployeeMini = {
  id: string
  name: string
  permission: string
}

export default async function NewRelocationProjectPage() {
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

  // 설계자 후보 (회사 활성 직원 전체)
  const { data: emps } = await supabase
    .from('employees')
    .select('id, name, permission')
    .eq('company_id', me.company_id)
    .eq('is_active', true)
    .order('name')

  const employees = (emps ?? []) as EmployeeMini[]

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-5">
        <header>
          <Link
            href="/relocation"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
            지장이설 목록
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">
            새 프로젝트 생성
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            현장 답사 후 안건 1건당 1 프로젝트로 등록합니다.
          </p>
        </header>

        <form
          action={createProject}
          className="rounded-2xl bg-white shadow-sm border border-slate-200 p-6 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700">
              프로젝트 제목 <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              name="title"
              required
              maxLength={200}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">지역</label>
            <input
              type="text"
              name="region"
              maxLength={100}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">공사계약일</label>
            <input
              type="date"
              name="surveyed_at"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">설계자</label>
            <select
              name="designer_id"
              defaultValue={me.id}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            >
              <option value="">(미지정)</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                  {e.id === me.id ? ' (본인)' : ''}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">기본은 본인. 다른 직원으로 변경 가능.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">상태</label>
            <select
              name="status"
              defaultValue="설계중"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
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
              maxLength={1000}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Link
              href="/relocation"
              className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              취소
            </Link>
            <button
              type="submit"
              className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              생성
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
