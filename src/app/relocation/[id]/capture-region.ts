// 화면 캡처 헬퍼 — getDisplayMedia 로 현재 탭 한 프레임을 받아
//   [data-sketch-canvas-region] 영역만 잘라 PNG File 로 반환.
//
// 지장이설 실사입력(FieldInspectionSaveDialog)의 캡처 로직을 공용화한 것.
//   - 거리뷰(Roadview) viewpoint 락 이벤트를 dispatch 해 「공유 중」 배너로 인한
//     viewport 축소 → SDK 자동 viewpoint 흔들림(화면 불일치)을 봉쇄.
//     RoadviewPanel 이 'roadview-lock-viewpoint' / 'roadview-restore-now' /
//     'roadview-unlock-viewpoint' 이벤트를 듣는다.
//   - 화면 공유 취소 시 null 반환 (호출부에서 무시).

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()))
}

// 「공유 중」 배너로 인한 layout shift 가 안정될 때까지 대기.
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
    setTimeout(finish, 500)
  })
  await nextFrame()
  await nextFrame()
  await sleep(800)
}

function cropCanvas(
  src: HTMLVideoElement,
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

function canvasToBlob(canvas: HTMLCanvasElement, mime = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b)
      else reject(new Error('이미지 변환 실패'))
    }, mime)
  })
}

export function displayMediaSupported(): boolean {
  if (typeof navigator === 'undefined') return false
  return !!(
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === 'function'
  )
}

export type CaptureResult =
  | { ok: true; file: File }
  | { ok: false; cancelled?: boolean; error?: string }

/**
 * 현재 탭 화면을 캡처해 [data-sketch-canvas-region] 영역만 PNG File 로 반환.
 * @param filenamePrefix 파일명 prefix (기본 'capture')
 */
export async function captureCanvasRegion(
  filenamePrefix = 'capture',
): Promise<CaptureResult> {
  if (!displayMediaSupported()) {
    return { ok: false, error: '이 기기는 화면 캡처를 지원하지 않습니다' }
  }

  let stream: MediaStream | null = null
  let roadviewLocked = false
  const video = document.createElement('video')
  try {
    try {
      window.dispatchEvent(new Event('roadview-lock-viewpoint'))
      roadviewLocked = true
    } catch {
      // ignore
    }

    try {
      const opts = {
        video: { cursor: 'never' },
        audio: false,
        preferCurrentTab: true,
      }
      stream = await navigator.mediaDevices.getDisplayMedia(
        opts as unknown as DisplayMediaStreamOptions,
      )
    } catch {
      return { ok: false, cancelled: true }
    }

    video.muted = true
    video.playsInline = true
    video.srcObject = stream
    video.style.cssText =
      'position:fixed;left:-10000px;top:0;width:2px;height:2px;opacity:0;pointer-events:none'
    document.body.appendChild(video)
    await video.play()
    for (let i = 0; i < 60 && video.videoWidth === 0; i++) await sleep(50)
    if (video.videoWidth === 0) {
      return { ok: false, error: '화면 영상을 받지 못했습니다' }
    }

    await waitForLayoutSettled()

    try {
      window.dispatchEvent(new Event('roadview-restore-now'))
    } catch {
      // ignore
    }
    await nextFrame()
    await nextFrame()
    await sleep(150)

    const region = document.querySelector('[data-sketch-canvas-region]') as
      | HTMLElement
      | null
    const rect = region ? region.getBoundingClientRect() : null
    let canvas: HTMLCanvasElement
    if (rect && rect.width > 10 && rect.height > 10) {
      const track = stream?.getVideoTracks()[0]
      const settings = (track?.getSettings?.() ?? {}) as { displaySurface?: string }
      const surface = settings.displaySurface
      const dpr = window.devicePixelRatio || 1
      let videoLeft = 0
      let videoTop = 0
      let scaleX: number
      let scaleY: number
      if (surface === 'browser' || !surface) {
        scaleX = video.videoWidth / window.innerWidth
        scaleY = video.videoHeight / window.innerHeight
      } else {
        const chromeTop = Math.max(0, window.outerHeight - window.innerHeight)
        videoLeft = window.screenX
        videoTop = window.screenY + chromeTop
        scaleX = dpr
        scaleY = dpr
      }
      const sx = Math.max(0, Math.round((videoLeft + rect.left) * scaleX))
      const sy = Math.max(0, Math.round((videoTop + rect.top) * scaleY))
      const sw = Math.min(video.videoWidth - sx, Math.round(rect.width * scaleX))
      const sh = Math.min(video.videoHeight - sy, Math.round(rect.height * scaleY))
      canvas = cropCanvas(video, sx, sy, sw, sh)
    } else {
      canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.drawImage(video, 0, 0)
    }

    const blob = await canvasToBlob(canvas, 'image/png')
    const file = new File([blob], `${filenamePrefix}-${Date.now()}.png`, {
      type: 'image/png',
    })
    return { ok: true, file }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  } finally {
    stream?.getTracks().forEach((t) => t.stop())
    if (video.parentNode) video.parentNode.removeChild(video)
    if (roadviewLocked) {
      try {
        window.dispatchEvent(new Event('roadview-unlock-viewpoint'))
      } catch {
        // ignore
      }
    }
  }
}
