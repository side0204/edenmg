import { BarChart3 } from 'lucide-react'
import { TASK_TYPE_COLOR } from '@/lib/connection'
import type { Aggregation } from '@/lib/connection-aggregate'

/**
 * 접속일보 자재·공종 합계 카드 (server component).
 * 작업별 / 공사번호별 / 작업통계 양쪽에서 재사용.
 *
 * showBars: 각 항목 옆에 해당 그룹 내 max 대비 가로 막대 표시 (통계 페이지용).
 */
export function AggregationCard({
  title,
  subtitle,
  aggregation,
  showBars = false,
}: {
  title: string
  subtitle?: string
  aggregation: Aggregation
  showBars?: boolean
}) {
  const hasAny = aggregation.materials.length > 0 || aggregation.tasks.length > 0
  const maxTaskCount = aggregation.tasks.reduce((m, t) => Math.max(m, t.totalCount), 0)
  const maxMaterialQty = aggregation.materials.reduce(
    (m, x) => Math.max(m, x.totalQuantity),
    0,
  )
  return (
    <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
      <div>
        <h2 className="text-base font-semibold text-slate-700 tracking-tight inline-flex items-center gap-1.5">
          <BarChart3 className="h-4 w-4 text-slate-500" />
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        <p className="mt-1 text-[11px] text-slate-400">
          접속일보 {aggregation.reportCount}건 누적 (결재 상태 무관)
        </p>
      </div>

      {!hasAny ? (
        <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          집계할 접속일보가 없습니다.
        </p>
      ) : (
        <div className="space-y-4">
          {aggregation.tasks.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-600 mb-1.5">공종 합계</p>
              <ul className="space-y-1.5">
                {aggregation.tasks.map((t) => {
                  const ratio = maxTaskCount > 0 ? t.totalCount / maxTaskCount : 0
                  return (
                    <li key={t.key} className="space-y-0.5">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span
                          className={
                            'rounded-full border px-2 py-0.5 text-xs font-medium ' +
                            TASK_TYPE_COLOR[t.task_type]
                          }
                        >
                          {t.label}
                        </span>
                        <span className="font-semibold text-slate-900 tabular-nums">
                          ×{t.totalCount}
                        </span>
                      </div>
                      {showBars && (
                        <div className="h-1 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full bg-blue-500"
                            style={{ width: `${Math.max(2, Math.round(ratio * 100))}%` }}
                          />
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {aggregation.materials.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-600 mb-1.5">자재 합계</p>
              <ul className="space-y-1.5">
                {aggregation.materials.map((m) => {
                  const ratio = maxMaterialQty > 0 ? m.totalQuantity / maxMaterialQty : 0
                  return (
                    <li key={m.key} className="space-y-0.5">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium text-slate-900">{m.name}</span>
                          {m.spec && (
                            <span className="ml-1 text-xs text-slate-500">({m.spec})</span>
                          )}
                          {m.isCustom && (
                            <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-700">
                              직접입력
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 font-semibold text-slate-900 tabular-nums">
                          {formatQty(m.totalQuantity)}
                          {m.unit && <span className="ml-0.5 text-xs text-slate-500">{m.unit}</span>}
                        </span>
                      </div>
                      {showBars && (
                        <div className="h-1 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full bg-emerald-500"
                            style={{ width: `${Math.max(2, Math.round(ratio * 100))}%` }}
                          />
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function formatQty(n: number): string {
  // 소수점 자리 정리: 정수면 정수로, 소수 있으면 최대 3자리
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(3).replace(/\.?0+$/, '')
}
