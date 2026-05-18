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

### ✅ 완료 (접속일보 후속 정정 1, 2026-05-18)

owner 피드백 4건 반영:

1. **상위국·하위국 사이 노드 추가 UI** — chain 트리 편집 페이지 각 부모-자식 edge 사이에 inline `[+ 여기 끼우기]` 버튼 노출. 클릭 시 `?parent=<부모>&between_child=<자식>` URL 파라미터로 add 폼 모드 전환.
2. **함체 규격 enum 화** — text 자유입력 → cable_spec enum (10종) 드롭다운. legacy text 컬럼 `spec` 은 그대로 두고 새 `spec_enum` 컬럼 신설. 텍스트 값이 enum 매치되면 자동 migrate.
3. **일보 작성 화면 통합 폼** — cable·공종·자재를 한 화면·한번에 입력. [`UnifiedReportForm`](./src/app/works/UnifiedReportForm.tsx) 클라이언트 컴포넌트로 노드별 dynamic rows(공종·자재 add/remove). 서버 액션은 `tasks_json`·`materials_json` 직렬화 필드로 받아 한 번에 검증+insert.
4. **결과 검토 후 추가** — 대기 중.

- **DB 마이그레이션**: [`0013_node_spec_enum.sql`](./supabase/migrations/0013_node_spec_enum.sql) — `connection_plan_nodes.spec_enum public.cable_spec` 추가 + text→enum 자동 매핑
- **UI**: 노드 등록/수정 폼 enum 드롭다운, 트리 표시 enum 우선, 사이 끼우기 버튼, 일보 통합 폼
- **CSV segment 모드**: 함체규격 컬럼은 spec_enum 우선 (legacy text fallback)

### 🟡 미완 / 후속

- **운영 작업 (owner 가 Supabase Dashboard 에서 SQL 실행 필요)** ⚠️
  - [`0007_leave_substitute.sql`](./supabase/migrations/0007_leave_substitute.sql) — 휴가 대무자 컬럼
  - [`0008_works.sql`](./supabase/migrations/0008_works.sql) — M3 작업관리 테이블·enum·권한 컬럼
  - [`0009_works_order_id.sql`](./supabase/migrations/0009_works_order_id.sql) — 작업 ID 컬럼 (청약·지장이설)
  - [`0010_work_daily_reports.sql`](./supabase/migrations/0010_work_daily_reports.sql) — works 확장 + 일일 작업일보
  - [`0011_connection_plan.sql`](./supabase/migrations/0011_connection_plan.sql) — 접속일보 chain side
  - [`0012_connection_reports.sql`](./supabase/migrations/0012_connection_reports.sql) — 접속일보 report side
  - [`0013_node_spec_enum.sql`](./supabase/migrations/0013_node_spec_enum.sql) — 함체 규격 enum 컬럼 추가
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
- **권한 (permission)** : 시스템 접근 제어. 작업자/소장/관리자/대표 4개 enum. 관리자/대표만 직원 관리 화면 진입 가능.
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
