'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileSpreadsheet, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { detectDelimiter, parseCsv } from '@/lib/csv-parse'
import { importStockCsv } from '../import-actions'
import type { ImportResult } from '../import-actions'

export default function ImportStockClient() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [autoCreate, setAutoCreate] = useState(true)
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
    fd.append('auto_create_master', autoCreate ? '1' : '0')
    const r = await importStockCsv(fd)
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
      {/* 템플릿 다운로드 */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
        <p className="text-sm font-semibold text-slate-700">CSV 형식</p>
        <p className="mt-1 text-xs text-slate-600">
          헤더 행 필수. <code className="rounded bg-white px-1">자재명*, 발주처코드, 규격, 단위, 사급지입*, 입고형태*, 발주처, 수량*, 단가, 관련공사번호, 메모</code>
        </p>
        <ul className="mt-2 list-disc list-inside text-xs text-slate-600 space-y-0.5">
          <li>「사급지입」 = <code>사급</code> 또는 <code>지입</code></li>
          <li>「입고형태」 = <code>일반입고</code> 또는 <code>직납입고</code></li>
          <li>사급은 발주처 필수. 직납입고는 관련공사번호 필수.</li>
          <li>UTF-8 인코딩 (Excel 「다른 이름으로 저장 → CSV UTF-8」)</li>
        </ul>
        <a
          href="/api/templates/stock-import.csv"
          download
          className="mt-2 inline-block rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          템플릿 CSV 다운로드
        </a>
      </div>

      {/* 파일 선택 */}
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

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={autoCreate}
            onChange={(e) => setAutoCreate(e.target.checked)}
            className="rounded"
          />
          매칭 실패 행은 자재 마스터도 함께 신규 생성
        </label>
      </div>

      {/* 미리보기 */}
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

      {/* 결과 */}
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
