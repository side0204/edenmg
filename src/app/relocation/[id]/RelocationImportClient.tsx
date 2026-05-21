'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Download, Upload, Network, Cable, Radio } from 'lucide-react'
import {
  importRelocationFacilitiesCsv,
  importRelocationCablesCsv,
  importRelocationCircuitsCsv,
  type ImportResult,
} from './import-actions'

// 지장이설 표준 템플릿 임포터 — 시설·케이블·회선 CSV 업로드.

type ImportFn = (fd: FormData) => Promise<ImportResult>

export default function RelocationImportClient({ projectId }: { projectId: string }) {
  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        <strong>시설 → 케이블 → 회선</strong> 순서로 가져오세요. 케이블은 시설 이름을
        참조하므로 시설을 먼저 등록해야 합니다.
      </p>

      <ImportSection
        projectId={projectId}
        icon={Network}
        title="1. 시설"
        desc="국사·함체·맨홀·가입자시설 등. 종류는 표준 범례 이름(예: 종합국사, 함체(가공형))으로 입력."
        headers="종류*, 이름*, 함체규격, 설치주소, 위도, 경도, 비고"
        templateType="facilities"
        action={importRelocationFacilitiesCsv}
      />
      <ImportSection
        projectId={projectId}
        icon={Cable}
        title="2. 케이블"
        desc="출발·도착시설은 위에서 등록한 시설 이름과 정확히 일치해야 합니다."
        headers="케이블ID*, 출발시설*, 도착시설*, 규격*, 상태, 설치구분, 전체거리, 비고"
        templateType="cables"
        action={importRelocationCablesCsv}
      />
      <ImportSection
        projectId={projectId}
        icon={Radio}
        title="3. 회선"
        desc="회선번호·종류(1코어/2코어/이원화) 입력."
        headers="회선번호*, 설치장소명, 종류*, 상태, 비고"
        templateType="circuits"
        action={importRelocationCircuitsCsv}
      />
    </div>
  )
}

function ImportSection({
  projectId,
  icon: Icon,
  title,
  desc,
  headers,
  templateType,
  action,
}: {
  projectId: string
  icon: typeof Network
  title: string
  desc: string
  headers: string
  templateType: string
  action: ImportFn
}) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  async function onImport() {
    if (!file || busy) return
    setBusy(true)
    const fd = new FormData()
    fd.set('project_id', projectId)
    fd.set('file', file)
    const r = await action(fd)
    setBusy(false)
    setResult(r)
    if (r.ok) {
      toast.success(r.message)
      router.refresh()
    } else {
      toast.error(r.message)
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <Icon className="h-4 w-4" />
          {title}
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
        <p className="mt-0.5 text-[11px] text-slate-400">헤더: {headers}</p>
      </div>

      <a
        href={`/api/templates/relocation-import.csv?type=${templateType}`}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        <Download className="h-3.5 w-3.5" />
        템플릿 다운로드
      </a>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null)
            setResult(null)
          }}
          className="text-xs text-slate-600 file:mr-2 file:rounded-md file:border file:border-slate-300 file:bg-slate-50 file:px-2 file:py-1 file:text-xs"
        />
        <button
          type="button"
          onClick={onImport}
          disabled={!file || busy}
          className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:bg-slate-300"
        >
          <Upload className="h-3.5 w-3.5" />
          {busy ? '가져오는 중…' : '가져오기'}
        </button>
      </div>

      {result && (
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
          <p className="font-medium text-slate-800">{result.message}</p>
          {result.errors.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-rose-700">
              {result.errors.slice(0, 15).map((e, i) => (
                <li key={i}>
                  {e.row}행: {e.message}
                </li>
              ))}
              {result.errors.length > 15 && (
                <li className="text-slate-500">그 외 {result.errors.length - 15}건…</li>
              )}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
