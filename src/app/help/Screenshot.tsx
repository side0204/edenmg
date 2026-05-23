// 시나리오 페이지용 스크린샷 컴포넌트.
// public/help/screenshots/<파일명> 이 있으면 자동으로 사진을 표시,
// 없으면 amber/회색 「자리표시」 박스로 표시 (필수/선택 분기).
//
// 사용 흐름:
//   1. 시나리오 페이지에 <Screenshot file="..." caption="..." priority="must" /> 박음
//   2. owner 가 같은 파일명으로 PNG 를 public/help/screenshots/ 에 드롭
//   3. 페이지 자동 반영 (코드 편집 불필요)

import fs from 'node:fs'
import path from 'node:path'

export function Screenshot({
  file,
  caption,
  priority = 'must',
}: {
  file: string
  caption: string
  priority?: 'must' | 'optional'
}) {
  // process.cwd() 는 Next.js 빌드·서버 모두 프로젝트 루트.
  // 빌드 시점에 한 번 평가됨 — 새 파일 추가 시 dev 서버는 HMR, prod 는 재배포 필요.
  const fullPath = path.join(
    process.cwd(),
    'public',
    'help',
    'screenshots',
    file,
  )
  const exists = fs.existsSync(fullPath)

  if (exists) {
    return (
      <figure className="rounded-lg border border-slate-200 overflow-hidden bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/help/screenshots/${file}`}
          alt={caption}
          className="block w-full h-auto"
        />
        <figcaption className="px-3 py-2 text-xs text-slate-600 border-t border-slate-200 bg-slate-50">
          {caption}
        </figcaption>
      </figure>
    )
  }

  // 자리표시 — 필수는 amber, 선택은 slate
  const must = priority === 'must'
  return (
    <div
      className={
        'rounded-lg border-2 border-dashed px-4 py-5 text-sm ' +
        (must
          ? 'border-amber-300 bg-amber-50 text-amber-900'
          : 'border-slate-300 bg-slate-50 text-slate-600')
      }
    >
      <p className="font-semibold">
        📸 스크린샷 자리 {must ? '(필수)' : '(선택)'}
      </p>
      <p className="mt-1">{caption}</p>
      <p className="mt-3 text-xs font-mono break-all">{file}</p>
      <p className="mt-1 text-xs">
        위 파일명으로 PNG 를{' '}
        <code className="font-mono">public/help/screenshots/</code> 에 저장하면 자동
        표시됩니다.
      </p>
    </div>
  )
}
