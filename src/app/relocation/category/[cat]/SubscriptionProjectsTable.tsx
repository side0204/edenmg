'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Download,
  RotateCcw,
  Search,
  Settings2,
  X,
} from 'lucide-react'

/**
 * 공사 설계 — 카테고리별 프로젝트 게시판형 테이블.
 *
 *  - 모든 컬럼을 한 화면에 (가로 스크롤). 첫 컬럼(제목) sticky
 *  - 상단 검색 input — 보이는 컬럼 텍스트 전체에 대해 부분 매칭
 *  - 「컬럼 설정」 버튼 → 모달에서 visibility 토글 + ▲▼ 순서 조정 + 기본값 재설정
 *  - 컬럼 prefs 는 localStorage 에 저장 — 브라우저별·카테고리별
 *  - 행 클릭 시 프로젝트 상세로 이동
 *
 * 카테고리별 컬럼:
 *  - 청약: 19 컬럼 전체 (가입자·청약일·작업자배정 등 청약 전용 포함)
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
  width: string
  defaultVisible: boolean
}

const ALL_COLUMNS: ColumnDef[] = [
  { id: 'title', label: '제목', width: 'min-w-[14rem]', defaultVisible: true },
  { id: 'status', label: '상태', width: 'min-w-[5rem]', defaultVisible: true },
  { id: 'subcategory', label: '청약 분류', width: 'min-w-[6rem]', defaultVisible: true },
  { id: 'region', label: '지역', width: 'min-w-[8rem]', defaultVisible: true },
  { id: 'subscription_id', label: '청약ID', width: 'min-w-[8rem]', defaultVisible: true },
  { id: 'order_no', label: '공사번호', width: 'min-w-[8rem]', defaultVisible: true },
  { id: 'subscriber_name', label: '가입자명', width: 'min-w-[7rem]', defaultVisible: true },
  { id: 'subscriber_address', label: '가입자 주소', width: 'min-w-[14rem]', defaultVisible: true },
  { id: 'branch_manager', label: '하위국 담당자', width: 'min-w-[7rem]', defaultVisible: false },
  { id: 'branch_contact', label: '하위국 연락처', width: 'min-w-[8rem]', defaultVisible: false },
  { id: 'subscribed_at', label: '청약일', width: 'min-w-[6.5rem]', defaultVisible: true },
  { id: 'desired_open_at', label: '개통희망일', width: 'min-w-[6.5rem]', defaultVisible: true },
  { id: 'surveyed_at', label: '공사계약일', width: 'min-w-[6.5rem]', defaultVisible: false },
  {
    id: 'expected_completion_at',
    label: '준공예정일',
    width: 'min-w-[6.5rem]',
    defaultVisible: true,
  },
  { id: 'completion_at', label: '작업완료일', width: 'min-w-[6.5rem]', defaultVisible: true },
  { id: 'outside_workers', label: '외선 작업자', width: 'min-w-[10rem]', defaultVisible: true },
  { id: 'splice_workers', label: '접속 작업자', width: 'min-w-[10rem]', defaultVisible: true },
  { id: 'designer', label: '설계자', width: 'min-w-[6rem]', defaultVisible: false },
  { id: 'notes', label: '비고', width: 'min-w-[12rem]', defaultVisible: false },
  { id: 'created_at', label: '등록일시', width: 'min-w-[10rem]', defaultVisible: false },
]

const COLUMN_BY_ID: Map<ColumnId, ColumnDef> = new Map(ALL_COLUMNS.map((c) => [c.id, c]))

// 카테고리별 사용 컬럼 + 기본 노출 (DB 컬럼은 공유, UI 만 분기)
type Cat = '청약' | '계획' | '지장이설'
const CATEGORY_COLUMNS: Record<Cat, ColumnId[]> = {
  청약: ALL_COLUMNS.map((c) => c.id),
  계획: ['title', 'status', 'region', 'surveyed_at', 'designer', 'notes', 'created_at'],
  지장이설: ['title', 'status', 'region', 'surveyed_at', 'designer', 'notes', 'created_at'],
}

function defaultPrefs(category: Cat): { order: ColumnId[]; hidden: ColumnId[] } {
  const order = CATEGORY_COLUMNS[category]
  const hidden = order.filter((id) => {
    const def = COLUMN_BY_ID.get(id)
    return def ? !def.defaultVisible : false
  })
  return { order: [...order], hidden }
}

function storageKey(category: Cat): string {
  return `relocation:${category}:cols:v2`
}

function isColumnId(v: string): v is ColumnId {
  return COLUMN_BY_ID.has(v as ColumnId)
}

type Prefs = { order: ColumnId[]; hidden: ColumnId[] }

function loadPrefs(category: Cat): Prefs {
  if (typeof window === 'undefined') return defaultPrefs(category)
  try {
    const raw = window.localStorage.getItem(storageKey(category))
    if (!raw) return defaultPrefs(category)
    const parsed = JSON.parse(raw) as { order?: unknown; hidden?: unknown }
    const allowed = new Set(CATEGORY_COLUMNS[category])
    const order: ColumnId[] = []
    if (Array.isArray(parsed.order)) {
      for (const v of parsed.order) {
        if (typeof v === 'string' && isColumnId(v) && allowed.has(v) && !order.includes(v)) {
          order.push(v)
        }
      }
    }
    // 누락된 새 컬럼은 기본 위치로 보충 (forward-compat)
    for (const id of CATEGORY_COLUMNS[category]) if (!order.includes(id)) order.push(id)
    const hidden: ColumnId[] = []
    if (Array.isArray(parsed.hidden)) {
      for (const v of parsed.hidden) {
        if (typeof v === 'string' && isColumnId(v) && allowed.has(v) && !hidden.includes(v)) {
          hidden.push(v)
        }
      }
    }
    return { order, hidden }
  } catch {
    return defaultPrefs(category)
  }
}

function savePrefs(category: Cat, p: Prefs) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(category), JSON.stringify(p))
  } catch {}
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
            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' +
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

export function SubscriptionProjectsTable({
  rows,
  category,
}: {
  rows: RelocationProjectRow[]
  category: Cat
}) {
  const [prefs, setPrefs] = useState<Prefs>(() => defaultPrefs(category))
  const [hydrated, setHydrated] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [query, setQuery] = useState('')
  // 정렬 — 헤더 클릭으로 asc/desc 토글, 3번째 클릭 시 reset (서버 기본 정렬 = created_at desc 유지)
  const [sort, setSort] = useState<{ col: ColumnId; dir: 'asc' | 'desc' } | null>(null)

  // SSR/CSR mismatch 회피 — 마운트 후 localStorage 읽기
  useEffect(() => {
    setPrefs(loadPrefs(category))
    setHydrated(true)
  }, [category])

  const visibleColumns: ColumnDef[] = useMemo(() => {
    const hidSet = new Set(prefs.hidden)
    return prefs.order
      .map((id) => COLUMN_BY_ID.get(id))
      .filter((c): c is ColumnDef => !!c && !hidSet.has(c.id))
  }, [prefs])

  const totalForCategory = CATEGORY_COLUMNS[category].length

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q
      ? rows.filter((r) =>
          visibleColumns.some((c) => valueOf(r, c.id).toLowerCase().includes(q)),
        )
      : rows
    if (!sort) return base
    // 정렬 — 날짜·텍스트 모두 문자열 비교 (ISO 날짜는 lexicographic 정렬과 일치)
    const sorted = [...base].sort((a, b) => {
      const va = valueOf(a, sort.col)
      const vb = valueOf(b, sort.col)
      // 빈 값은 항상 끝으로
      if (va === '' && vb === '') return 0
      if (va === '') return 1
      if (vb === '') return -1
      const cmp = va.localeCompare(vb, 'ko', { numeric: true })
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [rows, visibleColumns, query, sort])

  const toggleSort = (id: ColumnId) => {
    setSort((cur) => {
      if (!cur || cur.col !== id) return { col: id, dir: 'asc' }
      if (cur.dir === 'asc') return { col: id, dir: 'desc' }
      return null // 3번째 클릭 = reset
    })
  }

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

  const updatePrefs = (next: Prefs) => {
    setPrefs(next)
    savePrefs(category, next)
  }

  const toggleVisible = (id: ColumnId) => {
    const hidSet = new Set(prefs.hidden)
    if (hidSet.has(id)) hidSet.delete(id)
    else hidSet.add(id)
    updatePrefs({ ...prefs, hidden: Array.from(hidSet) })
  }

  const moveColumn = (id: ColumnId, dir: -1 | 1) => {
    const order = [...prefs.order]
    const idx = order.indexOf(id)
    const target = idx + dir
    if (idx < 0 || target < 0 || target >= order.length) return
    ;[order[idx], order[target]] = [order[target], order[idx]]
    updatePrefs({ ...prefs, order })
  }

  const resetPrefs = () => updatePrefs(defaultPrefs(category))

  return (
    <div className="space-y-3">
      {/* 검색 + 컬럼 설정 + 결과 카운트 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem] max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="제목·가입자·공사번호·주소 등 모든 컬럼 검색"
            className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-7 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="검색어 지우기"
            >
              <X className="h-3.5 w-3.5" />
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
        <p className="ml-auto text-xs text-slate-500 tabular-nums">
          {hydrated && query ? (
            <>
              <span className="font-semibold text-slate-700">{filteredRows.length}</span> /{' '}
              {rows.length}건 일치
            </>
          ) : (
            <>총 {rows.length}건</>
          )}
        </p>
      </div>

      {/* 모바일 카드 뷰 (md 미만) — 같은 컬럼 prefs 적용 */}
      <div className="md:hidden space-y-2">
        {filteredRows.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white px-3 py-8 text-center text-sm text-slate-500">
            {query
              ? `'${query}' 로 검색된 결과가 없습니다.`
              : '등록된 프로젝트가 없습니다.'}
          </p>
        ) : (
          filteredRows.map((row) => {
            // 첫 컬럼은 카드 제목 — title 이 첫 컬럼이 아닐 수도 있으니 안전하게 분리
            const titleCol = visibleColumns.find((c) => c.id === 'title')
            const otherCols = visibleColumns.filter((c) => c.id !== 'title')
            const cardTitle = titleCol ? row.title : valueOf(row, visibleColumns[0]?.id ?? 'title')
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

      {/* 데스크톱 테이블 (md 이상) */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              {visibleColumns.map((col, idx) => {
                const isSorted = sort?.col === col.id
                const SortIcon = !isSorted ? ArrowUpDown : sort!.dir === 'asc' ? ArrowUp : ArrowDown
                return (
                  <th
                    key={col.id}
                    scope="col"
                    className={
                      'px-3 py-2 text-left text-xs font-semibold whitespace-nowrap ' +
                      col.width +
                      (idx === 0 ? ' sticky left-0 bg-slate-50 z-10' : '')
                    }
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(col.id)}
                      className={
                        'inline-flex items-center gap-1 rounded px-1 -mx-1 py-0.5 hover:bg-slate-100 ' +
                        (isSorted ? 'text-slate-900' : 'text-slate-600')
                      }
                      title={
                        isSorted
                          ? `${sort!.dir === 'asc' ? '오름차순' : '내림차순'} 정렬됨 (한번 더 클릭하면 해제)`
                          : '클릭하면 이 컬럼으로 정렬'
                      }
                    >
                      {col.label}
                      <SortIcon
                        className={
                          'h-3 w-3 ' + (isSorted ? 'text-slate-900' : 'text-slate-300')
                        }
                      />
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.length === 0 ? (
              <tr>
                <td
                  colSpan={Math.max(1, visibleColumns.length)}
                  className="px-3 py-8 text-center text-sm text-slate-500"
                >
                  {query
                    ? `'${query}' 로 검색된 결과가 없습니다.`
                    : '등록된 프로젝트가 없습니다.'}
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  {visibleColumns.map((col, idx) => (
                    <td
                      key={col.id}
                      className={
                        'px-3 py-2 align-top text-sm ' +
                        col.width +
                        (idx === 0 ? ' sticky left-0 bg-white z-10' : '')
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
            체크 = 표시 / 화살표 = 순서 변경. 이 브라우저·이 카테고리에만 저장됩니다.
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
