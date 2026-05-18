'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import exifr from 'exifr'
import { PHOTO_MAX_BYTES, PHOTO_MIME_WHITELIST } from '@/lib/connection'
import { uploadConnectionPhoto } from './connection-report-actions'

type Props = {
  reportId: string
  workId: string
}

export default function PhotoUploader({ reportId, workId }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // 같은 파일 재선택 가능하도록 reset
    if (files.length === 0) return

    setBusy(true)
    setProgress({ done: 0, total: files.length })

    let success = 0
    let failed = 0
    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      // 클라이언트 사이드 1차 검증 (서버에서도 동일 검증)
      if (file.size > PHOTO_MAX_BYTES) {
        toast.error(`'${file.name}' — 10MB 초과`)
        failed++
        setProgress({ done: i + 1, total: files.length })
        continue
      }
      if (!PHOTO_MIME_WHITELIST.includes(file.type)) {
        toast.error(`'${file.name}' — 이미지 형식 아님`)
        failed++
        setProgress({ done: i + 1, total: files.length })
        continue
      }

      // EXIF 추출 (실패해도 업로드 자체는 계속)
      let takenAt: string | null = null
      let gpsLat: number | null = null
      let gpsLng: number | null = null
      try {
        const exif = await exifr.parse(file, { gps: true, pick: ['DateTimeOriginal', 'CreateDate', 'latitude', 'longitude'] })
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
        // EXIF 없는 파일은 정상 케이스 — 그냥 진행
      }

      const formData = new FormData()
      formData.append('file', file)
      formData.append('report_id', reportId)
      formData.append('work_id', workId)
      if (takenAt) formData.append('taken_at', takenAt)
      if (gpsLat !== null) formData.append('gps_lat', String(gpsLat))
      if (gpsLng !== null) formData.append('gps_lng', String(gpsLng))

      try {
        const res = await uploadConnectionPhoto(formData)
        if (res.ok) {
          success++
        } else {
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
    <div className="space-y-2">
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
        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        {busy && progress ? `업로드 중 ${progress.done}/${progress.total}` : '사진 추가'}
      </button>
      <p className="text-xs text-slate-500">최대 10MB · JPG/PNG/WEBP/HEIC · 여러 장 선택 가능 · 카메라로 즉시 촬영도 가능</p>
    </div>
  )
}
