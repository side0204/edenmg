'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Download,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  X,
} from 'lucide-react'

const MAX_SEARCH_INPUTS = 4
import { saveRelocationListPrefs } from './prefs-actions'

/**
 * 공사 설계 — 카테고리별 프로젝트 게시판형 테이블.
 *
 *  - 모든 컬럼을 한 화면에 (가로 스크롤). 첫 컬럼(제목) sticky
 *  - 상단 검색 input — 보이는 컬럼 텍스트 전체에 대해 부분 매칭
 *  - 「컬럼 설정」 버튼 → 모달에서 visibility 토글 + ▲▼ 순서 조정 + 기본값 재설정
 *  - 「CSV」 버튼 — 현재 보이는 컬럼 + 검색 결과만 UTF-8 BOM 다운로드
 *  - 컬럼 헤더 클릭 = 정렬 (asc/desc/reset), shift+click = 다중 컬럼 정렬 체인
 *  - 컬럼 헤더 우측 핸들 drag = 폭 조절 (px)
 *  - 컬럼 prefs (visibility·순서·폭) 는 DB 동기화 (마이그 0069, 디바이스 간 공유)
 *  - 정렬은 세션 단위 (DB 미동기화)
 *  - 모바일 (<md): 카드 스택 — 같은 prefs 적용 (visibility·순서 공유)
 *
 * 카테고리별 컬럼:
 *  - 청약: 20 컬럼 전체 (가입자·청약일·작업자배정 등 청약 전용 포함)
 *  - 계획·지장이설: 7 컬럼 (제목·상태·지역·공사계약일·설계자·비고·등록일시)
 */

export type RelocationProjectRow = {
  id: string
  title: string
  status: string
  category: '청약' | '계획' | '지장이설'
  subcategory: string | null
  region: string | null
  subscription_id: string | null
  order_no: string | null
  subscriber_name: string | null
  subscriber_address: string | null
  branch_manager: string | null
  branch_contact: string | null
  subscribed_at: string | null
  desired_open_at: string | null
  surveyed_at: string | null
  expected_completion_at: string | null
  completion_at: string | null
  outside_worker_names: string[]
  splice_worker_names: string[]
  designer_name: string | null
  notes: string | null
  created_at: string
}

type ColumnId =
  | 'title'
  | 'status'
  | 'subcategory'
  | 'region'
  | 'subscription_id'
  | 'order_no'
  | 'subscriber_name'
  | 'subscriber_address'
  | 'branch_manager'
  | 'branch_contact'
  | 'subscribed_at'
  | 'desired_open_at'
  | 'surveyed_at'
  | 'expected_completion_at'
  | 'completion_at'
  | 'outside_workers'
  | 'splice_workers'
  | 'designer'
  | 'notes'
  | 'created_at'

type ColumnDef = {
  id: ColumnId
  label: string
  defaultWidth: number // px — 사용자 prefs 가 우선
  defaultVisible: boolean
}

const ALL_COLUMNS: ColumnDef[] = [
  { id: 'title', label: '제목', defaultWidth: 224, defaultVisible: true },
  { id: 'status', label: '상태', defaultWidth: 76, defaultVisible: true },
  { id: 'subcategory', label: '청약 분류', defaultWidth: 88, defaultVisible: true },
  { id: 'region', label: '지역', defaultWidth: 120, defaultVisible: true },
  { id: 'subscription_id', label: '청약ID', defaultWidth: 120, defaultVisible: true },
  { id: 'order_no', label: '공사번호', defaultWidth: 120, defaultVisible: true },
  { id: 'subscriber_name', label: '가입자명', defaultWidth: 100, defaultVisible: true },
  { id: 'subscriber_address', label: '가입자 주소', defaultWidth: 220, defaultVisible: true },
  { id: 'branch_manager', label: '하위국 담당자', defaultWidth: 110, defaultVisible: false },
  { id: 'branch_contact', label: '하위국 연락처', defaultWidth: 120, defaultVisible: false },
  { id: 'subscribed_at', label: '청약일', defaultWidth: 100, defaultVisible: true },
  { id: 'desired_open_at', label: '개통희망일', defaultWidth: 100, defaultVisible: true },
  { id: 'surveyed_at', label: '공사계약일', defaultWidth: 100, defaultVisible: false },
  { id: 'expected_completion_at', label: '준공예정일', defaultWidth: 100, defaultVisible: true },
  { id: 'completion_at', label: '작업완료일', defaultWidth: 100, defaultVisible: true },
  { id: 'outside_workers', label: '외선 작업자', defaultWidth: 160, defaultVisible: true },
  { id: 'splice_workers', label: '접속 작업자', defaultWidth: 160, defaultVisible: true },
  { id: 'designer', label: '설계자', defaultWidth: 90, defaultVisible: false },
  { id: 'notes', label: '비고', defaultWidth: 200, defaultVisible: false },
  { id: 'created_at', label: '등록일시', defaultWidth: 140, defaultVisible: false },
]

const COLUMN_BY_ID: Map<ColumnId, ColumnDef> = new Map(ALL_COLUMNS.map((c) => [c.id, c]))

type Cat = '청약' | '계획' | '지장이설'
const CATEGORY_COLUMNS: Record<Cat, ColumnId[]> = {
  청약: ALL_COLUMNS.map((c) => c.id),
  계획: ['title', 'status', 'region', 'surveyed_at', 'designer', 'notes', 'created_at'],
  지장이설: ['title', 'status', 'region', 'surveyed_at', 'designer', 'notes', 'created_at'],
}

type Prefs = {
  order: ColumnId[]
  hidden: ColumnId[]
  widths: Partial<Record<ColumnId, number>>
}

function isColumnId(v: string): v is ColumnId {
  return COLUMN_BY_ID.has(v as ColumnId)
}

function defaultPrefs(category: Cat): Prefs {
  const order = CATEGORY_COLUMNS[category]
  const hidden = order.filter((id) => {
    const def = COLUMN_BY_ID.get(id)
    return def ? !def.defaultVisible : false
  })
  return { order: [...order], hidden, widths: {} }
}

function normalizePrefs(
  category: Cat,
  raw: { order?: string[]; hidden?: string[]; widths?: Record<string, number> } | null,
): Prefs {
  if (!raw) return defaultPrefs(category)
  const allowed = new Set(CATEGORY_COLUMNS[category])
  const order: ColumnId[] = []
  if (Array.isArray(raw.order)) {
    for (const v of raw.order) {
      if (typeof v === 'string' && isColumnId(v) && allowed.has(v) && !order.includes(v)) {
        order.push(v)
      }
    }
  }
  // 누락 컬럼 보충 (forward-compat)
  for (const id of CATEGORY_COLUMNS[category]) if (!order.includes(id)) order.push(id)
  const hidden: ColumnId[] = []
  if (Array.isArray(raw.hidden)) {
    for (const v of raw.hidden) {
      if (typeof v === 'string' && isColumnId(v) && allowed.has(v) && !hidden.includes(v)) {
        hidden.push(v)
      }
    }
  }
  const widths: Partial<Record<ColumnId, number>> = {}
  if (raw.widths) {
    for (const [k, v] of Object.entries(raw.widths)) {
      if (isColumnId(k) && allowed.has(k) && typeof v === 'number' && isFinite(v)) {
        widths[k] = Math.max(60, Math.min(800, Math.round(v)))
      }
    }
  }
  return { order, hidden, widths }
}

function valueOf(row: RelocationProjectRow, col: ColumnId): string {
  switch (col) {
    case 'title':
      return row.title
    case 'status':
      return row.status
    case 'subcategory':
      return row.subcategory ?? ''
    case 'region':
      return row.region ?? ''
    case 'subscription_id':
      return row.subscription_id ?? ''
    case 'order_no':
      return row.order_no ?? ''
    case 'subscriber_name':
      return row.subscriber_name ?? ''
    case 'subscriber_address':
      return row.subscriber_address ?? ''
    case 'branch_manager':
      return row.branch_manager ?? ''
    case 'branch_contact':
      return row.branch_contact ?? ''
    case 'subscribed_at':
      return row.subscribed_at ?? ''
    case 'desired_open_at':
      return row.desired_open_at ?? ''
    case 'surveyed_at':
      return row.surveyed_at ?? ''
    case 'expected_completion_at':
      return row.expected_completion_at ?? ''
    case 'completion_at':
      return row.completion_at ?? ''
    case 'outside_workers':
      return row.outside_worker_names.join(', ')
    case 'splice_workers':
      return row.splice_worker_names.join(', ')
    case 'designer':
      return row.designer_name ?? ''
    case 'notes':
      return row.notes ?? ''
    case 'created_at':
      return row.created_at.slice(0, 16).replace('T', ' ')
  }
}

const STATUS_BADGE: Record<string, string> = {
  설계중: 'bg-slate-100 text-slate-700',
  검증중: 'bg-amber-100 text-amber-700',
  확정: 'bg-blue-100 text-blue-700',
  시공중: 'bg-emerald-100 text-emerald-700',
  완료: 'bg-indigo-100 text-indigo-700',
  취소: 'bg-rose-100 text-rose-700',
}

function renderCell(row: RelocationProjectRow, col: ColumnId): React.ReactNode {
  switch (col) {
    case 'title':
      return (
        <Link
          href={`/relocation/${row.id}`}
          className="text-slate-900 font-medium hover:text-slate-700 hover:underline"
        >
          {row.title}
        </Link>
      )
    case 'status':
      return (
        <span
          className={
            'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ' +
            (STATUS_BADGE[row.status] ?? 'bg-slate-100 text-slate-700')
          }
        >
          {row.status}
        </span>
      )
    case 'subscriber_address':
    case 'notes':
      return <span className="line-clamp-2 whitespace-pre-wrap">{valueOf(row, col)}</span>
    case 'outside_workers':
      return row.outside_worker_names.length === 0 ? (
        <span className="text-slate-400">—</span>
      ) : (
        <span className="text-slate-700">{row.outside_worker_names.join(', ')}</span>
      )
    case 'splice_workers':
      return row.splice_worker_names.length === 0 ? (
        <span className="text-slate-400">—</span>
      ) : (
        <span className="text-slate-700">{row.splice_worker_names.join(', ')}</span>
      )
    default: {
      const v = valueOf(row, col)
      return v ? (
        <span className="text-slate-700">{v}</span>
      ) : (
        <span className="text-slate-400">—</span>
      )
    }
  }
}

type SortEntry = { col: ColumnId; dir: 'asc' | 'desc' }

export function SubscriptionProjectsTable({
  rows,
  category,
  initialPrefs,
}: {
  rows: RelocationProjectRow[]
  category: Cat
  initialPrefs: { order: string[]; hidden: string[]; widths: Record<string, number> } | null
}) {
  const [prefs, setPrefs] = useState<Prefs>(() => normalizePrefs(category, initialPrefs))
  const [settingsOpen, setSettingsOpen] = useState(false)
  // 다중 검색 (최대 4개, AND 필터) — 각 검색어가 보이는 컬럼 중 하나에 매치되어야 함
  const [queries, setQueries] = useState<string[]>([''])
  // 다중 컬럼 정렬 체인 — shift+click 으로 추가, 단일 click 은 1개로 reset
  const [sortChain, setSortChain] = useState<SortEntry[]>([])

  const activeQueries = useMemo(
    () => queries.map((q) => q.trim().toLowerCase()).filter((q) => q.length > 0),
    [queries],
  )
  const isSearching = activeQueries.length > 0

  const updateQuery = (idx: number, value: string) => {
    setQueries((prev) => prev.map((q, i) => (i === idx ? value : q)))
  }
  const addQuery = () => {
    setQueries((prev) => (prev.length < MAX_SEARCH_INPUTS ? [...prev, ''] : prev))
  }
  const removeQuery = (idx: number) => {
    setQueries((prev) => {
      if (prev.length <= 1) return ['']
      return prev.filter((_, i) => i !== idx)
    })
  }
  const clearAllQueries = () => setQueries([''])

  const visibleColumns: ColumnDef[] = useMemo(() => {
    const hidSet = new Set(prefs.hidden)
    return prefs.order
      .map((id) => COLUMN_BY_ID.get(id))
      .filter((c): c is ColumnDef => !!c && !hidSet.has(c.id))
  }, [prefs])

  const totalForCategory = CATEGORY_COLUMNS[category].length

  const filteredRows = useMemo(() => {
    const base =
      activeQueries.length === 0
        ? rows
        : rows.filter((r) => {
            // AND 필터 — 각 검색어가 보이는 컬럼 중 하나에 매치되어야 함
            const haystacks = visibleColumns.map((c) => valueOf(r, c.id).toLowerCase())
            return activeQueries.every((q) => haystacks.some((h) => h.includes(q)))
          })
    if (sortChain.length === 0) return base
    return [...base].sort((a, b) => {
      for (const s of sortChain) {
        const va = valueOf(a, s.col)
        const vb = valueOf(b, s.col)
        if (va === '' && vb === '') continue
        if (va === '') return 1 // 빈 값은 항상 끝
        if (vb === '') return -1
        const cmp = va.localeCompare(vb, 'ko', { numeric: true })
        if (cmp !== 0) return s.dir === 'asc' ? cmp : -cmp
      }
      return 0
    })
  }, [rows, visibleColumns, activeQueries, sortChain])

  // 디바운스 저장 — prefs 변경 후 500ms 후 server action 호출
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isInitialMountRef = useRef(true)
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false
      return
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void saveRelocationListPrefs(category, {
        order: prefs.order,
        hidden: prefs.hidden,
        widths: prefs.widths as Record<string, number>,
      })
    }, 500)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [prefs, category])

  const toggleVisible = (id: ColumnId) => {
    const hidSet = new Set(prefs.hidden)
    if (hidSet.has(id)) hidSet.delete(id)
    else hidSet.add(id)
    setPrefs({ ...prefs, hidden: Array.from(hidSet) })
  }

  const moveColumn = (id: ColumnId, dir: -1 | 1) => {
    const order = [...prefs.order]
    const idx = order.indexOf(id)
    const target = idx + dir
    if (idx < 0 || target < 0 || target >= order.length) return
    ;[order[idx], order[target]] = [order[target], order[idx]]
    setPrefs({ ...prefs, order })
  }

  const resetPrefs = () => {
    setPrefs(defaultPrefs(category))
    setSortChain([])
  }

  const toggleSort = (id: ColumnId, withShift: boolean) => {
    setSortChain((chain) => {
      const idx = chain.findIndex((s) => s.col === id)
      if (!withShift) {
        // 단일 정렬 — 1번째 asc, 2번째 desc, 3번째 reset
        if (idx < 0) return [{ col: id, dir: 'asc' }]
        if (chain.length === 1) {
          return chain[0].dir === 'asc'
            ? [{ col: id, dir: 'desc' }]
            : []
        }
        // 다중 정렬 상태에서 일반 click — 단일로 reset
        return [{ col: id, dir: 'asc' }]
      }
      // shift+click — 체인 추가/토글
      if (idx < 0) return [...chain, { col: id, dir: 'asc' }]
      const cur = chain[idx]
      if (cur.dir === 'asc') {
        const next = [...chain]
        next[idx] = { col: id, dir: 'desc' }
        return next
      }
      return chain.filter((s) => s.col !== id)
    })
  }

  // 컬럼 폭 드래그 (resize) — 헤더 우측 핸들에서 시작
  const resizeRef = useRef<{ id: ColumnId; startX: number; startWidth: number } | null>(null)
  const [resizingId, setResizingId] = useState<ColumnId | null>(null)
  const onResizeStart = (e: React.PointerEvent<HTMLDivElement>, id: ColumnId) => {
    e.preventDefault()
    e.stopPropagation()
    const def = COLUMN_BY_ID.get(id)
    if (!def) return
    const currentWidth = prefs.widths[id] ?? def.defaultWidth
    resizeRef.current = { id, startX: e.clientX, startWidth: currentWidth }
    setResizingId(id)
    document.body.style.userSelect = 'none'
  }
  useEffect(() => {
    if (!resizingId) return
    const onMove = (e: PointerEvent) => {
      const ref = resizeRef.current
      if (!ref) return
      const delta = e.clientX - ref.startX
      const next = Math.max(60, Math.min(800, ref.startWidth + delta))
      setPrefs((p) => ({ ...p, widths: { ...p.widths, [ref.id]: next } }))
    }
    const onUp = () => {
      resizeRef.current = null
      setResizingId(null)
      document.body.style.userSelect = ''
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [resizingId])

  // CSV 다운로드 — 보이는 컬럼만 (UTF-8 BOM + CRLF)
  const downloadCsv = () => {
    const escape = (v: string) => {
      const needs = /[",\r\n]/.test(v)
      const s = v.replace(/"/g, '""')
      return needs ? `"${s}"` : s
    }
    const header = visibleColumns.map((c) => escape(c.label)).join(',')
    const body = filteredRows
      .map((r) => visibleColumns.map((c) => escape(valueOf(r, c.id))).join(','))
      .join('\r\n')
    const csv = '﻿' + header + '\r\n' + body
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const today = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `${category}_설계_${today}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const widthFor = (id: ColumnId): number =>
    prefs.widths[id] ?? COLUMN_BY_ID.get(id)?.defaultWidth ?? 120

  const sortIndexOf = (id: ColumnId): number => sortChain.findIndex((s) => s.col === id)

  return (
    <div className="space-y-3">
      {/* 다중 검색 (최대 4개, AND) + 컬럼 설정 + CSV + 결과 카운트 */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* 검색 input 들 (1~4개) */}
          <div className="flex flex-1 min-w-[14rem] flex-wrap gap-1.5">
            {queries.map((q, idx) => {
              const placeholder =
                idx === 0
                  ? '제목·가입자·공사번호·주소 등 검색'
                  : `검색어 ${idx + 1}`
              return (
                <div key={idx} className="relative flex-1 min-w-[10rem]">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={q}
                    onChange={(e) => updateQuery(idx, e.currentTarget.value)}
                    placeholder={placeholder}
                    className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-7 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                  {(q.length > 0 || queries.length > 1) && (
                    <button
                      type="button"
                      onClick={() => removeQuery(idx)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label={queries.length > 1 ? '검색 제거' : '검색어 지우기'}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )
            })}
            {queries.length < MAX_SEARCH_INPUTS && (
              <button
                type="button"
                onClick={addQuery}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-900 hover:text-slate-900"
                title="검색 추가 (AND 필터, 최대 4개)"
              >
                <Plus className="h-3.5 w-3.5" />
                검색 추가
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Settings2 className="h-4 w-4" />
            <span className="hidden sm:inline">컬럼 설정</span>
            <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
              {visibleColumns.length}/{totalForCategory}
            </span>
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={filteredRows.length === 0}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white"
            title="현재 보이는 컬럼·검색 결과를 CSV 다운로드"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">CSV</span>
          </button>
          {sortChain.length > 0 && (
            <button
              type="button"
              onClick={() => setSortChain([])}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
              title="모든 정렬 해제"
            >
              정렬 {sortChain.length}개 해제
            </button>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          {isSearching ? (
            <p className="text-xs text-slate-500">
              <span className="font-medium text-slate-700">AND 필터</span> —{' '}
              {activeQueries.length}개 검색어 모두 매치된 행만 표시
              <button
                type="button"
                onClick={clearAllQueries}
                className="ml-2 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                모두 지우기
              </button>
            </p>
          ) : (
            <span />
          )}
          <p className="text-xs text-slate-500 tabular-nums">
            {isSearching ? (
              <>
                <span className="font-semibold text-slate-700">{filteredRows.length}</span> /{' '}
                {rows.length}건 일치
              </>
            ) : (
              <>총 {rows.length}건</>
            )}
          </p>
        </div>
      </div>

      {/* 모바일 카드 뷰 (md 미만) */}
      <div className="md:hidden space-y-2">
        {filteredRows.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white px-3 py-8 text-center text-sm text-slate-500">
            {isSearching
              ? `검색어(${activeQueries.length}개) 로 일치하는 결과가 없습니다.`
              : '등록된 프로젝트가 없습니다.'}
          </p>
        ) : (
          filteredRows.map((row) => {
            const titleCol = visibleColumns.find((c) => c.id === 'title')
            const otherCols = visibleColumns.filter((c) => c.id !== 'title')
            const cardTitle = titleCol
              ? row.title
              : valueOf(row, visibleColumns[0]?.id ?? 'title')
            return (
              <Link
                key={row.id}
                href={`/relocation/${row.id}`}
                className="block rounded-lg border border-slate-200 bg-white p-3 active:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-semibold text-slate-900 line-clamp-2">
                    {cardTitle}
                  </h3>
                  {visibleColumns.some((c) => c.id === 'status') && (
                    <span
                      className={
                        'shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' +
                        (STATUS_BADGE[row.status] ?? 'bg-slate-100 text-slate-700')
                      }
                    >
                      {row.status}
                    </span>
                  )}
                </div>
                {otherCols.filter((c) => c.id !== 'status').length > 0 && (
                  <dl className="mt-2 grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1 text-xs">
                    {otherCols
                      .filter((c) => c.id !== 'status')
                      .map((col) => {
                        const v = valueOf(row, col.id)
                        if (!v) return null
                        return (
                          <div key={col.id} className="contents">
                            <dt className="text-slate-400 truncate">{col.label}</dt>
                            <dd className="text-slate-700 break-words">{v}</dd>
                          </div>
                        )
                      })}
                  </dl>
                )}
              </Link>
            )
          })
        )}
      </div>

      {/* 데스크톱 테이블 (md 이상) — 컬럼 경계선 + 작은 글자 + resize + 다중 정렬 */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table
          className="border-collapse text-[11px]"
          style={{ tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}
        >
          <colgroup>
            {visibleColumns.map((col) => (
              <col key={col.id} style={{ width: widthFor(col.id) + 'px' }} />
            ))}
          </colgroup>
          <thead className="border-b border-slate-300 bg-slate-50">
            <tr>
              {visibleColumns.map((col, idx) => {
                const sortIdx = sortIndexOf(col.id)
                const isSorted = sortIdx >= 0
                const SortIcon = !isSorted
                  ? ArrowUpDown
                  : sortChain[sortIdx].dir === 'asc'
                    ? ArrowUp
                    : ArrowDown
                return (
                  <th
                    key={col.id}
                    scope="col"
                    className={
                      'relative border-r border-slate-200 px-2 py-1.5 text-left text-[10px] font-semibold whitespace-nowrap ' +
                      (idx === 0 ? 'sticky left-0 bg-slate-50 z-10' : '')
                    }
                  >
                    <button
                      type="button"
                      onClick={(e) => toggleSort(col.id, e.shiftKey)}
                      className={
                        'inline-flex items-center gap-1 rounded px-1 -mx-1 py-0.5 hover:bg-slate-100 max-w-full ' +
                        (isSorted ? 'text-slate-900' : 'text-slate-600')
                      }
                      title="클릭 = 정렬 / Shift+클릭 = 다중 정렬 추가"
                    >
                      <span className="truncate">{col.label}</span>
                      {isSorted && sortChain.length > 1 && (
                        <span className="inline-flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-slate-900 px-1 text-[8px] font-bold text-white">
                          {sortIdx + 1}
                        </span>
                      )}
                      <SortIcon
                        className={
                          'h-3 w-3 shrink-0 ' +
                          (isSorted ? 'text-slate-900' : 'text-slate-300')
                        }
                      />
                    </button>
                    {/* resize 핸들 — 우측 가장자리 */}
                    <div
                      onPointerDown={(e) => onResizeStart(e, col.id)}
                      className={
                        'absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400/60 ' +
                        (resizingId === col.id ? 'bg-blue-500' : '')
                      }
                      style={{ touchAction: 'none' }}
                      title="드래그하여 컬럼 폭 조절"
                    />
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td
                  colSpan={Math.max(1, visibleColumns.length)}
                  className="border-t border-slate-200 px-3 py-8 text-center text-sm text-slate-500"
                >
                  {isSearching
                    ? `검색어(${activeQueries.length}개) 로 일치하는 결과가 없습니다.`
                    : '등록된 프로젝트가 없습니다.'}
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
                  {visibleColumns.map((col, idx) => (
                    <td
                      key={col.id}
                      className={
                        'border-r border-slate-200 px-2 py-1 align-top overflow-hidden ' +
                        (idx === 0 ? 'sticky left-0 bg-white z-10' : '')
                      }
                    >
                      {renderCell(row, col.id)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 컬럼 설정 모달 */}
      <div
        className={
          'fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 ' +
          (settingsOpen ? '' : 'hidden pointer-events-none')
        }
      >
        <button
          type="button"
          className="absolute inset-0"
          onClick={() => setSettingsOpen(false)}
          aria-label="닫기"
        />
        <div className="relative w-full max-w-md max-h-[85vh] flex flex-col rounded-2xl bg-white shadow-xl">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <h2 className="text-base font-semibold text-slate-900">컬럼 설정</h2>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="닫기"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="px-4 pt-3 text-xs text-slate-500">
            체크 = 표시 / 화살표 = 순서 변경. 모든 디바이스에서 동기화됩니다.
          </p>
          <ul className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
            {prefs.order.map((id, idx) => {
              const col = COLUMN_BY_ID.get(id)
              if (!col) return null
              const visible = !prefs.hidden.includes(id)
              return (
                <li
                  key={id}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
                >
                  <label className="flex flex-1 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={visible}
                      onChange={() => toggleVisible(id)}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <span
                      className={
                        'text-sm ' +
                        (visible ? 'text-slate-900' : 'text-slate-400 line-through')
                      }
                    >
                      {col.label}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => moveColumn(id, -1)}
                    disabled={idx === 0}
                    className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent"
                    aria-label="위로"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveColumn(id, 1)}
                    disabled={idx === prefs.order.length - 1}
                    className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent"
                    aria-label="아래로"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
            <button
              type="button"
              onClick={resetPrefs}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              기본값으로 재설정
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              완료
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
