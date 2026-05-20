// 카카오맵 JavaScript SDK v2 — 지장이설 지도 캔버스에서 쓰는 최소 타입 선언.
// 전체 SDK 타입이 아니라 MapCanvas 가 실제로 사용하는 부분만 정의한다.

declare namespace kakao.maps {
  function load(callback: () => void): void

  class LatLng {
    constructor(lat: number, lng: number)
    getLat(): number
    getLng(): number
  }

  class LatLngBounds {
    constructor()
    extend(latlng: LatLng): void
    isEmpty(): boolean
  }

  interface MapOptions {
    center: LatLng
    level?: number
  }

  class Map {
    constructor(container: HTMLElement, options: MapOptions)
    setCenter(latlng: LatLng): void
    getCenter(): LatLng
    setLevel(level: number): void
    getLevel(): number
    setBounds(bounds: LatLngBounds): void
    relayout(): void
  }

  interface MarkerOptions {
    position: LatLng
    map?: Map
    draggable?: boolean
    title?: string
    zIndex?: number
  }

  class Marker {
    constructor(options: MarkerOptions)
    setMap(map: Map | null): void
    getPosition(): LatLng
    setPosition(latlng: LatLng): void
  }

  interface CustomOverlayOptions {
    position: LatLng
    content: string | HTMLElement
    map?: Map
    xAnchor?: number
    yAnchor?: number
    zIndex?: number
    clickable?: boolean
  }

  class CustomOverlay {
    constructor(options: CustomOverlayOptions)
    setMap(map: Map | null): void
    setPosition(latlng: LatLng): void
    getPosition(): LatLng
  }

  interface PolylineOptions {
    path: LatLng[]
    map?: Map
    strokeWeight?: number
    strokeColor?: string
    strokeOpacity?: number
    strokeStyle?: string
    zIndex?: number
  }

  class Polyline {
    constructor(options: PolylineOptions)
    setMap(map: Map | null): void
  }

  interface MouseEvent {
    latLng: LatLng
  }

  namespace event {
    function addListener(
      target: object,
      type: string,
      handler: (event?: MouseEvent) => void,
    ): void
    function removeListener(
      target: object,
      type: string,
      handler: (event?: MouseEvent) => void,
    ): void
  }

  // libraries=services — 주소 → 좌표 변환
  namespace services {
    interface AddressResult {
      x: string // 경도(lng)
      y: string // 위도(lat)
      address_name: string
    }
    class Geocoder {
      addressSearch(
        address: string,
        callback: (result: AddressResult[], status: string) => void,
      ): void
    }
  }
}

interface Window {
  kakao: typeof kakao
}
