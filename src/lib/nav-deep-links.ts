// 외부 네비 앱 deep link 빌더.
//   출발지는 모든 앱이 「현재 위치 자동」 사용 → 우리는 목적지만 전달.
//   카카오내비는 외부 출발지 지정 자체가 불가 — 항상 현재 위치.
//
//   사용:
//     buildNavUrl('kakaomap', { lat, lng, name }) → 'kakaomap://route?ep=37.5,127.0&by=CAR&...'
//     window.location.href = url (모바일은 앱 진입, 미설치 시 스토어 안내)
//
//   PC 사용자: 카카오맵·구글지도 웹 URL 도 지원 (모바일/PC 자동 분기는 호출부에서).

export type NavApp = 'kakaomap' | 'kakaonavi' | 'tmap' | 'naver' | 'google'

export const NAV_APP_LABEL: Record<NavApp, string> = {
  kakaomap: '카카오맵',
  kakaonavi: '카카오내비',
  tmap: '티맵',
  naver: '네이버지도',
  google: '구글지도',
}

export const NAV_APP_DESCRIPTION: Record<NavApp, string> = {
  kakaomap: '카카오맵 (앱 미설치 시 웹 fallback)',
  kakaonavi: '카카오내비 (전용 음성 안내)',
  tmap: '티맵 (한국 점유율 1위)',
  naver: '네이버지도',
  google: '구글지도 (PC·모바일 웹 OK)',
}

export type NavTarget = {
  lat: number
  lng: number
  name?: string
}

function encName(name: string | undefined): string {
  return encodeURIComponent(name?.trim() || '목적지')
}

// 모바일 deep link — 앱 미설치 시 스토어로 이동 (iOS/Android 자동).
export function buildNavUrl(app: NavApp, target: NavTarget): string {
  const { lat, lng, name } = target
  switch (app) {
    case 'kakaomap':
      // by=CAR 자동차 길찾기. ep=목적지(end point) lat,lng.
      return `kakaomap://route?ep=${lat},${lng}&by=CAR`
    case 'kakaonavi':
      // ⚠️ 이 deep link 단독으로는 "인증 실패 / 필수 파라메타 없음" 오류가 난다.
      //   카카오내비 실행은 Kakao JS SDK 의 Kakao.Navi.start({name,x,y,coordType})
      //   를 통한 인증이 필요 (Kakao.init + 카카오내비 제품 활성화). 현재 NavLauncher
      //   선택 목록에서 제외. SDK 연동 시 이 빌더 대신 Kakao.Navi.start 사용.
      return `kakaonavi://navigate?name=${encName(name)}&x=${lng}&y=${lat}&coord_type=wgs84`
    case 'tmap':
      // goalname/goalx(lng)/goaly(lat)
      return `tmap://route?goalname=${encName(name)}&goalx=${lng}&goaly=${lat}`
    case 'naver':
      // dlat/dlng/dname + appname 권장 (호출 앱 식별)
      return `nmap://route/car?dlat=${lat}&dlng=${lng}&dname=${encName(name)}&appname=com.edenmg.web`
    case 'google':
      // 웹 URL — 모바일에서도 앱으로 자동 분기.
      return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
  }
}

// 웹 fallback — 앱 미설치 시 안내용. 카카오·네이버는 웹 길찾기 URL 도 별도 제공.
export function buildNavWebFallback(app: NavApp, target: NavTarget): string {
  const { lat, lng, name } = target
  switch (app) {
    case 'kakaomap':
      // 카카오맵 웹 — 목적지 좌표 포커스 (앱 deep link 실패 시).
      return `https://map.kakao.com/link/to/${encName(name)},${lat},${lng}`
    case 'kakaonavi':
      // 카카오내비 웹은 없음 — 카카오맵 길찾기 페이지로 대체.
      return `https://map.kakao.com/link/to/${encName(name)},${lat},${lng}`
    case 'tmap':
      // 티맵 웹 — Play Store 안내가 무난.
      return `https://tmapmobility.com`
    case 'naver':
      return `https://map.naver.com/v5/?c=${lng},${lat},15,0,0,0,dh`
    case 'google':
      return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
  }
}

// 모바일 환경 판단 — Android/iOS 만 deep link 보장. PC 는 웹 fallback.
export function isMobileUA(ua: string | undefined): boolean {
  if (!ua) return false
  return /Android|iPhone|iPad|iPod/i.test(ua)
}

// localStorage 선호 앱 기억 키.
export const NAV_PREFERENCE_KEY = 'field_nav_preferred_app'
