@AGENTS.md

# edenMG — 광케이블 시공 SME 통합관리 웹앱

> 자세한 제품 요구사항은 [PRD.md](./PRD.md) 참조 (v0.1, 2026-05-17)

## 한 줄 요약
광케이블 설치·유지보수 SME의 **근태·작업·자재·안전**을 모바일 브라우저 하나로 처리하는 반응형 웹앱. MVP 6~10주 사내 베타 목표.

## 사용자
이 프로젝트의 owner는 **광케이블 시공 SME 관리자(비개발자)**이며, Claude Code와 함께 바이브코딩 방식으로 직접 개발 중. 한국어 의사소통, 전문 용어보다는 실용 가이드 선호.

## 기술 스택 (확정)
- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS v4
- **Backend(BaaS)**: Supabase (PostgreSQL + Auth + Storage + Realtime + Edge Functions)
- **인증**: Supabase Auth — **이메일 + 비밀번호 + 관리자 초대** 방식 (v1)
  - 전화 OTP는 v2 (한국 SMS 게이트웨이 비용 회피)
- **배포**: Vercel (자동) + Supabase Cloud
- **Region**: Northeast Asia (Seoul) — Supabase 프로젝트 위치
- **PWA / 오프라인**: 후순위 (M3 작업일보 모듈 들어갈 때 추가)

## 진행 상태 (2026-05-18 기준)

### ✅ 완료 (부트스트랩)
- 로컬 환경 (Node 20, Git)
- Supabase 프로젝트 생성 (`alhsklyqsbekfgwnyzap.supabase.co`)
  - 보안 설정: Data API ON, 자동 expose OFF, **자동 RLS ON**
- Vercel 계정 + GitHub 저장소 (`side0204/edenmg`) + 자동 배포 파이프라인
- Next.js 16 스캐폴딩 + 브라우저용 Supabase 클라이언트

### ✅ 완료 (M1 — 코드 일체)
- **DB 마이그레이션 SQL**
  - [`0001_init_organizations.sql`](./supabase/migrations/0001_init_organizations.sql) — `companies`, `employees`, `employee_role` enum, RLS 4개, `auth.users` insert 트리거, `current_employee()` 헬퍼, GRANT 블록
  - [`0002_add_position_team_work_type.sql`](./supabase/migrations/0002_add_position_team_work_type.sql) — `role` → `permission` 으로 컬럼·타입 이름 변경, `position`(직급)·`team`(팀)·`work_type`(분야) enum 3개 + 컬럼 3개 추가, RLS·트리거 함수 새 컬럼명에 맞춰 재작성
- **Supabase 클라이언트 3종**: 브라우저(`src/lib/supabase/client.ts`), SSR 서버(`src/lib/supabase/server.ts`), 서비스 롤(`src/lib/supabase/admin.ts`).
- **인증 게이트**: `src/proxy.ts` (Next.js 16 부터 `middleware.ts` → `proxy.ts`. 세션 갱신 + 비로그인 보호 경로 리다이렉트).
- **화면 + Server Actions** (모두 모바일 우선 Tailwind)
  - `/login` — 이메일/비밀번호 로그인, 에러 메시지 한국어화
  - `/` — 인증 게이트 + 역할별(작업자/소장/관리자/대표) 분기 + 로그아웃
  - `/admin/employees` — 관리자/대표만, 직원 목록 + 활성/비활성/초대 미수락 배지. **권한·직급·팀·분야를 행 단위 인라인 드롭다운으로 즉시 편집** (본인 권한은 락아웃 방지로 변경 차단)
  - `/admin/employees/invite` — 이름·이메일·휴대폰·권한 + 직급·팀·분야(선택) 입력 → `auth.admin.inviteUserByEmail`
  - `/auth/confirm` — 이메일 링크 도착지. PKCE(`?code=`)/OTP(`?token_hash=&type=`) 둘 다 처리
  - `/welcome` — 초대 수락 후 비밀번호 설정 + `employees.accepted_at` 갱신

### ✅ 완료 (M2 — 코드 일체, 2026-05-17)

PRD §4.2 보강 결정사항 (코드 들어가기 전 owner 와 확정):

| 항목 | 결정 | 비고 |
|---|---|---|
| **결재선** | 2단: 신청자 → 현장소장 → 관리자/대표 | PRD M2-04 |
| **긴급 전결** | 관리자/대표는 결재선 무관 단독 승인 가능. `leave_action` enum 의 `전결` 로 기록 (소장 단계에서 관리자가 승인하면 자동 전결) | UI 라벨도 인디고색 "전결" |
| **신청서 종류** | 연차 / 반차(오전·오후) / 반반차(오전·오후) / 병가 / 공가 / 외근 — 한국어 enum value | M2-03 |
| **첨부파일** | 신청서당 1개 예정 (Supabase Storage `leave-attachments` 버킷). **현재 컬럼만 있고 UI·버킷 미생성** — 실제 필요할 때 |
| **알림** | **인앱 배지만** (홈 카드 + 결재함 카운트). 푸시·메일·알림톡 v2 |
| **GPS 반경** | 기본 **500m**, 현장별 개별 설정 가능. 반경 벗어나면 사유 입력 강제 |
| **현장 매칭** | 클라이언트 Haversine 으로 가장 가까운 활성 현장 자동 선택 (`src/app/attendance/geo.ts`) |
| **연차 자동 부여** | MVP 미포함. 잔여 일수는 관리자 수동 입력 컬럼만 둠 → v2 |
| **야간/주말 라벨** | MVP 미포함. CSV 내보낼 때 후처리 → v2 |

- **DB 마이그레이션 SQL**
  - [`0003_sites_attendances.sql`](./supabase/migrations/0003_sites_attendances.sql) — `sites`(현장 마스터, radius_m 기본 500) + `attendances`(직원당 work_date UNIQUE, **delete GRANT 자체 미부여**) + `touch_updated_at()` 트리거 + RLS 5개
  - [`0004_leave_requests.sql`](./supabase/migrations/0004_leave_requests.sql) — `leave_requests` + `leave_request_approvals`(append-only audit) + enum 4개 (`leave_type`/`leave_status`/`leave_stage`/`leave_action`) + RLS 5개. approvals 는 update/delete GRANT 미부여.
- **공통 유틸**: [`src/lib/leave.ts`](./src/lib/leave.ts) — `LEAVE_TYPE_LABEL`·`LEAVE_TYPE_META`(multiDay/needsTime)·`STATUS_COLOR`·`formatPeriod`. 폼 동적 분기·표시 일관성을 위해 server/client 양쪽에서 import.
- **화면 + Server Actions** (모두 모바일 우선 Tailwind)
  - `/admin/sites` + `/new` + `/[id]` — 현장 CRUD. 📍 현재 위치로 채우기, 행 클릭 → 편집. ⚠️ **owner 가 별도 보강 예정** (아래 후속 참조)
  - `/attendance` — 출퇴근 1탭. GPS → 매칭 → 반경 밖이면 사유 강제. 한국 시간 기준 `work_date`. 출근 insert / 퇴근은 동일 row update.
  - `/requests` + `/new` + `/[id]` — 신청 목록·작성(종류별 동적 폼 분기)·상세 + 결재 이력·본인 취소
  - `/approvals` + `/[id]` — 결재함 (긴급 우선·소장은 본인 단계만/관리자·대표는 전사) + 승인/반려/전결 액션 페이지
  - `/` — 홈 보강. **오늘 근태** 카드 (상태별 큰 액션 버튼) + **결재** 카드 (내 신청 대기 노란 배지 + 결재함 빨간 카운트)

### ✅ 검증 완료 (Supabase 대시보드 작업)
- 0001 + 0002 + **0003 + 0004** 마이그레이션 실행 + GRANT 보완 SQL 실행
- 회사·대표 시드 (회사명: `(주)이든정보기술`, side0204@gmail.com → CEO/관리자)
- `SUPABASE_SERVICE_ROLE_KEY` `.env.local` + Vercel 등록
- Redirect URLs: `http://localhost:3000/auth/confirm` 등록
- "Invite user" 이메일 템플릿 한국어화 (`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/welcome` 패턴 사용 — 기본 `{{ .ConfirmationURL }}` 은 해시 토큰을 서버가 못 받아서 작동 안 함)
- 로그인 → 초대 → 메일 수신 → 비밀번호 설정 → 가입 완료 흐름 직접 확인
- `/admin/employees` 4개 드롭다운(권한·직급·팀·분야) 정상 동작 확인
- M2 화면 빌드+린트 통과. UI 실동작 검증은 owner 가 진행 중 (현장 등록·출퇴근·신청·결재 흐름).

### ✅ 완료 (M2-06 CSV 리포트, 2026-05-18)

PRD §4.2 보강 결정사항 (owner 와 확정):

| 항목 | 결정 | 비고 |
|---|---|---|
| **데이터 분리** | 출퇴근 / 신청서 각각 별도 CSV (파일 2개) | 급여·장부 입력 흐름이 따로라 합치면 오히려 손해 |
| **기간 단위** | 월(`YYYY-MM`) — `<input type="month">` 한 컨트롤 | 임의 구간은 v2 |
| **다운로드 권한** | 관리자/대표는 전사, 소장은 본인 관리 현장(`sites.manager_employee_id`)·1차 결재자 지정 신청(`leave_requests.assigned_foreman_id`)만 | worker 는 진입 자체 차단 |
| **인코딩** | UTF-8 + BOM, 줄바꿈 CRLF | 한글 Windows Excel 호환 최우선 |
| **신청서 거름 기준** | 신청 기간(start~end)이 대상 월과 겹치는 행 | 월 경계 휴가는 양쪽 모두에 잡힘 (이중계산 주의) |

- **공통 유틸**: [`src/lib/csv.ts`](./src/lib/csv.ts) — `buildCsv` (RFC 4180 escape + BOM + CRLF), `csvResponse` (Content-Disposition RFC 5987), `monthRangeKST`, `dateTimeKST`, `durationMinutes`.
- **Route Handler 2종** (Next.js 16 `app/api/.../route.ts`)
  - [`/api/reports/attendance`](./src/app/api/reports/attendance/route.ts) — 출퇴근 CSV. 컬럼: 일자·직원명·권한·직급·팀·분야·현장명·출근시각·출근위치·출근반경밖사유·퇴근시각·퇴근위치·퇴근반경밖사유·근무시간(H:MM)
  - [`/api/reports/leaves`](./src/app/api/reports/leaves/route.ts) — 신청서 CSV. 컬럼: 신청일시·직원명·권한·직급·팀·분야·종류·시작일·종료일·시작시각·종료시각·긴급·1차결재자(소장)·상태·사유·최종처리자·최종처리시각
  - 둘 다 권한 확인 → 회사 스코프 → foreman 인 경우 추가 좁히기. RLS 가 한 번 더 막아주는 이중 안전망.
- **화면**: [`/admin/reports`](./src/app/admin/reports/page.tsx) + [`ReportPanel.tsx`](./src/app/admin/reports/ReportPanel.tsx) — 월 input + 다운로드 anchor 2개. 권한별 안내 문구 분기. 홈 카드에 admin/ceo 는 "월별 리포트", foreman 은 별도 "리포트" 카드로 노출.

### ✅ 완료 (M2 첨부파일, 2026-05-18)

PRD §4.2 보강 결정사항 (owner 와 확정):

| 항목 | 결정 | 비고 |
|---|---|---|
| **대상 종류** | 병가·공가 (둘 다 선택, 필수 아님) | 다른 종류는 폼에 input 아예 안 보임 |
| **크기/형식** | 10MB · 이미지(JPG/PNG/WEBP/HEIC) + PDF | 버킷 메타로 1차 차단 + server action 으로 2차 검증 |
| **다운로드 권한** | 신청자 본인 + assigned_foreman + 회사 admin/ceo | RLS 가 `leave_requests` 와 join 해 자동 판단 |
| **업로드/교체/삭제** | 신청자 본인 + `status='대기'` 동안만 | 결재 시작 이후엔 고정 |
| **경로 규칙** | `{leave_request_id}/{uuid}.{ext}` — 표시명은 `attachment_filename` 컬럼 분리 | 다운로드 시 원본 파일명으로 받게 signedUrl 옵션 `download` 사용 |

- **DB 마이그레이션 SQL**
  - [`0005_leave_attachments.sql`](./supabase/migrations/0005_leave_attachments.sql) — `leave_requests.attachment_filename` 컬럼 추가 + `leave-attachments` 버킷(10MB, MIME 화이트리스트, private) 생성 + `storage.objects` RLS 4종 (select/insert/update/delete). select 정책은 `split_part(name,'/',1)::uuid` 로 신청서 id 추출 후 `leave_requests` 와 join.
- **공유 상수**: [`src/lib/leave.ts`](./src/lib/leave.ts) 에 `ATTACHMENT_ALLOWED_TYPES` 추가. `'use server'` 파일은 async 함수만 export 가능해서 상수는 lib 으로 빼야 함 (Next.js 16 규칙).
- **Server actions** ([`src/app/requests/actions.ts`](./src/app/requests/actions.ts)):
  - `submitRequest` — 파일 검증 → 신청 insert → Storage upload → `attachment_path/filename` 컬럼 갱신 순서 (RLS 가 신청서 존재 + 본인 확인). 업로드 실패해도 신청 자체는 유지하고 상세 페이지에서 재시도 안내.
  - `replaceAttachment` — 대기 중 첨부 교체. 새 파일 업로드 → 이전 파일 `remove`.
  - `removeAttachment` — 대기 중 첨부 삭제.
  - `getAttachmentUrl` — signedUrl 5분 발급. RLS 가 권한 분기 담당.
- **화면**
  - `/requests/new` — 종류가 병가/공가일 때만 첨부 input 표시. ATTACHMENT_ALLOWED_TYPES 로 동적 분기.
  - `/requests/[id]` — 첨부 섹션: 다운로드 링크 + (본인+대기) 교체 폼 + 삭제 버튼.
  - `/approvals/[id]` — 결재자용. 본문 안 "증빙" 행에 다운로드 링크 (있을 때만).

### ✅ 완료 (업무용 차량 모듈, 2026-05-18)

PRD 외 추가 모듈. owner 결정사항:

| 항목 | 결정 | 비고 |
|---|---|---|
| **사용 흐름** | 출고·반납 2단계. `vehicle_trips.returned_at IS NULL` = "사용 중" | 결재·사전신청 없음 |
| **주유** | 운행 기록 안 체크박스 + 금액(원, 선택). 별도 테이블 안 만듦 | 체크 안 되면 금액 무시 |
| **차량 마스터 필드** | 차량번호 · 차명 (+ 활성 · 비고). 연식·종류·연료·담당자 다 제외 | 회사별 차량번호 unique |
| **권한** | 회사 내 전 직원 운행 기록 SELECT. 마스터 CUD 만 admin/ceo. 운행 INSERT 본인만, UPDATE 본인+admin/ceo | RLS 로 강제 |
| **동시 사용** | 한 차량당 사용 중 1명 (partial unique index). 본인은 동시 1대만 (UI 차단) | DB 가 race 안전망 |
| **append-only** | `vehicle_trips` delete GRANT 미부여 | 운행 이력 보존 |

- **DB 마이그레이션 SQL**: [`0006_vehicles.sql`](./supabase/migrations/0006_vehicles.sql) — `vehicles` + `vehicle_trips` + RLS 5개 + partial unique index + GRANT.
- **Server actions** ([`src/app/vehicles/actions.ts`](./src/app/vehicles/actions.ts)): `createVehicle`/`updateVehicle` (admin), `checkoutVehicle`/`returnVehicle` (본인). 차량 활성/본인 다른 차량 사용 중/이미 사용 중 중복 체크.
- **화면** (모두 모바일 우선 Tailwind)
  - `/vehicles` — 차량 카드 리스트 + 상태 배지(내가 사용 중/타인 사용 중/대기/비활성) + 액션 버튼(출고/반납/수정). 최근 운행 10건 표시. admin/ceo 만 "+ 차량 등록".
  - `/vehicles/new`·`/[id]/edit` — admin/ceo 전용. VehicleForm 공유.
  - `/[id]/checkout` — 출발 km(선택)·목적(선택). 이전 반납 km 를 placeholder 로 표시.
  - `/[id]/return` — 도착 km · 주유 체크박스 + 금액 · 메모. 본인 또는 admin/ceo 만 진입.
- **홈 카드** ([`src/app/page.tsx`](./src/app/page.tsx)): "오늘 근태" 와 "결재" 사이. 내가 사용 중이면 차량명·출고시각 + 큰 "반납하기" 버튼, 아니면 "차량 출고·반납 →" 링크.

#### 운행일지 검색·CSV (owner 결정)

| 항목 | 결정 | 비고 |
|---|---|---|
| **권한 범위** | 전원 공개 (차량 모듈 정책과 일관) | RLS 의 `vehicle_trips_select` 가 같은 회사 전직원 허용 |
| **기간 필터** | 월(YYYY-MM) / 임의 기간(시작·종료) 두 가지 탭 토글 | URL 파라미터 `mode=month` / `mode=range` 로 결정 |
| **추가 필터** | 차량별 · 운전자별 · 주유한 운행만 | 모두 GET 쿼리 파라미터, 검색 페이지와 CSV API 가 동일 키 사용 |
| **CSV 컬럼** | 출고일시 · 반납일시 · 운행시간(H:MM) · 차량번호 · 차명 · 운전자 · 권한 · 직급 · 팀 · 분야 · 출발km · 도착km · 주행km · 목적 · 주유(O/X) · 주유금액 | UTF-8 + BOM + CRLF (csv.ts 공통 빌더 재사용) |
| **결과 상한** | 화면 표시 500건 (CSV 다운은 제한 없음) | 월/기간 단위라 보통 충분 |

- **Route Handler**: [`/api/reports/vehicle-trips/route.ts`](./src/app/api/reports/vehicle-trips/route.ts) — `mode=month|range` + `month` 또는 `start`/`end` + 선택 `vehicle_id`/`driver_id`/`refueled=1`. 기준은 출고일시(`departed_at`).
- **검색 페이지**: [`/vehicles/trips`](./src/app/vehicles/trips/page.tsx) — 탭 토글, 통계 4셀(기간·건수·총 주행거리·주유 합계), 결과 테이블, 우상단 ⬇ CSV 버튼 (현재 필터 그대로 같은 쿼리 파라미터로 다운로드).
- **진입점**: [`/vehicles`](./src/app/vehicles/page.tsx) 헤더 "🔍 운행 이력" 버튼 + 최근 운행 섹션 헤더의 "전체 검색·CSV →" 링크.

### ✅ 완료 (홈 보강 + 토스트 + 디자인 1차, 2026-05-18)

- **홈 차량 운행 현황 카드**: 회사 전 차량 (사용중/대기/비활성). 본인 사용 중이면 상단에 큰 "반납하기" 버튼. 대기 차량 탭 → 인라인 출고 폼 (출발 km·목적), 사용중 차량 탭 → 운전자·출고시각·경과시간·목적 펼침. [`src/app/VehicleStatusList.tsx`](./src/app/VehicleStatusList.tsx).
- **Sonner 토스트 전사 도입**: server action redirect 의 모든 결과를 `?ok=메시지` / `?err=메시지` 두 키로 통일. 루트 layout 에 `<Toaster position="bottom-center" />` + `ToastBridge` ([`src/components/ToastBridge.tsx`](./src/components/ToastBridge.tsx)) 가 URL 쿼리 감지 → 토스트 → URL 정리. 페이지의 query-param banner 분기 모두 제거 (데이터 로딩 banner 만 유지).
- **Pretendard 폰트 + 타이포그래피 위계**: Geist 제거 → Pretendard Variable Dynamic Subset (CDN). 페이지 메인 h1 `text-2xl` → `text-3xl tracking-tight` (16개 페이지). 홈 카드 헤더는 영문 `uppercase tracking-wider` 패턴 → `text-base font-semibold tracking-tight` (한글 친화).
- **Lucide 아이콘 통일**: 이모지 → Lucide (📍→MapPin, 🔍→Search, ⛽→Fuel, ⬇→Download). + 등록 버튼 → Plus/UserPlus, ← 뒤로가기 → ChevronLeft (15개 페이지). 홈 카드 헤더 5개에 아이콘 추가 (Clock·Car·ClipboardCheck·Settings·FileText·CalendarDays). 액션의 → 화살표는 한글과 어울려 텍스트 유지.
- **하단 탭 바**: [`BottomNav.tsx`](./src/components/BottomNav.tsx). 처음엔 4탭(홈/근태/차량/결재) 으로 했다가 owner 결정으로 **2탭(홈/사무) + 사무 그룹 상단 sticky 서브탭(근태/차량/결재)** 구조로 재편. 미래 M3 작업·M4 자재·M5 안전이 단일 최상위 탭으로 추가될 자리. [`OfficeSubTabs.tsx`](./src/components/OfficeSubTabs.tsx).
- **PWA 1단계**: [`public/manifest.json`](./public/manifest.json) + [`public/icon.svg`](./public/icon.svg) (임시 어두운 슬레이트 + 'eM' 모노그램) + layout metadata/viewport. 홈 화면 추가 시 standalone 풀스크린. **회사 로고 PNG 교체는 추후**. 푸시·오프라인 캐싱은 별도.
- **Empty State + Skeleton**: [`src/components/EmptyState.tsx`](./src/components/EmptyState.tsx) — 큰 원형 아이콘 + 제목 + 설명 + 선택적 CTA. 7개 페이지 적용. [`src/components/Skeleton.tsx`](./src/components/Skeleton.tsx) + Next.js 16 의 `loading.tsx` 라우트 세그먼트 (6개 핵심 페이지).
- **다크모드 1단계 (보너스)**: layout body, BottomNav, OfficeSubTabs, 홈 카드/헤더에 `dark:` 클래스 추가. 시스템 자동 (prefers-color-scheme). 라이트 모드에는 영향 없음. **정식 도입은 추후** — owner 가 기능상 필요 없다고 판단해 보류, dark: 클래스는 그대로 두고 미래 재사용.
- **모바일 동작 노하우 (대무자 콤보박스 디버깅으로 확인)**:
  - `<button>` 안 `<div>`/`<p>` 같은 block 요소는 모바일 안드로이드 크롬에서 클릭 영역 비정상. `<div role="button" tabIndex={0}>` + `onKeyDown` 으로 처리.
  - dropdown 패턴은 모바일 키보드 + 외부클릭 감지의 상호작용으로 자주 깨짐. **풀스크린 모달 검색** 패턴 (토스·카카오 스타일) 이 안정적.
  - 모달 안 항목 탭 → 모달 닫힘 후 같은 좌표의 trigger button 으로 **ghost click** 전파. `onClick` 대신 `onPointerDown + e.preventDefault()` 로 후속 click 차단.
  - `next dev` 의 JS chunk 가 LAN IP (예: `192.168.x.x:3000`) 접속 시 모바일에서 hydration 실패하는 경우 있음 → **모바일 검증은 Vercel 배포본(HTTPS) 사용**. GPS API 도 HTTPS 필수.
  - `package.json` 의 dev script 에 `-H 0.0.0.0` 추가했지만 LAN HMR 은 여전히 불안정. dev 는 데스크탑에서, 모바일은 Vercel 로.

### ✅ 완료 (휴가 대무자 + 휴가·외근 현황, 2026-05-18)

| 항목 | 결정 | 비고 |
|---|---|---|
| **대무자 필수 여부** | 모든 휴가 신청에 대무자 필수 | server action 검증 |
| **제외 대상** | 본인, 비활성 직원 | 신청 폼·서버 액션 양쪽 검증 |
| **검색 UI** | 풀스크린 모달 검색 (이름·직급·팀·분야 부분 매칭) | 일반 dropdown 은 모바일 버그 많아 모달 사용 |
| **홈 카드** | 당일 진행 중인 휴가·외근만 표시 + "이번 달 전체 보기 →" 링크 | 이름은 "휴가·외근 현황" |
| **/leaves 별도 페이지** | 이번 달 전체. 진행 중 / 예정 / 종료 3섹션 그룹화 | 다일 휴가는 전체 기간 표시 (이번 달 범위로 자르지 않음) |

- **DB 마이그레이션**: [`0007_leave_substitute.sql`](./supabase/migrations/0007_leave_substitute.sql) — `leave_requests.substitute_employee_id` 컬럼 + 휴가자 현황 인덱스.
- **EmployeeCombobox 풀스크린 모달**: [`src/app/requests/new/EmployeeCombobox.tsx`](./src/app/requests/new/EmployeeCombobox.tsx). 트리거 탭 → 화면 전체 모달 + 상단 sticky 검색 input + 결과 리스트. body 스크롤 잠금.
- **신청 폼**: 결재자 다음에 "대무자 *" 필드 추가. submitRequest 검증 (본인 금지·같은 회사·활성).
- **상세 표시**: 신청 상세·결재함 상세에 "대무자" 행 추가. CSV 신청서 리포트에 "대무자" 컬럼 추가.
- **/leaves 페이지**: 권한은 전 직원 (RLS 가 같은 회사 스코프).

### ✅ 완료 (타이틀 변경, 2026-05-18)

- 타이틀: `(주)이든정보기술 — 광케이블 시공 통합관리` → `(주)이든정보기술 — 통합관리시스템` (layout + manifest 둘 다).

### ✅ 완료 (M3 작업관리 Phase 1: 작업 CRUD + 배정, 2026-05-18)

owner 결정사항:

| 항목 | 결정 | 비고 |
|---|---|---|
| **작업 vs 현장** | 무관 (별도 entity) | sites 와 FK 연결 안 함. 현장은 GPS 출퇴근용, 작업은 공사 건 |
| **권한 모델** | admin/ceo + `employees.can_manage_works` 토글 | admin 이 일반 직원에게 부여 가능. /admin/employees 행마다 토글 |
| **배정 방식** | N:M + 기간 지정 | 한 작업에 여러 명, 각 배정마다 시작·종료일 (비우면 작업 전체 기간) |
| **작업유형 enum** | **DB enum 고정** — 4 대분류 + 12 소분류 | 추후 추가 시 마이그레이션 |
| **카테고리 분류** | 청약(소호·FTTH·모바일·전용회선·다회선·아파트) / 계획(망보강·코어분산·이원화) / 지장이설(단순·일반·원인자) / 기타 | DB CHECK 제약으로 카테고리-소분류 정합성 강제. 기타는 소분류 null |
| **상태** | 예정 / 진행중 / 완료 / 취소 | enum |

- **DB 마이그레이션**: [`0008_works.sql`](./supabase/migrations/0008_works.sql) — `works` + `work_assignments` + 3개 enum + `employees.can_manage_works` + RLS 4개.
- **공통 상수**: [`src/lib/work.ts`](./src/lib/work.ts) — `SUBCATEGORY_BY_CATEGORY` (카테고리별 소분류 매핑), `STATUS_COLOR`, `formatWorkLabel`/`formatWorkPeriod`.
- **권한 토글 server action**: [`toggleCanManageWorks`](./src/app/admin/employees/actions.ts) — admin/ceo 만. /admin/employees 페이지 각 직원 행 하단에 표시.
- **작업 페이지** (모두 모바일 우선)
  - `/works` — 목록 (상태 배지·카테고리·기간·발주처). 권한자는 + 작업 등록 버튼.
  - `/works/new`·`/[id]/edit` — 권한자만. [`WorkForm`](./src/app/works/WorkForm.tsx) 에서 대분류 변경 시 소분류 동적 필터링, '기타' 는 소분류 비활성.
  - `/works/[id]` — 상세 + N:M 배정 UI. 직원 선택 + 기간 + 배정/해제 (X 버튼).
- **하단 탭**: BottomNav 에 "작업" 탭 추가 (Hammer 아이콘). 홈 / 사무 / **작업** 3탭. M4 자재·M5 안전이 추가될 자리.

### ✅ 완료 (M3 Phase 2 — 일일 작업일보, 2026-05-18)

owner 결정사항:

| 항목 | 결정 | 비고 |
|---|---|---|
| **결재 모델** | 작업당 담당자 1명 (works.assignee_employee_id) — 일보 자동 라우팅 | 휴가 결재선과 별개. 1단 결재 |
| **결재 단계** | 1단 (작성자 → 담당자 승인/반려) | 본사 확인 단계 생략 |
| **작업자 구분** | works.worker_type enum: 접속팀 / 외선팀 / 기타(직접입력) | 기타는 worker_type_custom text 컬럼 (CHECK 제약으로 정합성 강제) |
| **작성 단위** | 작업+날짜+작성자 unique | 같은 작업·같은 날 여러 명이 각자 1장씩 |
| **작성 권한** | 해당 작업 배정자 + admin/ceo | RLS + server action 이중 검증 |
| **사용 자재** | 자유 텍스트 1000자 | M4 자재 모듈 들어오면 연결 검토 |
| **사진** | 이번 단계 미포함 | 디자인·용량 정리 후 추후 도입 |
| **진행률** | enum (시작전/진행중/완료) | 숫자 % 대신 단순 단계로 시작 |
| **EXIF·워터마크 (M3-06)** | 사진 미포함이라 함께 보류 | P1 그대로 |

- **DB 마이그레이션**: [`0010_work_daily_reports.sql`](./supabase/migrations/0010_work_daily_reports.sql)
  - works 확장: `worker_type` (enum 접속팀/외선팀/기타) + `worker_type_custom` + `assignee_employee_id`
  - `work_daily_reports` 테이블 + `work_report_progress`·`work_report_status` enum + RLS 3개 (select/insert/update). delete GRANT 미부여 (append-only)
  - RLS update 정책은 본인 작성+대기 OR 담당자/admin/ceo — 회사 스코프 강제
- **공통 상수**: [`src/lib/work.ts`](./src/lib/work.ts) 에 `WORKER_TYPE_VALUES`·`REPORT_PROGRESS_VALUES`·`REPORT_STATUS_VALUES`·색상 매핑·`formatWorkerType` 추가.
- **server actions**: [`src/app/works/report-actions.ts`](./src/app/works/report-actions.ts) — submitReport/updateReport/approveReport/rejectReport. 결재는 `reviewReport(formData, '승인'|'반려')` 공용 함수로 묶음.
- **화면**
  - `/works/new`·`/works/[id]/edit` — 작업자 구분 + 담당자 (EmployeeCombobox 풀스크린 모달 재사용) 필수 입력 추가
  - `/works/[id]` — 작업자/담당자 표시 + 일보 섹션 (최근 10건 + 상태 배지 + 오늘 일보 작성/보기 액션)
  - `/works/[id]/reports/new` — 일보 작성
  - `/works/[id]/reports/[reportId]` — 상세 + (작성자+대기 시) 인라인 수정 + (담당자 시) 승인·반려 액션
- **EmployeeCombobox**: `defaultSelected` prop 추가로 편집 모드 prefill 지원 (휴가 신청과 공유).

### ✅ 완료 (M3 Phase 2-B 접속일보, 2026-05-18)

접속팀(`worker_type='접속팀'`) 작업 전용 별도 entity. 일반 작업일보(`work_daily_reports`) 와 완전히 분리. 외선팀·기타는 일반 일보 유지 (외선일보는 v2 예정).

owner 결정사항 핵심:

| 항목 | 결정 | 비고 |
|---|---|---|
| **chain 구조** | 트리 (상위국 root → 함체들 → 하위국 leaf). 분기 가능 | 한 작업에 chain 1:N |
| **plan vs actual** | plan(함체·구조)은 chain 에, actual(케이블규격·선번)은 일보에 | B안 |
| **케이블 규격 enum** | 10종 (1C·1C드랍·2C·2C드랍·12C·36C·72C·144C·288C·576C) | DB enum, 추가는 마이그레이션 |
| **사용선번** | 자유 텍스트 ("1-6", "1,3,5", "1-6,12-18"). **같은 cable 안 중복 금지** | 클라이언트+서버 이중 검증 |
| **접속코어수** | 선번 파싱해서 자동 계산. DB 저장 X, 입력 시 라이브 표시 + CSV 출력 시 server 재계산 | |
| **공종 enum 14종** | 접속(12C이하/초과)·성단접속·성단작업·함체작업(주간/야간)·중간분기함체(기설/신설)·단자함설치·국사패치·IJP신설·고위험(함체)·신호수·기타 | "기타" 안전망 유지 |
| **자재 마스터** | 회사별 materials 테이블 (명·규격·단위·활성). admin/ceo 만 CUD. 비규격은 일보에서 직접 입력 | |
| **노드별 입력** | 노드마다 공종·공종수·사용자재 (1:N 행). 자재는 마스터 선택 OR 직접 입력 둘 중 하나 (CHECK 제약) | |
| **ad-hoc 함체 추가** | 작업자(배정자)도 chain plan_nodes 에 함체 추가 가능. created_by/added_during_report_id 로 추적 | |
| **분기 UI** | 들여쓰기 트리. parent 드롭다운 선택 또는 "사이 끼우기" 모드 | |
| **결재** | 1단 (작성자 → 담당자 승인/반려). 일반 일보와 동일 | |
| **엑셀 출력** | 일보별·세그먼트별·공종별·자재별 4모드 | UTF-8+BOM, CRLF |

- **DB 마이그레이션**
  - [`0011_connection_plan.sql`](./supabase/migrations/0011_connection_plan.sql) — enum 3종 + connection_chains + connection_plan_nodes + materials 마스터 + RLS + GRANT
  - [`0012_connection_reports.sql`](./supabase/migrations/0012_connection_reports.sql) — connection_reports + report_segments + node_materials + node_tasks + ALTER plan_nodes add added_during_report_id (forward FK 회피) + RLS + GRANT
- **공통 유틸**: [`src/lib/connection.ts`](./src/lib/connection.ts) — `parseLineNumbers`(중복 detect 포함)·`calcCoreCount`·enum 상수·색상 매핑·`formatTaskLabel`. server/client 양쪽 import.
- **자재 마스터**: [`/admin/materials`](./src/app/admin/materials/page.tsx) + new/[id] + actions (admin/ceo 전용. 삭제 대신 is_active 토글)
- **chain CRUD**: [`chain-actions.ts`](./src/app/works/chain-actions.ts) — createChain(상위국+하위국 자동 생성)·updateChain·deleteChain·createNode(insert_between 모드 지원)·updateNode·deleteNode
  - 화면: [`/works/[id]/chains/new`](./src/app/works/[id]/chains/new/page.tsx) (상위국·하위국 골격), [`/works/[id]/chains/[chainId]/edit`](./src/app/works/[id]/chains/[chainId]/edit/page.tsx) (트리 + 노드 추가 폼), [`nodes/[nodeId]/edit`](./src/app/works/[id]/chains/[chainId]/nodes/[nodeId]/edit/page.tsx) (개별 노드 수정)
- **접속일보**: [`connection-report-actions.ts`](./src/app/works/connection-report-actions.ts) — submit·updateMeta·approve·reject·addTask·removeTask·addMaterial·removeMaterial
  - 화면: [`/works/[id]/connection-reports/new`](./src/app/works/[id]/connection-reports/new/page.tsx) (cable 별 입력 + 라이브 코어수), [`[reportId]`](./src/app/works/[id]/connection-reports/[reportId]/page.tsx) (트리 + cable + 노드별 공종·자재 인라인 add/remove + 결재)
  - 클라이언트 위젯: [`CableSegmentInput`](./src/app/works/CableSegmentInput.tsx) — 입력 즉시 코어수 표시 + 중복·역순·음수 빨간 경고
- **작업 상세 분기**: `/works/[id]` 에서 `worker_type='접속팀'` 이면 일반 일보 섹션 숨김 + chain 관리 + 접속일보 섹션 노출. 외선/기타는 기존 그대로.
- **엑셀 API**: [`/api/reports/connection-reports`](./src/app/api/reports/connection-reports/route.ts) — `?mode=summary|segment|tasks|materials&month=YYYY-MM&work_id=옵션`. 회사 스코프 + foreman 은 본인 담당 작업만.
- **/admin/reports**: 접속일보 4모드 다운로드 버튼 묶음 추가.

### ✅ 완료 (작업자 흐름 단순화 + 케이블ID 도입, 2026-05-18)

owner 요청: "작업자가 최대한 복잡하지 않게. 절차 간단했으면 좋겠어."

반영:
- **chain 편집 진입점 권한 제한** — 일보 작성 폼의 [노드 수정]·[+ 사이 끼우기] 링크는 admin/ceo/담당자 권한일 때만 노출. 일반 작업자는 chain 변경 UI 자체가 안 보임 → 화면이 깔끔.
- **cable_code (케이블ID) 신규 필드** — segments 에 cable_code text 컬럼 추가. 일보 작성 시 datalist 자동완성으로 회사 케이블 마스터에서 검색, 마스터에 없으면 직접 입력, 또는 공란 OK.
- **자동 채움** — 입력한 케이블ID 가 마스터에 매치되면 cable_spec 자동 prefill. 작업자가 케이블규격을 매번 다시 안 골라도 됨.
- **케이블 마스터 페이지** — `/admin/cables` (admin/ceo 전용). 자재 마스터와 동일 패턴 (code·spec_enum·notes·is_active). 마스터에서 cable_spec 지정해두면 일보 자동 채움 효과.

- **DB**: [`0014_cables_master.sql`](./supabase/migrations/0014_cables_master.sql) — cables 마스터 + RLS + `connection_report_segments.cable_code text`
- **공통**: [`UnifiedReportForm.tsx`](./src/app/works/UnifiedReportForm.tsx) — `canEditChain` prop, `cableMasters` prop, cable_code datalist + spec 자동채움 client-side
- **CSV**: segment 모드에 "케이블ID" 컬럼 추가
- **홈 관리 메뉴**: 자재 마스터 옆에 케이블 마스터 진입점 추가

### ✅ 완료 (접속일보 후속 정정 1, 2026-05-18)

owner 피드백 4건 반영:

1. **상위국·하위국 사이 노드 추가 UI** — chain 트리 편집 페이지 각 부모-자식 edge 사이에 inline `[+ 여기 끼우기]` 버튼 노출. 클릭 시 `?parent=<부모>&between_child=<자식>` URL 파라미터로 add 폼 모드 전환.
2. **함체 규격 enum 화** — text 자유입력 → cable_spec enum (10종) 드롭다운. legacy text 컬럼 `spec` 은 그대로 두고 새 `spec_enum` 컬럼 신설. 텍스트 값이 enum 매치되면 자동 migrate.
3. **일보 작성 화면 통합 폼** — cable·공종·자재를 한 화면·한번에 입력. [`UnifiedReportForm`](./src/app/works/UnifiedReportForm.tsx) 클라이언트 컴포넌트로 노드별 dynamic rows(공종·자재 add/remove). 서버 액션은 `tasks_json`·`materials_json` 직렬화 필드로 받아 한 번에 검증+insert.
4. **결과 검토 후 추가** — 대기 중.

- **DB 마이그레이션**: [`0013_node_spec_enum.sql`](./supabase/migrations/0013_node_spec_enum.sql) — `connection_plan_nodes.spec_enum public.cable_spec` 추가 + text→enum 자동 매핑
- **UI**: 노드 등록/수정 폼 enum 드롭다운, 트리 표시 enum 우선, 사이 끼우기 버튼, 일보 통합 폼
- **CSV segment 모드**: 함체규격 컬럼은 spec_enum 우선 (legacy text fallback)

### ✅ 완료 (작업관리 7개 항목 일괄 개편, 2026-05-18)

owner 요청 (일보 작성 우선·작업자별 흐름·진입 단순화):

- **작업관리 1순위 = 일보 작성**. `/works` 카드 탭 시 작업 상세를 건너뛰고 일보 작성 직행 (접속팀→`/connection-reports/new`, 그 외→`/reports/new`). 상세는 카드 하단 작은 별도 링크 (`absolute inset-0 z-0 + z-20 footer` 패턴).
- **작업 등록 시 등록자가 기본 담당자로 자동 prefill** (`EmployeeCombobox` defaultSelected). 다르면 변경.
- **작업 등록 후 접속팀이면 자동으로 `/works/[id]/chains/new`** 진입. 등록자가 작업구간 골격 미리 세팅.
- **작업목록**: 카테고리·작업자구분·상태 3중 탭 + 순번(1,2,3 row index) + 검색 (작업명·order_id ilike OR). URL 파라미터 `cat`/`wt`/`status`/`q`.
- **chain → 「작업구간」 UI 라벨 일괄 변경**. DB 테이블·컬럼·코드 변수명은 chain 유지 (마이그 영향 회피).
- **권한 분리**: `canEditNode` (노드 수정=admin/담당자) vs `canAddNode` (사이끼우기=admin/담당자+배정 작업자). owner: "일보작성자는 등록된 작업구간에서 추가되는 부분만 추가하도록".

### ✅ 완료 (작업 삭제·지시사항·진행률, 2026-05-18)

- **DB 마이그레이션**
  - [`0015_work_delete_permission.sql`](./supabase/migrations/0015_work_delete_permission.sql) — `employees.can_delete_works` + works RLS 분리 (INSERT/UPDATE = manage 권한, DELETE = delete 권한)
  - [`0016_work_instructions.sql`](./supabase/migrations/0016_work_instructions.sql) — `works.instructions` text 컬럼
- **작업 삭제 권한** — admin 만 토글로 부여. DeleteWorkButton 클라이언트 (confirm() 가드). 카드 푸터 우측에 휴지통 (권한자만 노출).
- **작업자 지시사항** — works.instructions 별도 컬럼 (notes 와 분리). [`InstructionsBanner`](./src/app/works/InstructionsBanner.tsx) 노랑 박스 공용 컴포넌트로 작업 상세·일반 일보 작성·접속일보 작성 화면 상단에 항상 표시.
- **진행률 카드** — 접속팀: 완료 cable / 전체 cable progress bar. 외선·기타: 누적 일보 카운트.
- **공사번호 확장** — `order_id` 카테고리 한정 제거. 모든 작업에서 입력 가능. 작업목록 카드·작업 상세 "공사번호" 라벨로 표시.
- **자재·공종 합계 카드** ([`AggregationCard`](./src/app/works/AggregationCard.tsx) + [`lib/connection-aggregate.ts`](./src/lib/connection-aggregate.ts)) — 작업별 + 같은 공사번호 형제 작업 합산 + 작업목록 검색 결과 합산. 접속일보만 집계 (외선·기타의 자유 텍스트 자재는 집계 불가).

### ✅ 완료 (내 작업 알림 + 작업통계 페이지, 2026-05-18)

- **내 작업 진행 목록** — `/works?mine=1` 토글 + 본인 배정 필터. 신규 배정 amber 「신규」 배지 (work_assignments.created_at 최근 3일) + 본인 마지막 일보 일자. 홈 카드 「내 작업 진행 목록」 진입점 + 신규 카운트.
- **작업통계 페이지** [`/works/stats`](./src/app/works/stats/page.tsx)
  - **6차원 탭**: 작업자별 / 공사번호별 / 작업명별 / 연 / 월 / 일
  - **기간 필터** (from/to YYYY-MM-DD) + **TOP N 토글** (10/30/100/전체, 차원별 기본값)
  - **두 보기 모드**: 그룹 카드 (`AggregationCard` + reportCount 막대) / 일보 표 ([`StatsTable`](./src/app/works/stats/StatsTable.tsx) wide pivot — 메타 4컬럼 + 동적 공종·자재 컬럼 + 합계 행)
  - **3 metric 토글**: 전체 통계 / 공종 통계 / 자재 통계 (카드 섹션·표 컬럼·CSV 모두 적용)
  - **CSV API** [`/api/reports/work-stats`](./src/app/api/reports/work-stats/route.ts) — type=tasks (공종 long) / materials (자재 long) / table (일보 wide). UTF-8+BOM+CRLF.
  - **그룹별 작업 상태 분포** 배지 (예정/진행중/완료/취소) + 일보 표에 상태 컬럼
  - **공통 헬퍼** [`aggregateConnectionStats`·`buildStatsTable`](./src/lib/connection-aggregate.ts) — 한 번 fetch + 메모리 그룹핑
- **통계 권한 분리** (마이그 [`0017_view_stats_permission.sql`](./supabase/migrations/0017_view_stats_permission.sql)): `employees.can_view_stats` — admin 만 토글 부여. 미부여자는 본인 작성 일보 기반 통계만 (파란 안내 배지). admin/employees 에 파란 토글 추가.
- **작업관리 토글 3탭** — 전체 / **작업자** (권한자만, 직원 select picker) / 내 작업. 권한 = admin OR can_view_stats.

### ✅ 완료 (일보 라벨 분기 + 작업자 다중 배정, 2026-05-18)

- **일보 라벨 헬퍼** [`reportLabel(workerType)`](./src/lib/work.ts) — 접속팀=접속일보, 외선팀=외선일보, 그 외=일보. 카드 배지·페이지 타이틀·일보 섹션 헤더 모두 분기.
- **작업자 다중 배정** — 작업 등록 폼에 [`WorkersMultiSelect`](./src/app/works/WorkersMultiSelect.tsx) 추가. + 작업자 추가 버튼 → 풀스크린 모달 → toggle (체크박스) → 메인 form 의 작업자 카드에 worker_type 3-버튼 라디오 (접속팀/외선팀/기타).
- **마이그** [`0019_assignment_worker_type.sql`](./supabase/migrations/0019_assignment_worker_type.sql) — `work_assignments.worker_type` 컬럼 추가. 같은 작업에 작업자별로 다른 worker_type 지정 가능 (접속·외선 혼합 배정).
- **작업의 worker_type 폼에서 삭제** — 항상 null 저장. `isConnectionTeam` 판단은 `work.worker_type='접속팀' OR 작업자 중 1명이라도 worker_type='접속팀'`. `/chains/new`·`/connection-reports/new` 의 작업 단위 worker_type 차단 제거.
- **/works 카드 라우팅**: 본인이 배정자면 본인 `work_assignments.worker_type` 우선 사용 → 본인 분야에 맞는 일보 페이지로 직행.

**모바일 모달 안전 패턴 발견** (Galaxy S22 Ultra + 안드로이드 크롬):
- 증상: 「완료」 탭 시 모달 안 selected 카운트는 정상이지만 닫는 순간 메인 form 의 리스트가 비워짐. ghost-tap·body lock·overlay 모든 차단 패턴 무효.
- 가설: `{open && <Modal>}` conditional 렌더링 시 모달 unmount → 어떤 식으로든 부모 useState 리셋되는 React reconciliation 이슈.
- 해결: 모달을 **항상 mount + `hidden pointer-events-none` 클래스로만 visibility 토글**. element unmount 자체 회피.

### ✅ 완료 (접속일보 사진 첨부 + EXIF, 2026-05-19)

| 항목 | 결정 | 비고 |
|---|---|---|
| **다중성** | 1:N 별도 테이블 `connection_report_photos`. 한 일보에 여러 장 | 휴가 첨부는 1장이었지만 현장 사진은 여러 장 |
| **형식·크기** | JPG/PNG/WEBP/HEIC, 10MB/장 | PDF 제외 |
| **권한** | 업로드/삭제: 작성자+대기 OR admin. 다운로드: 같은 회사 누구나 | RLS 가 분기 |
| **EXIF 추출** | 클라이언트 `exifr` 라이브러리로 `taken_at`·`gps_lat`/`gps_lng` 추출 → DB 컬럼 | 서버는 metadata 받아 저장만 |
| **워터마크** | v2 — 촬영시각·작업명 합성 | 이번 단계는 EXIF 표시만 |
| **업로드 시점** | 일보 작성 후 상세 페이지에서만 | 작성 폼 X — 작성 흐름 단순화 |
| **노드별 태깅** | v2 | 현재는 일보 단위만 |

- **마이그** [`0020_connection_report_photos.sql`](./supabase/migrations/0020_connection_report_photos.sql) — connection_report_photos 테이블 + connection-photos 버킷(private, 10MB, 이미지 화이트리스트) + RLS 3개(select/insert/delete) + storage.objects 3개 정책.
- **공통**: [`src/lib/connection.ts`](./src/lib/connection.ts) — PHOTO_BUCKET/PHOTO_MAX_BYTES/PHOTO_MIME_WHITELIST·`isBrowserViewable()` 추가.
- **클라이언트**: [`PhotoUploader.tsx`](./src/app/works/PhotoUploader.tsx) — `<input type="file" multiple capture="environment">` + exifr 추출 + 순차 server action 호출. 진행 표시(`업로드 중 N/M`) + 토스트.
- **server actions** ([`connection-report-actions.ts`](./src/app/works/connection-report-actions.ts)): `uploadConnectionPhoto(formData) → { ok | error }`, `removeConnectionPhoto(formData)` (RLS 가 권한 분기), `getConnectionPhotoViewUrls(paths[])` (30분 signedUrl 일괄 발급).
- **갤러리** (일보 상세 페이지): 2/3-col grid + 정사각 썸네일 + 하단 오버레이(촬영시각·GPS map link·업로더). canEdit 시 우상단 hover 휴지통.

### ✅ 완료 (일반 일보 월별 CSV, 2026-05-19)

owner 결정: 외선·기타 일보 단일 CSV (접속일보는 별도 4모드 유지). 컬럼: 일자·작성자·권한·직급·팀·분야·작업명·공사번호·카테고리·작업자구분·작업내역·사용자재·진행률·상태·처리자·처리시각·처리의견·특이사항.

- **Route Handler**: [`/api/reports/work-daily-reports`](./src/app/api/reports/work-daily-reports/route.ts) — `?month=YYYY-MM&work_id=옵션`. 접속팀 work 의 일보는 자동 제외 (정의상 별도 entity). foreman 은 본인 담당 작업만.
- **/admin/reports**: 「일반 일보 (외선·기타)」 섹션 추가. 단일 다운로드 버튼.

### ✅ 완료 (M4 자재관리 Phase 1, 2026-05-19)

owner 결정사항:

| 항목 | 결정 | 비고 |
|---|---|---|
| **자재 구분** | 사급(발주처제공) / 지입(자체구매) | lot.source_type enum |
| **입고 형태** | 일반입고 / 직납입고 | lot.receipt_type enum. 직납은 related_work_id 필수 |
| **재고 단위** | Lot 단위 추적 | 입고마다 별도 lot. FIFO. quantity_remaining 추적 |
| **사급 격리** | 발주처(supplier) 단위 | lot.supplier 와 work.client 일치 검증 (둘 다 명시된 경우만) |
| **holding 강제** | 강제 + 「기타」 폴백 | 일보 자재 입력 시 본인 holding 에서 선택. 마스터/직접입력 폴백 |
| **권한** | admin + `can_manage_stock` 토글 | violet 색상 (rose/amber/blue 와 분리) |
| **창고** | 본사창고만 (현재) + 현장창고 확장 대비 | 회사당 본사창고 1개 자동 seed. site type 은 Phase 3 |
| **자재 마스터** | 발주처+발주처코드 (사급) 컬럼 추가 | UNIQUE (company, supplier, code). 자재 ↔ 발주처 1:1 매핑 |
| **CSV import** | 자재 마스터 + 보유자재(lot) 2종 | UTF-8, 자체 파서, 미리보기·에러 행 표시 |

- **마이그**:
  - [`0022_materials_warehouses.sql`](./supabase/migrations/0022_materials_warehouses.sql) — materials 확장 + warehouses + 본사창고 seed
  - [`0023_stock_receipts_lots.sql`](./supabase/migrations/0023_stock_receipts_lots.sql) — 입고 + 재고 lot
  - [`0024_holdings_issuances.sql`](./supabase/migrations/0024_holdings_issuances.sql) — 작업자 holding + 출고 이력
  - [`0025_can_manage_stock_and_report_link.sql`](./supabase/migrations/0025_can_manage_stock_and_report_link.sql) — can_manage_stock 토글 + daily_report_materials + connection_node_materials.holding_id + RLS 보강
- **공통 유틸**:
  - [`src/lib/stock.ts`](./src/lib/stock.ts) — enum 상수, 색상, formatMaterialLabel·formatQty
  - [`src/lib/csv-parse.ts`](./src/lib/csv-parse.ts) — RFC 4180 자체 파서 + 콤마/세미콜론 자동 감지
- **server actions**:
  - [`stock/actions.ts`](./src/app/stock/actions.ts) — createReceipt·createIssuance·consumeHolding·restoreHolding·toggleCanManageStock
  - [`stock/import-actions.ts`](./src/app/stock/import-actions.ts) — importMaterialsCsv·importStockCsv
  - [`works/daily-material-actions.ts`](./src/app/works/daily-material-actions.ts) — add·remove daily_report_materials (holding 차감 통합)
- **화면**:
  - `/stock` (메인 대시보드) + `/stock/lots` (재고 lot 검색·필터)
  - `/stock/receipts/new`·`/stock/receipts` (입고 등록·이력)
  - `/stock/issuances/new`·`/stock/issuances` (출고 등록·이력)
  - `/stock/my` (작업자 본인 holding, 작업별 grouping)
  - `/stock/import` (보유자재 CSV) + `/admin/materials/import` (자재 마스터 CSV)
  - 템플릿 API: `/api/templates/stock-import.csv`·`/api/templates/materials-import.csv`
- **일보 통합 (일반일보)**: 일반일보 상세 페이지에 「사용 자재」 구조화 섹션. holding/master/custom 3 모드 토글 + HoldingPicker 풀스크린 모달 (모바일 안전 패턴 — 항상 mount + hidden 토글). holding 사용 시 자동 차감.
- **권한 토글**: `/admin/employees` 에 자재관리 권한 (violet). admin 만 부여 가능.
- **홈 카드**: 「내 자재」 카드 (보유 시) + admin 관리 메뉴에 「자재 입출고」 진입점.
- **BottomNav**: 4탭 (홈/사무/작업/자재).

**Phase 1 미포함 (후속)**:
- 접속일보 holding 통합 (Phase 1.5) — UnifiedReportForm·addMaterial 에 holding picker
- QR/바코드 발행 + 스캐너 (Phase 2)
- 작업자간 인수인계 (Phase 2)
- 반납 (Phase 2)
- 현장 창고 + 창고 간 이동 (Phase 3)

### ✅ 완료 (회원가입 흐름 + work_type 재구성 + 차량 반납위치, 2026-05-19)

owner 요구사항:
- 직원 추가를 「초대」에서 「회원가입 + 관리자 승인」 흐름으로 전환
- 관리자 승인 시 개별 권한(권한 enum + 토글) 한 번에 부여
- 직무 6개 (사무·자재담당·외선팀·접속팀·장비팀·신호수) — 기존 work_type 재구성
- 접속팀 차량번호 필수, 외선팀 선택
- 차량 대기 카드에 최종 사용자 + 반납 위치 표시

- **마이그** [`0027_signup_and_work_type_rework.sql`](./supabase/migrations/0027_signup_and_work_type_rework.sql):
  - `employee_work_type` enum: 공무→사무, 외선→외선팀, 접속→접속팀 (rename) + 자재담당·장비팀·신호수 (add)
  - `employees.vehicle_plate text`
  - `vehicle_trips.return_location text`
  - `handle_new_auth_user` 트리거 갱신: phone·vehicle_plate 메타데이터 수집 + 회사 1개면 자동 매핑 + 신규 가입은 `is_active=false`/`accepted_at=null` 로 저장 (관리자 승인 대기)
- **회원가입 페이지** [`/signup`](./src/app/signup/page.tsx) + [`SignupForm`](./src/app/signup/SignupForm.tsx):
  - 이름·이메일·비밀번호·전화번호·직무·차량번호
  - 직무에 따라 차량번호 input 동적 표시 (접속팀 필수, 외선팀 선택, 그 외 미표시)
  - admin client 의 `createUser({ email_confirm: true })` 로 즉시 활성 user 생성 → 트리거가 employees row 생성 (is_active=false)
  - `/signup/pending` 으로 안내 (관리자 승인 대기)
- **로그인**: 「가입 신청」 링크 추가
- **proxy.ts**: `/signup` 도 PUBLIC_PREFIXES 에 포함
- **/admin/employees**:
  - 「가입 승인 대기」 섹션 (is_active=false + accepted_at=null) — 권한 select + 토글 4종 (manage/delete/stats/stock) + 승인/거부 버튼
  - 승인 = `approveSignup` (is_active=true·accepted_at·permission·토글 한 번에 적용)
  - 거부 = `rejectSignup` (admin client `auth.admin.deleteUser` + employees row 삭제)
  - 활성 직원 카드에 차량번호 인라인 입력 (접속팀·외선팀 표시). 접속팀은 plate 필수 검증 (server action)
- **invite 페이지** [`/admin/employees/invite`](./src/app/admin/employees/invite/page.tsx): 폐기 안내 + 회원가입 흐름 설명 + `/signup` 링크
- **차량 반납 폼** [`/vehicles/[id]/return`](./src/app/vehicles/[id]/return/page.tsx): 「반납 위치」 input 추가 (선택)
- **차량 페이지 + 홈 차량 카드**: 대기 상태 차량 카드에 「최종 반납」 정보 (사용자·시각·위치) 표시. `lastReturnByVehicleId` 매핑 fetch (반납 100건 desc → vehicle_id 별 첫 행)
- **모바일 모달 안전 패턴** 변동 없음 (기존 패턴 그대로)

**기존 work_type 코드 정정**:
- WorkersMultiSelect: `'접속' / '외선'` → `'접속팀' / '외선팀'`. `'공무'` → `'사무'`. 신규 4 직무 색상 추가
- WORK_TYPE_VALUES (fields.ts): 6 개로 확장
- /works/page.tsx subtab URL key 는 단축 표기 (`외선`/`접속`) 유지, DB 값과만 매핑

### ✅ 완료 (M4 Phase 2-A — 자재 사용 승인·초과 사유·취득사유, 2026-05-19)

owner 추가 요구사항 4건 반영:

| 요구 | 결정 | 비고 |
|---|---|---|
| **잔량 초과** | 클라 차단 + 사유 입력 후 통과. holding 은 잔량까지만 차감, 초과분은 `over_quantity` audit | 자재담당자가 사후 검토 가능 |
| **출고 시 공사 연계** | 이미 work_id FK 로 연계됨 (추가 데이터 X). UX 만 「검색 picker」 로 개선 권장 — 후속 | 별도 entity 추가 불필요 |
| **작업 외 사용 승인** | 사전 승인 + 지입+저비용 자재는 사후신고 자동 분기 | `materials.low_value` 토글 (자재담당자 등록 시 체크) |
| **미출고 자재 사용** | 취득사유 강제 (enum + 자유 텍스트) + 사후신고 | enum: 현장구매·이전잔여·임시차용·기타 |
| **알림** | 인앱 만 (홈 카드 배지 + /stock/approvals) | PWA 푸시 보류 |

- **마이그** [`0026_stock_use_approval.sql`](./supabase/migrations/0026_stock_use_approval.sql):
  - `materials.low_value boolean default false`
  - `daily_report_materials`·`connection_node_materials` 에 `approval_status` (자동승인/대기/승인/반려/사후신고) + `over_quantity`·`over_reason` + `acquisition_reason_type`·`acquisition_reason` + 승인 메타 컬럼
  - 자재담당자(admin/can_manage_stock) 가 일보 자재 row update 허용 RLS 추가
- **공통**: [`lib/stock.ts`](./src/lib/stock.ts) — ApprovalStatus·AcquisitionReasonType enum + 색상.
- **server actions** [`daily-material-actions.ts`](./src/app/works/daily-material-actions.ts):
  - `addDailyReportMaterial` 재작성 — holding work 비교 분기 (자동승인/사후신고/대기). 잔량 초과 시 over_quantity 기록. 미출고 자재 취득사유 검증.
  - `approveDailyMaterialUse` / `rejectDailyMaterialUse` — 자재담당자 처리. 승인 시 holding 차감.
- **자재 마스터** [`MaterialForm`](./src/app/admin/materials/MaterialForm.tsx): low_value 체크박스. 「저비용 자재 (사후 신고 허용)」 안내.
- **일보 자재 추가** [`DailyMaterialsClient`](./src/app/works/DailyMaterialsClient.tsx):
  - 잔량 라이브 표시 + 초과 입력 시 빨강 + 「초과 사용 사유」 input 자동 노출
  - 작업 외 holding 사용 시 amber 안내 박스 ("승인 대기 또는 사후신고")
  - master/custom 모드 시 취득사유 enum + 자유 텍스트 강제
- **일보 상세 표시**: 자재 row 에 approval_status 배지 (자동승인/대기/승인/반려/사후신고 색상) + 초과·취득사유·처리의견 노출. 대기 row 는 amber 배경, 반려 row 는 rose+opacity.
- **/stock/approvals**: 자재담당자 페이지. 대기/처리완료/전체 탭. 카드별 승인·반려 액션 (의견 입력 가능).
- **/stock 메인**: 「자재 사용 승인」 카드 (대기 카운트 amber).
- **홈**: 자재담당자에게 「자재 사용 승인 대기」 카드 (amber 배지 + 진입 버튼).

### ✅ 완료 (함체·국사 마스터, 2026-05-19)

| 항목 | 결정 | 비고 |
|---|---|---|
| **통합 vs 분리** | 단일 테이블 `connection_facilities` + `facility_type` enum-like CHECK ('station'/'box') | 두 타입이 같은 필드 셋 (이름·ID·주소·GPS·메모) 공유. spec_enum 만 함체용 |
| **권한** | 같은 회사 누구나 SELECT (자동완성용). admin 만 CUD | RLS |
| **plan_node 연결** | optional FK `master_id` (NULL=자유 입력). ON DELETE SET NULL — 마스터 삭제 시 plan_node 의 텍스트 snapshot 유지 | 통계 정확도 향상용 — 미사용 시에도 비파괴 |
| **자동완성 UX** | datalist + 이름 매칭 시 client-side prefill (code·spec·address·lat·lng) + master_id hidden field 저장 | chain new 폼에서 동작. chain edit 의 노드 추가 폼은 datalist 만(name 제안) — server form |

- **마이그** [`0021_connection_facilities.sql`](./supabase/migrations/0021_connection_facilities.sql) — connection_facilities + RLS 2개 + `connection_plan_nodes.master_id` 컬럼.
- **관리 페이지** [`/admin/facilities`](./src/app/admin/facilities/page.tsx) — 탭(국사/함체) + 검색 + 활성 토글 + new/[id] edit. admin only.
- **chain 등록 폼** [`ChainSetupForm.tsx`](./src/app/works/ChainSetupForm.tsx): 상위국·하위국·함체 모든 이름 input 에 datalist 자동완성. 매칭 시 onChange 가 master 필드 prefill + hidden master_id 채움.
- **chain-actions** [`createChain`](./src/app/works/chain-actions.ts): `upper_station_master_id`/`lower_station_master_id` + boxes_json 의 `master_id` 받아 plan_node insert 시 master_id 함께 저장. 상·하위국은 마스터 매칭 시 메타(code·spec·주소·GPS)도 DB 에서 재조회해 prefill.

### ✅ 완료 (권한 enum 재구성, 2026-05-18)

- **마이그** [`0018_permission_rename.sql`](./supabase/migrations/0018_permission_rename.sql):
  - `UPDATE employees SET permission='admin' WHERE permission='ceo'` — 데이터 통합
  - `ALTER TYPE employee_permission ADD VALUE 'team_member'`
  - `ALTER TYPE employee_permission RENAME VALUE 'foreman' TO 'team_leader'`
  - 출퇴근 RLS 정책 재정의 (foreman → team_leader)
- **새 위계**: 작업자(worker) / 팀원(team_member, 신규) / 팀장(team_leader) / 관리자(admin, 기존 admin+ceo 통합)
- **코드 grep replace (57 파일)**: `'admin'||'ceo'` → `'admin'`, `'foreman'` → `'team_leader'`, UI 라벨 '소장→팀장' '관리자/대표→관리자' '현장소장→현장팀장'
- **leave_stage enum 의 'foreman' 값**·`assigned_foreman_id` 컬럼명은 legacy 유지 (UI 만 '팀장 단계' 로 표시)
- **관리자가 모든 권한** + 토글로 부여: `can_manage_works` / `can_delete_works` / `can_view_stats` (rose/amber/blue 색상 분리)

### ✅ 완료 (오늘 작업 체크 — 시작·마감 의사결정 기록, 2026-05-19)

owner 결정사항:

| 항목 | 결정 | 비고 |
|---|---|---|
| **체크인 강제성** | 일보와 완전 분리 | 체크 없이도 일보 작성 가능. 체크는 의사결정 기록용 |
| **체크인 단위** | 작업자별 row (한 작업에 여러 명 체크인 가능) | unique(work_id, employee_id, check_date) |
| **「완료」 의미** | 작업자 본인 분만 끝 | 작업 status='완료' 확정은 별도 |
| **작업 완료 확정** | 담당자(assignee) 또는 admin 또는 can_manage_works | 작업 상세 우상단 「작업 완료로 확정」 인디고 버튼 (security definer RPC) |
| **이월 처리** | 별도 row 생성 X. 다음날 다시 체크인 | 의도성 매일 확인 |
| **시작 시 status** | '예정' → '진행중' 자동 전환 | security definer RPC (작업자가 works UPDATE 권한 없으므로) |
| **관리자 대시보드** | 별도 페이지 미설치. /works 의 「오늘」 서브탭만 | MVP 우선, 작업량 폭증 시 별도 페이지 검토 |

- **마이그** [`0029_work_daily_checks.sql`](./supabase/migrations/0029_work_daily_checks.sql):
  - `work_daily_checks` 테이블 + `daily_check_decision` enum ('진행중', '완료', '이월')
  - RLS 3개 (select 회사 전체 / insert·update 본인만). delete GRANT 미부여 (append-only)
  - security definer 함수 2개: `work_advance_to_in_progress(_work_id)` + `work_confirm_complete(_work_id)`
- **공통 lib** [`src/lib/work.ts`](./src/lib/work.ts): `DailyCheckDecision` type + `DAILY_CHECK_COLOR` 매핑 + `todayInSeoul()` (Asia/Seoul YYYY-MM-DD)
- **server actions** [`src/app/works/daily-check-actions.ts`](./src/app/works/daily-check-actions.ts):
  - `startDailyChecks(formData)` — 본인 배정 미완료 작업 중 선택된 N건 일괄 체크인 (upsert ignoreDuplicates) + 작업 status 자동 전환
  - `closeDailyChecksBulk(formData)` — row 별 decision 받아 일괄 마감
  - `confirmWorkComplete(formData)` — security definer RPC 호출 (담당자/관리자만)
- **홈 카드** [`src/app/TodayWorksCard.tsx`](./src/app/TodayWorksCard.tsx) (client):
  - 진행 중 row: 「본인 분 완료」/「내일 이어서」 라디오 토글 + 일괄 「마감하기」 버튼
  - 추가 시작: 미체크인 배정 작업 체크박스 다중선택 + 「시작하기」 버튼
  - 오늘 마감 완료: 접기/펼치기 collapsed by default
- **/works 「오늘」 서브탭**: 최상단 토글에 「오늘」 탭 신규 (전체/오늘/작업자/내 작업). 카드마다 emerald 「오늘 N명」 배지 (todayCountByWork map)
- **작업 상세**:
  - 상태 배지 옆에 「작업 완료로 확정」 인디고 버튼 (canConfirmComplete 일 때만)
  - 진행률 위에 「오늘 진행자 N명」 섹션 (시작시각·마감시각·메모·decision 배지)

### 🟡 미완 / 후속

- **운영 작업 (owner 가 Supabase Dashboard 에서 SQL 실행 필요)** ⚠️
  - [`0007_leave_substitute.sql`](./supabase/migrations/0007_leave_substitute.sql) — 휴가 대무자 컬럼
  - [`0008_works.sql`](./supabase/migrations/0008_works.sql) — M3 작업관리 테이블·enum·권한 컬럼
  - [`0009_works_order_id.sql`](./supabase/migrations/0009_works_order_id.sql) — 작업 ID 컬럼 (청약·지장이설)
  - [`0010_work_daily_reports.sql`](./supabase/migrations/0010_work_daily_reports.sql) — works 확장 + 일일 작업일보
  - [`0011_connection_plan.sql`](./supabase/migrations/0011_connection_plan.sql) — 접속일보 chain side
  - [`0012_connection_reports.sql`](./supabase/migrations/0012_connection_reports.sql) — 접속일보 report side
  - [`0013_node_spec_enum.sql`](./supabase/migrations/0013_node_spec_enum.sql) — 함체 규격 enum 컬럼 추가
  - [`0014_cables_master.sql`](./supabase/migrations/0014_cables_master.sql) — 케이블 마스터 + cable_code 컬럼
  - [`0015_work_delete_permission.sql`](./supabase/migrations/0015_work_delete_permission.sql) — 작업 삭제 권한 + RLS 분리
  - [`0016_work_instructions.sql`](./supabase/migrations/0016_work_instructions.sql) — 작업 지시사항 컬럼
  - [`0017_view_stats_permission.sql`](./supabase/migrations/0017_view_stats_permission.sql) — 통계 조회 권한
  - [`0018_permission_rename.sql`](./supabase/migrations/0018_permission_rename.sql) — 권한 enum 재구성 (소장→팀장, 대표→관리자 통합, 팀원 신규)
  - [`0019_assignment_worker_type.sql`](./supabase/migrations/0019_assignment_worker_type.sql) — 작업자별 worker_type
  - [`0020_connection_report_photos.sql`](./supabase/migrations/0020_connection_report_photos.sql) — 접속일보 사진 첨부 (테이블·버킷·RLS)
  - [`0021_connection_facilities.sql`](./supabase/migrations/0021_connection_facilities.sql) — 함체·국사 마스터 + plan_node 의 master_id
  - [`0022_materials_warehouses.sql`](./supabase/migrations/0022_materials_warehouses.sql) — M4: materials 확장 (카테고리·발주처·코드) + warehouses + 본사창고 seed
  - [`0023_stock_receipts_lots.sql`](./supabase/migrations/0023_stock_receipts_lots.sql) — M4: 입고 + 재고 lot
  - [`0024_holdings_issuances.sql`](./supabase/migrations/0024_holdings_issuances.sql) — M4: 작업자 holding + 출고 이력
  - [`0025_can_manage_stock_and_report_link.sql`](./supabase/migrations/0025_can_manage_stock_and_report_link.sql) — M4: can_manage_stock 토글 + daily_report_materials + 일보 자재 holding FK
  - [`0026_stock_use_approval.sql`](./supabase/migrations/0026_stock_use_approval.sql) — M4 Phase 2-A: 자재 사용 승인 + 초과 사유 + 취득사유 + low_value 토글
  - [`0027_signup_and_work_type_rework.sql`](./supabase/migrations/0027_signup_and_work_type_rework.sql) — 회원가입 흐름 + work_type enum 재구성 + vehicle_plate + return_location + 트리거 갱신
  - [`0028_employees_workplace.sql`](./supabase/migrations/0028_employees_workplace.sql) — 직원 본사/현장 구분 컬럼 (현장 = 사무탭·차량·결재 비표시)
  - [`0029_work_daily_checks.sql`](./supabase/migrations/0029_work_daily_checks.sql) — 오늘 작업 체크 + decision enum + security definer 함수 2개
- **외선일보 별도 entity (v2)** — 접속일보와 동일 패턴으로 외선팀 전용 모듈. 외선 작업 특성(케이블 포설구간·전주번호 등)에 맞는 구조 별도 설계.
- **접속일보 후속 (v2)** — segment-level 작업자 태그, 사진 첨부 + EXIF, 국사·함체 마스터 테이블화, 재접속 이력 조회, 지도 시각화
- **M3 Phase 2 후속** — 사진 첨부 + EXIF·워터마크 (PRD M3-06), 일보 결재함 통합 (현재는 작업 상세에서 진입), 일반 일보 월별 CSV 리포트
- **M3 Phase 3 (대시보드)** — PRD M3-05: 현장별 진행률·누적 인시·자재 사용량.
- **`/admin/sites` 수정사항** — owner 가 별도로 보강 예정 (현장 등록 폼·목록 UX).
- **알림** — 의도적으로 인앱 토스트만. PWA 푸시는 M3 들어갈 때 같이 도입 검토.
- **다크모드 정식 도입** — 1단계만 적용. 사용자가 OS 다크 모드 켜야 다크 보임. 전 페이지 일관 적용은 큰 작업이라 추후 owner 요청 시.
- **회사 로고 적용** — `public/icon.svg` 가 임시 'eM' 모노그램. 회사 로고 PNG (192·512 px) 생성 후 manifest.json 의 icons 경로 교체.
- **모바일 LAN 검증 한계** — `npm run dev` 의 JS chunk 가 LAN IP 접속 시 모바일 hydration 자주 실패. 모바일 검증은 Vercel 배포본 사용.

### 도메인 용어 — 헷갈리기 쉬운 부분
- **권한 (permission)** : 시스템 접근 제어. 작업자(worker) / 팀원(team_member) / 팀장(team_leader) / 관리자(admin) 4개 enum. 관리자만 직원 관리 + 권한 토글 부여. 결재 = 팀장 OR 관리자. (legacy: foreman→team_leader rename, ceo→admin 통합, 마이그 0018)
- **직급 (position)** : 회사 내 위계. 이사/부장/차장/과장/대리/사원. 권한과 1:1 아님.
- **팀 (team)** : 소속 부서. 지장/계획/공가/청약/정산/자재/지원.
- **분야 (work_type)** : 현장 작업 종류. 공무/외선/접속. 사용자가 평소 "역할" 이라고 부르는 항목 — UI 라벨은 "분야" 로 통일.
- 직급·팀·분야 enum 값은 **한국어 그대로** 사용 (DB·코드 양쪽). 본인의 권한은 락아웃 방지로 본인이 직접 못 바꿈.

### 📋 이후 모듈 (PRD §3.1)
- M3 작업관리 (W5-6 중반) — PWA + 오프라인 캐싱은 여기서 도입
- M4 자재 입출고 (W5-6 후반)
- M5 안전관리 (W7) — 산안법·중대재해처벌법 증빙 강조 → audit log 필수
- M6 대시보드 (W8)

## 자주 쓰는 명령

```powershell
# 로컬 dev 서버 (포트 3000)
npm run dev

# 빌드 검증 (배포 전 점검)
npm run build

# 린트
npm run lint

# 커밋·배포 (push 시 Vercel 자동 빌드)
git add .
git commit -m "메시지"
git push
```

## 환경변수 (.env.local — git에 커밋되지 않음)
- `NEXT_PUBLIC_SUPABASE_URL` ← 설정됨
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` ← 설정됨
- `SUPABASE_SERVICE_ROLE_KEY` ← 설정됨 (서버 전용, 브라우저 노출 금지)

Vercel 환경변수에도 동일 키 등록. 변수 추가 시 양쪽 동기화 필요.

## 보안·규제 메모
- **개인정보**: 주민번호 미수집. 휴대폰·계좌는 컬럼 단위 암호화 (M2 들어갈 때 설계)
- **위치정보**: 출퇴근·일보 외 추적 안 함. 동의 UI 필수
- **산안법/중대재해처벌법**: 안전 기록은 5년 보존, **append-only audit log**, 소프트 삭제만
- **RLS**: 모든 비즈니스 테이블에 회사·역할별 정책 강제 (Supabase 프로젝트 설정에서 자동 RLS ON 상태)

## 의사결정 컨벤션
- **빠른 MVP 우선**: 정식 자체 백엔드보다 Supabase 위에서 빠르게 구현. 추상화 미루기.
- **모바일 우선 반응형**: 모든 화면을 320~430px 폭에서 먼저 설계, 데스크톱은 그 다음.
- **한국어 UI**: 식별자(변수·테이블)는 영어, 사용자에게 보이는 모든 문구는 한국어.
- **간결한 코드**: 미래 가정용 추상화·feature flag·과도한 에러 처리 금지. 시스템 경계에서만 검증.
