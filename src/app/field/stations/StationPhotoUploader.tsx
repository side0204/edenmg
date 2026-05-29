'use client'

import { useRef, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import exifr from 'exifr'
import {
  STATION_PHOTO_MAX_BYTES,
  STATION_PHOTO_MIME_WHITELIST,
} from '@/lib/field-stations'
import { uploadStationPhoto } from '../station-actions'

// 국사 항목별 사진 업로더 — 선택 → 각 사진 설명 입력 → 업로드. EXIF 자동 추출.
//   현장 노트 FieldPhotoUploader 와 동일 패턴 (section 단위).

type Staged = {
  file: File
  previewUrl: string
  caption: string
}

export default function StationPhotoUploader({ sectionId }: { sectionId: string }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [staged, setStaged] = useState<Staged[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  useEffect(() => {
    return () => {
      staged.forEach((s) => URL.revokeObjectURL(s.previewUrl))
    }
  }, [staged])

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    const next: Staged[] = []
    for (const file of files) {
      if (file.size > STATION_PHOTO_MAX_BYTES) {
        toast.error(`'${file.name}' — 10MB 초과`)
        continue
      }
      if (!(STATION_PHOTO_MIME_WHITELIST as readonly string[]).includes(file.type)) {
        toast.error(`'${file.name}' — 이미지 형식 아님`)
        continue
      }
      next.push({ file, previewUrl: URL.createObjectURL(file), caption: '' })
    }
    if (next.length > 0) setStaged((prev) => [...prev, ...next])
  }

  function setCaption(i: number, v: string) {
    setStaged((prev) => prev.map((s, idx) => (idx === i ? { ...s, caption: v } : s)))
  }

  function removeStaged(i: number) {
    setStaged((prev) => {
      const target = prev[i]
      if (target) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((_, idx) => idx !== i)
    })
  }

  async function uploadAll() {
    if (staged.length === 0) return
    setBusy(true)
    setProgress({ done: 0, total: staged.length })

    let success = 0
    let failed = 0
    for (let i = 0; i < staged.length; i++) {
      const { file, caption } = staged[i]

      let takenAt: string | null = null
      let gpsLat: number | null = null
      let gpsLng: number | null = null
      try {
        const exif = await exifr.parse(file, {
          gps: true,
          pick: ['DateTimeOriginal', 'CreateDate', 'latitude', 'longitude'],
        })
        if (exif) {
          const d = (exif.DateTimeOriginal ?? exif.CreateDate) as Date | string | undefined
          if (d) {
            const dt = d instanceof Date ? d : new Date(d)
            if (!Number.isNaN(dt.getTime())) takenAt = dt.toISOString()
          }
          if (typeof exif.latitude === 'number') gpsLat = exif.latitude
          if (typeof exif.longitude === 'number') gpsLng = exif.longitude
        }
      } catch {
        // EXIF 없는 파일도 정상 업로드
      }

      const fd = new FormData()
      fd.append('file', file)
      fd.append('section_id', sectionId)
      if (caption.trim()) fd.append('caption', caption.trim())
      if (takenAt) fd.append('taken_at', takenAt)
      if (gpsLat !== null) fd.append('gps_lat', String(gpsLat))
      if (gpsLng !== null) fd.append('gps_lng', String(gpsLng))

      try {
        const res = await uploadStationPhoto(fd)
        if (res.ok) success++
        else {
          toast.error(res.error)
          failed++
        }
      } catch (err) {
        toast.error(`'${file.name}' — ${err instanceof Error ? err.message : '업로드 실패'}`)
        failed++
      }
      setProgress({ done: i + 1, total: staged.length })
    }

    setBusy(false)
    setProgress(null)
    staged.forEach((s) => URL.revokeObjectURL(s.previewUrl))
    setStaged([])

    if (success > 0) toast.success(`사진 ${success}장 업로드`)
    if (success > 0 || failed > 0) router.refresh()
  }

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        capture="environment"
        onChange={handleSelect}
        disabled={busy}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
        {busy && progress ? `업로드 중 ${progress.done}/${progress.total}` : '사진 추가'}
      </button>

      {staged.length > 0 && (
        <div className="mt-1 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-1.5">
          <p className="text-[10px] text-slate-500 px-0.5">
            각 사진에 설명을 입력하고 업로드하세요 (설명은 선택)
          </p>
          {staged.map((s, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <img src={s.previewUrl} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
              <textarea
                value={s.caption}
                onChange={(e) => setCaption(i, e.target.value)}
                rows={2}
                maxLength={200}
                disabled={busy}
                placeholder="어떤 사진인지 설명"
                className="flex-1 min-w-0 rounded border border-slate-300 px-1.5 py-1 text-[11px] focus:border-indigo-500 focus:outline-none resize-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => removeStaged(i)}
                disabled={busy}
                className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-50"
                aria-label="제거"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={uploadAll}
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy
              ? `업로드 중 ${progress?.done ?? 0}/${progress?.total ?? staged.length}`
              : `${staged.length}장 업로드`}
          </button>
        </div>
      )}
    </div>
  )
}
