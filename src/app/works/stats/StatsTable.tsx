import type { StatsTableData } from '@/lib/connection-aggregate'

/**
 * 일보 단위 wide 표.
 * 좌측 메타 (일자/연/월/작업자/공사번호/작업명) 고정 컬럼.
 * 우측: 공종 컬럼들 + 자재 컬럼들 (총량 내림차순).
 *
 * 모바일: 가로 스크롤. 첫 컬럼(일자) sticky left-0.
 */
export function StatsTable({ data }: { data: StatsTableData }) {
  if (data.rows.length === 0) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center">
        <p className="text-sm text-slate-500">
          표시할 일보가 없습니다. 기간·권한 조건을 확인하세요.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50">
            <tr className="text-left">
              <th className="sticky left-0 z-10 bg-slate-50 border-b border-r border-slate-200 px-2 py-2 font-semibold text-slate-700 whitespace-nowrap">
                일자
              </th>
              <th className="border-b border-slate-200 px-2 py-2 font-semibold text-slate-700 whitespace-nowrap">
                연
              </th>
              <th className="border-b border-slate-200 px-2 py-2 font-semibold text-slate-700 whitespace-nowrap">
                월
              </th>
              <th className="border-b border-slate-200 px-2 py-2 font-semibold text-slate-700 whitespace-nowrap">
                작업자
              </th>
              <th className="border-b border-slate-200 px-2 py-2 font-semibold text-slate-700 whitespace-nowrap">
                공사번호
              </th>
              <th className="border-b border-slate-200 px-2 py-2 font-semibold text-slate-700 whitespace-nowrap">
                작업명
              </th>
              {data.taskColumns.map((c) => (
                <th
                  key={c.key}
                  className="border-b border-l border-slate-200 px-2 py-2 font-semibold text-blue-700 whitespace-nowrap text-right"
                  title={`공종 합계 ×${c.totalCount}`}
                >
                  {c.label}
                </th>
              ))}
              {data.materialColumns.map((c) => (
                <th
                  key={c.key}
                  className="border-b border-l border-slate-200 px-2 py-2 font-semibold text-emerald-700 whitespace-nowrap text-right"
                  title={`자재 합계 ${formatQty(c.totalQuantity)}${c.unit ?? ''}`}
                >
                  {c.name}
                  {c.spec && <span className="ml-1 font-normal text-slate-500">({c.spec})</span>}
                  {c.unit && <span className="ml-1 font-normal text-slate-500">{c.unit}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.reportId} className="even:bg-slate-50/40 hover:bg-slate-50">
                <td className="sticky left-0 z-10 bg-white border-b border-r border-slate-200 px-2 py-1.5 font-medium text-slate-900 whitespace-nowrap">
                  {r.date}
                </td>
                <td className="border-b border-slate-200 px-2 py-1.5 text-slate-700 whitespace-nowrap">
                  {r.year}
                </td>
                <td className="border-b border-slate-200 px-2 py-1.5 text-slate-700 whitespace-nowrap">
                  {r.month}
                </td>
                <td className="border-b border-slate-200 px-2 py-1.5 text-slate-700 whitespace-nowrap">
                  {r.workerName}
                </td>
                <td className="border-b border-slate-200 px-2 py-1.5 text-slate-700 whitespace-nowrap">
                  {r.orderId ?? ''}
                </td>
                <td className="border-b border-slate-200 px-2 py-1.5 text-slate-700 whitespace-nowrap">
                  {r.workName}
                </td>
                {data.taskColumns.map((c) => {
                  const v = r.taskCounts.get(c.key)
                  return (
                    <td
                      key={c.key}
                      className="border-b border-l border-slate-200 px-2 py-1.5 text-right tabular-nums whitespace-nowrap"
                    >
                      {v ? <span className="font-medium text-slate-900">{v}</span> : <span className="text-slate-300">·</span>}
                    </td>
                  )
                })}
                {data.materialColumns.map((c) => {
                  const v = r.materialQtys.get(c.key)
                  return (
                    <td
                      key={c.key}
                      className="border-b border-l border-slate-200 px-2 py-1.5 text-right tabular-nums whitespace-nowrap"
                    >
                      {v ? (
                        <span className="font-medium text-slate-900">{formatQty(v)}</span>
                      ) : (
                        <span className="text-slate-300">·</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50">
            <tr className="text-right text-slate-700 font-semibold">
              <td
                colSpan={6}
                className="sticky left-0 z-10 bg-slate-50 border-t border-r border-slate-200 px-2 py-2 text-left whitespace-nowrap"
              >
                합계 ({data.rows.length}건)
              </td>
              {data.taskColumns.map((c) => (
                <td
                  key={c.key}
                  className="border-t border-l border-slate-200 px-2 py-2 tabular-nums whitespace-nowrap text-blue-700"
                >
                  {c.totalCount}
                </td>
              ))}
              {data.materialColumns.map((c) => (
                <td
                  key={c.key}
                  className="border-t border-l border-slate-200 px-2 py-2 tabular-nums whitespace-nowrap text-emerald-700"
                >
                  {formatQty(c.totalQuantity)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
        좌우로 스크롤하면 공종·자재 모든 컬럼을 볼 수 있습니다. CSV 다운로드로 엑셀에서 자유롭게
        가공하세요.
      </p>
    </div>
  )
}

function formatQty(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(3).replace(/\.?0+$/, '')
}
