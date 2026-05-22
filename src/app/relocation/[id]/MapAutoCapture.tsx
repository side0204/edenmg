'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { X, ImageDown, ZoomIn, ZoomOut, Loader2, Check } from 'lucide-react'

// 지장이설 지도 모드 — 자동 캡처.
//
// 브라우저 화면 공유(getDisplayMedia)로 지도 화면을 직접 가져온다.
// CORS 로 막히던 카카오맵 타일도 화면 캡처라 그대로 잡힌다.
//   1. 사용자가 「캡처 시작」 → 화면 공유 1회 허용 (현재 탭).
//   2. 앱이 시설 영역을 격자로 나눠 타일마다 지도를 자동 이동.
//   3. 각 타일에서 지도 영역만 잘라 캡처 → 메모리에 모음.
//   4. 모든 타일을 한 장으로 합쳐 PNG 다운로드.
//
// 분할 캡처(수동)와 달리 사람이 Win+Shift+S 로 찍을 필요가 없다.
// 다만 화면 공유 캡처가 카카오맵에서 정상 동작하는지는 실제 사용으로 검증한다.

type LatLngLit = { lat: number; lng: number }
type Bbox = { minLat: number; maxLat: number; minLng: number; maxLng: number }

// 캡처 후 또렷하게 다시 그릴 시설 라벨 정보 (TopologyCanvas 가 GPS·이름 등을 넘김)
type CaptureFacility = {
  lat: number | null
  lng: number | null
  code: string
  name: string
  isNew: boolean
  installNo: number | null
  labelDx: number
  labelDy: number
}

const OVERLAP = 0.06     // 타일 간 겹침 비율 (이음매 방지)
const TILE_WAIT = 850    // 타일 이동 후 지도 타일 로딩 대기(ms)
const PAD = 0.08         // bbox 가장자리 여백 (뷰포트 비율)
// 시설 라벨 글자 변형 — 너비 0.75배(가로 압축)·높이 1.2배(세로 신장). 조밀한 장체.
const LABEL_SCALE_X = 0.75
const LABEL_SCALE_Y = 1.2

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// 시설 영역을 뷰포트 크기로 나눈 격자 — 타일 중심 좌표 목록
function planTiles(
  bbox: Bbox,
  vSpanLng: number,
  vSpanLat: number,
): { cols: number; rows: number; centers: LatLngLit[] } {
  const stepLng = vSpanLng * (1 - OVERLAP)
  const stepLat = vSpanLat * (1 - OVERLAP)
  const padLng = vSpanLng * PAD
  const padLat = vSpanLat * PAD
  const spanLng = bbox.maxLng - bbox.minLng + padLng * 2
  const spanLat = bbox.maxLat - bbox.minLat + padLat * 2
  const cols =
    spanLng <= vSpanLng ? 1 : 1 + Math.ceil((spanLng - vSpanLng) / stepLng)
  const rows =
    spanLat <= vSpanLat ? 1 : 1 + Math.ceil((spanLat - vSpanLat) / stepLat)
  const coverLng = vSpanLng + (cols - 1) * stepLng
  const coverLat = vSpanLat + (rows - 1) * stepLat
  const firstLng =
    bbox.minLng - padLng - (coverLng - spanLng) / 2 + vSpanLng / 2
  const firstLat =
    bbox.maxLat + padLat + (coverLat - spanLat) / 2 - vSpanLat / 2
  const centers: LatLngLit[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      centers.push({
        lat: firstLat - r * stepLat,
        lng: firstLng + c * stepLng,
      })
    }
  }
  return { cols, rows, centers }
}

// 흰 외곽선(halo) 두른 텍스트 — 배경과 글자를 분리해 또렷하게.
function drawHaloText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  haloWidth: number,
): void {
  if (!text) return
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = haloWidth
  ctx.strokeText(text, x, y)
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
}

// 모서리 둥근 사각형 path — roundRect 미지원 브라우저 대비 arcTo 로 직접 그림.
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

// 합성 이미지 위에 시설 라벨을 또렷한 벡터(canvas 2D 텍스트)로 다시 그린다.
//   화면 캡처된 작은 글자는 흐리므로, 캡처 중엔 라벨을 숨기고 여기서 재합성.
//   GPS → 합성 픽셀 변환은 planTiles 의 타일 격자와 동일한 선형 매핑.
function redrawFacilityLabels(
  ctx: CanvasRenderingContext2D,
  opts: {
    facilities: CaptureFacility[]
    firstLat: number
    firstLng: number
    srcW: number
    srcH: number
    vLng: number
    vLat: number
    scale: number
  },
): void {
  const { facilities, firstLat, firstLng, srcW, srcH, vLng, vLat, scale } = opts
  if (vLng <= 0 || vLat <= 0) return
  const pxPerLng = srcW / vLng
  const pxPerLat = srcH / vLat
  const codeFont = 9 * scale
  const nameFont = 10 * scale
  const lineGap = 12 * scale     // 시설코드 → 시설명 baseline 간격
  const shapeGap = 22 * scale    // 시설 중심 → 시설코드 baseline (도형 아래)
  const halo = 2.5 * scale
  const pad = 5 * scale
  const FF = "'Pretendard Variable', Pretendard, system-ui, sans-serif"

  ctx.save()
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  // 자간 — 일부 TS lib.dom 에 letterSpacing 타입이 없어 느슨하게 설정 (Chrome 99+ 지원)
  const ctxLS = ctx as CanvasRenderingContext2D & { letterSpacing?: string }
  ctxLS.letterSpacing = '0.1em'

  for (const f of facilities) {
    if (f.lat == null || f.lng == null) continue
    const cx = srcW / 2 + (f.lng - firstLng) * pxPerLng + f.labelDx * scale
    const cy = srcH / 2 + (firstLat - f.lat) * pxPerLat + f.labelDy * scale
    const codeY = cy + shapeGap
    const nameY = codeY + lineGap
    const code = f.code || ''
    const name = f.name || ''
    const codeColor = f.isNew ? '#dc2626' : '#0f172a'
    const nameColor = f.isNew ? '#dc2626' : '#020617'

    // 글자 변형 — (cx, codeY) 기준 너비 0.75배·높이 1.2배 (조밀한 장체)
    ctx.save()
    ctx.translate(cx, codeY)
    ctx.scale(LABEL_SCALE_X, LABEL_SCALE_Y)
    ctx.translate(-cx, -codeY)

    // 글자 폭 측정 → 흰 배경판 크기
    ctx.font = `650 ${codeFont}px ${FF}`
    const wCode = code ? ctx.measureText(code).width : 0
    ctx.font = `600 ${nameFont}px ${FF}`
    const wNameText = name ? ctx.measureText(name).width : 0
    const instExtra = f.installNo != null ? nameFont * 1.9 : 0
    const boxW = Math.max(wCode, wNameText + instExtra) + pad * 2
    const boxX = cx - boxW / 2
    const boxY = codeY - codeFont
    const boxH = nameY - codeY + nameFont + 8 * scale

    // 흰 배경판
    roundRectPath(ctx, boxX, boxY, boxW, boxH, 4 * scale)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = Math.max(0.5, 0.75 * scale)
    ctx.stroke()

    // 시설코드 (가운데 정렬)
    ctx.textAlign = 'center'
    ctx.font = `650 ${codeFont}px ${FF}`
    drawHaloText(ctx, code, cx, codeY, codeColor, halo)

    // 시설명
    ctx.font = `600 ${nameFont}px ${FF}`
    if (f.installNo != null) {
      // 설치 순번 — 초록 원 + 흰 숫자, 그 뒤 이름(좌측 정렬)
      const r = nameFont * 0.78
      const gap = 4 * scale
      const startX = cx - (r * 2 + gap + wNameText) / 2
      const circleCx = startX + r
      const circleCy = nameY - nameFont * 0.35
      ctx.beginPath()
      ctx.arc(circleCx, circleCy, r, 0, Math.PI * 2)
      ctx.fillStyle = '#16a34a'
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = Math.max(1, 1.5 * scale)
      ctx.stroke()
      ctx.font = `700 ${nameFont}px ${FF}`
      ctx.fillStyle = '#ffffff'
      ctx.fillText(String(f.installNo), circleCx, circleCy + nameFont * 0.35)
      ctx.font = `600 ${nameFont}px ${FF}`
      ctx.textAlign = 'left'
      drawHaloText(ctx, name, startX + r * 2 + gap, nameY, nameColor, halo)
    } else {
      ctx.textAlign = 'center'
      drawHaloText(ctx, name, cx, nameY, nameColor, halo)
    }

    ctx.restore()
  }
  ctx.restore()
}

type Phase = 'ready' | 'capturing' | 'done' | 'error'

export default function MapAutoCapture({
  map,
  facilities,
  getMapRect,
  onCaptureRunningChange,
  onClose,
}: {
  map: kakao.maps.Map
  facilities: CaptureFacility[]
  // 캡처할 지도 영역(캔버스)의 화면 위치 — getDisplayMedia 프레임에서 잘라낼 사각형
  getMapRect: () => DOMRect | null
  // 캡처 진행 중 알림 — 부모가 시설 라벨을 숨겼다가(또렷한 재합성) 끝나면 복원
  onCaptureRunningChange?: (running: boolean) => void
  onClose: () => void
}) {
  const [phase, setPhase] = useState<Phase>('ready')
  const [level, setLevel] = useState<number>(() => map.getLevel())
  const [estimate, setEstimate] = useState<{ cols: number; rows: number } | null>(
    null,
  )
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [errorMsg, setErrorMsg] = useState('')
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  // 캡처 중 다시 누름 방지
  const runningRef = useRef(false)

  // 시설 GPS 경계
  const bbox = useMemo<Bbox | null>(() => {
    const pts = facilities.filter(
      (f): f is CaptureFacility & { lat: number; lng: number } =>
        f.lat != null && f.lng != null,
    )
    if (pts.length === 0) return null
    let minLat = Infinity
    let maxLat = -Infinity
    let minLng = Infinity
    let maxLng = -Infinity
    for (const p of pts) {
      if (p.lat < minLat) minLat = p.lat
      if (p.lat > maxLat) maxLat = p.lat
      if (p.lng < minLng) minLng = p.lng
      if (p.lng > maxLng) maxLng = p.lng
    }
    return { minLat, maxLat, minLng, maxLng }
  }, [facilities])

  // 준비 단계 — 줌 레벨에 따른 예상 장수 계산. 지도도 그 레벨로 보여준다.
  useEffect(() => {
    if (phase !== 'ready' || !bbox) return
    map.setLevel(level)
    const b = map.getBounds()
    const sw = b.getSouthWest()
    const ne = b.getNorthEast()
    const vLng = ne.getLng() - sw.getLng()
    const vLat = ne.getLat() - sw.getLat()
    if (vLng <= 0 || vLat <= 0) return
    const plan = planTiles(bbox, vLng, vLat)
    setEstimate({ cols: plan.cols, rows: plan.rows })
  }, [phase, level, bbox, map])

  // 결과 object URL 정리
  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl)
    }
  }, [resultUrl])

  async function start() {
    if (runningRef.current) return
    if (!bbox) {
      toast.error('지도에 배치된 시설이 없습니다')
      return
    }

    // 화면 공유 요청 — 반드시 사용자 클릭(이 함수)에서 호출
    let stream: MediaStream
    try {
      const opts = { video: true, audio: false, preferCurrentTab: true }
      stream = await navigator.mediaDevices.getDisplayMedia(
        opts as DisplayMediaStreamOptions,
      )
    } catch {
      toast.error('화면 공유가 취소되었습니다')
      return
    }

    runningRef.current = true
    setPhase('capturing')
    setProgress({ done: 0, total: 0 })

    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.srcObject = stream
    // 화면 밖에 두되 렌더는 되게 (display:none 은 일부 브라우저서 프레임 미생성)
    video.style.cssText =
      'position:fixed;left:-10000px;top:0;width:2px;height:2px;opacity:0;pointer-events:none'
    document.body.appendChild(video)

    try {
      await video.play()
      // 영상 크기 확보 대기
      for (let i = 0; i < 60 && video.videoWidth === 0; i++) await sleep(50)
      if (video.videoWidth === 0) {
        throw new Error('화면 영상을 받지 못했습니다')
      }

      // 시설 라벨 숨김 요청 — 캡처엔 안 찍히고, 끝난 뒤 또렷한 벡터로 다시 그린다
      onCaptureRunningChange?.(true)

      // 지도 잠금 + 캡처 레벨 적용
      map.setDraggable(false)
      map.setZoomable(false)
      map.setLevel(level)
      await sleep(500)

      // 뷰포트 지리 범위 → 격자 계산
      const b = map.getBounds()
      const sw = b.getSouthWest()
      const ne = b.getNorthEast()
      const vLng = ne.getLng() - sw.getLng()
      const vLat = ne.getLat() - sw.getLat()
      if (vLng <= 0 || vLat <= 0) throw new Error('지도 범위를 읽지 못했습니다')
      const plan = planTiles(bbox, vLng, vLat)

      // 지도 영역 → 캡처 영상에서 잘라낼 사각형
      const rect = getMapRect()
      if (!rect || rect.width < 10 || rect.height < 10) {
        throw new Error('지도 영역을 찾지 못했습니다')
      }
      const scaleX = video.videoWidth / window.innerWidth
      const scaleY = video.videoHeight / window.innerHeight
      const srcX = Math.max(0, Math.round(rect.left * scaleX))
      const srcY = Math.max(0, Math.round(rect.top * scaleY))
      const srcW = Math.round(rect.width * scaleX)
      const srcH = Math.round(rect.height * scaleY)

      setProgress({ done: 0, total: plan.centers.length })

      // 타일별 캡처
      const tiles: HTMLCanvasElement[] = []
      for (let i = 0; i < plan.centers.length; i++) {
        const c = plan.centers[i]
        map.setCenter(new kakao.maps.LatLng(c.lat, c.lng))
        await sleep(TILE_WAIT)
        const tc = document.createElement('canvas')
        tc.width = srcW
        tc.height = srcH
        const tctx = tc.getContext('2d')
        if (!tctx) throw new Error('캔버스를 만들지 못했습니다')
        tctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH)
        tiles.push(tc)
        setProgress({ done: i + 1, total: plan.centers.length })
      }

      // 한 장으로 합치기 (타일은 OVERLAP 만큼 겹쳐 배치 — 이음매 제거)
      const stepX = srcW * (1 - OVERLAP)
      const stepY = srcH * (1 - OVERLAP)
      const bigW = Math.round(srcW + (plan.cols - 1) * stepX)
      const bigH = Math.round(srcH + (plan.rows - 1) * stepY)
      const big = document.createElement('canvas')
      big.width = bigW
      big.height = bigH
      const bctx = big.getContext('2d')
      if (!bctx) throw new Error('캔버스를 만들지 못했습니다')
      bctx.fillStyle = '#ffffff'
      bctx.fillRect(0, 0, bigW, bigH)
      tiles.forEach((t, i) => {
        const col = i % plan.cols
        const row = Math.floor(i / plan.cols)
        bctx.drawImage(t, Math.round(col * stepX), Math.round(row * stepY))
      })

      // 시설 라벨을 또렷한 벡터로 다시 그린다 (화면 캡처 글자는 작아서 흐림)
      await document.fonts.ready
      redrawFacilityLabels(bctx, {
        facilities,
        firstLat: plan.centers[0].lat,
        firstLng: plan.centers[0].lng,
        srcW,
        srcH,
        vLng,
        vLat,
        scale: scaleX,
      })

      // PNG 로 변환 — 화면 공유 프레임이 보안 제약(tainted)이면 여기서 실패
      const blob = await new Promise<Blob>((resolve, reject) => {
        big.toBlob(
          (bl) => (bl ? resolve(bl) : reject(new Error('이미지 변환 실패'))),
          'image/png',
        )
      })
      const url = URL.createObjectURL(blob)
      setResultUrl(url)
      setPhase('done')

      // 자동 다운로드
      const a = document.createElement('a')
      a.href = url
      a.download = '지도캡처.png'
      document.body.appendChild(a)
      a.click()
      a.remove()
      toast.success('지도 이미지를 저장했습니다')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // 보안 제약(tainted canvas) 친절 안내
      const friendly =
        msg.includes('tainted') || msg.toLowerCase().includes('secur')
          ? '브라우저 보안 제약으로 캡처 화면을 이미지로 변환하지 못했습니다. 분할 캡처(수동) 방식을 사용해 주세요.'
          : '캡처 실패: ' + msg
      setErrorMsg(friendly)
      setPhase('error')
    } finally {
      stream.getTracks().forEach((t) => t.stop())
      video.srcObject = null
      video.remove()
      map.setDraggable(true)
      map.setZoomable(true)
      runningRef.current = false
      onCaptureRunningChange?.(false)
    }
  }

  // ===== UI — 캔버스 아래 패널. 지도 위를 가리지 않는다. =====================
  return (
    <div className="border-t border-slate-200 bg-white px-3 py-2.5">
      <div className="mx-auto w-full max-w-3xl">
        {/* 헤더 */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-800">
            <ImageDown className="h-3.5 w-3.5" />
            지도 자동 캡처
          </span>
          {phase === 'ready' && estimate && (
            <span className="text-[11px] text-slate-500">
              예상 {estimate.cols * estimate.rows}장 · {estimate.cols}열 ×{' '}
              {estimate.rows}행
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={phase === 'capturing'}
            className="ml-auto inline-flex h-7 items-center gap-0.5 rounded-md border border-slate-300 px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            <X className="h-3.5 w-3.5" />
            닫기
          </button>
        </div>

        {/* 준비 단계 */}
        {phase === 'ready' && (
          <div className="mt-2 space-y-2">
            {!bbox ? (
              <p className="text-[11px] text-rose-600">
                지도에 배치된 시설이 없습니다. 시설을 지도에 배치한 뒤 사용하세요.
              </p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500">확대 정도</span>
                  <div className="inline-flex items-center overflow-hidden rounded-md border border-slate-300">
                    <button
                      type="button"
                      onClick={() => setLevel((l) => Math.min(14, l + 1))}
                      className="inline-flex h-7 items-center gap-0.5 px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                      title="지도 축소 (장수 줄이기)"
                    >
                      <ZoomOut className="h-3.5 w-3.5" />
                      축소
                    </button>
                    <button
                      type="button"
                      onClick={() => setLevel((l) => Math.max(1, l - 1))}
                      className="inline-flex h-7 items-center gap-0.5 border-l border-slate-300 px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                      title="지도 확대 (더 선명·장수 늘기)"
                    >
                      <ZoomIn className="h-3.5 w-3.5" />
                      확대
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={start}
                    className="ml-auto inline-flex h-8 items-center gap-1 rounded-md bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800"
                  >
                    <ImageDown className="h-4 w-4" />
                    캡처 시작
                  </button>
                </div>
                <p className="text-[10.5px] leading-snug text-slate-500">
                  「캡처 시작」을 누르면 브라우저가 화면 공유를 한 번 물어봅니다 —
                  <b className="text-slate-700"> 현재 탭</b>을 선택해 허용하세요.
                  이후 앱이 지도를 자동으로 이동하며 캡처해 한 장으로 합칩니다.
                  캡처 중에는 다른 창으로 지도를 가리지 마세요.
                </p>
              </>
            )}
          </div>
        )}

        {/* 캡처 진행 */}
        {phase === 'capturing' && (
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-slate-700">
              <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
              캡처 중… {progress.done} / {progress.total || '?'}장
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full bg-slate-900 transition-all"
                style={{
                  width: progress.total
                    ? `${(progress.done / progress.total) * 100}%`
                    : '0%',
                }}
              />
            </div>
            <p className="text-[10.5px] text-slate-400">
              지도가 자동으로 움직입니다. 끝날 때까지 기다려 주세요.
            </p>
          </div>
        )}

        {/* 완료 */}
        {phase === 'done' && (
          <div className="mt-2 space-y-2">
            <p className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
              <Check className="h-4 w-4" />
              완료 — 지도 이미지를 다운로드했습니다.
            </p>
            {resultUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resultUrl}
                alt="캡처 결과 미리보기"
                className="max-h-40 w-auto rounded-md border border-slate-200"
              />
            )}
            <div className="flex items-center gap-2">
              {resultUrl && (
                <a
                  href={resultUrl}
                  download="지도캡처.png"
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <ImageDown className="h-4 w-4" />
                  다시 다운로드
                </a>
              )}
              <button
                type="button"
                onClick={() => {
                  setResultUrl(null)
                  setPhase('ready')
                }}
                className="inline-flex h-8 items-center rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                다시 캡처
              </button>
            </div>
          </div>
        )}

        {/* 오류 */}
        {phase === 'error' && (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-rose-700">{errorMsg}</p>
            <button
              type="button"
              onClick={() => setPhase('ready')}
              className="inline-flex h-8 items-center rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              다시 시도
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
