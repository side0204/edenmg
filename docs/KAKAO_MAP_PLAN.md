# 카카오맵 ↔ 지장이설 캔버스 통합 계획

> 작성 2026-05-20. 컨텍스트 정리용 핸드오프 문서.
>
> ✅ **완료 (2026-05-20)** — Phase 1·1B·2·3·4 모두 구현 완료. 실제 구현 내역은
> CLAUDE.md 의 「Step C-5」 항목이 정본. 이 문서는 설계 의도 기록용으로 보존.

## 목표

지장이설 설계 캔버스([`TopologyCanvas.tsx`](../src/app/relocation/[id]/TopologyCanvas.tsx))를
**카카오맵 위에서** 그대로 작동하게 한다. 「지도 모드」에서 도식 모드의 모든 기능
(29종 시설 도형·케이블·waypoint·정보 패널·범례·고장점 검색·추가 도구)이
실제 GPS 좌표 기반으로 동작해야 한다.

## 배경 — 왜 재설계하는가

1차 시도(Step C-5 Phase 1)는 별도의 단순 컴포넌트 `MapCanvas.tsx` 를 만들어
도식/지도 토글(`RelocationCanvas.tsx`)로 전환하는 방식이었다.
→ **owner 거부**: 단순 핀 마커만 표시, 29종 도형·케이블 그리기·도구·정보 패널이 없음.
→ **결론: 별도 단순 컴포넌트 방식 폐기. 카카오맵을 진짜 `TopologyCanvas` 의 배경으로 통합.**

## 핵심 방식 (Option B)

- 카카오맵 div 를 SVG 캔버스 **뒤 배경**으로 깔고, 기존 SVG 를 투명하게 위에 오버레이.
- 지도가 이동·확대를 담당. SVG 콘텐츠는 GPS→화면픽셀 투영으로 지도를 따라감.
- **도식 모드는 코드 무수정** — 모든 분기는 `if (mode === 'map')` 별도 경로 (회귀 위험 0).

## 현재 상태 (이미 완료 — 미커밋)

- 마이그 [`0045_relocation_facility_geo.sql`](../supabase/migrations/0045_relocation_facility_geo.sql) — `relocation_facilities.lat`/`lng` 추가. **owner 가 Supabase 에서 실행 완료.**
- [`src/lib/kakao-loader.ts`](../src/lib/kakao-loader.ts) — 카카오 SDK 로더 (`&libraries=services` 포함 — Geocoder·Places 사용 가능).
- [`src/types/kakao-maps.d.ts`](../src/types/kakao-maps.d.ts) — 카카오맵 SDK v2 최소 타입 선언.
- [`facility-actions.ts`](../src/app/relocation/[id]/facility-actions.ts) — `createFacilityAtLatLng`·`updateFacilityLatLng`·`bulkPlaceFacilities` (JSON 반환 server action).
- ⚠️ `MapCanvas.tsx` · `RelocationCanvas.tsx` — **삭제 대상** (1차 시도의 단순 버전).
- 카카오 개발자 셋업 완료: JavaScript 키 · 웹 도메인(localhost·vercel) 등록 · `NEXT_PUBLIC_KAKAO_MAP_KEY` (.env.local + Vercel Production·Preview).

## TopologyCanvas 좌표/줌/팬 구조 (Plan agent 분석)

- `initialPositions` (useMemo, `autoLayoutPositions`) — `x_hint/y_hint` 또는 자동 그리드 → SVG 픽셀 좌표.
- `positions` (state) — 사용자 드래그 override 만 보관.
- `effectivePositions` (useMemo) — `positions[id] ?? initialPositions[id]` 병합. **모든 렌더 경로가 읽는 단일 좌표 소스.**
- `viewport` `{x,y,width,height}` state → `viewBoxStr` → `<svg viewBox>`. 줌/팬 = viewport 변경.
- `toSvgCoord(clientX,clientY)` — `getScreenCTM().inverse()` 로 화면→SVG 좌표.
- wheel 줌 — native non-passive `wheel` 리스너. 빈영역 드래그 pan — `onSvgPointerDown`(`e.target===svgRef`일 때만)→`onPointerMove` case 3.
- `cablePathPoints(c)` — `[from중심, ...waypoints, to중심]`. 중심 = `pos.x + NODE_SIZE.width/2`, `pos.y + NODE_SIZE.height/2 - 10`.
- 노드 드래그 = `onPointerDown`/`onPointerMove` case 1 → `positions` 갱신 → `onPointerUp` 에서 `saveNodePositions`.
- waypoint 드래그 = `onWaypointPointerDown`/case 2 → `cableWaypoints` → `saveCableWaypoints`.

## 구현 지침 (지도 모드)

1. **mode 상태** `'schematic' | 'map'` — TopologyCanvas 내부 state. 도식/지도 토글을 상단 툴바로.
2. **effectivePositions 분기** — map 모드: 각 시설 `lat/lng` → `map.getProjection().containerPointFromCoords()` → 컨테이너 픽셀. `NODE_SIZE.width/2`·`height/2-10` 빼서 기존 중심 계산과 맞춤. `mapEpoch` 카운터(지도 `idle`/`zoom_changed` 마다 증가)를 deps 에 추가해 재계산.
3. **viewBox** — map 모드: `0 0 ${containerW} ${containerH}` (화면 1:1). `ResizeObserver` 로 컨테이너 크기 추적 + `map.relayout()`.
4. **줌/팬 위임** — map 모드: wheel `useEffect` early-return, `onSvgPointerDown` pan early-return. 카카오맵 div 가 native 로 처리.
5. **pointer-events** — map 모드: `<svg>` 루트 `pointer-events:none` (빈영역 드래그가 지도로 통과). 시설 `<g>`·케이블 polyline·hit line·waypoint circle 은 `pointer-events:auto`. 도식 모드는 무변경.
6. **시설 추가** — 카카오 `click` 리스너(빈영역 클릭은 지도로 감) → `e.latLng` → 배치 모달 → `createFacilityAtLatLng`.
7. **드래그 저장** — 노드 드래그 끝: 픽셀 → `coordsFromContainerPoint` → lat/lng → `updateFacilityLatLng`.
8. **격리** — 분기는 `effectivePositions`·`viewBoxStr`·wheel effect·`onSvgPointerDown`·`toSvgCoord`·`onPointerUp` 저장·SVG 루트 pointer-events 7군데. 지도 로직은 `useKakaoMap` 훅으로 분리 권장.
9. **토글·정리** — 도식/지도 토글을 TopologyCanvas 상단 툴바로. `MapCanvas.tsx` 삭제. `RelocationCanvas.tsx` 삭제 → `page.tsx` 가 `<TopologyCanvas>` 직접 렌더. `TopologyCanvas` 의 `FacilityNode` 타입에 `lat`/`lng` 추가.
10. **d.ts 보강** — `getProjection()` 반환 타입에 `containerPointFromCoords`/`coordsFromContainerPoint` 추가. `services.Places` 추가.

## 단계 (phased) — 전부 완료 ✅

| 단계 | 내용 | 상태 |
|---|---|---|
| **Phase 1** | 지도 위 실제 29종 도형·케이블 표시 (보기·정보 패널·고장점) + 주소·건물명 검색 | ✅ |
| **Phase 1B** | 별도 캔버스 라우트 `/relocation/[id]/canvas` (「넓은 화면으로 열기」) | ✅ |
| **Phase 2** | 지도에서 시설 배치(미배치 패널) + 마커 드래그 이동 | ✅ |
| **Phase 3** | 지도에서 시설 추가·케이블 그리기 도구 | ✅ |
| **Phase 4** | 지도에서 케이블 경로(waypoint) 편집 — `waypoints` 가 jsonb 라 스키마 작업 불필요, 경로점에 lat/lng 추가 | ✅ |

> 구현 중 확인: waypoint 스키마 작업은 불필요했음 (`relocation_cables.waypoints` 가 jsonb).
> 전용 라우트는 별도 레이아웃을 만들지 않고 임베드 모드(`initialCanvasSize='tall'`) 재사용.

## 추가 요구사항 (owner, 2026-05-20)

1. **주소·건물명 검색** — 지도 모드 툴바에 검색창.
   - 주소 검색(지번·도로명) = `kakao.maps.services.Geocoder.addressSearch`
   - 건물·장소명 검색(아파트·빌딩·상호) = `kakao.maps.services.Places.keywordSearch`
   - 결과 목록 클릭 → 지도 이동. → Phase 1 에 포함.
2. **별도 웹화면** — 캔버스만 전체화면으로 띄우는 별도 라우트(예: `/relocation/[id]/canvas`).
   - 프로젝트 화면에 「넓은 화면으로 열기」 버튼 → 새 탭/창.
   - 좁은 범위 = 기존(프로젝트 페이지 내장), 넓은 범위 = 별도 창. 설계자가 선택.
   - 별도 창은 앱 메뉴(BottomNav 등) 없이 캔버스만 → 모니터 전체 활용. → Phase 1B.

## 비고

- 도식 모드의 산출물(코어구성도·직선도)은 schematic 으로 유지. 도식/지도 토글 둘 다 존재.
- ESLint strict: `@typescript-eslint/no-explicit-any` = error. React Compiler 룰 on.
- dev 서버는 `.env.local` 변경 시 재시작 필요 ([[dev-server-restart]] 메모리 참조).
