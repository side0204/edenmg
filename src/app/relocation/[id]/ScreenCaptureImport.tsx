'use client'

import { useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ImagePlus, Pipette, Search, Trash2, Loader2, CheckCircle2 } from 'lucide-react'
import { CLOSURE_TYPE_VALUES, CLOSURE_TYPE_LABEL, type ClosureType } from '@/lib/relocation'
import { createFacilityAtPosition } from './facility-actions'

// ============================================================================
// 캡처 화면 → 시설 자동 검출 (완전 로컬 · 브라우저 안에서만 처리)
//
// 이미지는 어떤 서버로도 전송되지 않습니다. 브라우저 canvas 에서 픽셀을 읽어
// 색 기반으로 시설 심볼을 찾고, 추출된 좌표·종류만 server action 으로 보내
// 시설을 생성합니다. (LGU+ 망 데이터 유출 위험 0)
//
// 방식: owner 가 화면에서 심볼 색을 한 번 클릭(보정) → 같은 색의 덩어리(blob)를
// 전부 찾아 후보 시설로 표시 → 확인 후 일괄 생성. OCR(이름 자동 읽기)·케이블
// 연결은 후속 단계.
// ============================================================================

const MAX_ANALYSIS_DIM = 1400 // 분석 해상도 상한 (성능)
const FACILITY_COORD_SPAN = 1200 // 캔버스 좌표 환산 (긴 변 기준)

type RGB = { r: number; g: number; b: number }

type Sample = {
  id: number
  color: RGB
  closureType: ClosureType
  tolerance: number
}

type Candidate = {
  id: number
  cx: number // 분석 canvas 픽셀
  cy: number
  closureType: ClosureType
  color: RGB
}

// 색 거리 기반 연결요소(blob) 검출 — 작은 심볼은 잡고, 가늘고 긴 선(케이블)은 거름
function detectBlobs(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  target: RGB,
  tol: number,
  minArea: number,
  maxArea: number,
): { cx: number; cy: number }[] {
  const n = w * h
  const match = new Uint8Array(n)
  const tol2 = tol * tol
  for (let i = 0; i < n; i++) {
    const o = i * 4
    if (data[o + 3] < 128) continue
    const dr = data[o] - target.r
    const dg = data[o + 1] - target.g
    const db = data[o + 2] - target.b
    if (dr * dr + dg * dg + db * db <= tol2) match[i] = 1
  }
  const visited = new Uint8Array(n)
  const blobs: { cx: number; cy: number }[] = []
  const stack: number[] = []
  for (let i = 0; i < n; i++) {
    if (!match[i] || visited[i]) continue
    stack.length = 0
    stack.push(i)
    visited[i] = 1
    let area = 0
    let sx = 0
    let sy = 0
    let minX = w
    let maxX = 0
    let minY = h
    let maxY = 0
    while (stack.length) {
      const p = stack.pop() as number
      const px = p % w
      const py = (p / w) | 0
      area++
      sx += px
      sy += py
      if (px < minX) minX = px
      if (px > maxX) maxX = px
      if (py < minY) minY = py
      if (py > maxY) maxY = py
      if (px > 0) {
        const q = p - 1
        if (match[q] && !visited[q]) {
          visited[q] = 1
          stack.push(q)
        }
      }
      if (px < w - 1) {
        const q = p + 1
        if (match[q] && !visited[q]) {
          visited[q] = 1
          stack.push(q)
        }
      }
      if (py > 0) {
        const q = p - w
        if (match[q] && !visited[q]) {
          visited[q] = 1
          stack.push(q)
        }
      }
      if (py < h - 1) {
        const q = p + w
        if (match[q] && !visited[q]) {
          visited[q] = 1
          stack.push(q)
        }
      }
    }
    if (area < minArea || area > maxArea) continue
    const bw = maxX - minX + 1
    const bh = maxY - minY + 1
    const fill = area / (bw * bh)
    const aspect = Math.max(bw, bh) / Math.max(1, Math.min(bw, bh))
    if (fill < 0.25) continue // 듬성한 덩어리(선) 제거
    if (aspect > 4) continue // 가늘고 긴 것(케이블 선) 제거
    blobs.push({ cx: sx / area, cy: sy / area })
  }
  return blobs
}

function rgbCss(c: RGB) {
  return `rgb(${c.r}, ${c.g}, ${c.b})`
}

export default function ScreenCaptureImport({ projectId }: { projectId: string }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  // 분석용 ImageData (자연 해상도, MAX_ANALYSIS_DIM 으로 캡)
  const analysisRef = useRef<{ data: Uint8ClampedArray; w: number; h: number } | null>(null)

  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [dispW, setDispW] = useState(0) // 화면 표시 폭 (px)
  const [samples, setSamples] = useState<Sample[]>([])
  const [pickType, setPickType] = useState<ClosureType>('함체_관로형')
  const [picking, setPicking] = useState(false)
  const [minArea, setMinArea] = useState(25)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [detecting, setDetecting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [createdCount, setCreatedCount] = useState<number | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  const reset = () => {
    setSamples([])
    setCandidates([])
    setCreatedCount(null)
    setErrors([])
    setProgress(null)
    setPicking(false)
  }

  const onPickFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    reset()
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, MAX_ANALYSIS_DIM / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.drawImage(img, 0, 0, w, h)
      analysisRef.current = { data: ctx.getImageData(0, 0, w, h).data, w, h }
      setImgSrc(url)
      setDispW(w) // 표시 폭 초기값 = 분석 폭 (CSS 로 반응형 축소됨)
    }
    img.src = url
  }, [])

  // 이미지 클릭 → 보정 색 추출 (picking 모드) 또는 후보 제거(아래 별도 핸들러)
  function onImageClick(e: React.MouseEvent<HTMLImageElement>) {
    if (!picking) return
    const analysis = analysisRef.current
    if (!analysis) return
    const rect = e.currentTarget.getBoundingClientRect()
    const fx = (e.clientX - rect.left) / rect.width
    const fy = (e.clientY - rect.top) / rect.height
    const px = Math.floor(fx * analysis.w)
    const py = Math.floor(fy * analysis.h)
    const o = (py * analysis.w + px) * 4
    const color: RGB = { r: analysis.data[o], g: analysis.data[o + 1], b: analysis.data[o + 2] }
    setSamples((s) => [
      ...s,
      { id: Date.now() + Math.floor(fx * 1000), color, closureType: pickType, tolerance: 40 },
    ])
    setPicking(false)
  }

  function runDetect() {
    const analysis = analysisRef.current
    if (!analysis || samples.length === 0) return
    setDetecting(true)
    setCreatedCount(null)
    // 비동기로 한 틱 양보 (스피너 표시)
    setTimeout(() => {
      const maxArea = (analysis.w * analysis.h) / 150 // 너무 큰 영역(배경) 제거
      const found: Candidate[] = []
      let cid = 1
      for (const s of samples) {
        const blobs = detectBlobs(
          analysis.data,
          analysis.w,
          analysis.h,
          s.color,
          s.tolerance,
          minArea,
          maxArea,
        )
        for (const b of blobs) {
          found.push({ id: cid++, cx: b.cx, cy: b.cy, closureType: s.closureType, color: s.color })
        }
      }
      setCandidates(found)
      setDetecting(false)
    }, 30)
  }

  function removeCandidate(id: number) {
    setCandidates((c) => c.filter((x) => x.id !== id))
  }

  async function createAll() {
    const analysis = analysisRef.current
    if (!analysis || candidates.length === 0) return
    setCreating(true)
    setErrors([])
    setProgress({ done: 0, total: candidates.length })
    const coordScale = FACILITY_COORD_SPAN / Math.max(analysis.w, analysis.h)
    const counters = new Map<ClosureType, number>()
    const errs: string[] = []
    let done = 0
    let ok = 0
    for (const c of candidates) {
      const n = (counters.get(c.closureType) ?? 0) + 1
      counters.set(c.closureType, n)
      const name = `${CLOSURE_TYPE_LABEL[c.closureType]} ${n}`
      try {
        const res = await createFacilityAtPosition({
          project_id: projectId,
          closure_type: c.closureType,
          name,
          x: Math.round(c.cx * coordScale),
          y: Math.round(c.cy * coordScale),
        })
        if (res.ok) ok++
        else errs.push(`${name}: ${res.error}`)
      } catch (err) {
        errs.push(`${name}: ${err instanceof Error ? err.message : String(err)}`)
      }
      done++
      setProgress({ done, total: candidates.length })
    }
    setCreating(false)
    setCreatedCount(ok)
    setErrors(errs)
    router.refresh()
  }

  // 후보 종류별 카운트
  const countByType = candidates.reduce<Record<string, number>>((acc, c) => {
    acc[c.closureType] = (acc[c.closureType] ?? 0) + 1
    return acc
  }, {})

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-slate-900">
          캡처 화면에서 시설 가져오기 (로컬)
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          캡처 이미지는 <strong className="text-slate-700">브라우저 안에서만</strong> 분석되며 어떤
          서버로도 전송되지 않습니다. 심볼 색을 클릭해 보정하면 같은 색 시설을 자동으로 찾습니다.
        </p>
      </div>

      <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} className="hidden" />
      <button
        onClick={() => fileRef.current?.click()}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <ImagePlus className="h-4 w-4" />
        {imgSrc ? '다른 캡처 선택' : '캡처 화면 선택'}
      </button>

      {imgSrc && (
        <>
          {/* 1) 색 보정 */}
          <div className="rounded-lg border border-slate-200 p-3 space-y-2">
            <p className="text-xs font-medium text-slate-600">1. 시설 종류별 색 보정</p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={pickType}
                onChange={(e) => setPickType(e.target.value as ClosureType)}
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              >
                {CLOSURE_TYPE_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {CLOSURE_TYPE_LABEL[v]}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setPicking((p) => !p)}
                className={
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ' +
                  (picking
                    ? 'bg-amber-500 text-white'
                    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50')
                }
              >
                <Pipette className="h-4 w-4" />
                {picking ? '이미지에서 심볼 클릭…' : '색 선택'}
              </button>
            </div>

            {samples.length > 0 && (
              <ul className="space-y-1.5 pt-1">
                {samples.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-xs">
                    <span
                      className="h-4 w-4 shrink-0 rounded border border-slate-300"
                      style={{ background: rgbCss(s.color) }}
                    />
                    <span className="w-24 shrink-0 truncate text-slate-700">
                      {CLOSURE_TYPE_LABEL[s.closureType]}
                    </span>
                    <label className="flex flex-1 items-center gap-1.5 text-slate-500">
                      허용범위
                      <input
                        type="range"
                        min={10}
                        max={120}
                        value={s.tolerance}
                        onChange={(e) =>
                          setSamples((arr) =>
                            arr.map((x) =>
                              x.id === s.id ? { ...x, tolerance: Number(e.target.value) } : x,
                            ),
                          )
                        }
                        className="flex-1"
                      />
                      <span className="w-7 text-right tabular-nums">{s.tolerance}</span>
                    </label>
                    <button
                      onClick={() => setSamples((arr) => arr.filter((x) => x.id !== s.id))}
                      className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      aria-label="삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 2) 검출 옵션 + 실행 */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              최소 크기
              <input
                type="range"
                min={5}
                max={200}
                value={minArea}
                onChange={(e) => setMinArea(Number(e.target.value))}
              />
              <span className="w-8 tabular-nums">{minArea}</span>
            </label>
            <button
              onClick={runDetect}
              disabled={samples.length === 0 || detecting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              {detecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              검출
            </button>
            {candidates.length > 0 && (
              <span className="text-xs text-slate-600">
                후보 {candidates.length}개 ·{' '}
                {Object.entries(countByType)
                  .map(([t, n]) => `${CLOSURE_TYPE_LABEL[t as ClosureType]} ${n}`)
                  .join(', ')}
              </span>
            )}
          </div>

          {/* 3) 미리보기 + 후보 오버레이 */}
          <div
            className="relative inline-block max-w-full overflow-hidden rounded-lg border border-slate-300"
            style={{ width: dispW ? Math.min(dispW, 900) : undefined }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imgSrc}
              alt="캡처 미리보기"
              onClick={onImageClick}
              className="block w-full select-none"
              style={{ cursor: picking ? 'crosshair' : 'default' }}
              draggable={false}
            />
            {candidates.map((c) => {
              const a = analysisRef.current
              if (!a) return null
              const left = (c.cx / a.w) * 100
              const top = (c.cy / a.h) * 100
              return (
                <button
                  key={c.id}
                  onClick={() => removeCandidate(c.id)}
                  title="클릭하면 제거"
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                  style={{
                    left: `${left}%`,
                    top: `${top}%`,
                    width: 14,
                    height: 14,
                    background: rgbCss(c.color),
                  }}
                />
              )
            })}
          </div>
          {candidates.length > 0 && (
            <p className="text-[11px] text-slate-400">
              잘못 잡힌 점은 클릭해서 제거하세요. 너무 적게/많이 잡히면 위의 허용범위·최소 크기를
              조절하고 다시 검출하세요.
            </p>
          )}

          {/* 4) 생성 */}
          {candidates.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3">
              <button
                onClick={createAll}
                disabled={creating}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                시설 {candidates.length}개 생성
              </button>
              {progress && creating && (
                <span className="text-xs text-slate-500">
                  생성 중 {progress.done}/{progress.total}
                </span>
              )}
            </div>
          )}

          {createdCount !== null && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              ✅ 시설 {createdCount}개를 생성했습니다.{' '}
              <Link href={`/relocation/${projectId}`} className="font-medium underline">
                캔버스에서 보기 →
              </Link>
              {errors.length > 0 && (
                <details className="mt-2 text-xs text-rose-700">
                  <summary className="cursor-pointer">실패 {errors.length}건</summary>
                  <ul className="mt-1 list-disc pl-4">
                    {errors.slice(0, 20).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </>
      )}

      <p className="text-[11px] text-slate-400">
        ※ 이름은 임시(예: “함체(관로형) 1”)로 들어갑니다. 글자 자동 인식(OCR)과 케이블 연결은 다음
        단계에서 추가합니다.
      </p>
    </section>
  )
}
