import {
  CLOSURE_TYPE_LABEL,
  CLOSURE_TYPE_VALUES,
  formatFacilityCode,
  type ClosureType,
} from '@/lib/relocation'

type FacilityMini = {
  id: string
  closure_type: ClosureType
  seq_no: number
  name: string
  parent_facility_id: string | null
}

/**
 * 좌측 패널 — 시설 번호 목록 (종류별 그룹).
 * 사양 § 7-2-1.
 *
 * 현재 골격: 검색·캔버스 점프는 Phase 3 시각화와 함께. 지금은 단순 표시.
 */
export default function LeftPanel({ facilities }: { facilities: FacilityMini[] }) {
  const grouped = new Map<ClosureType, FacilityMini[]>()
  for (const t of CLOSURE_TYPE_VALUES) grouped.set(t, [])
  for (const f of facilities) grouped.get(f.closure_type)!.push(f)
  for (const arr of grouped.values()) arr.sort((a, b) => a.seq_no - b.seq_no)

  return (
    <aside className="border border-slate-200 rounded-xl bg-white p-3 space-y-3 text-sm">
      <header>
        <p className="font-semibold text-slate-700">시설 목록</p>
        <p className="text-xs text-slate-500">총 {facilities.length}건</p>
      </header>
      {facilities.length === 0 ? (
        <p className="text-xs text-slate-400 italic">아직 등록된 시설이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {CLOSURE_TYPE_VALUES.filter((t) => grouped.get(t)!.length > 0).map((t) => (
            <details key={t} open className="">
              <summary className="cursor-pointer text-xs font-semibold text-slate-600 hover:text-slate-900">
                {CLOSURE_TYPE_LABEL[t]} ({grouped.get(t)!.length})
              </summary>
              <ul className="mt-1 space-y-0.5 ml-2 text-xs text-slate-700">
                {grouped.get(t)!.map((f) => (
                  <li key={f.id} className="flex gap-1.5">
                    <span className="font-mono text-slate-400 shrink-0">
                      {formatFacilityCode(f.closure_type, f.seq_no)}
                    </span>
                    <span className="truncate">{f.name}</span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </aside>
  )
}
