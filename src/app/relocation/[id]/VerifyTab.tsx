import { AlertCircle, CircleCheck, TriangleAlert, ShieldCheck } from 'lucide-react'
import type { VerifyResult, Severity } from '@/lib/relocation-verify'

// 검증 탭 — 자동 검증 룰(§ 6-2) 결과 표시. 읽기 전용 (page.tsx 에서 계산해 전달).

const SEV: Record<
  Severity,
  { box: string; badge: string; icon: typeof AlertCircle; label: string }
> = {
  red: {
    box: 'border-rose-200 bg-rose-50',
    badge: 'bg-rose-600 text-white',
    icon: AlertCircle,
    label: '오류',
  },
  yellow: {
    box: 'border-amber-200 bg-amber-50',
    badge: 'bg-amber-500 text-white',
    icon: TriangleAlert,
    label: '주의',
  },
}

export default function VerifyTab({
  result,
  facilityCount,
}: {
  result: VerifyResult
  facilityCount: number
}) {
  if (facilityCount === 0) {
    return (
      <div className="text-center py-12">
        <ShieldCheck className="mx-auto h-10 w-10 text-slate-300" />
        <p className="mt-3 text-sm text-slate-500">
          시설·케이블을 먼저 등록하면 설계 검증을 할 수 있습니다.
        </p>
      </div>
    )
  }

  const { findings, redCount, yellowCount } = result
  const pass = redCount === 0 && yellowCount === 0

  return (
    <div className="space-y-5">
      {/* 요약 */}
      {pass ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3">
          <CircleCheck className="h-6 w-6 shrink-0 text-emerald-600" />
          <div>
            <p className="text-sm font-semibold text-emerald-900">검증 통과</p>
            <p className="text-xs text-emerald-700 mt-0.5">
              자동 검증 룰에서 발견된 문제가 없습니다.
            </p>
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center h-7 min-w-7 rounded-lg bg-rose-600 px-2 text-sm font-bold text-white">
                {redCount}
              </span>
              <span className="text-sm text-slate-600">오류</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center h-7 min-w-7 rounded-lg bg-amber-500 px-2 text-sm font-bold text-white">
                {yellowCount}
              </span>
              <span className="text-sm text-slate-600">주의</span>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            오류(빨강)는 설계를 확정하기 전 반드시 해결해야 합니다. 주의(노랑)는 설계자
            판단입니다.
          </p>
        </section>
      )}

      {/* 발견 항목 */}
      {findings.length > 0 && (
        <ul className="space-y-2">
          {findings.map((f, i) => {
            const s = SEV[f.severity]
            const Icon = s.icon
            return (
              <li key={i} className={'rounded-xl border p-3 ' + s.box}>
                <div className="flex items-start gap-2">
                  <Icon
                    className={
                      'h-4 w-4 shrink-0 mt-0.5 ' +
                      (f.severity === 'red' ? 'text-rose-600' : 'text-amber-600')
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={
                          'inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ' +
                          s.badge
                        }
                      >
                        {f.rule}
                      </span>
                      <span className="text-sm font-semibold text-slate-900">
                        {f.title}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-700">{f.target}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{f.detail}</p>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* 검증 범위 안내 */}
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 space-y-1">
        <p className="font-semibold text-slate-600">검증 범위</p>
        <p>
          C1·C2(함체 케이블·코어 한도) · C3(신설 분기) · S1(함체 규격) · R1(RN 다이버시티) ·
          D1·D2(이원화 분리) · T1(공종 수량) 룰을 검사합니다.
        </p>
        <p>
          O1(동일 케이블 코어 중복)·E1(기설 코어 보존)은 DB 제약으로 항상 차단되어
          별도 표시하지 않습니다. U1·U2(유니트·여장판 최적화)는 접속(splice) 입력 기능이
          갖춰진 뒤 추가됩니다.
        </p>
      </section>
    </div>
  )
}
