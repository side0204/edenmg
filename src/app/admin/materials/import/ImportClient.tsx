'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileSpreadsheet, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { detectDelimiter, parseCsv } from '@/lib/csv-parse'
import { importMaterialsCsv, type ImportResult } from '@/app/stock/import-actions'

export default function ImportMaterialsClient() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<{ header: string[]; rows: string[][]; delimiter: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  async function handleFile(f: File) {
    setFile(f)
    setResult(null)
    const text = await f.text()
    const delim = detectDelimiter(text)
    const { rows } = parseCsv(text, delim)
    if (rows.length === 0) {
      setPreview(null)
      toast.error('파일이 비어있습니다')
      return
    }
    setPreview({ header: rows[0], rows: rows.slice(1, 11), delimiter: delim })
  }

  async function handleSubmit() {
    if (!file) return
    setBusy(true)
    setResult(null)
    const fd = new FormData()
    fd.append('file', file)
    const r = await importMaterialsCsv(fd)
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
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
        <p className="text-sm font-semibold text-slate-700">CSV 형식</p>
        <p className="mt-1 text-xs text-slate-600">
          헤더: <code className="rounded bg-white px-1">자재명*, 규격, 단위, 카테고리, 발주처, 발주처코드</code>
        </p>
        <ul className="mt-2 list-disc list-inside text-xs text-slate-600 space-y-0.5">
          <li>사급 자재: 발주처 + 발주처코드 둘 다 입력 → 매칭 키로 사용</li>
          <li>지입 자재: 발주처·발주처코드 비움</li>
          <li>같은 (발주처, 발주처코드) 이미 있으면 갱신</li>
        </ul>
        <a
          href="/api/templates/materials-import.csv"
          download
          className="mt-2 inline-block rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          템플릿 CSV 다운로드
        </a>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">파일 선택</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
            className="mt-1 block w-full text-sm"
          />
        </label>
      </div>

      {preview && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
          <p className="text-sm font-semibold text-slate-700">
            미리보기 (앞 10행 · 구분자: {preview.delimiter})
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100">
                  {preview.header.map((h, i) => (
                    <th key={i} className="border border-slate-200 px-2 py-1 text-left font-medium text-slate-700">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((c, ci) => (
                      <td key={ci} className="border border-slate-200 px-2 py-1 text-slate-700">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-3 text-base font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            {busy ? '처리 중...' : '확정 등록'}
          </button>
        </div>
      )}

      {result && (
        <div
          className={
            'rounded-2xl border p-4 ' +
            (result.errors.length === 0
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-amber-200 bg-amber-50')
          }
        >
          <p className="font-semibold text-slate-900">{result.message}</p>
          {result.errors.length > 0 && (
            <div className="mt-2">
              <p className="text-sm font-medium text-amber-800">실패 행:</p>
              <ul className="mt-1 max-h-48 overflow-y-auto text-xs text-amber-900 space-y-0.5">
                {result.errors.map((e, i) => (
                  <li key={i}>· {e.row}행: {e.message}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
