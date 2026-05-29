'use client'

import { useEffect, useState } from 'react'
import { Navigation, X, MapPin } from 'lucide-react'
import {
  type NavApp,
  NAV_APP_LABEL,
  NAV_APP_DESCRIPTION,
  NAV_PREFERENCE_KEY,
  buildNavUrl,
  buildNavWebFallback,
} from '@/lib/nav-deep-links'

// 외부 네비 앱 deep link 런처.
//   - 마커 패널에서 「길찾기」 버튼 → 이 컴포넌트 → 앱 선택 → 즉시 진입
//   - 사용자 선호 앱은 localStorage 에 저장. 다음부터 모달 없이 바로 진입
//   - 모달 안에서 「앱 변경」 누르면 다시 선택 가능

type Props = {
  lat: number
  lng: number
  name?: string
}

// 카카오내비(kakaonavi)는 제외 — 단순 deep link 로는 "인증 실패 / 필수 파라메타 없음"
//   오류. 실행하려면 Kakao JS SDK 의 Kakao.Navi.start() 인증이 필요 (별도 연동).
const APPS: NavApp[] = ['kakaomap', 'tmap', 'naver', 'google']

export default function NavLauncher({ lat, lng, name }: Props) {
  const [open, setOpen] = useState(false)
  const [preferred, setPreferred] = useState<NavApp | null>(null)
  // SSR/CSR 깜박임 방지 — 마운트 후 prefer 읽기
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      const v = localStorage.getItem(NAV_PREFERENCE_KEY)
      if (v && (APPS as string[]).includes(v)) {
        setPreferred(v as NavApp)
      }
    } catch {
      // localStorage 접근 실패 — 시크릿 모드 등. 무시.
    }
  }, [])

  // body scroll lock
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  function launch(app: NavApp, remember: boolean) {
    if (remember) {
      try {
        localStorage.setItem(NAV_PREFERENCE_KEY, app)
        setPreferred(app)
      } catch {
        // ignore
      }
    }
    const target = { lat, lng, name }
    const deep = buildNavUrl(app, target)
    const web = buildNavWebFallback(app, target)

    // 모바일 deep link — 앱 미설치 시 PlayStore/AppStore 로 자동 안내
    //   다만 일부 안드로이드 크롬은 fallback 처리 안 되므로 1.5초 후 웹 URL 로 보강
    const isWeb = app === 'google'
    if (isWeb) {
      window.open(deep, '_blank', 'noopener')
      setOpen(false)
      return
    }

    // mobile deep link 시도
    const start = Date.now()
    window.location.href = deep
    // fallback: 앱 진입 실패 시 1.6 초 후 웹 길찾기로 이동
    setTimeout(() => {
      if (Date.now() - start < 2200) {
        // 페이지가 그대로 살아있으면 앱 진입 실패로 간주
        try {
          window.open(web, '_blank', 'noopener')
        } catch {
          // popup 차단 — 그냥 location 으로
          window.location.href = web
        }
      }
    }, 1600)
    setOpen(false)
  }

  function quickLaunch() {
    if (preferred) launch(preferred, false)
    else setOpen(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={quickLaunch}
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        <Navigation className="h-4 w-4" />
        길찾기
        {mounted && preferred && (
          <span className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-[10px]">
            {NAV_APP_LABEL[preferred]}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div className="w-full sm:w-[420px] bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-indigo-600" />
                <span className="font-semibold text-sm">네비게이션 앱 선택</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
                aria-label="닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-3 space-y-2">
              <p className="text-xs text-slate-500 px-1">
                목적지: {name ?? '선택한 위치'} ({lat.toFixed(5)}, {lng.toFixed(5)})
              </p>
              {APPS.map((app) => (
                <button
                  key={app}
                  type="button"
                  onClick={() => launch(app, true)}
                  className="w-full text-left rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 px-3 py-2.5"
                >
                  <div className="font-medium text-sm text-slate-900">
                    {NAV_APP_LABEL[app]}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {NAV_APP_DESCRIPTION[app]}
                  </div>
                </button>
              ))}
              <p className="text-[10px] text-slate-400 px-1 pt-1">
                선택한 앱은 다음부터 자동 사용. 변경하려면 마커 패널에서 「앱 변경」 누르세요.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// 선호 앱 초기화 버튼 (마커 패널의 「앱 변경」 트리거)
export function NavPreferenceReset() {
  const [cleared, setCleared] = useState(false)
  useEffect(() => {
    if (!cleared) return
    const t = setTimeout(() => setCleared(false), 1500)
    return () => clearTimeout(t)
  }, [cleared])

  return (
    <button
      type="button"
      onClick={() => {
        try {
          localStorage.removeItem(NAV_PREFERENCE_KEY)
          setCleared(true)
        } catch {
          // ignore
        }
      }}
      className="text-[11px] text-slate-500 hover:text-indigo-600 underline"
    >
      {cleared ? '✓ 초기화됨 (다음 길찾기 시 다시 선택)' : '앱 변경'}
    </button>
  )
}
