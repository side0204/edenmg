// 지장이설 도식(schematic) 캔버스를 PNG 이미지로 내보내기.
//   도식 모드 SVG 는 지도 타일·외부 이미지가 없는 자기완결 벡터라
//   화면 공유(자동 캡처) 없이 SVG 직렬화 → 래스터화만으로 깔끔하게 추출된다.
//
// 주의:
//   - 텍스트 색은 Tailwind 클래스(fill-slate-* 등)로 들어가 직렬화 시 사라지므로
//     live DOM 의 계산된 fill 을 인라인 attribute 로 박는다.
//   - 흰 배경은 CSS background 라 직렬화 안 됨 → 흰 rect 를 깐다.
//   - Pretendard 웹폰트는 래스터화 샌드박스에서 못 불러와 시스템 한글 글꼴로
//     대체된다 (가독성엔 문제 없음).

const SVG_NS = 'http://www.w3.org/2000/svg'
const MAX_DIM = 6000 // PNG 한 변 최대 px
const SCALE = 2 // 기본 2배 해상도

export type ExportBox = { x: number; y: number; width: number; height: number }

export async function exportSchematicPng(
  liveSvg: SVGSVGElement,
  box: ExportBox,
  fileName: string,
): Promise<void> {
  // 1. SVG 복제 + 내보내기용 정리
  const clone = liveSvg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', SVG_NS)
  clone.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`)
  clone.setAttribute('width', String(box.width))
  clone.setAttribute('height', String(box.height))
  clone.removeAttribute('style')

  // 흰 배경 rect — viewBox 전체를 덮어 가장 아래에
  const bg = document.createElementNS(SVG_NS, 'rect')
  bg.setAttribute('x', String(box.x))
  bg.setAttribute('y', String(box.y))
  bg.setAttribute('width', String(box.width))
  bg.setAttribute('height', String(box.height))
  bg.setAttribute('fill', '#ffffff')
  clone.insertBefore(bg, clone.firstChild)

  // 텍스트 색 — live DOM 의 계산된 fill 을 인라인으로 고정
  const liveTexts = liveSvg.querySelectorAll('text')
  const cloneTexts = clone.querySelectorAll('text')
  for (let i = 0; i < liveTexts.length && i < cloneTexts.length; i++) {
    const fill = getComputedStyle(liveTexts[i]).fill
    if (fill) cloneTexts[i].setAttribute('fill', fill)
    cloneTexts[i].removeAttribute('class')
  }

  // 2. 직렬화 → 이미지 로드
  const svgStr = new XMLSerializer().serializeToString(clone)
  const svgUrl = URL.createObjectURL(
    new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' }),
  )
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('도식 이미지를 만들지 못했습니다'))
      img.src = svgUrl
    })

    // 3. 캔버스에 래스터화 (2배 해상도, 한 변 최대 6000px)
    let scale = SCALE
    if (box.width * scale > MAX_DIM || box.height * scale > MAX_DIM) {
      scale = Math.min(MAX_DIM / box.width, MAX_DIM / box.height)
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(box.width * scale))
    canvas.height = Math.max(1, Math.round(box.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('캔버스를 만들지 못했습니다')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    // 4. PNG 다운로드
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    )
    if (!blob) throw new Error('PNG 변환에 실패했습니다')
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}
