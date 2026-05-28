'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus,
  MapPin,
  Loader2,
  X,
  Pencil,
  Trash2,
  AlertCircle,
  Info,
  AlertTriangle,
  Crosshair,
  ChevronLeft,
  ChevronRight,
  Map as MapIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { useKakaoMap } from './useKakaoMap'
import {
  type FieldNoteKind,
  FIELD_NOTE_KIND_VALUES,
  FIELD_NOTE_KIND_COLOR,
  haversineMeters,
  formatDistance,
  isSameKstDate,
} from '@/lib/field-notes'
import NavLauncher, { NavPreferenceReset } from './NavLauncher'
import FieldPhotoUploader from './FieldPhotoUploader'
import {
  createFieldNote,
  updateFieldNote,
  deleteFieldNote,
  deleteFieldNotePhoto,
  getFieldNotePhotoUrls,
  setFieldNoteShared,
} from './field-note-actions'

// 현장관리 — 지도 모드 전용 뷰.
//   - 노트 마커 (일반/주의/위험) 지도 위에 표시
//   - 빈 지도 클릭 + 추가 모드 → 폼 모달로 새 노트
//   - 마커 클릭 → 우측 상세 패널 (사진·길찾기·수정·삭제)
//   - 「내 위치」 → Geolocation API → 지도 중앙 이동 + 거리 계산용 anchor
//
// HTTPS 필수: Geolocation API 는 HTTPS 에서만 작동. 로컬 dev (http) 는 권한 거부.

export type FieldNotePhoto = {
  id: string
  path: string
  taken_at: string | null
  gps_lat: number | null
  gps_lng: number | null
  uploaded_by: string | null
  uploaded_by_name: string | null
  created_at: string
}

export type FieldNoteData = {
  id: string
  kind: FieldNoteKind
  title: string | null
  body: string | null
  lat: number
  lng: number
  address: string | null
  created_by: string | null
  created_by_name: string | null
  created_at: string
  photos: FieldNotePhoto[]
  // 공사 노트의 최상위 공유 플래그 (project 모드에서 「보내기」 상태)
  sharedToField: boolean
  // 최상위(global) 모드에서 출처 공사 표시용
  projectId: string | null
  projectTitle: string | null
}

type Props = {
  // 공사(프로젝트) 모드면 projectId 문자열, 최상위 현장관리(/field) 모드면 null
  projectId: string | null
  notes: FieldNoteData[]
  meId: string
  meIsAdmin: boolean
}

type LatLng = { lat: number; lng: number }

const KIND_ICON: Record<FieldNoteKind, typeof Info> = {
  일반: Info,
  주의: AlertCircle,
  위험: AlertTriangle,
}

const KIND_BUTTON_TONE: Record<FieldNoteKind, string> = {
  일반: 'bg-slate-700 hover:bg-slate-800 text-white border-slate-700',
  주의: 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600',
  위험: 'bg-rose-600 hover:bg-rose-700 text-white border-rose-700',
}

const MARKER_DIAMETER = 36
const MARKER_RADIUS = MARKER_DIAMETER / 2

export default function FieldNotesView({ projectId, notes, meId, meIsAdmin }: Props) {
  const router = useRouter()
  const { setContainer, map, status, epoch } = useKakaoMap(true)
  const isGlobal = projectId === null

  // 추가 모드 — 도구바에서 선택한 종류. 빈 지도 클릭 시 새 노트 폼 오픈.
  const [addMode, setAddMode] = useState<FieldNoteKind | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showAddPin, setShowAddPin] = useState<LatLng | null>(null)
  const [showForm, setShowForm] = useState<
    | { mode: 'create'; kind: FieldNoteKind; lat: number; lng: number }
    | { mode: 'edit'; note: FieldNoteData }
    | null
  >(null)
  const [myLocation, setMyLocation] = useState<LatLng | null>(null)
  const [locating, setLocating] = useState(false)
  const [kindFilter, setKindFilter] = useState<Record<FieldNoteKind, boolean>>({
    일반: true,
    주의: true,
    위험: true,
  })
  const [sortBy, setSortBy] = useState<'recent' | 'distance'>('recent')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})

  // ===== 노트 필터·정렬 =================================================
  const filteredNotes = useMemo(() => {
    let list = notes.filter((n) => kindFilter[n.kind])
    if (sortBy === 'distance' && myLocation) {
      list = [...list].sort(
        (a, b) =>
          haversineMeters(myLocation, { lat: a.lat, lng: a.lng }) -
          haversineMeters(myLocation, { lat: b.lat, lng: b.lng }),
      )
    } else {
      list = [...list].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
    }
    return list
  }, [notes, kindFilter, sortBy, myLocation])

  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedId) ?? null,
    [notes, selectedId],
  )

  // ===== 사진 signed URL 일괄 발급 ======================================
  useEffect(() => {
    const allPaths = notes.flatMap((n) => n.photos.map((p) => p.path))
    if (allPaths.length === 0) {
      setPhotoUrls({})
      return
    }
    let cancelled = false
    getFieldNotePhotoUrls(allPaths).then((map) => {
      if (!cancelled) setPhotoUrls(map)
    })
    return () => {
      cancelled = true
    }
  }, [notes])

  // ===== 지도 click — 빈 영역 클릭 시 노트 추가 (addMode 활성 시만) =====
  useEffect(() => {
    if (!map) return
    const handler = (e?: kakao.maps.MouseEvent) => {
      if (!e) return
      const lat = e.latLng.getLat()
      const lng = e.latLng.getLng()
      if (addMode) {
        setShowAddPin({ lat, lng })
        setShowForm({ mode: 'create', kind: addMode, lat, lng })
      } else {
        setSelectedId(null)
      }
    }
    kakao.maps.event.addListener(map, 'click', handler)
    return () => {
      kakao.maps.event.removeListener(map, 'click', handler)
    }
  }, [map, addMode])

  // ===== 지도 준비 후 노트 범위로 1회 fit =================================
  //   global 모드는 회사 노트가 전국 분산일 수 있어 특히 필요. project 모드도 동일.
  const fittedRef = useState({ done: false })[0]
  useEffect(() => {
    if (!map || fittedRef.done || notes.length === 0) return
    fittedRef.done = true
    if (notes.length === 1) {
      map.setCenter(new kakao.maps.LatLng(notes[0].lat, notes[0].lng))
      map.setLevel(4)
      return
    }
    const bounds = new kakao.maps.LatLngBounds()
    for (const n of notes) bounds.extend(new kakao.maps.LatLng(n.lat, n.lng))
    map.setBounds(bounds)
  }, [map, notes, fittedRef])

  // ===== 노트 → 화면 픽셀 투영 (epoch 가 카카오맵 이동 시마다 증가하므로 캐시 무효화) =====
  const projectedMarkers = useMemo(() => {
    void epoch
    if (!map) return [] as Array<{ note: FieldNoteData; x: number; y: number }>
    const proj = map.getProjection()
    if (!proj) return []
    const results: Array<{ note: FieldNoteData; x: number; y: number }> = []
    for (const n of filteredNotes) {
      try {
        const pt = proj.containerPointFromCoords(
          new kakao.maps.LatLng(n.lat, n.lng),
        )
        results.push({ note: n, x: pt.x, y: pt.y })
      } catch {
        // 좌표 외 — 무시
      }
    }
    return results
  }, [map, filteredNotes, epoch])

  const myLocationPixel = useMemo(() => {
    void epoch
    if (!map || !myLocation) return null
    const proj = map.getProjection()
    if (!proj) return null
    try {
      const pt = proj.containerPointFromCoords(
        new kakao.maps.LatLng(myLocation.lat, myLocation.lng),
      )
      return { x: pt.x, y: pt.y }
    } catch {
      return null
    }
  }, [map, myLocation, epoch])

  const addPinPixel = useMemo(() => {
    void epoch
    if (!map || !showAddPin) return null
    const proj = map.getProjection()
    if (!proj) return null
    try {
      const pt = proj.containerPointFromCoords(
        new kakao.maps.LatLng(showAddPin.lat, showAddPin.lng),
      )
      return { x: pt.x, y: pt.y }
    } catch {
      return null
    }
  }, [map, showAddPin, epoch])

  // ===== 「내 위치」 버튼 ================================================
  const locateMe = useCallback(() => {
    if (!('geolocation' in navigator)) {
      toast.error('이 기기에서 위치 서비스를 사용할 수 없습니다')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setMyLocation(loc)
        if (map) {
          map.setCenter(new kakao.maps.LatLng(loc.lat, loc.lng))
          if (map.getLevel() > 5) map.setLevel(4)
        }
        setLocating(false)
        toast.success(`현재 위치로 이동 (정확도 ±${Math.round(pos.coords.accuracy)}m)`)
      },
      (err) => {
        setLocating(false)
        const msg =
          err.code === err.PERMISSION_DENIED
            ? '위치 권한이 거부됨. 브라우저 설정에서 허용해주세요'
            : err.code === err.TIMEOUT
              ? '위치 확인 시간 초과'
              : '위치를 확인할 수 없습니다'
        toast.error(msg)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }, [map])

  // ===== 노트 선택 (지도 중앙으로 이동) =================================
  function selectNote(note: FieldNoteData) {
    setSelectedId(note.id)
    if (map) {
      map.setCenter(new kakao.maps.LatLng(note.lat, note.lng))
      if (map.getLevel() > 5) map.setLevel(4)
    }
  }

  // ===== 노트 삭제 ======================================================
  async function handleDelete(noteId: string) {
    if (!confirm('이 노트를 삭제하시겠습니까? 첨부 사진도 함께 삭제됩니다.')) return
    const fd = new FormData()
    fd.append('note_id', noteId)
    fd.append('project_id', projectId ?? '')
    const res = await deleteFieldNote(fd)
    if (res.ok) {
      toast.success('삭제됨')
      setSelectedId(null)
      router.refresh()
    } else {
      toast.error(res.error)
    }
  }

  async function handleDeletePhoto(photoId: string) {
    if (!confirm('이 사진을 삭제하시겠습니까?')) return
    const fd = new FormData()
    fd.append('photo_id', photoId)
    fd.append('project_id', projectId ?? '')
    const res = await deleteFieldNotePhoto(fd)
    if (res.ok) {
      toast.success('사진 삭제됨')
      router.refresh()
    } else {
      toast.error(res.error)
    }
  }

  // ===== 공사 노트 → 최상위 현장관리로 보내기 / 취소 (project 모드만) =====
  async function handleSetShared(noteId: string, shared: boolean) {
    const fd = new FormData()
    fd.append('note_id', noteId)
    fd.append('project_id', projectId ?? '')
    fd.append('shared', String(shared))
    const res = await setFieldNoteShared(fd)
    if (res.ok) {
      toast.success(shared ? '현장관리로 보냈습니다' : '현장관리에서 내렸습니다')
      router.refresh()
    } else {
      toast.error(res.error)
    }
  }

  // 통계
  const kindCounts = useMemo(() => {
    const c: Record<FieldNoteKind, number> = { 일반: 0, 주의: 0, 위험: 0 }
    for (const n of notes) c[n.kind]++
    return c
  }, [notes])

  return (
    <div className="relative flex h-[78vh] sm:h-[80vh] w-full overflow-hidden rounded-xl border border-slate-300 bg-slate-100">
      {/* 좌측 사이드바 — 노트 목록 */}
      {sidebarOpen ? (
        <aside className="w-[280px] shrink-0 bg-white border-r border-slate-200 flex flex-col">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-200">
            <div className="flex items-center gap-1.5">
              <MapIcon className="h-4 w-4 text-slate-600" />
              <span className="text-sm font-semibold">
                {isGlobal ? '현장관리 (전체)' : '현장관리 노트'}
              </span>
              <span className="text-[11px] text-slate-500">{filteredNotes.length}/{notes.length}</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="rounded p-1 text-slate-500 hover:bg-slate-100"
              aria-label="사이드바 접기"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>

          {/* 필터 + 정렬 */}
          <div className="px-3 py-2 border-b border-slate-200 space-y-1.5">
            <div className="flex flex-wrap gap-1">
              {FIELD_NOTE_KIND_VALUES.map((k) => (
                <button
                  key={k}
                  onClick={() =>
                    setKindFilter((p) => ({ ...p, [k]: !p[k] }))
                  }
                  className={
                    'rounded-full border px-2 py-0.5 text-[11px] transition-colors ' +
                    (kindFilter[k]
                      ? `${FIELD_NOTE_KIND_COLOR[k].badgeBg} ${FIELD_NOTE_KIND_COLOR[k].badgeText} ${FIELD_NOTE_KIND_COLOR[k].badgeBorder}`
                      : 'bg-slate-100 text-slate-400 border-slate-200 line-through')
                  }
                >
                  {k} {kindCounts[k]}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setSortBy('recent')}
                className={
                  'flex-1 rounded text-[11px] px-2 py-1 ' +
                  (sortBy === 'recent'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
                }
              >
                최신순
              </button>
              <button
                onClick={() => setSortBy('distance')}
                disabled={!myLocation}
                className={
                  'flex-1 rounded text-[11px] px-2 py-1 ' +
                  (sortBy === 'distance'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40')
                }
                title={myLocation ? '내 위치 기준 거리순' : '먼저 「내 위치」 누르세요'}
              >
                거리순
              </button>
            </div>
          </div>

          {/* 목록 */}
          <div className="flex-1 overflow-y-auto">
            {filteredNotes.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">
                노트가 없습니다. 도구바에서 종류를 선택하고 지도를 클릭해 추가하세요.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filteredNotes.map((n) => {
                  const dist = myLocation
                    ? haversineMeters(myLocation, { lat: n.lat, lng: n.lng })
                    : null
                  const color = FIELD_NOTE_KIND_COLOR[n.kind]
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => selectNote(n)}
                        className={
                          'w-full text-left px-3 py-2 hover:bg-slate-50 ' +
                          (selectedId === n.id ? 'bg-indigo-50' : '')
                        }
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full shrink-0 mt-1"
                            style={{ backgroundColor: color.fill }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`text-[10px] px-1.5 rounded ${color.badgeBg} ${color.badgeText}`}
                              >
                                {n.kind}
                              </span>
                              {dist != null && (
                                <span className="text-[10px] text-slate-500">
                                  {formatDistance(dist)}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 text-sm font-medium text-slate-900 truncate">
                              {n.title || n.body?.slice(0, 30) || '(제목 없음)'}
                            </div>
                            {isGlobal && n.projectTitle && (
                              <div className="mt-0.5 text-[10px] text-indigo-600 truncate">
                                공사: {n.projectTitle}
                              </div>
                            )}
                            <div className="mt-0.5 text-[10px] text-slate-500">
                              {n.created_by_name ?? '—'} ·{' '}
                              {new Date(n.created_at).toLocaleString('ko-KR', {
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                              {n.photos.length > 0 && ` · 📷 ${n.photos.length}`}
                            </div>
                          </div>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </aside>
      ) : (
        <button
          onClick={() => setSidebarOpen(true)}
          className="absolute top-3 left-3 z-20 inline-flex items-center gap-1 rounded-lg bg-white shadow-md border border-slate-200 px-2 py-1.5 text-xs hover:bg-slate-50"
          aria-label="사이드바 펼치기"
        >
          <ChevronRight className="h-4 w-4" />
          목록
        </button>
      )}

      {/* 지도 + 마커 오버레이 */}
      <div className="relative flex-1 min-w-0">
        {/* 상단 도구바 */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-white shadow-lg rounded-xl border border-slate-200 px-2 py-1.5">
          {FIELD_NOTE_KIND_VALUES.map((k) => {
            const Icon = KIND_ICON[k]
            const active = addMode === k
            return (
              <button
                key={k}
                onClick={() => setAddMode(active ? null : k)}
                title={`${k} 추가 — 지도 클릭 위치에 노트 생성`}
                className={
                  'inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition ' +
                  (active
                    ? KIND_BUTTON_TONE[k] + ' ring-2 ring-offset-1 ring-' + (k === '위험' ? 'rose' : k === '주의' ? 'amber' : 'slate') + '-400'
                    : `bg-white text-slate-700 border-slate-300 hover:${k === '위험' ? 'bg-rose-50' : k === '주의' ? 'bg-amber-50' : 'bg-slate-50'}`)
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {active ? `${k} 추가 중` : k}
              </button>
            )
          })}
          <div className="mx-1 h-5 w-px bg-slate-200" />
          <button
            onClick={locateMe}
            disabled={locating}
            title="GPS 로 내 위치를 찾아 지도 중앙으로 이동"
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 text-white px-2 py-1.5 text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {locating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Crosshair className="h-3.5 w-3.5" />
            )}
            내 위치
          </button>
        </div>

        {/* 안내 메시지 — 추가 모드 활성 */}
        {addMode && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 rounded-full bg-slate-900/90 text-white text-xs px-3 py-1 shadow">
            지도에서 {addMode} 마커를 추가할 위치를 클릭하세요. (취소: 같은 버튼 다시 누르기)
          </div>
        )}

        {/* 지도 컨테이너 */}
        <div
          ref={setContainer}
          className="absolute inset-0 bg-slate-200"
          style={{ cursor: addMode ? 'crosshair' : 'grab' }}
        />

        {/* 지도 status 표시 */}
        {status === 'loading' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 pointer-events-none">
            <Loader2 className="h-8 w-8 animate-spin text-slate-600" />
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
              지도를 불러오지 못했습니다. NEXT_PUBLIC_KAKAO_MAP_KEY 환경변수 확인.
            </div>
          </div>
        )}

        {/* SVG 오버레이 — 마커 */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width="100%"
          height="100%"
        >
          {projectedMarkers.map(({ note, x, y }) => {
            const color = FIELD_NOTE_KIND_COLOR[note.kind]
            const selected = selectedId === note.id
            return (
              <g
                key={note.id}
                style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation()
                  selectNote(note)
                }}
              >
                {selected && (
                  <circle
                    cx={x}
                    cy={y}
                    r={MARKER_RADIUS + 8}
                    fill={color.fill}
                    opacity={0.25}
                  />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={MARKER_RADIUS}
                  fill={color.fill}
                  stroke={color.stroke}
                  strokeWidth={selected ? 3 : 2}
                />
                <text
                  x={x}
                  y={y + 4}
                  textAnchor="middle"
                  fontSize="13"
                  fontWeight="700"
                  fill={color.text}
                  style={{ userSelect: 'none' }}
                >
                  {note.kind === '위험' ? '!' : note.kind === '주의' ? '⚠' : 'i'}
                </text>
                {note.photos.length > 0 && (
                  <g>
                    <circle
                      cx={x + MARKER_RADIUS - 3}
                      cy={y - MARKER_RADIUS + 3}
                      r={7}
                      fill="white"
                      stroke={color.stroke}
                      strokeWidth={1.5}
                    />
                    <text
                      x={x + MARKER_RADIUS - 3}
                      y={y - MARKER_RADIUS + 6}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="700"
                      fill={color.stroke}
                    >
                      {note.photos.length > 9 ? '9+' : note.photos.length}
                    </text>
                  </g>
                )}
              </g>
            )
          })}

          {/* 내 위치 마커 */}
          {myLocationPixel && (
            <g pointerEvents="none">
              <circle
                cx={myLocationPixel.x}
                cy={myLocationPixel.y}
                r={14}
                fill="#3b82f6"
                opacity={0.2}
              />
              <circle
                cx={myLocationPixel.x}
                cy={myLocationPixel.y}
                r={6}
                fill="#3b82f6"
                stroke="white"
                strokeWidth={2}
              />
            </g>
          )}

          {/* 추가 위치 핀 (폼 입력 중) */}
          {addPinPixel && showForm?.mode === 'create' && (
            <g pointerEvents="none">
              <line
                x1={addPinPixel.x}
                y1={addPinPixel.y - 20}
                x2={addPinPixel.x}
                y2={addPinPixel.y - 5}
                stroke="#475569"
                strokeWidth={2}
              />
              <circle
                cx={addPinPixel.x}
                cy={addPinPixel.y}
                r={6}
                fill="#475569"
                stroke="white"
                strokeWidth={2}
              />
            </g>
          )}
        </svg>
      </div>

      {/* 우측 상세 패널 */}
      {selectedNote && (
        <NoteDetailPanel
          note={selectedNote}
          meId={meId}
          meIsAdmin={meIsAdmin}
          isGlobal={isGlobal}
          myLocation={myLocation}
          projectId={projectId}
          photoUrls={photoUrls}
          onClose={() => setSelectedId(null)}
          onEdit={() => setShowForm({ mode: 'edit', note: selectedNote })}
          onDelete={() => handleDelete(selectedNote.id)}
          onDeletePhoto={handleDeletePhoto}
          onSetShared={(shared) => handleSetShared(selectedNote.id, shared)}
        />
      )}

      {/* 노트 생성/수정 폼 모달 */}
      {showForm && (
        <NoteFormModal
          projectId={projectId}
          state={showForm}
          onClose={() => {
            setShowForm(null)
            setShowAddPin(null)
            setAddMode(null)
          }}
          onSuccess={() => {
            setShowForm(null)
            setShowAddPin(null)
            setAddMode(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

// =====================================================================
// 우측 상세 패널
// =====================================================================
function NoteDetailPanel({
  note,
  meId,
  meIsAdmin,
  isGlobal,
  myLocation,
  projectId,
  photoUrls,
  onClose,
  onEdit,
  onDelete,
  onDeletePhoto,
  onSetShared,
}: {
  note: FieldNoteData
  meId: string
  meIsAdmin: boolean
  isGlobal: boolean
  myLocation: LatLng | null
  projectId: string | null
  photoUrls: Record<string, string>
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onDeletePhoto: (photoId: string) => void
  onSetShared: (shared: boolean) => void
}) {
  const color = FIELD_NOTE_KIND_COLOR[note.kind]
  const Icon = KIND_ICON[note.kind]
  const isAuthor = note.created_by === meId
  const sameDay = isSameKstDate(note.created_at)
  const canDelete = meIsAdmin || (isAuthor && sameDay)
  const canEdit = meIsAdmin || isAuthor
  // 「보내기」 권한 = 작성자 OR admin (update RLS 와 동일)
  const canShare = !isGlobal && (meIsAdmin || isAuthor)
  const distance = myLocation
    ? haversineMeters(myLocation, { lat: note.lat, lng: note.lng })
    : null

  return (
    <aside className="w-[340px] shrink-0 bg-white border-l border-slate-200 flex flex-col">
      <div
        className={`flex items-center justify-between px-3 py-2.5 border-b ${color.badgeBg} ${color.badgeBorder}`}
      >
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${color.badgeText}`} />
          <span className={`text-sm font-semibold ${color.badgeText}`}>
            {note.kind}
          </span>
          <span className="text-[11px] text-slate-500">
            {new Date(note.created_at).toLocaleString('ko-KR', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-slate-500 hover:bg-white"
          aria-label="닫기"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {note.title && (
          <h2 className="text-base font-bold text-slate-900">{note.title}</h2>
        )}
        {note.body && (
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{note.body}</p>
        )}
        {note.address && (
          <div className="text-xs text-slate-500">
            <MapPin className="inline h-3 w-3 mr-0.5" />
            {note.address}
          </div>
        )}

        {/* 출처 공사 (최상위 모드) */}
        {isGlobal && note.projectTitle && (
          <div className="rounded bg-indigo-50 border border-indigo-100 px-2 py-1.5 text-[11px] text-indigo-700">
            출처 공사: <span className="font-medium">{note.projectTitle}</span>
          </div>
        )}

        {/* 현장관리로 보내기 (공사 모드만) */}
        {canShare && (
          <div className="rounded border border-slate-200 px-2 py-2 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-600">
                {note.sharedToField
                  ? '✓ 최상위 현장관리에 표시 중'
                  : '이 공사에서만 보임'}
              </span>
              <button
                onClick={() => onSetShared(!note.sharedToField)}
                className={
                  'rounded-md px-2 py-1 text-[11px] font-medium ' +
                  (note.sharedToField
                    ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700')
                }
              >
                {note.sharedToField ? '내리기' : '현장관리로 보내기'}
              </button>
            </div>
          </div>
        )}

        <div className="text-[11px] text-slate-500 grid grid-cols-2 gap-2 rounded bg-slate-50 p-2">
          <div>
            <div className="text-slate-400">위도/경도</div>
            <div className="font-mono">
              {note.lat.toFixed(5)}, {note.lng.toFixed(5)}
            </div>
          </div>
          {distance != null && (
            <div>
              <div className="text-slate-400">내 위치까지 (직선)</div>
              <div className="font-semibold text-slate-700">
                {formatDistance(distance)}
              </div>
            </div>
          )}
        </div>

        {/* 길찾기 */}
        <div className="space-y-1.5 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <NavLauncher
              lat={note.lat}
              lng={note.lng}
              name={note.title || `${note.kind} 지점`}
            />
            <NavPreferenceReset />
          </div>
          <p className="text-[10px] text-slate-400">
            외부 네비 앱이 자동으로 현재 위치에서 길안내를 시작합니다
          </p>
        </div>

        {/* 사진 */}
        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-xs font-semibold text-slate-700">
              사진 ({note.photos.length})
            </div>
            {(canEdit || isAuthor) && (
              <FieldPhotoUploader noteId={note.id} projectId={projectId} />
            )}
          </div>
          {note.photos.length === 0 ? (
            <div className="text-[11px] text-slate-400 text-center py-3 bg-slate-50 rounded">
              사진 없음
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {note.photos.map((p) => {
                const url = photoUrls[p.path]
                return (
                  <div key={p.id} className="relative group rounded overflow-hidden bg-slate-100 aspect-square">
                    {url ? (
                      <a href={url} target="_blank" rel="noopener">
                        <img
                          src={url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </a>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                      </div>
                    )}
                    {(meIsAdmin || p.uploaded_by === meId) && (
                      <button
                        onClick={() => onDeletePhoto(p.id)}
                        className="absolute top-1 right-1 rounded bg-rose-600/80 p-1 text-white opacity-0 group-hover:opacity-100"
                        title="삭제"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                    {p.taken_at && (
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] px-1 py-0.5">
                        {new Date(p.taken_at).toLocaleString('ko-KR', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 메타 */}
        <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-100">
          작성자: {note.created_by_name ?? '—'}
        </div>
      </div>

      {/* 액션 */}
      {(canEdit || canDelete) && (
        <div className="border-t border-slate-200 p-2 flex gap-2 bg-slate-50">
          {canEdit && (
            <button
              onClick={onEdit}
              className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-white border border-slate-300 px-3 py-2 text-xs font-medium hover:bg-slate-100"
            >
              <Pencil className="h-3.5 w-3.5" />
              수정
            </button>
          )}
          {canDelete ? (
            <button
              onClick={onDelete}
              className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-rose-600 text-white px-3 py-2 text-xs font-medium hover:bg-rose-700"
            >
              <Trash2 className="h-3.5 w-3.5" />
              삭제
            </button>
          ) : isAuthor && !sameDay ? (
            <div className="flex-1 text-[10px] text-slate-500 text-center py-2 px-2 leading-tight">
              당일이 지나 본인 삭제 불가.<br />관리자에게 문의
            </div>
          ) : null}
        </div>
      )}
    </aside>
  )
}

// =====================================================================
// 노트 생성·수정 폼 모달
// =====================================================================
function NoteFormModal({
  projectId,
  state,
  onClose,
  onSuccess,
}: {
  projectId: string | null
  state:
    | { mode: 'create'; kind: FieldNoteKind; lat: number; lng: number }
    | { mode: 'edit'; note: FieldNoteData }
  onClose: () => void
  onSuccess: () => void
}) {
  const isEdit = state.mode === 'edit'
  const initialKind = isEdit ? state.note.kind : state.kind
  const initialLat = isEdit ? state.note.lat : state.lat
  const initialLng = isEdit ? state.note.lng : state.lng
  const initialTitle = isEdit ? state.note.title ?? '' : ''
  const initialBody = isEdit ? state.note.body ?? '' : ''
  const initialAddress = isEdit ? state.note.address ?? '' : ''

  const [kind, setKind] = useState<FieldNoteKind>(initialKind)
  const [title, setTitle] = useState(initialTitle)
  const [body, setBody] = useState(initialBody)
  const [address, setAddress] = useState(initialAddress)
  const [busy, setBusy] = useState(false)

  // body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const fd = new FormData()
    fd.append('project_id', projectId ?? '')
    fd.append('kind', kind)
    fd.append('title', title.trim())
    fd.append('body', body.trim())
    fd.append('address', address.trim())
    fd.append('lat', String(initialLat))
    fd.append('lng', String(initialLng))

    try {
      if (isEdit) {
        fd.append('note_id', state.note.id)
        const res = await updateFieldNote(fd)
        if (res.ok) {
          toast.success('수정됨')
          onSuccess()
        } else {
          toast.error(res.error)
          setBusy(false)
        }
      } else {
        const res = await createFieldNote(fd)
        if (res.ok) {
          toast.success(`${kind} 노트 추가됨`)
          onSuccess()
        } else {
          toast.error(res.error)
          setBusy(false)
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장 실패')
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div className="text-sm font-semibold">
            {isEdit ? '노트 수정' : '새 현장관리 노트'}
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-700">종류</label>
            <div className="mt-1 flex gap-1">
              {FIELD_NOTE_KIND_VALUES.map((k) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => setKind(k)}
                  className={
                    'flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium ' +
                    (kind === k
                      ? KIND_BUTTON_TONE[k]
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50')
                  }
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700">
              제목 (선택)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="예: 도로 매설 위험·인접 굴착 작업"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700">
              내용 / 메모
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="상세 내용·주의사항·대응 방법 등"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700">
              주소 (선택)
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={200}
              placeholder="도로명 또는 지번"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="rounded bg-slate-50 p-2 text-[11px] text-slate-500">
            위치: {initialLat.toFixed(5)}, {initialLng.toFixed(5)}
            {isEdit && (
              <span className="block mt-0.5">
                ※ 위치를 옮기려면 일단 삭제 후 다시 추가하거나 마커를 드래그하세요 (이번 단계는 미지원)
              </span>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={busy}
              className={
                'flex-1 rounded-lg px-3 py-2 text-sm font-medium ' +
                KIND_BUTTON_TONE[kind] +
                ' disabled:opacity-50'
              }
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin mx-auto" />
              ) : isEdit ? (
                '수정 저장'
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Plus className="h-3.5 w-3.5" />
                  추가
                </span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
