/**
 * 작업 지시사항 노랑 배너.
 * 작업 상세·일보 작성 화면 어디서든 동일 톤으로 사용.
 * server component.
 */
export function InstructionsBanner({ instructions }: { instructions: string | null }) {
  if (!instructions) return null
  return (
    <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <p className="text-xs font-semibold text-amber-800 tracking-tight mb-1.5">
        작업자 지시사항
      </p>
      <p className="text-sm text-amber-900 whitespace-pre-wrap">{instructions}</p>
    </section>
  )
}
