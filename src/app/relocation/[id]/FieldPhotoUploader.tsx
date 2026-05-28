'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import exifr from 'exifr'
import {
  FIELD_NOTE_PHOTO_MAX_BYTES,
  FIELD_NOTE_PHOTO_MIME_WHITELIST,
} from '@/lib/field-notes'
import { uploadFieldNotePhoto } from './field-note-actions'

// 현장관리 노트 사진 업로더. exifr 로 EXIF (촬영시각·GPS) 추출 후 server action 호출.
//   접속일보 PhotoUploader 와 동일 패턴. 모바일 카메라 즉시 촬영 지원.

type Props = {
  noteId: string
  projectId: string | null
}

export default function FieldPhotoUploader({ noteId, projectId }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return

    setBusy(true)
    setProgress({ done: 0, total: files.length })

    let success = 0
    let failed = 0
    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      if (file.size > FIELD_NOTE_PHOTO_MAX_BYTES) {
        toast.error(`'${file.name}' — 10MB 초과`)
        failed++
        setProgress({ done: i + 1, total: files.length })
        continue
      }
      if (!(FIELD_NOTE_PHOTO_MIME_WHITELIST as readonly string[]).includes(file.type)) {
        toast.error(`'${file.name}' — 이미지 형식 아님`)
        failed++
        setProgress({ done: i + 1, total: files.length })
        continue
      }

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
      fd.append('note_id', noteId)
      fd.append('project_id', projectId ?? '')
      if (takenAt) fd.append('taken_at', takenAt)
      if (gpsLat !== null) fd.append('gps_lat', String(gpsLat))
      if (gpsLng !== null) fd.append('gps_lng', String(gpsLng))

      try {
        const res = await uploadFieldNotePhoto(fd)
        if (res.ok) success++
        else {
          toast.error(res.error)
          failed++
        }
      } catch (err) {
        toast.error(`'${file.name}' — ${err instanceof Error ? err.message : '업로드 실패'}`)
        failed++
      }
      setProgress({ done: i + 1, total: files.length })
    }

    setBusy(false)
    setProgress(null)

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
        onChange={handleChange}
        disabled={busy}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        {busy && progress ? `업로드 중 ${progress.done}/${progress.total}` : '사진 추가'}
      </button>
      <p className="text-[10px] text-slate-500">최대 10MB · 여러 장 선택 가능 · 카메라 즉시 촬영도 OK</p>
    </div>
  )
}
