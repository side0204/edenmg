'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { X, Save, Search, Camera, Loader2, Upload } from 'lucide-react'
import { saveFieldInspection } from './field-inspection-actions'
import { formatFacilityCode, type ClosureType } from '@/lib/relocation'

// 「실사 화면을 시설에 저장」 다이얼로그.
//   1. 시설 선택 — preselected 가 있으면 prefill, 없으면 검색·리스트
//   2. 메모 입력 (선택)
//   3. 「캡처 + 저장」 → getDisplayMedia 로 현재 탭 한 프레임 → PNG → Storage 업로드
//
// 화면 공유 권한은 사용자 클릭에서 직접 요청 (브라우저 정책). 첫 사용 시 1회 허용.

type FacilityMini = {
  id: string
  closure_type: ClosureType
  seq_no: number
  name: string
}

type Props = {
  open: boolean
  onClose: () => void
  projectId: string
  facilities: FacilityMini[]
  // 기본 선택 시설 — 시설이 이미 선택되어 있으면 그것을 prefill
  preselectedFacilityId: string | null
  // 캡처 직전·직후 호출 — 도구바·핸들 숨김 처리용
  onCaptureRunningChange?: (running: boolean) => void
  // 저장 성공 시 알림 (FacilityInfoPanel router.refresh 등)
  onSaved?: (facilityId: string) => void
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// 다음 paint 까지 대기 (rAF 1회)
function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()))
}

/**
 * 화면 공유 시작 후 「공유 중」 배너로 인한 layout shift 가 안정될 때까지 대기.
 *
 *   브라우저 banner 가 viewport 상단을 잡아먹어 페이지가 ~30~40px 밀리면서
 *   `resize` 이벤트가 발생하고 (KakaoMap 도 이걸 받아 tile 을 재배치),
 *   SketchOverlay 좌표 재계산, SVG 재페인트가 일어난다. 시점이 어긋나면
 *   캡처된 video 프레임과 region.getBoundingClientRect() 값이 안 맞아
 *   그리기 위치가 어긋난 듯 보임.
 *
 *   동작:
 *     1. resize 이벤트 한 번 발생할 때까지 대기 (최대 500ms)
 *     2. 추가 paint 2 프레임 + 800ms 안정화
 *   resize 가 안 와도 (가끔 발생 안 함) sleep 만으로 충분히 settled.
 */
async function waitForLayoutSettled(): Promise<void> {
  await new Promise<void>((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      window.removeEventListener('resize', finish)
      resolve()
    }
    window.addEventListener('resize', finish, { once: true, passive: true })
    setTimeout(finish, 500) // resize 가 안 오면 fallback
  })
  // 추가 paint 2 프레임 + 안정화
  await nextFrame()
  await nextFrame()
  await sleep(800)
}

// HTMLCanvas 의 일부 영역을 잘라 새 canvas 로 반환
function cropCanvas(
  src: HTMLCanvasElement | HTMLVideoElement,
  x: number,
  y: number,
  w: number,
  h: number,
): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (ctx) ctx.drawImage(src, x, y, w, h, 0, 0, w, h)
  return c
}

// canvas → Blob
function canvasToBlob(canvas: HTMLCanvasElement, mime = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b)
      else reject(new Error('이미지 변환 실패'))
    }, mime)
  })
}

export default function FieldInspectionSaveDialog({
  open,
  onClose,
  projectId,
  facilities,
  preselectedFacilityId,
  onCaptureRunningChange,
  onSaved,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(preselectedFacilityId)
  const [note, setNote] = useState('')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'capturing' | 'uploading'>('idle')
  const [pickedFile, setPickedFile] = useState<File | null>(null)
  const runningRef = useRef(false)

  // 모바일 (iOS/Android) — getDisplayMedia 미지원·권한 흐름 불안정 → 파일 첨부 우선.
  const isMobile = useMemo(() => {
    if (typeof navigator === 'undefined') return false
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  }, [])
  const supportsDisplayMedia = useMemo(() => {
    if (typeof navigator === 'undefined') return false
    return !!(
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getDisplayMedia === 'function'
    )
  }, [])

  // open 토글 시 reset
  useEffect(() => {
    if (open) {
      setSelectedId(preselectedFacilityId)
      setNote('')
      setSearch('')
      setPhase('idle')
      setPickedFile(null)
    }
  }, [open, preselectedFacilityId])

  if (!open) return null

  const filtered =
    search.trim() === ''
      ? facilities
      : facilities.filter((f) => {
          const q = search.trim().toLowerCase()
          return (
            f.name.toLowerCase().includes(q) ||
            formatFacilityCode(f.closure_type, f.seq_no).toLowerCase().includes(q)
          )
        })

  const selected = selectedId
    ? facilities.find((f) => f.id === selectedId) ?? null
    : null

  // 파일 직접 업로드 — 모바일 스크린샷 첨부 흐름. getDisplayMedia 우회.
  async function doUploadFile(file: File) {
    if (runningRef.current) return
    if (!selected) {
      toast.error('저장할 시설을 선택하세요')
      return
    }
    if (!file.type.startsWith('image/')) {
      toast.error('이미지 파일만 첨부할 수 있습니다')
      return
    }
    setBusy(true)
    runningRef.current = true
    setPhase('uploading')
    try {
      const fd = new FormData()
      fd.append('project_id', projectId)
      fd.append('facility_id', selected.id)
      fd.append('note', note.trim())
      fd.append('file', file)
      const res = await saveFieldInspection(fd)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      const facName = `${formatFacilityCode(selected.closure_type, selected.seq_no)} ${selected.name}`
      toast.success(`「${facName}」에 실사 사진을 저장했습니다`)
      onSaved?.(selected.id)
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('실사 저장 실패: ' + msg)
    } finally {
      runningRef.current = false
      setBusy(false)
      setPhase('idle')
    }
  }

  async function doCaptureAndSave() {
    if (runningRef.current) return
    if (!selected) {
      toast.error('저장할 시설을 선택하세요')
      return
    }
    if (!supportsDisplayMedia) {
      toast.error(
        '이 기기는 화면 자동 캡처를 지원하지 않습니다. 「사진 파일 첨부」 를 사용하세요',
      )
      return
    }
    setBusy(true)
    runningRef.current = true
    let stream: MediaStream | null = null
    let roadviewLocked = false
    const video = document.createElement('video')
    try {
      // 거리뷰 viewpoint 락 — getDisplayMedia 호출 전 활성화.
      //   배너로 인한 viewport 축소 → Roadview SDK 자동 viewpoint 조정 봉쇄.
      //   (owner 보고 2026-05-25: 단순 viewpoint 저장·복원 + setViewpoint 만으론
      //    SDK 가 비동기로 한 번 더 흔드는 경우가 있음. viewpoint_changed 이벤트
      //    가드로 락 동안 발생하는 모든 변경을 즉시 되돌린다.)
      try {
        window.dispatchEvent(new Event('roadview-lock-viewpoint'))
        roadviewLocked = true
      } catch {}

      // 화면 공유 권한 요청 — 사용자 클릭에서 직접 호출 필수
      setPhase('capturing')
      try {
        // cursor: 'never' — 마우스 포인터를 캡처 영상에서 제외 (Chrome 지원).
        //   spec: MediaTrackConstraintSet.cursor — 일부 브라우저에서 미지원이라 cast.
        const opts = {
          video: { cursor: 'never' },
          audio: false,
          preferCurrentTab: true,
        }
        stream = await navigator.mediaDevices.getDisplayMedia(
          opts as unknown as DisplayMediaStreamOptions,
        )
      } catch {
        toast.error('화면 공유가 취소되었습니다')
        return
      }

      onCaptureRunningChange?.(true)

      // 비디오에 stream 연결 → 첫 프레임 확보
      video.muted = true
      video.playsInline = true
      video.srcObject = stream
      video.style.cssText =
        'position:fixed;left:-10000px;top:0;width:2px;height:2px;opacity:0;pointer-events:none'
      document.body.appendChild(video)
      await video.play()
      // 영상 크기 확보 대기
      for (let i = 0; i < 60 && video.videoWidth === 0; i++) await sleep(50)
      if (video.videoWidth === 0) throw new Error('화면 영상을 받지 못했습니다')

      // 안정화 대기 (owner 2026-05-25 보고):
      //   브라우저 「공유 중」 배너가 viewport 상단을 잡아먹어 페이지 콘텐츠가
      //   ~30~40px 아래로 밀리는데, layout 재계산 + KakaoMap 내부 타일 재배치 +
      //   SketchOverlay 좌표 재계산 모두 완료될 때까지 길게 기다린다.
      //   resize 이벤트 첫 발생 후 + 추가 paint 1-2 프레임 + 안정화 800ms.
      await waitForLayoutSettled()

      // 거리뷰 viewpoint 강제 복원 — 캡처 프레임을 읽기 직전에 한 번 더.
      //   폴링·이벤트 가드가 다 잡지 못한 SDK 비동기 흔들림 보정.
      try {
        window.dispatchEvent(new Event('roadview-restore-now'))
      } catch {}
      await nextFrame()
      await nextFrame()
      await sleep(150)

      // 캔버스 영역(SketchOverlay 가 자리잡은 flex-row)을 잘라낸다.
      //   data-sketch-canvas-region 속성으로 찾음 (TopologyCanvas 가 마크).
      const region = document.querySelector('[data-sketch-canvas-region]') as
        | HTMLElement
        | null
      const rect = region ? region.getBoundingClientRect() : null
      let canvas: HTMLCanvasElement
      if (rect && rect.width > 10 && rect.height > 10) {
        // 사용자가 어떤 화면을 공유했는지 — getSettings().displaySurface 로 판정.
        //   'browser' (탭) : video 영역 = 이 탭 viewport. window.innerWidth/Height 와 1:1
        //   'window'        : video 영역 = 브라우저 창 전체 (chrome 포함)
        //   'monitor'       : video 영역 = 전체 화면
        // 'window'·'monitor' 의 경우 viewport 의 위치는 window.screenX/Y +
        //   브라우저 chrome 높이만큼 아래로 떨어진 곳. 보정 안 하면 캡처 위치가 틀어짐.
        const track = stream?.getVideoTracks()[0]
        const settings = (track?.getSettings?.() ?? {}) as {
          displaySurface?: string
        }
        const surface = settings.displaySurface
        const dpr = window.devicePixelRatio || 1
        let videoLeft = 0
        let videoTop = 0
        let scaleX: number
        let scaleY: number
        if (surface === 'browser' || !surface) {
          // 탭 공유 (또는 displaySurface 미지원 → 가장 일반적인 케이스로 처리)
          scaleX = video.videoWidth / window.innerWidth
          scaleY = video.videoHeight / window.innerHeight
        } else {
          // 창 / 전체 화면 공유 — 브라우저 chrome 높이만큼 viewport 가 아래로 밀려 있음
          const chromeTop = Math.max(0, window.outerHeight - window.innerHeight)
          videoLeft = window.screenX
          videoTop = window.screenY + chromeTop
          scaleX = dpr
          scaleY = dpr
        }
        const sx = Math.max(0, Math.round((videoLeft + rect.left) * scaleX))
        const sy = Math.max(0, Math.round((videoTop + rect.top) * scaleY))
        const sw = Math.min(
          video.videoWidth - sx,
          Math.round(rect.width * scaleX),
        )
        const sh = Math.min(
          video.videoHeight - sy,
          Math.round(rect.height * scaleY),
        )
        canvas = cropCanvas(video, sx, sy, sw, sh)
      } else {
        // 영역 못 찾으면 전체 프레임
        canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        if (ctx) ctx.drawImage(video, 0, 0)
      }

      setPhase('uploading')
      const blob = await canvasToBlob(canvas, 'image/png')
      const file = new File([blob], `inspection-${Date.now()}.png`, {
        type: 'image/png',
      })

      const fd = new FormData()
      fd.append('project_id', projectId)
      fd.append('facility_id', selected.id)
      fd.append('note', note.trim())
      fd.append('file', file)
      const res = await saveFieldInspection(fd)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      const facName = `${formatFacilityCode(selected.closure_type, selected.seq_no)} ${selected.name}`
      toast.success(`「${facName}」에 실사 내용을 저장했습니다`)
      onSaved?.(selected.id)
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('실사 저장 실패: ' + msg)
    } finally {
      onCaptureRunningChange?.(false)
      runningRef.current = false
      setBusy(false)
      setPhase('idle')
      stream?.getTracks().forEach((t) => t.stop())
      if (video.parentNode) video.parentNode.removeChild(video)
      if (roadviewLocked) {
        try {
          window.dispatchEvent(new Event('roadview-unlock-viewpoint'))
        } catch {}
      }
    }
  }

  return (
    <div
      data-field-inspection-dialog
      className="fixed top-3 right-3 z-[60] w-[min(360px,calc(100vw-1.5rem))] max-h-[calc(100vh-1.5rem)]"
      style={{ transition: 'opacity 0.15s' }}
    >
      <div className="w-full max-h-[calc(100vh-1.5rem)] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 flex flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 px-3 h-10 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <Camera className="h-4 w-4 text-rose-600 shrink-0" />
            <h2 className="text-sm font-bold text-slate-900">실사 화면 저장</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-slate-400 hover:text-slate-900 disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-2">
          {isMobile || !supportsDisplayMedia ? (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-1.5 leading-snug">
              📱 모바일에서는 화면 자동 캡처가 동작하지 않아요. 휴대폰으로 <b>스크린샷을 찍어</b> 아래에서 사진을 선택해 주세요.
            </p>
          ) : (
            <p className="text-[11px] text-slate-500 leading-snug">
              현재 캔버스를 캡처해 시설에 첨부합니다. 「캡처 + 저장」 → 화면 공유 창에서 <b>현재 탭</b> 선택.
            </p>
          )}

          {/* 시설 선택 */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              저장할 시설 *
            </label>
            {selected ? (
              <div className="flex items-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {formatFacilityCode(selected.closure_type, selected.seq_no)}{' '}
                    {selected.name}
                  </p>
                  <p className="text-[10px] text-slate-500">{selected.closure_type}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  disabled={busy}
                  className="text-[11px] text-slate-500 hover:text-slate-900 disabled:opacity-40"
                >
                  변경
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="시설명·코드 검색"
                    className="w-full rounded-md border border-slate-300 pl-7 pr-3 py-1.5 text-sm focus:outline-none focus:border-slate-500"
                  />
                </div>
                <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-slate-200 divide-y divide-slate-100">
                  {filtered.length === 0 ? (
                    <p className="p-3 text-center text-xs text-slate-500">
                      검색 결과가 없습니다
                    </p>
                  ) : (
                    filtered.slice(0, 80).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setSelectedId(f.id)}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50"
                      >
                        <span className="font-medium text-slate-900">
                          {formatFacilityCode(f.closure_type, f.seq_no)}
                        </span>{' '}
                        <span className="text-slate-700">{f.name}</span>
                        <span className="ml-1 text-[10px] text-slate-400">
                          ({f.closure_type})
                        </span>
                      </button>
                    ))
                  )}
                </div>
                {filtered.length > 80 && (
                  <p className="mt-1 text-[10px] text-slate-500">
                    상위 80건만 표시 — 검색으로 좁히세요
                  </p>
                )}
              </>
            )}
          </div>

          {/* 메모 (선택) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              메모 <span className="text-slate-400 font-normal">(선택)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예: 함체 우측에 신설 분기함 자리"
              rows={2}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:border-slate-500"
            />
          </div>

          {/* 사진 파일 첨부 — 모바일 스크린샷 / 갤러리 / 카메라 사진.
              데스크탑에서도 사용 가능 (캡처 대신 미리 찍은 이미지 업로드). */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              사진 파일 첨부{' '}
              <span className="text-slate-400 font-normal">
                {isMobile ? '(권장)' : '(선택)'}
              </span>
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                setPickedFile(f)
              }}
              disabled={busy}
              className="block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200 disabled:opacity-40"
            />
            {pickedFile && (
              <p className="mt-1 text-[10px] text-slate-600 truncate">
                선택됨: {pickedFile.name} (
                {(pickedFile.size / 1024).toFixed(0)}KB)
              </p>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 px-3 py-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-slate-300 px-2.5 h-8 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => {
              if (pickedFile) {
                void doUploadFile(pickedFile)
              } else {
                void doCaptureAndSave()
              }
            }}
            disabled={
              !selected || busy || (!pickedFile && !supportsDisplayMedia)
            }
            className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-3 h-8 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {phase === 'capturing' ? '캡처 중…' : '업로드 중…'}
              </>
            ) : pickedFile ? (
              <>
                <Upload className="h-4 w-4" />
                업로드 + 저장
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                캡처 + 저장
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  )
}
