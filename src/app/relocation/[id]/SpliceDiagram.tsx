import type { SpliceRow } from './SpliceTab'

// 함체 직선도 — 접속(splice)을 입력 코어 ↔ 출력 코어 단선결선도(bipartite)로 그린다.
//   왼쪽 = 입력 케이블·코어 (케이블별 정렬), 오른쪽 = 출력 케이블·코어.
//   연결선 색: 연속 코어 초록 / 비연속 주황. 케이블은 C1·C2… 태그 + 색으로 구분.

const CABLE_COLORS = [
  '#2563eb',
  '#16a34a',
  '#ea580c',
  '#7c3aed',
  '#0d9488',
  '#dc2626',
  '#ca8a04',
  '#475569',
]

export default function SpliceDiagram({
  splices,
  cableLabel,
}: {
  splices: SpliceRow[]
  cableLabel: (id: string) => string
}) {
  if (splices.length === 0) return null

  // 등장 케이블 → 인덱스·색·태그
  const cableIds: string[] = []
  for (const s of splices) {
    if (!cableIds.includes(s.in_cable_id)) cableIds.push(s.in_cable_id)
    if (!cableIds.includes(s.out_cable_id)) cableIds.push(s.out_cable_id)
  }
  const idxOf = new Map(cableIds.map((id, i) => [id, i]))
  const tagOf = (id: string) => `C${(idxOf.get(id) ?? 0) + 1}`
  const colorOf = (id: string) =>
    CABLE_COLORS[(idxOf.get(id) ?? 0) % CABLE_COLORS.length]

  // 좌(입력)·우(출력) 각각 케이블·코어 순 정렬
  const leftSorted = [...splices].sort(
    (a, b) =>
      (idxOf.get(a.in_cable_id) ?? 0) - (idxOf.get(b.in_cable_id) ?? 0) ||
      a.in_core - b.in_core,
  )
  const rightSorted = [...splices].sort(
    (a, b) =>
      (idxOf.get(a.out_cable_id) ?? 0) - (idxOf.get(b.out_cable_id) ?? 0) ||
      a.out_core - b.out_core,
  )
  const leftIdx = new Map(leftSorted.map((s, i) => [s.id, i]))
  const rightIdx = new Map(rightSorted.map((s, i) => [s.id, i]))

  const rowH = 26
  const topPad = 22
  const width = 400
  const leftX = 150
  const rightX = 250
  const height = splices.length * rowH + topPad + 8
  const y = (i: number) => topPad + i * rowH + rowH / 2

  return (
    <div>
      <div className="overflow-auto border border-slate-200 rounded-lg bg-white p-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          style={{ maxWidth: width, height: 'auto' }}
        >
          <text x={leftX} y={13} textAnchor="end" fontSize={10} fill="#64748b">
            입력
          </text>
          <text x={rightX} y={13} textAnchor="start" fontSize={10} fill="#64748b">
            출력
          </text>

          {/* 접속선 */}
          {splices.map((s) => {
            const ly = y(leftIdx.get(s.id) ?? 0)
            const ry = y(rightIdx.get(s.id) ?? 0)
            return (
              <path
                key={'line-' + s.id}
                d={`M ${leftX} ${ly} C ${leftX + 45} ${ly}, ${rightX - 45} ${ry}, ${rightX} ${ry}`}
                fill="none"
                stroke={s.is_continuous ? '#16a34a' : '#f59e0b'}
                strokeWidth={1.5}
              />
            )
          })}

          {/* 입력 노드 */}
          {leftSorted.map((s, i) => (
            <g key={'L-' + s.id}>
              <circle cx={leftX} cy={y(i)} r={3} fill={colorOf(s.in_cable_id)} />
              <text
                x={leftX - 9}
                y={y(i) + 3.5}
                textAnchor="end"
                fontSize={11}
                fill="#1e293b"
              >
                <tspan fill={colorOf(s.in_cable_id)} fontWeight="bold">
                  {tagOf(s.in_cable_id)}
                </tspan>
                {` 코어 ${s.in_core}`}
              </text>
            </g>
          ))}

          {/* 출력 노드 */}
          {rightSorted.map((s, i) => (
            <g key={'R-' + s.id}>
              <circle cx={rightX} cy={y(i)} r={3} fill={colorOf(s.out_cable_id)} />
              <text
                x={rightX + 9}
                y={y(i) + 3.5}
                textAnchor="start"
                fontSize={11}
                fill="#1e293b"
              >
                <tspan fill={colorOf(s.out_cable_id)} fontWeight="bold">
                  {tagOf(s.out_cable_id)}
                </tspan>
                {` 코어 ${s.out_core}`}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* 범례 */}
      <div className="mt-2 space-y-1 text-[11px] text-slate-500">
        <ul className="space-y-0.5">
          {cableIds.map((id) => (
            <li key={id} className="flex items-start gap-1.5">
              <span
                className="font-bold shrink-0"
                style={{ color: colorOf(id) }}
              >
                {tagOf(id)}
              </span>
              <span className="text-slate-600">{cableLabel(id)}</span>
            </li>
          ))}
        </ul>
        <p>
          <span className="text-emerald-600">━</span> 연속 코어 ·{' '}
          <span className="text-amber-500">━</span> 비연속 코어
        </p>
      </div>
    </div>
  )
}
