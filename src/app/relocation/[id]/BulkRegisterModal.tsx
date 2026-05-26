'use client'

import { useMemo, useState } from 'react'
import { X, Layers, ArrowRight } from 'lucide-react'
import { parseBulkRegisterText } from './bulk-register-parser'

// 시설물 일괄등록 모달 — 캔버스 툴바 「시설물 일괄등록」 버튼이 연다.
//   1) 텍스트 박스에 C/L 라인 입력
//   2) 파싱 결과 미리보기 (함체·케이블 수 + 오류)
//   3) 가로/세로/자동 토글 선택
//   4) 「범위 지정하기」 누르면 모달 닫히고 캔버스 드래그 모드로 전환

export type BulkRegisterPayload = {
  text: string
  direction: 'horizontal' | 'vertical' | 'auto'
  parsedClosureCount: number
  parsedCableCount: number
}

const SAMPLE = `// 접속함체:   C, 함체규격, ID, 구분(가공/관로/중접/중간분기/SP), 명칭
// 케이블:    L, 코어수, ID, 구분(가공/구내/해저/입상/지중), from시설명, to시설명
C, 36, 2222, 가공, 1번접속함체
C, 36, 2223, 가공, 2번접속함체
L, 36, 3333, 지중, 1번접속함체, 2번접속함체`

export default function BulkRegisterModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  onConfirm: (payload: BulkRegisterPayload) => void
}) {
  const [text, setText] = useState('')
  const [direction, setDirection] = useState<'horizontal' | 'vertical' | 'auto'>('auto')

  const parsed = useMemo(() => parseBulkRegisterText(text), [text])
  const total = parsed.closures.length + parsed.cables.length
  const canConfirm = total > 0 && parsed.errors.length === 0

  const onConfirmClick = () => {
    onConfirm({
      text,
      direction,
      parsedClosureCount: parsed.closures.length,
      parsedCableCount: parsed.cables.length,
    })
  }

  return (
    <div
      className={
        'fixed inset-0 z-[55] flex items-end sm:items-center justify-center bg-black/50 p-3 ' +
        (open ? '' : 'hidden pointer-events-none')
      }
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <p className="inline-flex items-center gap-2 text-xl font-extrabold text-slate-900">
            <Layers className="h-5 w-5 text-slate-600" />
            시설물 일괄등록
          </p>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-900"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-700 space-y-1">
            <p className="font-semibold">입력 형식 (대소문자 무시, 줄 단위 입력)</p>
            <p>
              · <span className="font-mono font-bold">C, 함체규격, ID, 구분, 명칭</span>{' '}
              <span className="text-slate-500">— 접속함체</span>
            </p>
            <p>
              · <span className="font-mono font-bold">L, 코어수, ID, 구분, from, to</span>{' '}
              <span className="text-slate-500">— 케이블</span>
            </p>
            <p className="text-slate-500">
              · 함체규격/코어수: 12, 36, 72, 144, 288, 576 등 (자동 「NC」 매핑) — 시설정보패널 「함체 규격」 과 동일
            </p>
            <p className="text-slate-500">
              from·to 시설명이 매칭 안 되면 「미연결 케이블」 로 보관됩니다.
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              일괄 입력
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={12}
              placeholder={SAMPLE}
              spellCheck={false}
              className="w-full rounded-md border-2 border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:border-emerald-500 focus:ring-emerald-300"
            />
          </div>

          {/* 파싱 결과 미리보기 */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-2">
              <p className="text-[10px] font-semibold text-emerald-700">접속함체</p>
              <p className="text-xl font-extrabold text-emerald-900 tabular-nums">
                {parsed.closures.length}
              </p>
            </div>
            <div className="rounded-md bg-blue-50 border border-blue-200 px-2 py-2">
              <p className="text-[10px] font-semibold text-blue-700">케이블</p>
              <p className="text-xl font-extrabold text-blue-900 tabular-nums">
                {parsed.cables.length}
              </p>
            </div>
            <div
              className={
                'rounded-md border px-2 py-2 ' +
                (parsed.errors.length > 0
                  ? 'bg-rose-50 border-rose-200'
                  : 'bg-slate-50 border-slate-200')
              }
            >
              <p
                className={
                  'text-[10px] font-semibold ' +
                  (parsed.errors.length > 0 ? 'text-rose-700' : 'text-slate-500')
                }
              >
                오류
              </p>
              <p
                className={
                  'text-xl font-extrabold tabular-nums ' +
                  (parsed.errors.length > 0 ? 'text-rose-900' : 'text-slate-400')
                }
              >
                {parsed.errors.length}
              </p>
            </div>
          </div>

          {parsed.errors.length > 0 && (
            <ul className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 max-h-32 overflow-y-auto space-y-0.5">
              {parsed.errors.slice(0, 10).map((err, i) => (
                <li key={i} className="text-[11px] text-rose-800">
                  <span className="font-mono font-bold">L{err.lineNo}</span>: {err.message}
                </li>
              ))}
              {parsed.errors.length > 10 && (
                <li className="text-[11px] text-rose-600 italic">
                  ... 그 외 {parsed.errors.length - 10}건
                </li>
              )}
            </ul>
          )}

          {/* 배치 방향 토글 */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              배치 방향
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { v: 'auto', label: '자동', desc: '드래그 영역 종횡비' },
                  { v: 'horizontal', label: '가로 ↔', desc: '1행 N열' },
                  { v: 'vertical', label: '세로 ↕', desc: 'N행 1열' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setDirection(opt.v)}
                  className={
                    'rounded-md border-2 px-3 py-2 text-sm font-bold ' +
                    (direction === opt.v
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')
                  }
                >
                  <p>{opt.label}</p>
                  <p className="mt-0.5 text-[10px] font-normal text-slate-500">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirmClick}
            disabled={!canConfirm}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            범위 지정하기
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
