import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, ExternalLink, Info } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import type { Permission } from '../fields'

// 초대 흐름은 폐기. 회원가입(/signup) 으로 대체됨. 페이지 자체는 안내문 + 회원가입 링크.
export default async function InviteEmployeePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: meRow } = await supabase
    .from('employees')
    .select('permission')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as { permission: Permission } | null
  if (!me || me.permission !== 'admin') notFound()

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-md space-y-5">
        <header>
          <Link
            href="/admin/employees"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
            직원 목록
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">
            직원 초대 (폐기됨)
          </h1>
        </header>

        <section className="rounded-2xl border border-amber-300 bg-amber-50/80 p-5 space-y-3">
          <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-800">
            <Info className="h-4 w-4" />
            초대 방식은 회원가입 방식으로 변경됐습니다
          </div>
          <p className="text-sm text-slate-700">
            새 직원은 직접 회원가입 페이지에 접속해 신청합니다. 관리자는 직원 관리 화면의 「가입
            승인 대기」 섹션에서 권한을 부여하며 활성화합니다.
          </p>
          <Link
            href="/signup"
            target="_blank"
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            회원가입 페이지 열기 (직원에게 안내)
          </Link>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-2 text-sm text-slate-600">
          <p className="font-medium text-slate-700">새 직원 가입 흐름</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>직원이 <code className="rounded bg-slate-100 px-1">/signup</code> 페이지에서 이름·이메일·비밀번호·직무·차량번호 입력</li>
            <li>가입 신청 접수 (직원은 「관리자 승인 대기」 안내 받음)</li>
            <li>관리자가 직원 관리에서 「가입 승인 대기」 카드 확인 → 권한 부여 후 「승인하기」</li>
            <li>직원이 로그인 가능</li>
          </ol>
        </section>
      </div>
    </main>
  )
}
