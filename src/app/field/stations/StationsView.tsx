'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Plus,
  Search,
  X,
  Trash2,
  Building2,
  Images,
  MapPin,
  Loader2,
  Save,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import NavLauncher, { NavPreferenceReset } from '../../relocation/[id]/NavLauncher'
import AddressGeocodeField from './AddressGeocodeField'
import StationPhotoUploader from './StationPhotoUploader'
import {
  createStation,
  updateStation,
  deleteStation,
  addStationSection,
  updateStationSection,
  deleteStationSection,
  deleteStationPhoto,
  getStationPhotoUrls,
} from '../station-actions'

// =====================================================================
// 타입 (server page 와 공유)
// =====================================================================
export type StationPhotoData = {
  id: string
  sectionId: string
  path: string
  caption: string | null
  takenAt: string | null
  gpsLat: number | null
  gpsLng: number | null
  uploadedBy: string | null
  uploadedByName: string | null
  createdAt: string
}

export type StationSectionData = {
  id: string
  stationId: string
  label: string
  body: string | null
  sortOrder: number
  photos: StationPhotoData[]
}

export type StationData = {
  id: string
  name: string
  address: string | null
  lat: number | null
  lng: number | null
  createdBy: string | null
  createdAt: string
  sections: StationSectionData[]
}

type Props = {
  stations: StationData[]
  meId: string
  meIsAdmin: boolean
}

// =====================================================================
// 메인 — 좌측 목록 + 우측 정보패널 (드래그로 폭 조절)
// =====================================================================
export default function StationsView({ stations, meId, meIsAdmin }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [panelWidth, setPanelWidth] = useState(460)
  const draggingRef = useRef(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return stations
    return stations.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.address ?? '').toLowerCase().includes(q),
    )
  }, [stations, search])

  const selected = useMemo(
    () => stations.find((s) => s.id === selectedId) ?? null,
    [stations, selectedId],
  )

  // 선택한 국사가 목록에서 사라지면(삭제) 선택 해제
  useEffect(() => {
    if (selectedId && !stations.some((s) => s.id === selectedId)) {
      setSelectedId(null)
    }
  }, [stations, selectedId])

  function onHandleDown(e: React.PointerEvent) {
    draggingRef.current = true
    try {
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }
  function onHandleMove(e: React.PointerEvent) {
    if (!draggingRef.current) return
    const w = window.innerWidth - e.clientX
    setPanelWidth(Math.max(320, Math.min(960, w)))
  }
  function onHandleUp(e: React.PointerEvent) {
    draggingRef.current = false
    try {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex flex-col md:flex-row gap-3 items-start">
      {/* 좌측 — 국사 목록 */}
      <div className="w-full md:flex-1 md:min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="국사명·주소 검색"
              className="w-full rounded-lg border border-slate-300 pl-8 pr-8 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="지우기"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700"
          >
            <Plus className="h-4 w-4" />
            국사 등록
          </button>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 py-12 text-center">
            <Building2 className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">
              {stations.length === 0 ? '등록된 국사가 없습니다.' : '검색 결과가 없습니다.'}
            </p>
            {stations.length === 0 && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700"
              >
                <Plus className="h-4 w-4" />첫 국사 등록
              </button>
            )}
          </div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 gap-2">
            {filtered.map((s) => {
              const photoCount = s.sections.reduce((n, sec) => n + sec.photos.length, 0)
              const active = s.id === selectedId
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={
                      'w-full text-left rounded-xl border px-3 py-2.5 transition ' +
                      (active
                        ? 'border-rose-400 bg-rose-50 ring-1 ring-rose-200'
                        : 'border-slate-200 bg-white hover:border-slate-300')
                    }
                  >
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 shrink-0 text-rose-600" />
                      <span className="font-semibold text-sm text-slate-900 truncate">
                        {s.name}
                      </span>
                    </div>
                    {s.address && (
                      <p className="mt-0.5 text-xs text-slate-500 truncate flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {s.address}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-slate-400">
                      항목 {s.sections.length} · 사진 {photoCount}
                    </p>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* 우측 — 정보패널 (드래그로 폭 조절) */}
      {selected && (
        <div
          className="relative w-full md:shrink-0 md:w-[var(--panel-w)]"
          style={{ ['--panel-w' as string]: `${panelWidth}px` }}
        >
          {/* 드래그 핸들 (md 이상) */}
          <div
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            className="hidden md:block absolute -left-2 top-0 bottom-0 z-10 w-4 cursor-col-resize"
            title="드래그해서 패널 폭 조절"
          >
            <div className="mx-auto h-full w-0.5 bg-slate-200 hover:bg-rose-400" />
          </div>

          <StationDetail
            key={selected.id}
            station={selected}
            meId={meId}
            meIsAdmin={meIsAdmin}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}

      {creating && (
        <CreateStationModal
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false)
            setSelectedId(id)
          }}
        />
      )}
    </div>
  )
}

// =====================================================================
// 국사 등록 모달
// =====================================================================
function CreateStationModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [addr, setAddr] = useState<{ address: string; lat: number | null; lng: number | null }>({
    address: '',
    lat: null,
    lng: null,
  })
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!name.trim()) {
      toast.error('국사명을 입력하세요')
      return
    }
    setBusy(true)
    const fd = new FormData()
    fd.append('name', name.trim())
    fd.append('address', addr.address.trim())
    if (addr.lat != null && addr.lng != null) {
      fd.append('lat', String(addr.lat))
      fd.append('lng', String(addr.lng))
    }
    try {
      const res = await createStation(fd)
      if (res.ok) {
        toast.success('국사 등록 완료')
        router.refresh()
        onCreated(res.id)
      } else {
        toast.error(res.error)
        setBusy(false)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '등록 실패')
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div className="w-full sm:w-[480px] bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <span className="flex items-center gap-2 font-semibold text-sm">
            <Building2 className="h-4 w-4 text-rose-600" />
            국사 등록
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">국사명 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 시흥국사"
              autoFocus
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">국사주소</label>
            <AddressGeocodeField
              address={addr.address}
              lat={addr.lat}
              lng={addr.lng}
              onChange={setAddr}
            />
          </div>
          <p className="text-[11px] text-slate-400">
            등록하면 상면도·장비랙정보·OFD랙정보·추가정보 항목이 자동으로 만들어집니다 (이름 변경·추가 가능).
          </p>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="w-full rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60 inline-flex items-center justify-center gap-1.5"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            등록
          </button>
        </div>
      </div>
    </div>
  )
}

// =====================================================================
// 정보패널 — 선택한 국사 상세
// =====================================================================
type PhotoWithUrl = StationPhotoData & { url: string | null; sectionLabel: string }

function StationDetail({
  station,
  meId,
  meIsAdmin,
  onClose,
}: {
  station: StationData
  meId: string
  meIsAdmin: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [name, setName] = useState(station.name)
  const [addr, setAddr] = useState<{ address: string; lat: number | null; lng: number | null }>({
    address: station.address ?? '',
    lat: station.lat,
    lng: station.lng,
  })
  const [savingInfo, setSavingInfo] = useState(false)
  const [urlMap, setUrlMap] = useState<Record<string, string>>({})
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const canDeleteStation = meIsAdmin || station.createdBy === meId

  const infoDirty =
    name.trim() !== station.name ||
    addr.address.trim() !== (station.address ?? '') ||
    addr.lat !== station.lat ||
    addr.lng !== station.lng

  // 모든 사진 평탄화 (갤러리·라이트박스 순회용)
  const allPhotos: PhotoWithUrl[] = useMemo(() => {
    const arr: PhotoWithUrl[] = []
    for (const sec of station.sections) {
      for (const p of sec.photos) {
        arr.push({ ...p, url: urlMap[p.path] ?? null, sectionLabel: sec.label })
      }
    }
    return arr
  }, [station.sections, urlMap])

  // 사진 signed URL 일괄 발급
  useEffect(() => {
    const paths = station.sections.flatMap((sec) => sec.photos.map((p) => p.path))
    if (paths.length === 0) {
      setUrlMap({})
      return
    }
    let cancelled = false
    getStationPhotoUrls(paths)
      .then((m) => {
        if (!cancelled) setUrlMap(m)
      })
      .catch(() => {
        // signed URL 실패 — 썸네일만 비표시
      })
    return () => {
      cancelled = true
    }
  }, [station.sections])

  async function saveInfo() {
    if (!name.trim()) {
      toast.error('국사명을 입력하세요')
      return
    }
    setSavingInfo(true)
    const fd = new FormData()
    fd.append('station_id', station.id)
    fd.append('name', name.trim())
    fd.append('address', addr.address.trim())
    if (addr.lat != null && addr.lng != null) {
      fd.append('lat', String(addr.lat))
      fd.append('lng', String(addr.lng))
    }
    try {
      const res = await updateStation(fd)
      if (res.ok) {
        toast.success('저장됨')
        router.refresh()
      } else toast.error(res.error)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
    }
    setSavingInfo(false)
  }

  async function removeStation() {
    if (!confirm(`국사 「${station.name}」 을(를) 삭제할까요?\n등록된 항목·사진이 모두 삭제됩니다.`)) return
    const fd = new FormData()
    fd.append('station_id', station.id)
    try {
      const res = await deleteStation(fd)
      if (res.ok) {
        toast.success('국사 삭제됨')
        onClose()
        router.refresh()
      } else toast.error(res.error)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  async function addSection() {
    const fd = new FormData()
    fd.append('station_id', station.id)
    fd.append('label', '추가정보')
    try {
      const res = await addStationSection(fd)
      if (res.ok) {
        toast.success('항목 추가됨 — 이름을 변경하세요')
        router.refresh()
      } else toast.error(res.error)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '추가 실패')
    }
  }

  const totalPhotos = allPhotos.length

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-3 py-2.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="md:hidden rounded p-1 text-slate-500 hover:bg-slate-100"
            aria-label="목록으로"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <Building2 className="h-4 w-4 shrink-0 text-rose-600" />
          <span className="font-semibold text-sm text-slate-900 truncate">{station.name}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setGalleryOpen(true)}
            disabled={totalPhotos === 0}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            <Images className="h-3.5 w-3.5" />
            갤러리 {totalPhotos}
          </button>
          {canDeleteStation && (
            <button
              type="button"
              onClick={removeStation}
              className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50"
              aria-label="국사 삭제"
              title="국사 삭제"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="p-3 space-y-3 max-h-[calc(100vh-12rem)] overflow-y-auto">
        {/* 기본 정보 */}
        <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-2.5">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">국사명</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">국사주소</label>
            <AddressGeocodeField
              address={addr.address}
              lat={addr.lat}
              lng={addr.lng}
              onChange={setAddr}
            />
          </div>
          <div className="flex items-center gap-2">
            {infoDirty && (
              <button
                type="button"
                onClick={saveInfo}
                disabled={savingInfo}
                className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {savingInfo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                정보 저장
              </button>
            )}
            {station.lat != null && station.lng != null ? (
              <>
                <NavLauncher lat={station.lat} lng={station.lng} name={station.name} />
                <NavPreferenceReset />
              </>
            ) : station.address ? (
              <a
                href={`https://map.kakao.com/?q=${encodeURIComponent(station.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                <MapPin className="h-4 w-4" />
                주소로 검색
              </a>
            ) : null}
          </div>
          {infoDirty && (
            <p className="text-[11px] text-amber-600">변경된 내용이 있습니다. 「정보 저장」을 눌러 반영하세요.</p>
          )}
        </div>

        {/* 항목(섹션) 목록 */}
        {station.sections.map((sec) => (
          <StationSectionCard
            key={sec.id}
            section={sec}
            urlMap={urlMap}
            canDeletePhoto={(p) => meIsAdmin || p.uploadedBy === meId}
            onOpenPhoto={(photoId) => {
              const idx = allPhotos.findIndex((p) => p.id === photoId)
              if (idx >= 0) setLightboxIndex(idx)
            }}
          />
        ))}

        <button
          type="button"
          onClick={addSection}
          className="w-full rounded-lg border border-dashed border-slate-300 py-2 text-xs font-medium text-slate-500 hover:border-rose-300 hover:text-rose-600 inline-flex items-center justify-center gap-1.5"
        >
          <Plus className="h-4 w-4" />
          항목 추가
        </button>
      </div>

      {/* 전체 사진 갤러리 모달 (전체화면 + 반응형 그리드 + 내부 라이트박스) */}
      {galleryOpen && (
        <StationGalleryModal
          stationName={station.name}
          photos={allPhotos}
          onClose={() => setGalleryOpen(false)}
        />
      )}

      {/* 라이트박스 */}
      {lightboxIndex !== null && allPhotos[lightboxIndex] && (
        <Lightbox
          photos={allPhotos}
          index={lightboxIndex}
          onIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  )
}

// =====================================================================
// 항목 카드 — 이름·설명 편집 + 사진 + 업로더 + 삭제
// =====================================================================
function StationSectionCard({
  section,
  urlMap,
  canDeletePhoto,
  onOpenPhoto,
}: {
  section: StationSectionData
  urlMap: Record<string, string>
  canDeletePhoto: (p: StationPhotoData) => boolean
  onOpenPhoto: (photoId: string) => void
}) {
  const router = useRouter()
  const [label, setLabel] = useState(section.label)
  const [body, setBody] = useState(section.body ?? '')
  const [saving, setSaving] = useState(false)

  const dirty = label.trim() !== section.label || body.trim() !== (section.body ?? '')

  async function save() {
    if (!label.trim()) {
      toast.error('항목 이름을 입력하세요')
      return
    }
    setSaving(true)
    const fd = new FormData()
    fd.append('section_id', section.id)
    fd.append('label', label.trim())
    fd.append('body', body.trim())
    try {
      const res = await updateStationSection(fd)
      if (res.ok) {
        toast.success('저장됨')
        router.refresh()
      } else toast.error(res.error)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
    }
    setSaving(false)
  }

  async function remove() {
    if (!confirm(`항목 「${section.label}」 을(를) 삭제할까요?\n이 항목의 사진도 함께 삭제됩니다.`)) return
    const fd = new FormData()
    fd.append('section_id', section.id)
    try {
      const res = await deleteStationSection(fd)
      if (res.ok) {
        toast.success('항목 삭제됨')
        router.refresh()
      } else toast.error(res.error)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  async function removePhoto(p: StationPhotoData) {
    if (!confirm('이 사진을 삭제할까요?')) return
    const fd = new FormData()
    fd.append('photo_id', p.id)
    try {
      const res = await deleteStationPhoto(fd)
      if (res.ok) {
        toast.success('사진 삭제됨')
        router.refresh()
      } else toast.error(res.error)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 p-2.5 space-y-2">
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="flex-1 min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm font-semibold text-slate-900 hover:border-slate-200 focus:border-indigo-500 focus:bg-white focus:outline-none"
        />
        <button
          type="button"
          onClick={remove}
          className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
          aria-label="항목 삭제"
          title="항목 삭제"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="설명 입력 (선택)"
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:border-indigo-500 focus:outline-none resize-y"
      />

      {dirty && (
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          저장
        </button>
      )}

      {/* 사진 그리드 */}
      {section.photos.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
          {section.photos.map((p) => {
            const url = urlMap[p.path]
            return (
              <div key={p.id} className="group relative aspect-square overflow-hidden rounded-md bg-slate-100">
                {url ? (
                  <button
                    type="button"
                    onClick={() => onOpenPhoto(p.id)}
                    className="block h-full w-full"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={p.caption ?? ''} className="h-full w-full object-cover" />
                  </button>
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
                  </div>
                )}
                {p.caption && (
                  <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-[9px] text-white line-clamp-1">
                    {p.caption}
                  </span>
                )}
                {canDeletePhoto(p) && (
                  <button
                    type="button"
                    onClick={() => removePhoto(p)}
                    className="absolute right-0.5 top-0.5 rounded bg-black/50 p-0.5 text-white opacity-0 group-hover:opacity-100"
                    aria-label="사진 삭제"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <StationPhotoUploader sectionId={section.id} />
    </div>
  )
}

// =====================================================================
// 전체 사진 갤러리 모달 — 전체화면 다크. 화면 크기에 따라 열 수가 동적으로
//   늘어나는 반응형 그리드(2→3→4→5열). 썸네일 클릭 = 내부 라이트박스.
//   지도 노트(PhotoGalleryModal) 와 동일 UX.
// =====================================================================
function StationGalleryModal({
  stationName,
  photos,
  onClose,
}: {
  stationName: string
  photos: PhotoWithUrl[]
  onClose: () => void
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && lightboxIndex === null) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [lightboxIndex, onClose])

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/80">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <Images className="h-5 w-5" />
          <span className="font-semibold">{stationName} 사진 갤러리</span>
          <span className="text-sm text-white/60">{photos.length}장</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 hover:bg-white/15"
          aria-label="닫기"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {photos.length === 0 ? (
          <div className="flex h-full items-center justify-center text-white/60 text-sm">
            등록된 사진이 없습니다
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {photos.map((p, idx) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setLightboxIndex(idx)}
                className="group relative aspect-square overflow-hidden rounded-lg bg-slate-800 text-left"
              >
                {p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt={p.caption ?? ''} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-white/50" />
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1 pt-4">
                  <div className="truncate text-[11px] font-medium text-white">
                    {p.sectionLabel}
                    {p.caption ? ` · ${p.caption}` : ''}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 라이트박스 — 갤러리 위에 겹쳐 표시, 닫으면 그리드로 복귀 */}
      {lightboxIndex !== null && photos[lightboxIndex] && (
        <Lightbox
          photos={photos}
          index={lightboxIndex}
          onIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  )
}

// =====================================================================
// 라이트박스 (◀ ▶ ESC)
// =====================================================================
function Lightbox({
  photos,
  index,
  onIndex,
  onClose,
}: {
  photos: PhotoWithUrl[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') onIndex(Math.max(0, index - 1))
      else if (e.key === 'ArrowRight') onIndex(Math.min(photos.length - 1, index + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [index, photos.length, onIndex, onClose])

  const p = photos[index]
  if (!p) return null

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/90">
      <div className="shrink-0 flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm">
          {index + 1} / {photos.length} · {p.sectionLabel}
        </span>
        <button type="button" onClick={onClose} className="rounded p-1 hover:bg-white/10" aria-label="닫기">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* ◀ ▶ 는 화면에 고정 — 스크롤해도 항상 같은 위치 */}
      {index > 0 && (
        <button
          type="button"
          onClick={() => onIndex(index - 1)}
          className="fixed left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          aria-label="이전"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {index < photos.length - 1 && (
        <button
          type="button"
          onClick={() => onIndex(index + 1)}
          className="fixed right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          aria-label="다음"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {/* 본문 — 사진이 커서 캡션이 잘리면 세로 스크롤 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div
          className="flex min-h-full items-center justify-center px-2 py-3"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          {p.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.url}
              alt={p.caption ?? ''}
              className="max-w-full max-h-[82vh] object-contain"
            />
          ) : (
            <Loader2 className="h-8 w-8 animate-spin text-white/60" />
          )}
        </div>

        {(p.caption || p.uploadedByName || p.takenAt) && (
          <div className="px-4 pb-6 pt-1 text-center text-white/90">
            {p.caption && <p className="text-sm">{p.caption}</p>}
            <p className="text-[11px] text-white/60 mt-0.5">
              {p.uploadedByName ?? ''}
              {p.takenAt
                ? ` · 촬영 ${new Date(p.takenAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`
                : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
