'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronUp, ChevronDown } from 'lucide-react'

// 작업 순서 안내 표시줄 — 프로젝트 페이지 최상단.
//   설계 데이터의 유무로 각 단계의 완료 여부를 자동 판정하고,
//   비개발자 owner 에게 "지금 무엇을 할 차례인지" 를 알려준다.
//   각 단계는 해당 탭으로 가는 링크. 우상단 화살표로 접기/펼치기.

export type ProgressStep = {
  tab: string
  label: string
  done: boolean
  detail?: string // 단계 옆 작은 보조 텍스트 (예: "시설 7개")
  warn?: boolean // 빨강 강조 (예: 검증 오류 있음)
}

// 단계별 다음 할 일 안내 문구 — 비개발자가 바로 이해할 수 있게.
const STEP_HINT: Record<string, string> = {
  facilities: '국사·함체·맨홀 등 시설을 등록하세요',
  cables: '시설을 잇는 광케이블을 입력하세요',
  cores: '회선과 사용 코어를 배정하세요',
  verify: '설계 오류를 확인하고 수정하세요',
  phases: '작업 차수를 자동 분할하세요',
  export: '기별명세서를 내보내세요',
}

type StepBarTheme = {
  current: string // 현재 단계 동그라미
  currentLabel: string // 현재 단계 라벨
  activeRing: string // 현재 탭 ring
  link: string // "다음 할 일" 링크 색
}
const CATEGORY_STEP_THEME: Record<string, StepBarTheme> = {
  청약: {
    current: 'bg-emerald-600 text-white',
    currentLabel: 'font-semibold text-emerald-700',
    activeRing: 'bg-emerald-50 ring-1 ring-emerald-300',
    link: 'text-emerald-700',
  },
  계획: {
    current: 'bg-blue-600 text-white',
    currentLabel: 'font-semibold text-blue-700',
    activeRing: 'bg-blue-50 ring-1 ring-blue-300',
    link: 'text-blue-700',
  },
  지장이설: {
    current: 'bg-amber-600 text-white',
    currentLabel: 'font-semibold text-amber-700',
    activeRing: 'bg-amber-50 ring-1 ring-amber-300',
    link: 'text-amber-700',
  },
}
const FALLBACK_THEME: StepBarTheme = {
  current: 'bg-slate-900 text-white',
  currentLabel: 'font-semibold text-slate-900',
  activeRing: 'bg-slate-100 ring-1 ring-slate-300',
  link: 'text-slate-700',
}

export default function ProgressStepBar({
  projectId,
  steps,
  currentTab,
  category,
}: {
  projectId: string
  steps: ProgressStep[]
  currentTab: string
  category?: string
}) {
  const theme = (category && CATEGORY_STEP_THEME[category]) || FALLBACK_THEME
  const [collapsed, setCollapsed] = useState(false)

  // 현재 할 일 = 빨강 경고 단계 우선, 없으면 첫 미완료 단계
  const warnIdx = steps.findIndex((s) => s.warn && !s.done)
  const firstTodoIdx = steps.findIndex((s) => !s.done)
  const currentIdx = warnIdx >= 0 ? warnIdx : firstTodoIdx
  const nextStep = currentIdx >= 0 ? steps[currentIdx] : null
  const allDone = firstTodoIdx < 0

  // 접힌 상태 — 한 줄 요약 + 펼치기 화살표
  if (collapsed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          작업 순서
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500">
          {nextStep ? (
            <>
              {nextStep.warn ? '먼저 해결할 일' : '다음 할 일'}:{' '}
              <Link
                href={`/relocation/${projectId}?tab=${nextStep.tab}`}
                className={
                  'font-semibold underline-offset-2 hover:underline ' +
                  (nextStep.warn ? 'text-rose-600' : theme.link)
                }
              >
                {nextStep.label}
              </Link>
            </>
          ) : (
            allDone && '모든 단계를 마쳤습니다'
          )}
        </span>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="shrink-0 inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title="작업 순서 펼치기"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          펼치기
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="hidden shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:inline">
          작업 순서
        </span>
        <div className="flex flex-1 items-center gap-0.5 overflow-x-auto">
          {steps.map((step, i) => {
            const warn = !!step.warn && !step.done
            const state: 'done' | 'current' | 'todo' = step.done
              ? 'done'
              : i === currentIdx
                ? 'current'
                : 'todo'
            const isActiveTab = step.tab === currentTab

            const circleCls = warn
              ? 'bg-rose-600 text-white'
              : state === 'done'
                ? 'bg-emerald-600 text-white'
                : state === 'current'
                  ? theme.current
                  : 'border border-slate-300 text-slate-400'
            const labelCls = warn
              ? 'font-semibold text-rose-700'
              : state === 'done'
                ? 'text-emerald-700'
                : state === 'current'
                  ? theme.currentLabel
                  : 'text-slate-400'

            return (
              <Fragment key={step.tab}>
                {i > 0 && (
                  <div
                    className={
                      'h-px w-2.5 shrink-0 sm:w-4 ' +
                      (step.done ? 'bg-emerald-300' : 'bg-slate-200')
                    }
                  />
                )}
                <Link
                  href={`/relocation/${projectId}?tab=${step.tab}`}
                  className={
                    'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 transition hover:bg-slate-50 ' +
                    (isActiveTab ? theme.activeRing : '')
                  }
                >
                  <span
                    className={
                      'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ' +
                      circleCls
                    }
                  >
                    {warn ? '!' : step.done ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  <span className="flex flex-col leading-tight">
                    <span className={'text-xs ' + labelCls}>{step.label}</span>
                    {step.detail && (
                      <span
                        className={
                          'text-[10px] ' + (warn ? 'text-rose-500' : 'text-slate-400')
                        }
                      >
                        {step.detail}
                      </span>
                    )}
                  </span>
                </Link>
              </Fragment>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="shrink-0 inline-flex items-center gap-0.5 self-start rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title="작업 순서 접기"
        >
          <ChevronUp className="h-3.5 w-3.5" />
          접기
        </button>
      </div>

      {nextStep ? (
        <p className="mt-1.5 text-[11px] text-slate-500 sm:pl-[4.75rem]">
          {nextStep.warn ? '먼저 해결할 일' : '다음 할 일'}:{' '}
          <Link
            href={`/relocation/${projectId}?tab=${nextStep.tab}`}
            className={
              'font-semibold underline-offset-2 hover:underline ' +
              (nextStep.warn ? 'text-rose-600' : theme.link)
            }
          >
            {nextStep.label}
          </Link>{' '}
          <span className="text-slate-400">— {STEP_HINT[nextStep.tab] ?? ''}</span>
        </p>
      ) : (
        allDone && (
          <p className="mt-1.5 text-[11px] text-emerald-600 sm:pl-[4.75rem]">
            모든 단계를 마쳤습니다. 내보내기 탭에서 기별명세서를 확인하세요.
          </p>
        )
      )}
    </div>
  )
}
