// 카카오맵 JavaScript SDK 로더 — 한 번만 로드되도록 Promise 를 메모이즈.
//
// 사용: const ok = await loadKakaoMaps()  →  이후 전역 `kakao.maps.*` 사용 가능.
// 환경변수 NEXT_PUBLIC_KAKAO_MAP_KEY (JavaScript 키) 필요.
// 카카오 개발자 콘솔에 접속 도메인(localhost·배포 주소)이 등록돼 있어야 한다.

let loadPromise: Promise<void> | null = null

const SCRIPT_ID = 'kakao-maps-sdk'

export function loadKakaoMaps(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('브라우저 환경이 아닙니다'))
  }
  if (loadPromise) return loadPromise

  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY
  if (!appKey) {
    return Promise.reject(
      new Error(
        'NEXT_PUBLIC_KAKAO_MAP_KEY 환경변수가 없습니다. .env.local 등록 후 dev 서버를 재시작했는지 확인하세요.',
      ),
    )
  }

  loadPromise = new Promise<void>((resolve, reject) => {
    // 이미 SDK 가 로드돼 있으면 maps.load 만 호출
    if (window.kakao && window.kakao.maps) {
      window.kakao.maps.load(() => resolve())
      return
    }

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    const script = existing ?? document.createElement('script')

    const onLoad = () => {
      window.kakao.maps.load(() => resolve())
    }
    const onError = () => {
      loadPromise = null // 실패 시 재시도 가능하게
      reject(new Error('카카오맵 SDK 를 불러오지 못했습니다. 네트워크·도메인 등록을 확인하세요.'))
    }

    script.addEventListener('load', onLoad)
    script.addEventListener('error', onError)

    if (!existing) {
      script.id = SCRIPT_ID
      script.async = true
      // autoload=false → 스크립트 로드 후 kakao.maps.load() 를 직접 호출
      // libraries=services → 주소→좌표 변환(Geocoder) 사용
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false&libraries=services`
      document.head.appendChild(script)
    }
  })

  return loadPromise
}
