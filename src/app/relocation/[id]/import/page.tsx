import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import RelocationImportClient from '../RelocationImportClient'
import ScreenCaptureImport from '../ScreenCaptureImport'

// 지장이설 데이터 가져오기 — 표준 템플릿(시설·케이블·회선) CSV 일괄 등록.

export default async function RelocationImportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: projRow } = await supabase
    .from('relocation_projects')
    .select('id, title')
    .eq('id', id)
    .maybeSingle()
  if (!projRow) notFound()
  const project = projRow as { id: string; title: string }

  return (
    <main className="min-h-screen pb-10">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-4 sm:pt-6 space-y-5">
        <header>
          <Link
            href={`/relocation/${id}`}
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
            {project.title}
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 tracking-tight">
            데이터 가져오기
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            LGU+ 데이터를 표준 템플릿 양식에 맞춰 시설·케이블·회선을 한 번에
            등록합니다. 각 템플릿을 내려받아 채운 뒤 업로드하세요.
          </p>
        </header>

        <ScreenCaptureImport projectId={project.id} />

        <RelocationImportClient projectId={project.id} />
      </div>
    </main>
  )
}
