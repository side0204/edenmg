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

  // 지도 타일 종류 — ROADMAP(기본 도로지도) / SKYVIEW(위성) / HYBRID(위성+도로명)
  //   ROADVIEW = 거리뷰 가능 도로 표시 오버레이용 ID (addOverlayMapTypeId 인자)
  const MapTypeId: {
    ROADMAP: string
    SKYVIEW: string
    HYBRID: string
    ROADVIEW: string
  }

  class Map {
    constructor(container: HTMLElement, options: MapOptions)
    setCenter(latlng: LatLng): void
    getCenter(): LatLng
    setLevel(level: number): void
    getLevel(): number
    setMinLevel(level: number): void
    setMaxLevel(level: number): void
    setBounds(bounds: LatLngBounds): void
    getBounds(): LatLngBounds
    panTo(latlng: LatLng): void
    relayout(): void
    getProjection(): MapProjection
    setDraggable(draggable: boolean): void
    setZoomable(zoomable: boolean): void
    setMapTypeId(mapTypeId: string): void
    // 오버레이 토글 — 기본 지도 위 추가 레이어. 거리뷰 가능 도로 파란 선 등.
    addOverlayMapTypeId(mapTypeId: string): void
    removeOverlayMapTypeId(mapTypeId: string): void
  }

  // ===== Roadview (거리뷰) =================================================
  // Roadview = panorama 표시 객체 · RoadviewClient = 좌표 ↔ panorama 검색
  interface RoadviewViewpoint {
    pan: number
    tilt: number
    zoom: number
  }
  class Roadview {
    constructor(container: HTMLElement)
    // panorama 표시. position 은 거리뷰의 「관점 위치」 (panoId 가 있는 도로 위 좌표).
    setPanoId(panoId: number, position: LatLng): void
    relayout(): void
    // 시점(pan/tilt/zoom). relayout 전후 저장·복원해 「공유 중」 배너 layout shift 시
    //   SDK 의 viewpoint 자동 흔들림 방지 (owner 2026-05-25).
    getViewpoint(): RoadviewViewpoint
    setViewpoint(viewpoint: RoadviewViewpoint): void
  }
  class RoadviewClient {
    constructor()
    // 좌표에서 반경 안 가장 가까운 panoId 검색. 없으면 callback 인자 0/null.
    getNearestPanoId(
      position: LatLng,
      radius: number,
      callback: (panoId: number | null) => void,
    ): void
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
