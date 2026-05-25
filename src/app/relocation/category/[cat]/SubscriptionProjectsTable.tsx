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
import { saveRelocationListPrefs } from './prefs-actions'

const MAX_SEARCH_INPUTS = 4

// 날짜 컬럼 — 이 컬럼이 선택되면 검색 input 이 from~to 기간 picker 로 자동 전환됨.
//   created_at 은 'YYYY-MM-DD HH:MM' 형식이라 앞 10자 비교
const DATE_COLUMN_IDS = [
  'subscribed_at',
  'desired_open_at',
  'surveyed_at',
  'expected_completion_at',
  'completion_at',
  'created_at',
] as const
type DateColumnId = (typeof DATE_COLUMN_IDS)[number]
const isDateColumn = (id: string): id is DateColumnId =>
  (DATE_COLUMN_IDS as readonly string[]).includes(id)

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
  theme,
}: {
  rows: RelocationProjectRow[]
  category: Cat
  initialPrefs: { order: string[]; hidden: string[]; widths: Record<string, number> } | null
  theme?: { headerBg: string; rowHover: string; cardBorder: string }
}) {
  const t = theme ?? {
    headerBg: 'bg-slate-50',
    rowHover: 'hover:bg-slate-50',
    cardBorder: '',
  }
  const [prefs, setPrefs] = useState<Prefs>(() => normalizePrefs(category, initialPrefs))
  const [settingsOpen, setSettingsOpen] = useState(false)
  // 다중 검색 (최대 4개, AND 필터). 각 entry 는 컬럼 선택 + 텍스트 OR 날짜 from~to.
  //   col='all' → 텍스트 매치를 보이는 모든 컬럼에 시도
  //   col=텍스트컬럼 → 그 컬럼만 텍스트 매치
  //   col=날짜컬럼 → from~to 기간 필터 (둘 다 없으면 무필터)
  type SearchEntry = {
    col: ColumnId | 'all'
    text: string
    dateFrom: string
    dateTo: string
  }
  const [queries, setQueries] = useState<SearchEntry[]>([
    { col: 'all', text: '', dateFrom: '', dateTo: '' },
  ])
  // 다중 컬럼 정렬 체인 — shift+click 으로 추가, 단일 click 은 1개로 reset
  const [sortChain, setSortChain] = useState<SortEntry[]>([])

  const activeEntries = useMemo(() => {
    return queries.filter((q) => {
      if (q.col !== 'all' && isDateColumn(q.col)) {
        return q.dateFrom.length > 0 || q.dateTo.length > 0
      }
      return q.text.trim().length > 0
    })
  }, [queries])
  const isSearching = activeEntries.length > 0

  const updateQueryText = (idx: number, value: string) => {
    setQueries((prev) => prev.map((q, i) => (i === idx ? { ...q, text: value } : q)))
  }
  const updateQueryCol = (idx: number, col: ColumnId | 'all') => {
    setQueries((prev) =>
      prev.map((q, i) =>
        i === idx
          ? // 컬럼 종류 변경 시 다른 모드 값 초기화
            { ...q, col, text: '', dateFrom: '', dateTo: '' }
          : q,
      ),
    )
  }
  const updateQueryDate = (idx: number, key: 'dateFrom' | 'dateTo', value: string) => {
    setQueries((prev) => prev.map((q, i) => (i === idx ? { ...q, [key]: value } : q)))
  }
  const addQuery = () => {
    setQueries((prev) =>
      prev.length < MAX_SEARCH_INPUTS
        ? [...prev, { col: 'all', text: '', dateFrom: '', dateTo: '' }]
        : prev,
    )
  }
  const removeQuery = (idx: number) => {
    setQueries((prev) => {
      if (prev.length <= 1) return [{ col: 'all', text: '', dateFrom: '', dateTo: '' }]
      return prev.filter((_, i) => i !== idx)
    })
  }
  const clearAllQueries = () =>
    setQueries([{ col: 'all', text: '', dateFrom: '', dateTo: '' }])

  const visibleColumns: ColumnDef[] = useMemo(() => {
    const hidSet = new Set(prefs.hidden)
    return prefs.order
      .map((id) => COLUMN_BY_ID.get(id))
      .filter((c): c is ColumnDef => !!c && !hidSet.has(c.id))
  }, [prefs])

  const totalForCategory = CATEGORY_COLUMNS[category].length

  const filteredRows = useMemo(() => {
    const base =
      activeEntries.length === 0
        ? rows
        : rows.filter((r) => {
            // AND 필터 — 모든 active entry 가 매치돼야 함
            return activeEntries.every((q) => {
              if (q.col !== 'all' && isDateColumn(q.col)) {
                // 날짜 컬럼: from~to 범위 비교 (앞 10자 YYYY-MM-DD)
                const raw = valueOf(r, q.col).slice(0, 10)
                if (!raw) return false
                if (q.dateFrom && raw < q.dateFrom) return false
                if (q.dateTo && raw > q.dateTo) return false
                return true
              }
              // 텍스트
              const needle = q.text.trim().toLowerCase()
              if (!needle) return true
              if (q.col === 'all') {
                return visibleColumns.some((c) =>
                  valueOf(r, c.id).toLowerCase().includes(needle),
                )
              }
              return valueOf(r, q.col).toLowerCase().includes(needle)
            })
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
  }, [rows, visibleColumns, activeEntries, sortChain])

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

  // ── 컬럼 헤더 드래그·드롭 reorder (HTML5 drag API) ──
  // 헤더를 좌클릭 후 드래그 → 다른 헤더 위에 드롭하면 그 위치로 삽입.
  // 드롭 위치는 mouse x 가 target 의 좌·우 절반 중 어디인지로 before/after 결정.
  const [draggingId, setDraggingId] = useState<ColumnId | null>(null)
  const [dragOverId, setDragOverId] = useState<ColumnId | null>(null)
  const [dragOverSide, setDragOverSide] = useState<'before' | 'after'>('before')

  const cancelDrag = () => {
    setDraggingId(null)
    setDragOverId(null)
  }

  const onHeaderDragStart = (e: React.DragEvent<HTMLTableCellElement>, id: ColumnId) => {
    // resize 핸들에서 시작된 drag 는 무시 — 컬럼 폭 조절과 충돌 회피
    if ((e.target as HTMLElement).closest('[data-resize-handle]')) {
      e.preventDefault()
      return
    }
    setDraggingId(id)
    try {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', id) // Firefox 호환
    } catch {}
  }

  const onHeaderDragOver = (e: React.DragEvent<HTMLTableCellElement>, id: ColumnId) => {
    if (!draggingId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (id === draggingId) {
      setDragOverId(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    setDragOverId(id)
    setDragOverSide(x < rect.width / 2 ? 'before' : 'after')
  }

  const onHeaderDrop = (e: React.DragEvent<HTMLTableCellElement>, id: ColumnId) => {
    e.preventDefault()
    if (!draggingId || draggingId === id) {
      cancelDrag()
      return
    }
    const order = [...prefs.order]
    const fromIdx = order.indexOf(draggingId)
    if (fromIdx < 0) {
      cancelDrag()
      return
    }
    order.splice(fromIdx, 1)
    let toIdx = order.indexOf(id)
    if (toIdx < 0) {
      cancelDrag()
      return
    }
    if (dragOverSide === 'after') toIdx++
    order.splice(toIdx, 0, draggingId)
    setPrefs({ ...prefs, order })
    cancelDrag()
  }

  const onHeaderDragEnd = () => cancelDrag()

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
        {/* 검색 row 들 (1~4개) — 각 row 는 [컬럼선택 ▾] + [텍스트 또는 from~to 날짜] + [×] */}
        <ul className="space-y-1.5">
          {queries.map((q, idx) => {
            const isDateMode = q.col !== 'all' && isDateColumn(q.col)
            const colLabel =
              q.col === 'all'
                ? '전체 컬럼'
                : (COLUMN_BY_ID.get(q.col)?.label ?? q.col)
            return (
              <li key={idx} className="flex flex-wrap items-center gap-1.5">
                <select
                  value={q.col}
                  onChange={(e) =>
                    updateQueryCol(idx, e.currentTarget.value as ColumnId | 'all')
                  }
                  className="shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium text-slate-700 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                  title="검색 대상 컬럼"
                >
                  <option value="all">전체 컬럼</option>
                  <optgroup label="텍스트">
                    {CATEGORY_COLUMNS[category]
                      .filter((id) => !isDateColumn(id))
                      .map((id) => {
                        const def = COLUMN_BY_ID.get(id)
                        if (!def) return null
                        return (
                          <option key={id} value={id}>
                            {def.label}
                          </option>
                        )
                      })}
                  </optgroup>
                  <optgroup label="날짜 (기간 검색)">
                    {CATEGORY_COLUMNS[category]
                      .filter((id) => isDateColumn(id))
                      .map((id) => {
                        const def = COLUMN_BY_ID.get(id)
                        if (!def) return null
                        return (
                          <option key={id} value={id}>
                            {def.label}
                          </option>
                        )
                      })}
                  </optgroup>
                </select>

                {isDateMode ? (
                  <div className="flex flex-1 min-w-[16rem] items-center gap-1.5">
                    <input
                      type="date"
                      value={q.dateFrom}
                      onChange={(e) => updateQueryDate(idx, 'dateFrom', e.currentTarget.value)}
                      className="flex-1 rounded-lg border border-slate-300 bg-white py-1.5 px-2 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                      aria-label={`${colLabel} 시작`}
                    />
                    <span className="shrink-0 text-xs text-slate-400">~</span>
                    <input
                      type="date"
                      value={q.dateTo}
                      onChange={(e) => updateQueryDate(idx, 'dateTo', e.currentTarget.value)}
                      className="flex-1 rounded-lg border border-slate-300 bg-white py-1.5 px-2 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                      aria-label={`${colLabel} 종료`}
                    />
                  </div>
                ) : (
                  <div className="relative flex-1 min-w-[12rem]">
                    <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={q.text}
                      onChange={(e) => updateQueryText(idx, e.currentTarget.value)}
                      placeholder={
                        q.col === 'all'
                          ? '제목·가입자·공사번호 등 검색'
                          : `${colLabel} 에서 검색`
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-2 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => removeQuery(idx)}
                  disabled={
                    queries.length === 1 &&
                    q.text === '' &&
                    q.dateFrom === '' &&
                    q.dateTo === '' &&
                    q.col === 'all'
                  }
                  className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                  aria-label="검색 제거"
                  title="검색 제거"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            )
          })}
        </ul>

        <div className="flex flex-wrap items-center gap-2">
          {queries.length < MAX_SEARCH_INPUTS && (
            <button
              type="button"
              onClick={addQuery}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-900 hover:text-slate-900"
              title="검색 추가 (AND 필터, 최대 4개)"
            >
              <Plus className="h-3.5 w-3.5" />
              검색 추가 ({queries.length}/{MAX_SEARCH_INPUTS})
            </button>
          )}
          {isSearching && (
            <button
              type="button"
              onClick={clearAllQueries}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-900 hover:text-slate-900"
            >
              <X className="h-3.5 w-3.5" />
              검색 모두 지우기
            </button>
          )}
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
          <p className="ml-auto text-xs text-slate-500 tabular-nums">
            {isSearching ? (
              <>
                <span className="font-semibold text-slate-700">{filteredRows.length}</span> /{' '}
                {rows.length}건 일치
                {activeEntries.length > 1 && (
                  <span className="ml-1 text-[10px] text-slate-400">
                    (AND 필터 {activeEntries.length}개)
                  </span>
                )}
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
              ? `검색어(${activeEntries.length}개) 로 일치하는 결과가 없습니다.`
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
                className={
                  'block rounded-lg border border-slate-200 bg-white p-3 active:bg-slate-50 ' +
                  t.cardBorder
                }
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
          <thead className={'border-b border-slate-300 ' + t.headerBg}>
            <tr>
              {visibleColumns.map((col, idx) => {
                const sortIdx = sortIndexOf(col.id)
                const isSorted = sortIdx >= 0
                const SortIcon = !isSorted
                  ? ArrowUpDown
                  : sortChain[sortIdx].dir === 'asc'
                    ? ArrowUp
                    : ArrowDown
                const isDragging = draggingId === col.id
                const isDragOver = dragOverId === col.id
                return (
                  <th
                    key={col.id}
                    scope="col"
                    draggable
                    onDragStart={(e) => onHeaderDragStart(e, col.id)}
                    onDragOver={(e) => onHeaderDragOver(e, col.id)}
                    onDrop={(e) => onHeaderDrop(e, col.id)}
                    onDragEnd={onHeaderDragEnd}
                    className={
                      'relative border-r border-slate-200 px-2 py-1.5 text-center text-[10px] font-semibold whitespace-nowrap select-none cursor-grab ' +
                      (idx === 0 ? 'sticky left-0 z-10 ' + t.headerBg + ' ' : '') +
                      (isDragging ? 'opacity-50 ' : '') +
                      (isDragOver && dragOverSide === 'before'
                        ? 'shadow-[inset_3px_0_0_0_rgb(59,130,246)] '
                        : '') +
                      (isDragOver && dragOverSide === 'after'
                        ? 'shadow-[inset_-3px_0_0_0_rgb(59,130,246)] '
                        : '')
                    }
                  >
                    <button
                      type="button"
                      onClick={(e) => toggleSort(col.id, e.shiftKey)}
                      className={
                        'inline-flex items-center justify-center gap-1 rounded px-1 py-0.5 hover:bg-slate-100 w-full ' +
                        (isSorted ? 'text-slate-900' : 'text-slate-600')
                      }
                      title="클릭 = 정렬 / Shift+클릭 = 다중 정렬 추가 / 헤더 드래그 = 순서 변경"
                      draggable={false}
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
                    {/* resize 핸들 — 우측 가장자리. data-resize-handle 로 drag 시작 차단 */}
                    <div
                      data-resize-handle
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
                    ? `검색어(${activeEntries.length}개) 로 일치하는 결과가 없습니다.`
                    : '등록된 프로젝트가 없습니다.'}
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.id} className={'border-t border-slate-100 ' + t.rowHover}>
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
