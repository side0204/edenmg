'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'

type DaumData = {
  roadAddress: string
  jibunAddress: string
  buildingName?: string
  zonecode: string
  autoJibunAddress?: string
  autoRoadAddress?: string
}

declare global {
  interface Window {
    daum?: {
      Postcode: new (opts: {
        oncomplete: (data: DaumData) => void
        width?: string | number
        height?: string | number
      }) => { embed: (el: HTMLElement) => void }
    }
  }
}

const SCRIPT_SRC = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'

function loadDaumScript(): Promise<void> {
  if (window.daum?.Postcode) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('postcode load failed')))
      if (window.daum?.Postcode) resolve()
      return
    }
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('postcode load failed'))
    document.head.appendChild(script)
  })
}

export function AddressInput({
  name,
  defaultValue,
  placeholder,
}: {
  name: string
  defaultValue: string
  placeholder?: string
}) {
  const [value, setValue] = useState(defaultValue)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'road' | 'jibun'>('road')
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const modeRef = useRef(mode)

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  useEffect(() => {
    if (!open) return

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    let cancelled = false

    loadDaumScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.daum) return
        containerRef.current.innerHTML = ''
        new window.daum.Postcode({
          oncomplete: (data) => {
            const picked = modeRef.current === 'road' ? data.roadAddress : data.jibunAddress
            const finalAddr = data.buildingName
              ? `${picked} (${data.buildingName})`
              : picked
            setValue(finalAddr)
            setOpen(false)
          },
          width: '100%',
          height: '100%',
        }).embed(containerRef.current)
      })
      .catch(() => {
        if (!cancelled) setError('주소 검색을 불러오지 못했습니다. 네트워크를 확인해 주세요.')
      })

    return () => {
      cancelled = true
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  return (
    <>
      <div className="flex gap-2">
        <input
          name={name}
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          maxLength={200}
          placeholder={placeholder ?? '검색하거나 직접 입력'}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-base bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
        />
        <button
          type="button"
          onClick={() => {
            setError(null)
            setOpen(true)
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100"
        >
          <Search className="size-4" />
          검색
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex size-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="닫기"
            >
              <X className="size-5" />
            </button>
            <h2 className="text-base font-semibold text-slate-900">주소 검색</h2>
            <div className="flex rounded-lg border border-slate-300 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setMode('road')}
                className={`rounded-md px-2 py-1 font-medium ${
                  mode === 'road' ? 'bg-slate-900 text-white' : 'text-slate-600'
                }`}
              >
                도로명
              </button>
              <button
                type="button"
                onClick={() => setMode('jibun')}
                className={`rounded-md px-2 py-1 font-medium ${
                  mode === 'jibun' ? 'bg-slate-900 text-white' : 'text-slate-600'
                }`}
              >
                지번
              </button>
            </div>
          </div>

          <p className="px-3 py-2 text-xs text-slate-500">
            검색 결과 선택 시 <b>{mode === 'road' ? '도로명' : '지번'}</b> 주소로 채워집니다. 토글로 형식 변경 가능.
          </p>

          {error ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-rose-600">
              {error}
            </div>
          ) : (
            <div ref={containerRef} className="flex-1 overflow-hidden" />
          )}
        </div>
      )}
    </>
  )
}
