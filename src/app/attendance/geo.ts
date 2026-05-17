// 두 좌표 사이 거리(m). Haversine.
// 클라이언트·서버 양쪽에서 쓸 수 있게 별도 분리.
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export type ActiveSite = {
  id: string
  name: string
  lat: number
  lng: number
  radius_m: number
}

// 좌표 기준으로 반경 안의 가장 가까운 현장을 찾음. 없으면 null.
export function matchSite(
  userLat: number,
  userLng: number,
  sites: ActiveSite[],
): { site: ActiveSite; distanceM: number } | null {
  let best: { site: ActiveSite; distanceM: number } | null = null
  for (const s of sites) {
    const d = haversineMeters(userLat, userLng, s.lat, s.lng)
    if (d <= s.radius_m && (best === null || d < best.distanceM)) {
      best = { site: s, distanceM: d }
    }
  }
  return best
}
