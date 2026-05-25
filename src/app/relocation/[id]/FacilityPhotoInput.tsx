'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Camera, Image as ImageIcon, Loader2, Plus, X } from 'lucide-react'
import {
  uploadFacilityPhoto,
  FACILITY_PHOTO_CATEGORIES,
  type FacilityPhotoCategory,
} from './facility-photo-actions'

// 시설 작업사진 입력 — FacilityTaskPopover 의 「확정」 버튼 아래 + FacilityInfoPanel.
//   카테고리 선택 → 카메라/갤러리 → 업로드.
//   「기타」 는 직접 입력으로 라벨 받음.

type PendingCategory = {
  category: FacilityPhotoCategory
  customLabel: string | null
}

export default function FacilityPhotoInput({
  projectId,
  facilityId,
  onUploaded,
  compact,
}: {
  projectId: string
  facilityId: string
  onUploaded?: () => void
  /** 작은 버튼 (popover 안) / 큰 버튼 (info panel) */
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<PendingCategory | null>(null)
  const [customLabel, setCustomLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  function pickCategory(cat: FacilityPhotoCategory) {
    if (cat === '기타') {
      setPending({ category: cat, customLabel: '' })
      setCustomLabel('')
    } else {
      setPending({ category: cat, customLabel: null })
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !pending) return
    setBusy(true)
    let okCount = 0
    let errMsg: string | null = null
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const fd = new FormData()
      fd.append('project_id', projectId)
      fd.append('facility_id', facilityId)
      fd.append('category', pending.category)
      if (pending.category === '기타' && customLabel.trim()) {
        fd.append('custom_label', customLabel.trim())
      }
      // taken_at — File.lastModified (EXIF 정밀 추출은 v2)
      if (file.lastModified) {
        fd.append('taken_at', new Date(file.lastModified).toISOString())
      }
      fd.append('file', file)
      const r = await uploadFacilityPhoto(fd)
      if (r.ok) okCount++
      else errMsg = r.error
    }
    setBusy(false)
    if (okCount > 0) {
      const label =
        pending.category === '기타' && customLabel.trim()
          ? customLabel.trim()
          : pending.category
      toast.success(`「${label}」 ${okCount}장 업로드`)
      onUploaded?.()
      setPending(null)
      setOpen(false)
      setCustomLabel('')
    }
    if (errMsg) toast.error(errMsg)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={busy}
        className={
          compact
            ? 'w-full inline-flex items-center justify-center gap-1.5 rounded-md border-2 border-emerald-300 bg-white px-3 py-2 text-base font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50'
            : 'inline-flex items-center gap-1.5 rounded-md border-2 border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50'
        }
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        작업사진 입력
      </button>

      {/* 모달 — 항상 mount + hidden 토글 (모바일 안전 패턴) */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        className={
          'fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-3 ' +
          (open ? '' : 'hidden pointer-events-none')
        }
      >
        <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 bg-emerald-50 px-4 py-3 shrink-0">
            <p className="text-xl font-extrabold text-emerald-700">
              {pending ? `${pending.category} 사진 입력` : '사진 종류 선택'}
            </p>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setPending(null)
                setCustomLabel('')
              }}
              className="text-slate-500 hover:text-slate-900"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {!pending ? (
              <ul className="space-y-1.5">
                {FACILITY_PHOTO_CATEGORIES.map((cat) => (
                  <li key={cat}>
                    <button
                      type="button"
                      onClick={() => pickCategory(cat)}
                      className="w-full text-left rounded-lg border-2 border-slate-200 px-4 py-3 text-lg font-semibold text-slate-800 hover:border-emerald-500 hover:bg-emerald-50"
                    >
                      {cat === '기타' ? (
                        <span className="inline-flex items-center gap-2">
                          <Plus className="h-5 w-5 text-emerald-600" />
                          기타 (직접 입력)
                        </span>
                      ) : (
                        cat
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="space-y-3">
                {pending.category === '기타' && (
                  <label className="block">
                    <span className="block text-sm font-semibold text-slate-700 mb-1">
                      사진 이름 <span className="text-rose-600">*</span>
                    </span>
                    <input
                      type="text"
                      value={customLabel}
                      onChange={(e) => setCustomLabel(e.target.value)}
                      maxLength={100}
                      placeholder="예: 작업 전 / 작업 후 / 케이블 절단면"
                      className="w-full rounded-md border-2 border-slate-300 px-3 py-2 text-base focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                    />
                  </label>
                )}
                <p className="text-sm text-slate-600">
                  카메라로 찍거나 갤러리에서 선택. 여러 장 한 번에 가능.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={
                      busy || (pending.category === '기타' && !customLabel.trim())
                    }
                    onClick={() => cameraRef.current?.click()}
                    className="inline-flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-emerald-500 bg-emerald-50 px-3 py-4 text-base font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-40"
                  >
                    <Camera className="h-7 w-7" />
                    카메라
                  </button>
                  <button
                    type="button"
                    disabled={
                      busy || (pending.category === '기타' && !customLabel.trim())
                    }
                    onClick={() => galleryRef.current?.click()}
                    className="inline-flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-slate-400 bg-slate-50 px-3 py-4 text-base font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                  >
                    <ImageIcon className="h-7 w-7" />
                    갤러리
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPending(null)
                    setCustomLabel('')
                  }}
                  disabled={busy}
                  className="w-full mt-2 text-sm text-slate-500 hover:text-slate-900 underline-offset-2 hover:underline"
                >
                  ← 다른 종류 선택
                </button>
                {busy && (
                  <p className="inline-flex items-center gap-2 text-sm text-emerald-700">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    업로드 중...
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 숨겨진 file input — 항상 mount */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/heic"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </>
  )
}
