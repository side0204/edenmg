'use client'

import { X } from 'lucide-react'
import {
  CLOSURE_TYPE_COLOR,
  CLOSURE_TYPE_LABEL,
  cableSpecColor,
} from '@/lib/relocation'

// LGU+ 표준 범례 (owner 첨부 이미지 재현, 2026-05-20)
//   - 건물/설치장소 범례: 국사 5종 + 설치장소 2종 + 모바일국소 8종
//   - 광망 범례: 광케이블(설치 3·규격 6) + 접속함체 3 + RN/IJP/광MUX 5
//
// 사용:
//   <LegendPanel open={open} onClose={...} />
//
// 모달 패턴 — 「표준 범례 보기」 버튼으로 트리거.

export default function LegendPanel({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-4xl w-full p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">LGU+ 표준 범례</h3>
            <p className="text-xs text-slate-500 mt-1">
              건물/설치장소 + 광망 범례 (설계 표준)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-900 p-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <BuildingLegend />
          <NetworkLegend />
        </div>
      </div>
    </div>
  )
}


// =====================================================================
// 「건물/설치장소 범례」 — 국사·설치장소·모바일국소
// =====================================================================
function BuildingLegend() {
  return (
    <section className="space-y-3">
      <h4 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-1">
        건물 / 설치장소 범례
      </h4>

      <CategoryGroup title="국사">
        <LegendRow icon={<FlagIcon color={CLOSURE_TYPE_COLOR['국사']} />} label="국사" />
        <LegendRow icon={<DiamondIcon color={CLOSURE_TYPE_COLOR['종합국사']} />} label="종합국사" />
        <LegendRow icon={<DiamondIcon color={CLOSURE_TYPE_COLOR['집중국사']} />} label="집중국사" />
        <LegendRow icon={<DiamondIcon color={CLOSURE_TYPE_COLOR['가입자국사']} />} label="가입자국사" />
        <LegendRow icon={<DiamondIcon color={CLOSURE_TYPE_COLOR['간이국사']} />} label="간이국사" />
      </CategoryGroup>

      <CategoryGroup title="설치장소">
        <LegendRow icon={<DiamondIcon color={CLOSURE_TYPE_COLOR['창고']} />} label="창고" />
        <LegendRow
          icon={<TriangleIcon color={CLOSURE_TYPE_COLOR['일반설치장소']} />}
          label="일반설치장소"
        />
      </CategoryGroup>

      <CategoryGroup title="모바일국소">
        <LegendRow icon={<TowerIcon />} label="기지국" />
        <LegendRow icon={<RelayFlagIcon />} label={CLOSURE_TYPE_LABEL['중계기']} />
        <LegendRow icon={<CircledTextIcon text="H" color="#dc2626" />} label="안테나" />
        <LegendRow icon={<BoxedTextIcon text="eNB" color={CLOSURE_TYPE_COLOR['ESS_LTE_DU']} />} label="ESS_LTE_DU" />
        <LegendRow icon={<CircledTextIcon text="충" color={CLOSURE_TYPE_COLOR['ESS_LTE_RRH']} />} label="ESS_LTE_RRH" />
        <LegendRow icon={<CircledTextIcon text="기" color={CLOSURE_TYPE_COLOR['ESS_CDMA_기지국']} />} label="ESS_CDMA_기지국" />
        <LegendRow icon={<CircledTextIcon text="광" color={CLOSURE_TYPE_COLOR['ESS_CDMA_광중계기']} />} label="ESS_CDMA_광중계기" />
        <LegendRow icon={<CircledTextIcon text="RF" color={CLOSURE_TYPE_COLOR['ESS_RF중계기']} />} label="ESS_RF중계기" />
      </CategoryGroup>
    </section>
  )
}


// =====================================================================
// 「광망 범례」 — 광케이블·접속함체·RN/IJP/광MUX
// =====================================================================
function NetworkLegend() {
  return (
    <section className="space-y-3">
      <h4 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-1">
        광망 범례
      </h4>

      <CategoryGroup title="광케이블 — 설치구분별 형태">
        <LegendRow icon={<LineIcon dash="none" />} label="가공, 구내, 해저" />
        <LegendRow icon={<LineIcon dash="2 3" />} label="입상" />
        <LegendRow icon={<LineIcon dash="8 4" />} label="지중" />
      </CategoryGroup>

      <CategoryGroup title="광케이블 — 규격별 COLOR">
        <LegendRow icon={<LineIcon dash="none" color={cableSpecColor('12C')} />} label="1C ~ 12C" />
        <LegendRow icon={<LineIcon dash="none" color={cableSpecColor('36C')} />} label="13C ~ 36C" />
        <LegendRow icon={<LineIcon dash="none" color={cableSpecColor('72C')} />} label="37C ~ 72C" />
        <LegendRow icon={<LineIcon dash="none" color={cableSpecColor('144C')} />} label="73C ~ 144C" />
        <LegendRow icon={<LineIcon dash="none" color={cableSpecColor('288C')} />} label="145C ~ 288C" />
        <LegendRow
          icon={<LineIcon dash="none" color="#111827" />}
          label="기타(지장이설인 경우 기설케이블)"
        />
      </CategoryGroup>

      <CategoryGroup title="접속함체">
        <LegendRow icon={<CircleXIcon color={CLOSURE_TYPE_COLOR['중간접속형']} />} label="중간접속형" />
        <LegendRow icon={<CircleTIcon color={CLOSURE_TYPE_COLOR['중간분기형']} />} label="중간분기형" />
        <LegendRow icon={<BowtieIcon color={CLOSURE_TYPE_COLOR['SP내장형']} />} label="SP내장형" />
      </CategoryGroup>

      <CategoryGroup title="RN / IJP / 광MUX">
        <LegendRow icon={<CircledTextIcon text="R" color={CLOSURE_TYPE_COLOR['RN_TPS']} />} label="RN_TPS" />
        <LegendRow icon={<CircledTextIcon text="R" color={CLOSURE_TYPE_COLOR['RN_LTE']} />} label="RN_LTE" />
        <LegendRow icon={<CircledTextIcon text="R" color={CLOSURE_TYPE_COLOR['TPS_LTE_외']} />} label="TPS,LTE 외" />
        <LegendRow icon={<CircledTextIcon text="i" color={CLOSURE_TYPE_COLOR['IJP']} />} label="IJP" />
        <LegendRow icon={<CircledTextIcon text="M" color={CLOSURE_TYPE_COLOR['광Mux']} />} label="광Mux" />
      </CategoryGroup>
    </section>
  )
}


// =====================================================================
// 공통 — 카테고리 그룹 + 한 행
// =====================================================================
function CategoryGroup({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-bold text-rose-600 uppercase tracking-wide flex items-center gap-1">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500" />
        {title}
      </p>
      <ul className="space-y-1 ml-3">{children}</ul>
    </div>
  )
}

function LegendRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <li className="flex items-center gap-2.5 text-xs text-slate-700">
      <span className="inline-flex items-center justify-center w-6 h-6 shrink-0">
        {icon}
      </span>
      <span>{label}</span>
    </li>
  )
}


// =====================================================================
// 아이콘 SVG 컴포넌트들 — LGU+ 표준 범례 모양 재현
// =====================================================================

function DiamondIcon({ color = '#111827' }: { color?: string }) {
  // 마름모 (45도 사각형). 종합·집중·가입자·간이국사·창고에 사용
  return (
    <svg width="20" height="20" viewBox="0 0 20 20">
      <rect
        x="3"
        y="3"
        width="14"
        height="14"
        fill={color}
        transform="rotate(45 10 10)"
      />
    </svg>
  )
}

function TriangleIcon({ color = '#111827' }: { color?: string }) {
  // 정삼각형 — 일반설치장소
  return (
    <svg width="20" height="20" viewBox="0 0 20 20">
      <polygon points="10,3 17,17 3,17" fill={color} />
    </svg>
  )
}

function FlagIcon({ color = '#111827' }: { color?: string }) {
  // 깃대 + 깃발 — 국사
  return (
    <svg width="20" height="20" viewBox="0 0 20 20">
      <line x1="5" y1="3" x2="5" y2="18" stroke={color} strokeWidth="1.5" />
      <rect x="5" y="3" width="9" height="6" fill={color} />
    </svg>
  )
}

function TowerIcon() {
  // 기지국 탑 — 사다리꼴 + 점
  return (
    <svg width="20" height="20" viewBox="0 0 20 20">
      <circle cx="10" cy="3" r="1.5" fill="#111827" />
      <polygon points="10,5 14,18 6,18" fill="none" stroke="#111827" strokeWidth="1.4" />
      <line x1="7" y1="12" x2="13" y2="12" stroke="#111827" strokeWidth="1" />
    </svg>
  )
}

function RelayFlagIcon() {
  // 중계기 — 작은 깃발 (검정)
  return (
    <svg width="20" height="20" viewBox="0 0 20 20">
      <line x1="5" y1="3" x2="5" y2="18" stroke="#111827" strokeWidth="1.4" />
      <polygon points="5,3 14,5 5,7" fill="#111827" />
    </svg>
  )
}

function CircledTextIcon({ text, color = '#111827' }: { text: string; color?: string }) {
  // 원 안에 글자 — 안테나 H, RN_R, IJP_i, 광Mux M 등
  return (
    <svg width="22" height="22" viewBox="0 0 22 22">
      <circle cx="11" cy="11" r="9" fill={color} />
      <text
        x="11"
        y="14.5"
        textAnchor="middle"
        fill="white"
        style={{ fontSize: 10, fontFamily: 'system-ui', fontWeight: 700 }}
      >
        {text}
      </text>
    </svg>
  )
}

function BoxedTextIcon({ text, color = '#0ea5e9' }: { text: string; color?: string }) {
  // 박스 안에 글자 — ESS_LTE_DU 의 eNB 등
  return (
    <svg width="26" height="20" viewBox="0 0 26 20">
      <rect x="2" y="3" width="22" height="14" fill={color} rx="2" />
      <text
        x="13"
        y="13"
        textAnchor="middle"
        fill="white"
        style={{ fontSize: 9, fontFamily: 'system-ui', fontWeight: 700 }}
      >
        {text}
      </text>
    </svg>
  )
}

function LineIcon({ dash = 'none', color = '#111827' }: { dash?: string; color?: string }) {
  // 케이블 선 — 가공·입상·지중 점선 / 규격별 색
  return (
    <svg width="24" height="6" viewBox="0 0 24 6">
      <line
        x1="0"
        y1="3"
        x2="24"
        y2="3"
        stroke={color}
        strokeWidth="2"
        strokeDasharray={dash}
      />
    </svg>
  )
}

function CircleXIcon({ color }: { color: string }) {
  // 원 + X — 중간접속형
  return (
    <svg width="22" height="22" viewBox="0 0 22 22">
      <circle cx="11" cy="11" r="8" fill="none" stroke={color} strokeWidth="1.6" />
      <line x1="5" y1="5" x2="17" y2="17" stroke={color} strokeWidth="1.4" />
      <line x1="5" y1="17" x2="17" y2="5" stroke={color} strokeWidth="1.4" />
    </svg>
  )
}

function CircleTIcon({ color }: { color: string }) {
  // 원 + T (수직 막대) — 중간분기형
  return (
    <svg width="22" height="22" viewBox="0 0 22 22">
      <circle cx="11" cy="11" r="8" fill="none" stroke={color} strokeWidth="1.6" />
      <line x1="3" y1="11" x2="19" y2="11" stroke={color} strokeWidth="1.4" />
      <line x1="11" y1="3" x2="11" y2="19" stroke={color} strokeWidth="1.4" />
    </svg>
  )
}

function BowtieIcon({ color }: { color: string }) {
  // 보타이 / 리본 모양 — SP내장형
  return (
    <svg width="22" height="22" viewBox="0 0 22 22">
      <polygon
        points="11,11 4,5 4,17"
        fill={color}
        stroke={color}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <polygon
        points="11,11 18,5 18,17"
        fill={color}
        stroke={color}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}
