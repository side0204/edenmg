// 카카오맵 JavaScript SDK v2 — 지장이설 지도 캔버스에서 쓰는 최소 타입 선언.
// 전체 SDK 타입이 아니라 지도 모드(TopologyCanvas)가 실제로 사용하는 부분만 정의한다.

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
    getSouthWest(): LatLng
    getNorthEast(): LatLng
  }

  // 화면(컨테이너) 픽셀 좌표 — 좌표 ↔ 화면 변환 결과
  class Point {
    constructor(x: number, y: number)
    x: number
    y: number
  }

  // 좌표 ↔ 화면 픽셀 투영 — 지도 모드에서 SVG 오버레이를 지도에 맞춰 배치
  interface MapProjection {
    containerPointFromCoords(latlng: LatLng): Point
    coordsFromContainerPoint(point: Point): LatLng
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
    getBounds(): LatLngBounds
    panTo(latlng: LatLng): void
    relayout(): void
    getProjection(): MapProjection
    setDraggable(draggable: boolean): void
    setZoomable(zoomable: boolean): void
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

  // libraries=services — 주소·장소 검색
  namespace services {
    // 주소 검색 (지번·도로명)
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

    // 장소·키워드 검색 (건물·아파트·상호)
    interface PlacesSearchResultItem {
      id: string
      place_name: string
      address_name: string
      road_address_name: string
      category_group_name: string
      x: string // 경도(lng)
      y: string // 위도(lat)
    }
    class Places {
      keywordSearch(
        keyword: string,
        callback: (result: PlacesSearchResultItem[], status: string) => void,
      ): void
    }
  }
}

interface Window {
  kakao: typeof kakao
}
