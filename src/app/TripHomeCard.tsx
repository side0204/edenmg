import Link from 'next/link'
import { Car } from 'lucide-react'
import { hmKST, type TransportKind } from '@/lib/trips'
import { BigTimes, StatusText, TD, TH, Table, TransportLegend, TransportTag, TwoLine } from './trips/ui'
import ElapsedText from './trips/ElapsedText'

export type TripHomeRow = {
  id: string
  driverId: string
  driverName: string
  purpose: string | null
  place: string | null
  departedAt: string
  expectedArrivalAt: string | null
  transport: TransportKind
  transportLabel: string
  companions: string[]
  isMine: boolean
  isRiding: boolean
}

/**
 * 홈 「외근·차량」 카드 — 내 상태(큰 시각 + 도착 버튼) + 지금 외근 중 표 + 차량 한 줄.
 * 기존 「업무용 차량」 + 「휴가·외근 현황」 두 카드를 합친 것 (2026-09-20).
 */
export default function TripHomeCard({
  trips,
  vehicleTotal,
  vehicleInUse,
  idleLabel,
}: {
  trips: TripHomeRow[]
  vehicleTotal: number
  vehicleInUse: number
  idleLabel: string | null
}) {
  const mine = trips.find((t) => t.isMine) ?? null
  const riding = !mine ? trips.find((t) => t.isRiding) ?? null : null
  const others = trips.filter((t) => !t.isMine)

  return (
    <section className="rounded-2xl bg-white shadow-sm border border-slate-200 dark:bg-slate-900 dark:border-slate-800 p-6 space-y-3">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 tracking-tight dark:text-slate-300">
        <Car className="h-5 w-5 text-slate-400" />
        외근·차량
        <Link href="/trips" className="ml-auto text-xs font-medium text-slate-500 hover:text-slate-900">
          전체 보기 →
        </Link>
      </h2>

      {mine ? (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <StatusText text="외근 중" tone="emerald" />
            <TransportTag transport={mine.transport} label={mine.transportLabel} />
          </div>
          <p className="text-[17px] font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {mine.purpose}
            {mine.place && <span className="ml-1.5 text-[13px] font-normal text-slate-500">· {mine.place}</span>}
          </p>
          <BigTimes
            dep={hmKST(mine.departedAt)}
            arr={mine.expectedArrivalAt ? hmKST(mine.expectedArrivalAt) : '—'}
            depLabel={
              <>
                출발 · <ElapsedText fromIso={mine.departedAt} />
                {mine.companions.length > 0 && ` · 동행 ${mine.companions.join(' · ')}`}
              </>
            }
            arrLabel={mine.expectedArrivalAt ? '도착 예정' : '도착 예정 없음'}
            size="text-2xl leading-7"
          />
          <Link
            href={`/trips/${mine.id}/end`}
            className="block rounded-[14px] bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 px-4 py-[15px] text-base font-bold text-white text-center"
          >
            도착 · 반납하기
          </Link>
        </div>
      ) : (
        <div className="space-y-2.5">
          {riding ? (
            <p className="text-sm text-slate-700 dark:text-slate-300">
              <StatusText text="외근 중 (동승)" tone="emerald" /> <b>{riding.driverName}</b> 님과 · {riding.place ?? '—'} ·{' '}
              {hmKST(riding.departedAt)} 출발
            </p>
          ) : (
            <p className="text-sm text-slate-500">지금 외근 중이 아닙니다.</p>
          )}
          <Link
            href="/trips/new"
            className="block rounded-[14px] bg-slate-900 hover:bg-slate-800 active:bg-slate-700 px-4 py-[15px] text-base font-bold text-white text-center"
          >
            외근 시작
          </Link>
        </div>
      )}

      <div className="h-px bg-slate-100 dark:bg-slate-800" />

      <p className="text-xs font-semibold text-slate-500">
        지금 외근 중 <span className="text-emerald-700">{trips.length}</span>
        {mine && others.length > 0 && ' · 나 외'} {mine ? others.length > 0 && `${others.length}명` : ''}
      </p>
      {others.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-4 text-center text-sm text-slate-500 dark:bg-slate-800">
          {mine ? '다른 외근자가 없습니다.' : '외근 중인 직원이 없습니다.'}
        </p>
      ) : (
        <Table>
          <colgroup>
            <col className="w-[64px]" />
            <col />
            <col className="w-[78px]" />
            <col className="w-[70px]" />
          </colgroup>
          <thead>
            <tr>
              <th className={TH}>이름</th>
              <th className={TH}>장소 · 목적</th>
              <th className={TH}>출발 → 도착</th>
              <th className={TH}>차량</th>
            </tr>
          </thead>
          <tbody>
            {others.map((t) => (
              <tr key={t.id}>
                <td className={TD}>
                  <TwoLine top={<b className="font-semibold">{t.driverName}</b>} bottom={t.companions.join('·') || undefined} wrap />
                </td>
                <td className={TD}>
                  <TwoLine top={t.place ?? '—'} bottom={t.purpose ?? undefined} />
                </td>
                <td className={TD}>
                  <TwoLine
                    top={`${hmKST(t.departedAt)} → ${t.expectedArrivalAt ? hmKST(t.expectedArrivalAt) : '—'}`}
                    bottom={t.expectedArrivalAt ? '예정' : '도착 미정'}
                  />
                </td>
                <td className={TD}>
                  <TransportTag transport={t.transport} label={t.transportLabel.split(' ')[0]} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <TransportLegend />

      <p className="flex items-center gap-2 text-[13px] text-slate-600 dark:text-slate-300">
        <Car className="h-4 w-4 shrink-0 text-slate-400" />
        <span>
          업무용 {vehicleTotal}대 중 <b>{vehicleInUse}대 사용 중</b>
          {idleLabel && (
            <span className="text-slate-500">
              {' '}
              · 대기 {idleLabel}
            </span>
          )}
        </span>
      </p>
    </section>
  )
}
