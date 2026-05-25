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

### ✅ 완료 (연차 관리 — 근로기준법 자동 부여 + 사용내역, 2026-05-19)

owner 결정사항:

| 항목 | 결정 | 비고 |
|---|---|---|
| **부여 방식** | 근로기준법 자동 | 1년 미만: 매월 1일 누적 (최대 11일). 1년 이상: 매 1주년에 15+min(10, floor((seq-1)/2))일 (최대 25일) |
| **회계 기준** | 입사일 기준 (개인별) | period_seq=0 (1년 미만) / 1·2·... (N주년 회차). 회계연도 일괄 X |
| **소진 시점** | 결재 승인 시 자동 | security definer `annual_leave_apply_usage` RPC. 신청·반려·취소는 영향 X |
| **잔여 부족** | 신청·승인 모두 허용 | /requests/new 에 amber 경고, /approvals 상세에 「승인 시 예상 잔여」 + rose 경고 |
| **음수 잔여** | 허용 (정책상 유연성) | 관리자가 조정 가능 |
| **단위** | 일(day) · numeric(5,2) | 반차 0.5 / 반반차 0.25 자동 매핑 |
| **leave_type 매핑** | 연차=N일·반차=0.5·반반차=0.25·병가/공가/외근=0 | `LEAVE_TYPE_PER_DAY_COST` |
| **취소·반려 시 복원** | MVP 미포함 | 승인 후 취소 흐름이 코드에 없음. v2 에 reverse delta 처리 |
| **운영 전 사용 이력** | 회차별 「현재 잔여」 입력 (A안) | admin 이 직원·회차마다 잔여 X일 입력 → used = max(0, granted - X) 자동 계산. audit 에 `source='admin_manual'` + reason 기록 |

- **마이그** [`0031_annual_leaves.sql`](./supabase/migrations/0031_annual_leaves.sql):
  - `employees.hire_date date` 컬럼
  - `annual_leave_balances` 테이블 — (employee_id, period_seq) unique. granted·used numeric(5,2)
  - `annual_leave_grants` audit log (delete GRANT 미부여, append-only)
  - RLS: 본인 select / admin all + audit insert
  - security definer `annual_leave_apply_usage(_employee_id, _on_date, _delta)` — leave_requests 와 별개 권한으로 used 갱신
- **공통 lib** [`src/lib/annual-leave.ts`](./src/lib/annual-leave.ts):
  - `LEAVE_TYPE_PER_DAY_COST` · `calcLeaveUsage` (다일 연차 일수 계산)
  - `yearsBetween` · `legalGrantForYear` · `periodDates` · `monthsBetween` · `currentPeriodSeq`
  - `plannedPeriods(hireDate)` — 입사일 기준 현재까지 만들어져야 할 모든 회차 + 권장 granted
  - `calcRemaining` · `formatLeaveDays`
- **server actions** [`src/app/admin/annual-leaves/actions.ts`](./src/app/admin/annual-leaves/actions.ts):
  - `refreshEmployeeAnnualLeaves(formData)` — 한 직원 회차 갱신 (insert 또는 granted += delta, audit log)
  - `refreshAllAnnualLeaves()` — 전직원 일괄
  - `adjustAnnualLeaveBalance(formData)` — admin 수동 가산·차감 (granted 변경)
  - `setInitialRemaining(formData)` — 운영 전 잔여 직접 입력 (used 역산)
  - `updateHireDate(formData)` — 입사일 갱신 + 즉시 회차 자동 갱신
- **승인 액션 통합** [`src/app/approvals/actions.ts`](./src/app/approvals/actions.ts):
  - `approveRequest` 의 nextStatus='승인' 시점에 `annual_leave_apply_usage` RPC 호출
- **/admin/annual-leaves** 페이지: 직원별 입사일 입력 + 회차 리스트 + 잔여 큰 숫자 + 「조정」 폼 + 「이 직원만 갱신」/「전직원 일괄 갱신」 버튼. 1년 미만 회차(seq=0) 는 「1년 미만 (월 누적)」 라벨
- **/requests/new** 신청 폼 위에 잔여 카드 (잔여 < 0 rose / < 1 amber / 그 외 emerald)
- **/approvals/[id]** 상세에 「연차 차감」 InfoRow — 차감 일수 + 현재 잔여 + 승인 시 예상 잔여. 음수면 rose 경고
- **홈 카드** [page.tsx](src/app/page.tsx) 에 `annual_leave` 카드 추가 (입사일·회차 부여 시에만 노출). 관리자 카드에 「연차 관리」 링크 추가
- **홈 카드 개인화** [`home-cards.ts`](./src/lib/home-cards.ts): `annual_leave` id 등록 + 기본 순서·라벨·설명

#### 후속 (2026-05-19): /my-leaves · 대기 합계 · CSV · 팀별 통계 · 다음 회차 미리보기

- **/my-leaves** [`src/app/my-leaves/page.tsx`](./src/app/my-leaves/page.tsx) — 직원 본인 페이지
  - 현재 회차 큰 잔여 카드 (휴가 신청 진입점)
  - 다음 회차 미리보기 (blue) — N주년 시작 시 부여 예정 일수
  - 이전 회차 리스트
  - 본인 휴가 신청 이력 (100건, /requests/[id] 링크)
  - audit (annual_leave_grants) 이력 — admin 부여·조정 추적
- **대기 신청 합계** — 현재 잔여에서 「대기 중 신청 X일 · 승인 시 Y일」 amber 줄 표시
  - 홈 「내 연차 잔여」 카드
  - /requests/new 잔여 카드
  - /my-leaves 헤더 카드
- **다음 회차 미리보기**: 홈 카드 + /my-leaves 양쪽에 blue 박스로 N주년 일수·기간 표시
- **관리자 CSV** ([api/reports/annual-leave-balances](src/app/api/reports/annual-leave-balances/route.ts) · [annual-leave-usage](src/app/api/reports/annual-leave-usage/route.ts))
  - 잔여 CSV — 직원 × 모든 회차 (잔여 표)
  - 사용 CSV — 월별 (status='승인' + 차감 대상만)
- **팀별 사용률 통계** — /admin/annual-leaves 하단. 활성 직원 × 현재 회차 합산. progress bar + 사용률(% ≥80 rose, ≥50 amber)

### ✅ 완료 (홈 화면 카드 개인화, 2026-05-19)

owner 결정사항:

| 항목 | 결정 | 비고 |
|---|---|---|
| **저장 위치** | DB (`employees.home_card_prefs jsonb`) | 디바이스 무관 (PC·핸드폰·태블릿 동일). 서버 렌더 시점에 적용 — hydration mismatch 없음 |
| **편집 UI** | 별도 페이지 `/settings/home` | 홈 인라인 편집은 모바일 드래그·long-press 충돌. 홈 우상단 ⚙ 아이콘 진입점 |
| **재정렬 방식** | ▲▼ 화살표 버튼 | 한국 모바일 사용자에게 직관적, ghost-tap 위험 0 |
| **고정 카드** | 없음 (전부 숨김 가능) | admin 카드 숨겨도 BottomNav·사무탭으로 진입점 유지 |
| **새 카드 추가 시** | `HOME_CARD_DEFAULT_ORDER` 에 추가만 하면 자동 폴백 | resolveHomeCardPrefs 가 사용자 prefs 에 없는 새 id 를 기본 위치에 끼워 넣음 (forward-compat) |

- **마이그** [`0030_home_card_prefs.sql`](./supabase/migrations/0030_home_card_prefs.sql): `employees.home_card_prefs jsonb default '{}'` 1 컬럼. 기존 `employees_update_self` RLS 가 본인 row 갱신 허용
- **공통 lib** [`src/lib/home-cards.ts`](./src/lib/home-cards.ts):
  - `HomeCardId` type (10종: attendance·today_works·vehicles·my_materials·stock_approvals·my_works·approvals·leaves·admin·reports)
  - `HOME_CARD_LABEL`·`HOME_CARD_DESCRIPTION` 매핑
  - `resolveHomeCardPrefs(raw)` — jsonb → `{ order, hidden }` 정규화 + 알 수 없는 id·중복 제거 + 누락 id 기본 순서로 보충
  - `isCardVisible(prefs, id)` + `isValidHomeCardId(v)`
- **server actions** [`src/app/settings/home/actions.ts`](./src/app/settings/home/actions.ts): `moveHomeCard(up|down)`·`toggleHomeCardVisible`·`resetHomeCardPrefs`. 본인 row 만 update (RLS 가 한 번 더 막아줌)
- **/settings/home** [`src/app/settings/home/page.tsx`](./src/app/settings/home/page.tsx): 카드 리스트 + ▲▼ 화살표 + 「표시/숨김」 토글 + 「기본 설정으로 초기화」 버튼. 카드 비활성 row 는 회색·취소선
- **홈** [`src/app/page.tsx`](./src/app/page.tsx):
  - 카드들을 `Partial<Record<HomeCardId, ReactNode>>` 맵으로 별수화 (조건부 카드는 undefined)
  - prefs 순서대로 visible 카드만 Fragment 로 렌더
  - 우상단 ⚙ 아이콘 진입점 (로그아웃 버튼 옆)
  - 모든 카드를 숨겼을 때는 amber 안내 박스 + 설정 진입 CTA 노출

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

### ✅ 완료 (회원가입 흐름 디버깅 — service_role GRANT, 2026-05-19)

회원가입 후 가입가능한 회사가 없음 → 회사 조회 실패 (permission denied) → "This page couldn't load" 의 3단 진단:

| 증상 | 원인 | 해결 |
|---|---|---|
| "가입 가능한 회사가 없습니다" | `/signup` 가 anon `createClient()` 로 companies 조회. RLS 가 `current_employee()` 기반이라 비로그인 시 0건 | [`src/app/signup/actions.ts`](./src/app/signup/actions.ts) — admin client (service role) 로 우회 |
| "This page couldn't load" | Vercel 에 `SUPABASE_SERVICE_ROLE_KEY` 환경변수 누락 → `createAdminClient()` throw → 잡히지 않은 에러 | try/catch 로 잡아 토스트 메시지 노출 + Vercel env 등록 (CLI `--value` 플래그로 비대화형) |
| "permission denied for table companies" | 자동 RLS ON 으로 만든 Supabase 프로젝트는 `service_role` 에 자동 GRANT 안 들어감. BYPASSRLS 만으론 부족 | 마이그 [`0032_service_role_grants.sql`](./supabase/migrations/0032_service_role_grants.sql) — public 스키마 일괄 GRANT + `alter default privileges` |

**핵심 학습**: `permission denied for table` 메시지는 RLS 가 아니라 **table-level GRANT 부재** 신호. RLS 차단은 빈 결과로 나옴. 향후 admin client 로 새 테이블 접근 시에도 0032 의 default privileges 가 자동 grant 보장.

### ✅ 완료 (직원 퇴사 처리, 2026-05-19)

owner 결정사항:

| 항목 | 결정 | 비고 |
|---|---|---|
| **차단 범위** | 로그인 차단만 | 홈 페이지의 `!is_active` 분기가 이미 차단. 진행중 차량·휴가는 수동 정리 |
| **퇴사일** | 관리자가 직접 입력 | 기본 오늘(KST), 수정 가능. 4대보험·정산용 실제 퇴사일과 맞추는 유연성 |
| **재입사** | 같은 row 재활용 | `is_active=true` + `resigned_at=null`. 데이터 그대로 복귀 |
| **화면** | `/admin/employees/resigned` 별도 페이지 | 활성 직원 목록을 깨끗하게 유지 |

- **마이그** [`0033_employee_resignation.sql`](./supabase/migrations/0033_employee_resignation.sql) — `employees.resigned_at date` + index
- **server actions** ([`src/app/admin/employees/actions.ts`](./src/app/admin/employees/actions.ts)): `resignEmployee` (본인 차단·기본 오늘 KST), `unresignEmployee` (재입사), `updateResignedAt` (퇴사일만 수정)
- **/admin/employees**: 활성 카드 푸터에 「퇴사 처리」 접기 메뉴 (rose, 본인 제외) + 헤더 우측에 「퇴사자 N」 진입 버튼. 활성 목록 쿼리에 `.is('resigned_at', null)` 필터 추가
- **/admin/employees/resigned** (신규): 퇴사일 desc 정렬 + 퇴사일 수정 폼 + 「재입사 처리」 emerald 버튼
- **홈 비활성 메시지**: 3 케이스 분기 (퇴사·승인대기·일반비활성) — 퇴사면 "퇴사 처리된 계정입니다" + 퇴사일 표시
- **데이터 보존**: 산안법 5년 보존 준수. 모든 일보·근태·작업 이력 유지. 통계·CSV 에 그대로 표시

### ✅ 완료 (업무용 차량 사용 종료·영구 삭제, 2026-05-19)

owner 결정사항: 폐차뿐 아니라 매각·렌트반납·리스반납 등 회사를 떠나는 사유 다양. 하이브리드 방식.

| 시나리오 | 동작 | 보존 |
|---|---|---|
| **운행 이력 0건** | 영구 삭제 가능 (등록 실수 정정용) | DB ON DELETE RESTRICT 가 0건 보장 |
| **운행 이력 있음** | 사용 종료 처리 (`retired_at` + `retire_reason` + `is_active=false`) | 이력 100% 보존 |
| **사용 중 차량** | 두 동작 모두 차단. 먼저 반납 처리 필요 | server action active trip 사전 체크 |

- **마이그** [`0034_vehicle_retirement.sql`](./supabase/migrations/0034_vehicle_retirement.sql) — `vehicles.retired_at` + `retire_reason` text (enum 화 X, 자유 텍스트)
- **server actions** ([`src/app/vehicles/actions.ts`](./src/app/vehicles/actions.ts)): `deleteVehicle` (count 0 사전 체크 + RESTRICT 최후 안전망 — 삼중), `retireVehicle` (사유 필수 + active trip 차단), `reactivateVehicle` (운영 재개)
- **client**: [`DeleteVehicleButton`](./src/app/vehicles/DeleteVehicleButton.tsx) — confirm() 가드 (작업 삭제와 동일 패턴)
- **/vehicles**:
  - 활성 카드 푸터 (admin only · 사용 중 차량 제외): 「사용 종료 처리」 details 접기 (사유·날짜 입력) + 「삭제」 버튼 (운행 이력 0건만)
  - 헤더 우측 (admin only): 「사용 종료 N」 진입 버튼
  - 차량 목록 쿼리에 `.is('retired_at', null)` 필터
  - 운행 이력 vehicle_id Set 만들어 영구 삭제 가능 여부 판단 (회사 규모상 50,000건 limit 안전)
- **/vehicles/retired** (신규): 종료일 desc + 「사용 종료 사유」 표시 + 「운영 재개」 emerald 버튼
- **홈 차량 카드**: retired 제외 (`vehiclesRes` 쿼리에 `.is('retired_at', null)`)
- **운행 이력 검색** (`/vehicles/trips`): 사용 종료 차량 그대로 포함 (과거 이력 검색 보장)
- **아이콘**: lucide-react 에 `CarOff` 없음 → `Ban` 사용

### ✅ 완료 (페이지 헤더 모바일 레이아웃 일괄 보정, 2026-05-19)

owner 모바일 스크린샷 보고: `/vehicles` 헤더에서 "업무용 차량" 이 "업무 / 용 / 차량" 처럼 한 글자씩 세로로 깨짐.

- **원인**: `<header className="flex items-center justify-between gap-3">` 가 모바일에서도 가로 배치를 강제. 우측 버튼 그룹의 `shrink-0` 이 좌측 제목(`text-3xl`)을 압박해 한글이 글자 단위로 줄바꿈됨. 우측 버튼이 늘어날수록 심화.
- **해결**: 모바일(<640px)에선 세로 stack, `sm` 이상에서만 가로 배치.
  ```diff
  - flex items-center justify-between gap-3
  + space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3
  ```
- **적용 (10개 페이지)**: `/vehicles` · `/admin/employees` · `/admin/sites` · `/admin/facilities` · `/admin/materials` · `/admin/cables` · `/works` · `/works/[id]` · `/requests` · `/vehicles/trips`
- **신규 페이지 작성 시**: 큰 제목(`text-2xl` 이상) + 우측 버튼 조합이면 처음부터 모바일 stack 패턴으로 시작. mobile_ux_patterns 메모리에 「8. 모바일 헤더 가로 강제」 로 기록.

### ✅ 완료 (청약 작업관리 연동 + 작업자 picker + 작업완료일, 2026-05-25)

owner 요구 (0067 후속): 「작업완료일」 추가 + 작업자 입력을 외선팀/접속팀 직원 picker 로 + 청약 프로젝트 생성 시 작업관리(`works`) 에 자동 연동 → 배정된 작업자가 일보 작성 시 「설계내역」 보면서 입력.

- **마이그** [`0068_relocation_works_link.sql`](./supabase/migrations/0068_relocation_works_link.sql):
  - `relocation_projects` 확장: `completion_at date` (작업완료일) + `outside_worker_ids jsonb` + `splice_worker_ids jsonb` + `subcategory text`(청약 sub: 소호/FTTH/모바일/전용회선/다회선/아파트, CHECK)
  - `works` 역방향 FK: `relocation_project_id uuid` (ON DELETE SET NULL — 산안법 5년 보존) + unique partial index (프로젝트 1:1 work)
  - jsonb id 배열 GIN 인덱스 2개
- **공유 picker** ([`src/app/relocation/RelocationWorkerPicker.tsx`](./src/app/relocation/RelocationWorkerPicker.tsx)) — 풀스크린 모달 멀티 선택. 후보는 회사 활성 직원 중 work_type 매치(외선팀/접속팀) 자동 필터. hidden input 에 JSON id 배열. WorkersMultiSelect 와 달리 worker_type 은 picker 별로 고정(외선/접속 따라). 모달 항상 mount + hidden 토글 (모바일 안전 패턴)
- **server action** ([`src/app/relocation/actions.ts`](./src/app/relocation/actions.ts)):
  - `parseProjectForm` — 신규 필드 + jsonb id array 파싱 (`parseIdArray` 헬퍼, UUID 검증)
  - `validateProject` — 청약일 때 subcategory 강제
  - 신규 `syncLinkedWork()` — 청약 프로젝트 → `works` upsert + `work_assignments` 동기화 (외선→worker_type='외선팀', 접속→'접속팀'). cross-company 차단(회사 직원만), admin client(service role) 로 works·assignments 쓰기 (작성자에게 works 권한 없어도 가능. 같은 회사 자기 청약 프로젝트의 부산물이라 인가 OK). 기존 배정 diff 로 insert/update/delete 동기화
  - `createProject`/`updateProject` 양쪽에서 호출. 동기화 실패해도 프로젝트 자체는 유지
- **/relocation/new** — 청약 필드 재배치: 청약 분류(필수 select), 청약ID/공사번호, 가입자명, 가입자 주소, 하위국 담당자/연락처, 청약일/개통희망일, **공사계약일/준공예정일/작업완료일(3열)**, **작업자배정 picker 2 컬럼 (외선 주황·접속 파랑 톤)**. 후보 직원 0명일 때 안내문
- **/relocation/[id]** 편집 폼: 같은 구조 + initialIds 로 picker pre-select. 헤더 우상단 「작업관리 보기」 emerald 링크 (linkedWorkId 있을 때)
- **/works/[id]**: 헤더 우상단 「설계내역 보기」 indigo 링크 (`relocation_project_id` 있을 때). 작업자가 일보 작성 전 클릭으로 청약 프로젝트 캔버스 진입
- **데이터 흐름**:
  1. 청약 프로젝트 생성 (외선·접속 작업자 선택)
  2. 자동 `works` row 생성 + `work_assignments` 추가 (worker_type 자동 매핑)
  3. 배정된 작업자: 홈 「내 작업」 카드 + `/works?mine=1` 에 노출
  4. 작업자가 작업 카드 탭 → worker_type 에 따라 외선일보/접속일보 폼 직행
  5. `/works/[id]` 에서 「설계내역 보기」 → 청약 프로젝트 캔버스 → 설계 보면서 일보 작성
- **기존 free-text 작업자 필드** (`outside_workers`/`splice_workers`): 0067 에서 추가한 컬럼은 그대로 두고 신규 입력은 id 배열 사용. 기존 입력 데이터 보존

### ✅ 완료 (청약 폼 보강 — 준공예정일·작업자배정, 2026-05-25)

owner 요구 (0066 후속): 청약 카테고리 폼에서 「지역」 제거, 「공사계약일」 옆에 「준공예정일」 추가, 「작업자배정」 외선/접속 구분 입력.

- **마이그** [`0067_relocation_subscription_fields_v2.sql`](./supabase/migrations/0067_relocation_subscription_fields_v2.sql): `expected_completion_at date` (준공예정일) + `outside_workers text` (외선 작업자) + `splice_workers text` (접속 작업자). 모두 nullable
- **server action** ([`src/app/relocation/actions.ts`](./src/app/relocation/actions.ts)): `parseProjectForm` 에 3 필드 추가. 청약 외 카테고리는 null 저장
- **/relocation/new** + **/relocation/[id]** (편집): 청약 카테고리 분기 — 청약 폼에서 「지역」 row 숨기고, 공사계약일·준공예정일 2 열 + 작업자배정(외선·접속) 2 열 추가. 계획·지장이설 카테고리는 지역+공사계약일 그대로
- **작업자 입력 방식**: 자유 텍스트 (콤마 구분). 풀 employee picker 는 추후 — MVP 우선
- **「지역」 DB 컬럼**: 그대로 유지. 청약 외 카테고리 + 기존 청약 데이터 보존

### ✅ 완료 (청약 카테고리 전용 폼 + PC 컴팩트 모드, 2026-05-25)

owner 요구: 「청약 설계」 새 프로젝트 생성 폼에서 「프로젝트 제목」 → 「청약명」 으로 변경 + 청약 전용 8 필드 (청약ID·가입자명·가입자 주소·하위국 연락처·하위국 담당자·청약일·개통희망일·공사번호) 추가. PC 화면 글자 크기 3/4 축소 + 폼 입력 간격 줄여 풀HD 한 화면에 다 보이도록.

- **마이그** [`0066_relocation_subscription_fields.sql`](./supabase/migrations/0066_relocation_subscription_fields.sql): `relocation_projects` 에 청약 전용 8 컬럼 추가 (subscription_id·subscriber_name·subscriber_address·branch_contact·branch_manager·subscribed_at date·desired_open_at date·order_no). 모두 nullable — 다른 카테고리에서는 미사용. order_no partial 인덱스 (검색 대비)
- **server action** ([`src/app/relocation/actions.ts`](./src/app/relocation/actions.ts)): `parseProjectForm` 에 청약 8 필드 추가. category !== '청약' 일 때는 모두 null 저장 — 카테고리 변경 시 잔여값 자동 정리. `parseDate` 헬퍼 분리
- **/relocation/new** ([`src/app/relocation/new/page.tsx`](./src/app/relocation/new/page.tsx)) 재작성:
  - 청약 카테고리일 때만 8 필드 렌더 (title 직후, 지역 위)
  - title 라벨 「프로젝트 제목」 → 「청약명」 동적 분기
  - 청약 필드 레이아웃: 청약ID·공사번호 / 가입자명 / 가입자 주소 / 하위국 담당자·하위국 연락처 / 청약일·개통희망일 (lg+ 2열 그리드)
  - **PC 컴팩트 모드** (`lg:` 1024px+): 글자 ~3/4 축소 (text-base→text-xs, text-3xl→text-xl), padding 줄임 (py-2→py-1.5, p-6→p-4), 행 간격 축소 (space-y-4→space-y-2), 그리드 2 컬럼화. 모바일은 그대로 (large touch target 유지)
  - 컨테이너 폭 `max-w-2xl lg:max-w-4xl` — PC 에서 2 컬럼 폭 확보
  - 공통 `INPUT`·`LABEL` 상수로 스타일 일관성
- **/relocation/[id]** 편집 폼: 청약 카테고리 프로젝트일 때만 8 필드 노출. title 라벨 「제목」 → 「청약명」 분기. 편집 컴팩트 모드는 미적용 (편집은 자주 안 쓰므로)
- **계획·지장이설 카테고리**: 변경 없음 — 청약 필드 미노출, 기존 폼 그대로

### ✅ 완료 (공사 설계로 일반화 + 3 카테고리 허브, 2026-05-25)

owner 요구: 「지장이설 설계」 단일 진입을 「공사 설계」로 일반화. 진입하면 「청약 설계」/「계획 설계」/「지장이설 설계」 3 카테고리로 분기, 각 카테고리 안에서 프로젝트 생성·관리. 모든 공사의 행정도·코어구성도·직선도 설계를 한 모듈에서.

- **마이그** [`0065_relocation_project_category.sql`](./supabase/migrations/0065_relocation_project_category.sql): `relocation_projects.category text not null default '지장이설'` + CHECK(청약·계획·지장이설) + (company_id, category) 인덱스. 기존 row 는 `'지장이설'` backfill
- **공통 lib** ([`src/lib/relocation.ts`](./src/lib/relocation.ts)): `RelocationCategory`/`RelocationCategorySlug` type, `RELOCATION_CATEGORY_VALUES`·`_SLUG`·`_FROM_SLUG`·`_LABEL`·`_DESCRIPTION` 상수. 슬러그 ASCII (`subscription`/`planning`/`relocation`) — 한글 URL 인코딩 회피
- **홈 카드** ([`src/lib/home-cards.ts`](./src/lib/home-cards.ts) + [`src/app/page.tsx`](./src/app/page.tsx)): 라벨 「지장이설 설계」 → 「공사 설계」, 설명 「모든 공사의 행정도·코어구성도·직선도 설계 (데스크톱 권장)」
- **/relocation** ([`src/app/relocation/page.tsx`](./src/app/relocation/page.tsx)): 기존 프로젝트 목록 → **3 카테고리 허브**. 카테고리별 진입 카드 (emerald/blue/amber 톤 + 카운트 배지). 더 이상 프로젝트 등록 버튼 없음 (목록 페이지에서만)
- **/relocation/category/[cat]** (신규 [`src/app/relocation/category/[cat]/page.tsx`](./src/app/relocation/category/[cat]/page.tsx)): 카테고리별 프로젝트 목록. 헤더 좌측 「공사 설계」 back link, 우측 「+ 프로젝트 생성」(카테고리 prefilled URL). 빈 목록은 EmptyState
- **/relocation/new** ([`src/app/relocation/new/page.tsx`](./src/app/relocation/new/page.tsx)): `?cat=` 슬러그 쿼리 파라미터 수용. 카테고리 결정 시 hidden field + 회색 박스로 잠금, 미결정 시 select 노출. back link 도 카테고리 슬러그에 맞춰 동적
- **server action** ([`src/app/relocation/actions.ts`](./src/app/relocation/actions.ts)): `parseProjectForm` 에 `category` 검증 + insert/update 반영. `createProject` 실패 시 `/relocation/new?cat=...` 로 돌아옴. `deleteProject` 는 삭제 전 카테고리 조회 후 `/relocation/category/[slug]` 로 redirect. `updateProject` 가 카테고리도 갱신
- **/relocation/[id]** ([`src/app/relocation/[id]/page.tsx`](./src/app/relocation/[id]/page.tsx)): 프로젝트 fetch 에 `category` 추가, back link 가 「{카테고리 라벨} 목록」 (`/relocation/category/[slug]`), 헤더 sub 라인에 카테고리 라벨 prefix, 프로젝트 정보·설정 폼에 「공사 분류」 select 추가
- **/admin/activity** [`pathSection`](./src/app/admin/activity/page.tsx): `/relocation` 메뉴 라벨 「지장이설」 → 「공사 설계」

### 🚧 진행 중 (지장이설 자동화 모듈, 2026-05-19 시작)

LGU+ 협력사 본업 — 광케이블 지장이설 코어구성도·직선도 설계 자동화. 설계자가 시설·케이블을 입력하면 시스템이 기설 코어 보존을 최우선으로 자동 코어 배정 + 검증 + 차수 분할 + 시각화까지 처리. 기존 모듈과 **완전 독립**.

**사양서**: [`docs/RELOCATION_DESIGN_PLAN.md`](./docs/RELOCATION_DESIGN_PLAN.md) (v0.8, 8 라운드 owner 답변 종합)

**핵심 결정사항 요약**:
- 데이터 출처: LGU+ 전용 DB (엑셀 업로드)
- 코어 매핑 기준: 기설 코어ID 보존이 최우선
- 케이블 ID: 기설은 LGU+ 제공·신설은 자동 생성(`NEW-XXXX-NNNNNN`)
- 시설 종류: 국사·맨홀·가공형/관로형 함체·가입자시설 + 국사 내부(MOFD·OJC·장비)
- 시설 번호 자동 부여: 종류별 prefix (S/B/H/C/M/O/E) + 좌측 패널 번호 목록
- 1차 RN 스플리터: 2:8 / 2:16 / 1:2:8:4 / 1:3:8:4 + 작업모드(분기/내부접속만)
- 다이버시티(이원화): 케이블 + 함체 모두 분리. 1코어씩 또는 2코어씩
- 함체 한도: 6조/8조 케이블, 48~576 접속 코어. 1단계 위 권장
- 작업 차수: 02~05시 새벽, 2팀(기본)~4팀(최대), 코어 3분(연속)/8분(비연속), 함체신설+20분
- 양쪽 작업자 페어링: 짝 작업자 함체·코어·휴대폰을 작업 지시서에 명시
- 공종 마스터: 회사 단위, 시드 14종 + 설계자 자유 추가
- 검증 룰 12개: C1·C2·C3·S1·U1·U2·R1·D1·D2·E1·O1·T1
- 모바일: 설계는 데스크톱, 완료 설계 보기는 모바일 허용

**진행 상태** (Phase 1 — DB · CRUD):
- ✅ 사양서 v0.8 작성
- ✅ 마이그 0035 (foundation: enums 9종 + `relocation_projects` + RLS + GRANT) — owner 실행 완료 (2026-05-19)
- ✅ 마이그 0036 (facilities · cables · circuits · core_assignments + 카운터 2종 + btree_gist exclusion) — owner 실행 완료 (2026-05-19)
- ✅ 마이그 0037 (splices · splitters · splitter_ports · task_type_master + 시드 14종 · facility_tasks) — owner 실행 완료, 시드 14 행 확인 (2026-05-19)
- ✅ 마이그 0038 (phases · phase_tasks · task_pairs) — owner 실행 완료 (2026-05-19)
- ✅ 마이그 0039 (migrations · migration_circuits — 이전 워크플로우 audit) — owner 실행 완료 (2026-05-20)
- ✅ **Step A 코드** (2026-05-19): 도메인 헬퍼 + 프로젝트 CRUD + 진입점
  - [`src/lib/relocation.ts`](./src/lib/relocation.ts) — enum 미러링·시설 번호 prefix·케이블/함체 메타·작업시간 공식·신설 케이블 ID 생성
  - [`src/app/relocation/actions.ts`](./src/app/relocation/actions.ts) — 프로젝트 CRUD (create/update/delete)
  - [`/relocation`](./src/app/relocation/page.tsx) 프로젝트 목록
  - [`/relocation/new`](./src/app/relocation/new/page.tsx) 생성 폼
  - [`/relocation/[id]`](./src/app/relocation/[id]/page.tsx) 상세 + 7 탭 골격 (Phase 2 에서 콘텐츠 채움)
  - 홈 카드 `relocation` 신규 등록 (전 직원 노출). [`home-cards.ts`](./src/lib/home-cards.ts) + [`page.tsx`](./src/app/page.tsx)
- ✅ **Step B 코드** (2026-05-20): 시설·케이블·회선·코어배정 CRUD + 좌측 패널 + 시드 데이터 채우기 기능
  - [`facility-actions.ts`](./src/app/relocation/[id]/facility-actions.ts) · [`cable-actions.ts`](./src/app/relocation/[id]/cable-actions.ts) · [`circuit-actions.ts`](./src/app/relocation/[id]/circuit-actions.ts) · [`core-actions.ts`](./src/app/relocation/[id]/core-actions.ts)
  - 탭 컴포넌트 4종: [`FacilitiesTab.tsx`](./src/app/relocation/[id]/FacilitiesTab.tsx) · [`CablesTab.tsx`](./src/app/relocation/[id]/CablesTab.tsx) · [`CircuitsTab.tsx`](./src/app/relocation/[id]/CircuitsTab.tsx) · [`CoresTab.tsx`](./src/app/relocation/[id]/CoresTab.tsx)
  - [`LeftPanel.tsx`](./src/app/relocation/[id]/LeftPanel.tsx) — 시설 번호 목록 (S/B/H/C/M/O/E prefix 그룹)
  - [`seed-actions.ts`](./src/app/relocation/[id]/seed-actions.ts) — 빈 프로젝트에 미니 시나리오 시드 (시설 7·케이블 6·회선 4). 실제 LGU+ 임포트 구현 전 임시 도구
  - 케이블 라벨 = 구간명 (`출발시설명 ~ 도착시설명 · 규격`) 으로 통일
- ✅ **Step C-prev 코드** (2026-05-20): 이전(migration) 워크플로우 — 영향 회선 자동 추출 + 옛→새 매핑 audit
  - [`migration-actions.ts`](./src/app/relocation/[id]/migration-actions.ts) · [`MigrationsTab.tsx`](./src/app/relocation/[id]/MigrationsTab.tsx) · `?from=` searchParam — 이전 탭 (철거/이설 chip → 영향 회선 자동 추출 → 매핑) 동작 중. audit 가치 보존
  - 시드 보강 — 기설 코어 배정 5건 (lifecycle='preexisting'). C1종로중구23-3 을 removing 으로 마킹하면 회선 5572607 자동 추출

- ✅ **Step C 워크플로우 재정의** (2026-05-20, owner 제안):
  | 단계 | 동작 | 데이터 |
  |---|---|---|
  | 1. 범례 → 캔버스 배치 | 좌측 범례에서 시설/케이블 종류 선택 → 캔버스 클릭으로 순서대로 배치 | `relocation_facilities.x_hint/y_hint` |
  | 2. 시설물명 매칭 | 배치 후 인라인 input + `connection_facilities` 마스터 자동완성 | `master_facility_id` FK |
  | 3. 종단 케이블 + 회선 입력 | 종단으로 표시한 케이블에 회선·사용코어 입력 | `relocation_core_assignments` (lifecycle·circuit_id·core_range) |
  | **종단 판단** | **설계자 명시 (자동 추론 X)** — 가입자시설도 통과되는 경우 있음. 함체·국사·맨홀 모두 종단 가능 | `is_terminal boolean` (마이그 0040) |
  | 4. 자동 경로 탐색 | 종단만 검색 → 동일 회선 2 개 이상 종단 = 양쪽 끝. 시설 그래프 BFS 로 경유 케이블에 자동 코어 배정 | server action (C-4 예정) |
  | 5. 카카오 지도 배경 | 캔버스 SVG 뒤에 지도 타일 합성 (owner 가 카카오 개발자 등록 후 JS API key 발급 → `NEXT_PUBLIC_KAKAO_MAP_KEY`) | C-5 |

- ✅ **Step C-1 코드** (2026-05-20): 워크플로우 1-2 — 범례 도구 + 캔버스 배치 + 시설명 마스터 매칭
  - [`TopologyCanvas.tsx`](./src/app/relocation/[id]/TopologyCanvas.tsx) 에 「시설 추가」 도구 패널 (7 종 chip) + `addTool` 상태 + 캔버스 빈 영역 클릭 시 그 좌표에 임시 placement
  - `NewFacilityModal` (client) — 시설명 input + 회사 `connection_facilities` 마스터 datalist 자동완성 (국사→station, 함체→box 자동 필터). 마스터명 일치 시 `master_id` + 규격·주소 자동 prefill (✓ 매칭 배지)
  - 함체 추가 시 규격 select, 가입자시설 추가 시 주소 input 노출
  - 신규 server action [`createFacilityAtPosition`](./src/app/relocation/[id]/facility-actions.ts) — 좌표 + 마스터 FK 한 번에 저장 (JSON 결과 반환, redirect 안 함)
  - [`page.tsx`](src/app/relocation/[id]/page.tsx) — 회사 facility 마스터 fetch + 빈 프로젝트에도 캔버스 노출
- ✅ **Step C-1.5 종단 컬럼** (2026-05-20): 마이그 0040 + `CoresTab` 폼에 「종단 (회선의 끝)」 체크박스 + 행 배지 (Flag 아이콘, blue). owner 결정: 자동 추론 X, 설계자 명시
- ✅ **Step C-1.6 LGU+ 표준 범례** (2026-05-20, owner 첨부 이미지 2장):
  - 마이그 0041 — `relocation_closure_type` 8 → 29 종 (국사 5 + 국사내부 3 + 설치장소 4 + 접속함체 5 + 모바일국소 8 + RN/IJP/광MUX 5). `relocation_cables.installation_type` 컬럼 (가공·구내·해저·입상·지중)
  - [`lib/relocation.ts`](src/lib/relocation.ts) — `ClosureType` 29 종 + `ClosureCategory` 5 그룹 + `CLOSURE_TYPE_CATEGORY` 매핑 + `CLOSURE_TYPE_COLOR` LGU+ 표준 색 (마름모 4색·R/i/M 글자색 등) + `cableSpecColor` (1C~12C 빨강·13C~36C 청록·...·기타 검정) + `installationTypeDash` (가공/구내/해저 solid·입상 dotted·지중 dashed)
  - 신규 [`LegendPanel.tsx`](src/app/relocation/[id]/LegendPanel.tsx) — 「표준 범례」 버튼 클릭 시 모달. 좌측 「건물/설치장소 범례」 + 우측 「광망 범례」 두 컬럼. 카테고리 헤더(rose dot) + 시설 SVG 아이콘 (DiamondIcon·TriangleIcon·FlagIcon·TowerIcon·CircledTextIcon·BoxedTextIcon·CircleXIcon·CircleTIcon·BowtieIcon·LineIcon) + 라벨
  - [`TopologyCanvas.tsx`](src/app/relocation/[id]/TopologyCanvas.tsx) — 기존 인라인 `Legend()` 제거 → 「표준 범례」 트리거 버튼 (BookOpen 아이콘). 「시설 추가」 도구 패널을 카테고리 5 그룹 접기/펼치기 (기본: 국사·접속함체 펼침)로 재구성. 케이블 line 색은 `edgeStyle(spec, status)` — 색은 규격 기반 + dash 는 status 기반. ConnectionModal 의 status 선택은 그대로
  - **캔버스 시설 SVG 도형 자체** (FacilityShape) 의 표준 모양 적용은 별도 단계 (신규 21 종은 현재 fallback 박스+라벨)

- ✅ **Step C-1.7 캔버스 폭 확장 + FacilityShape 표준 도형** (2026-05-20, owner 피드백):
  - **캔버스 가로 폭 full-bleed** — [page.tsx](src/app/relocation/[id]/page.tsx): 캔버스를 `max-w-6xl` 컨테이너 밖으로 분리 (`px-4 sm:px-6 my-5`). 헤더·탭·정보 폼은 6xl 유지. 결과: 모니터 해상도에 따라 캔버스가 거의 화면 전체 폭 사용
  - **FacilityShape 29 종 표준 도형** — [TopologyCanvas.tsx](src/app/relocation/[id]/TopologyCanvas.tsx) 의 FacilityShape 재작성:
    - 국사 5종: 깃발 (국사) + 마름모 4 색 (종합·집중·가입자·간이)
    - 설치장소 4종: 사각형(맨홀)·빨강 원(가입자시설)·초록 마름모(창고)·파란 삼각형(일반설치장소)
    - 접속함체 5종: 원+X 검정(함체_가공형/관로형) + 원+X 빨강(중간접속형) + 원+T 주황(중간분기형) + 보타이 빨강(SP내장형)
    - 모바일국소 8종: 탑(기지국)·검정 깃발(중계기)·H원(안테나)·eNB박스·충원·기원·광원·RF원
    - RN/IJP/광MUX 5종: R빨강·R보라·R초록(RN_TPS/LTE/외)·i노랑(IJP)·M파랑(광Mux)
    - 색깔은 모두 `CLOSURE_TYPE_COLOR` 사용 → LegendPanel 의 작은 아이콘과 동일 모양·색을 NODE_SIZE 90×90 에 맞춰 확대 재현
    - 헬퍼 `CircledText`·`BoxedText` 추가로 13개 동일 패턴 정리

- ✅ **Step C-1.8 캔버스 zoom · pan** (2026-05-20, owner 요청 — 광범위 작업 영역 대응):
  - **마우스 휠**: 마우스 위치를 anchor 로 줌 in/out (factor 1.15 per tick, min width 200·max 12000). `useEffect` + native `wheel` 리스너 (`passive: false`) — React onWheel 은 passive 라 preventDefault 안 됨
  - **빈 영역 마우스 다운 + 드래그**: pan. SVG `setPointerCapture` 로 마우스가 SVG 밖으로 나가도 계속 추적. drag 거리 < 4px 이면 클릭으로 간주 (선택 해제 / 추가 도구 시 시설 배치)
  - **viewBox 를 state 로 분리** — 기존 `useMemo` 자동 계산 → `useState<Viewport>` (사용자 제어). 초기값은 `computeFitToContent(initialPositions)` 로 전체 시설 보이는 viewport
  - **「전체보기」 버튼** — 우상단. 모든 시설이 보이도록 viewport 리셋
  - **줌 컨트롤** — ZoomOut·전체보기·ZoomIn 버튼 + 현재 줌% 표시 (100% = 초기 fit)
  - **click 충돌 해결** — pan 직후 click 은 `recentlyPannedRef` 로 무시 (선택 해제·추가 도구 배치 모두 차단)
  - **캔버스 컨테이너** — 기존 `maxHeight: 70vh + overflow-auto` → `height: 75vh + svg w-full h-full + touchAction: none`. 외부 스크롤바 제거 — 모든 이동은 pan 으로
  - **cursor**: 추가 도구 시 `crosshair` · 노드 드래그 중 `grabbing` · 그 외 `grab`

- ✅ **Step C-1.9 캔버스 DOM 크기 단계 조절** (2026-05-20, owner 요청 — 광범위 작업):
  - owner 정정: **내부 작업 공간은 무한** (이미 zoom/pan 으로 어디든 가능). 조절 대상은 **화면 표시 영역 (DOM)**. 4K 모니터에서 화면 전체 활용 가능하도록
  - 4 단계 `canvasSize`: **compact** (40vh) · **normal** (75vh, 기본) · **tall** (90vh) · **fullscreen** (`fixed inset-0 z-40`, 100vw×100vh — 4K 모니터에서 3840×2160)
  - 우상단 컨트롤 그룹: `Shrink ◁` 축소 / 현재 단계 라벨 (작게/보통/크게/전체) / `Expand ▷` 확장
  - fullscreen 진입 시 페이지 padding 무시하고 캔버스만 화면 전체. 헤더 컨트롤은 그대로 유지 (`flex flex-col` wrapper + SVG `flex-1 min-h-0`)
  - **ESC 키** 로 fullscreen → normal 복귀 + 헤더 우측 「✕ 닫기」 버튼도 노출
  - 작은 화면(compact)도 의외로 유용 — 작업 내용 빠르게 훑기·다른 폼 입력 시 캔버스 줄이기

- ✅ **Step C-1.10 상·하단 패널 접기 + 집중 모드** (2026-05-20, owner 요청 — 캔버스 작업 시 화면 최대 활용):
  - 신규 [`CollapsibleLayout.tsx`](src/app/relocation/[id]/CollapsibleLayout.tsx) (client) — `topPanel`·`canvas`·`bottomPanel` 세 ReactNode props
  - 상태: `topCollapsed`·`bottomCollapsed` 각각 독립. 둘 다 collapsed = 집중 모드
  - **개별 토글 stripe** — 상단↔캔버스 사이 / 캔버스↔하단 사이에 얇은 hover 영역. ChevronUp/Down 아이콘 + "상단 접기/펼치기" / "하단 접기/펼치기" 라벨
  - **집중 모드 floating 토글** — 화면 `fixed bottom-right z-30`. 「집중 모드」(Minimize2) ↔ 「펼치기」(Maximize2). 페이지 어디서든 한 번 클릭으로 상하 동시 접기·펼치기
  - z-index 의도: fullscreen 캔버스 (`z-40`) 보다 낮음 → fullscreen 진입 시 floating 가려짐 (이미 다 접힌 상태와 동일하므로 불필요)
  - [page.tsx](src/app/relocation/[id]/page.tsx) 의 상단(헤더+시드카드)·캔버스·하단(탭+폼) 세 영역을 `topPanel`·`canvas`·`bottomPanel` 로 분리해서 전달

- ✅ **Step C-1.11 시설 추가 도구 패널 접기 + 자동 접힘** (2026-05-20, owner 요청):
  - owner: "시설을 선택할 때는 펼쳐서 선택, 그리기 할 때는 접어서 그리기"
  - [TopologyCanvas.tsx](src/app/relocation/[id]/TopologyCanvas.tsx) 에 `toolsCollapsed` state 추가
  - 도구 패널 헤더 항상 표시 (`▼ 시설 추가` / `▶ 시설 추가`) — 클릭으로 토글
  - 헤더에 현재 선택된 시설 종류 chip 표시 (예: `시설 추가 [● 종합국사]`) — 접힌 상태에서도 무엇을 선택했는지 즉시 확인
  - **chip 클릭 시 자동 접힘** — 시설 종류 선택 → 도구 패널 자동 접힘 → 캔버스에 집중. 같은 chip 다시 누르면 해제(펼친 상태 유지)
  - 「취소」 버튼 — addTool 만 null (펼침 상태는 그대로)

- ✅ **Step C-2 케이블 도구 + 설치 구분** (2026-05-20):
  - [TopologyCanvas.tsx](src/app/relocation/[id]/TopologyCanvas.tsx) 도구 패널에 **「광케이블」 카테고리** 추가 — `CABLE_SPEC_VALUES` chip (규격별 색 막대). `cableTool` state, 시설 도구(`addTool`)와 상호 배타
  - 케이블 도구 선택 → 시설 2 개 차례 클릭 → `ConnectionModal` 의 규격이 `cableTool` 로 prefill (`defaultSpec` prop)
  - **`route_type` → `installation_type` 일원화** — LGU+ 광망 범례의 「설치구분별 형태」 (가공·구내·해저·입상·지중). `route_type` DB 컬럼은 legacy 로 방치, UI·신규 입력은 `installation_type`
  - [cable-actions.ts](src/app/relocation/[id]/cable-actions.ts) — `parseCableForm` 에 `installation_type` enum 검증, create/update insert 에 반영
  - 캔버스 케이블 line `edgeStyle(spec, status, installationType)` — **색=규격 · dash=설치구분**(`installationTypeDash`: 가공/구내/해저 solid·입상 dotted·지중 dashed) **· width·opacity=상태**(신설 두껍게·철거 흐리게 opacity 0.45)
  - [CablesTab.tsx](src/app/relocation/[id]/CablesTab.tsx) create/edit 폼도 `route_type` select → `installation_type` select 로 교체
  - seed-actions 의 케이블 시드는 legacy `route_type` 그대로 (DB 컬럼 존재 → 동작엔 영향 없음. 캔버스 dash 만 미표시)

- ✅ **Step C-2.1 케이블 경로 (polyline) + waypoint 편집** (2026-05-20, owner 요청 — 도로 경로 대응):
  - owner: 케이블 양끝은 시설 위치 자동, 연결 후 중간 경로를 길에 맞춰 수정 (지도 연동 대비)
  - 마이그 0042 — `relocation_cables.waypoints jsonb` (중간 꺾임점 `[{x,y}]`. 시작·끝점은 시설 위치 derive — 시설 이동 시 자동 추종)
  - [position-actions.ts](src/app/relocation/[id]/position-actions.ts) `saveCableWaypoints` server action
  - [TopologyCanvas.tsx](src/app/relocation/[id]/TopologyCanvas.tsx):
    - 케이블 렌더 `<line>` → `<polyline>` (점 배열 = `[출발시설중심, ...waypoints, 도착시설중심]` — `cablePathPoints`)
    - **케이블 클릭 = 경로 편집 선택** (`selectedCableId`, 시설 선택 `selectedId` 와 상호 배타). 선택 시 파란 굵은 후광
    - **선분 클릭 = waypoint 추가** (클릭한 선분 위치에 삽입), **점 드래그 = 이동**, **점 우클릭 = 삭제**
    - 선분별 투명 굵은 hit area (strokeWidth 14) 로 가는 케이블도 클릭 쉽게
    - `cableWaypoints` 로컬 override state — positions 와 동일 패턴 (드래그 부드럽게 + router.refresh 후 새 데이터 반영). `waypointDragRef` 로 onPointerMove/Up 분기 (노드드래그 / waypoint드래그 / pan 3-way)
  - [page.tsx](src/app/relocation/[id]/page.tsx) cables fetch 에 waypoints, CableEdge 매핑

- ✅ **Step C-2.2 좌측 시설 목록 사이드바** (2026-05-20, owner 요청):
  - [TopologyCanvas.tsx](src/app/relocation/[id]/TopologyCanvas.tsx) SVG 영역을 가로 flex 로 — 좌측 `aside` 시설 목록 + 우측 SVG
  - 카테고리 5 그룹별 시설 리스트 (색 dot + 번호 S-001 + 이름). `facilitiesByCategory` useMemo
  - 시설 클릭 → `focusFacility` — viewport 를 그 시설이 화면 중앙에 오도록 이동 (줌 레벨 유지) + 선택 표시
  - `sidebarCollapsed` 토글 — 접으면 SVG 위 absolute 「▶ 시설 목록」 버튼으로 다시 펼침
  - fullscreen 모드에서도 사이드바 유지

- ✅ **Step C-2.3 케이블 클릭 수정 + 겹침 분리 + 연결 직관화** (2026-05-20, owner 피드백):
  - **케이블 클릭 안 되던 버그** — 케이블 위 pointerdown 이 SVG 까지 bubble → `onSvgPointerDown` 이 `setPointerCapture` 호출 → 후속 click 이 SVG 로 가로채짐. `onSvgPointerDown` 에 `if (e.target !== svgRef.current) return` 추가 — SVG 배경 직접 클릭일 때만 pan 시작
  - **같은 경로 여러 케이블 겹침** — `cableOffsets` useMemo: 같은 (from,to) 쌍 그룹의 케이블들을 수직 offset (`CABLE_OFFSET_GAP` 7px) 으로 평행 분리. waypoint 있는 케이블은 offset 안 함 (사용자 경로 존중)
  - **동일 시설 연결 직관 확인**: (a) 시설 노드 우상단에 **연결 케이블 수 배지** (teal 원, `facilityCableCount`) (b) 시설 선택 시 그 시설에 연결된 케이블 **amber 후광 강조** (`linkedToSelectedFacility`, `LINKED_COLOR`)

- ✅ **Step C-2.4 케이블 정보 패널 — 정산 거리 + 수정 + 삭제** (2026-05-20, owner 요청):
  - owner: 정산 시 기별명세서 — 케이블 구간별 거리 필요. 경로점이 전주면 전주명 + 시설~전주 / 전주~전주 구간 거리. 구간 합 = 케이블 전체거리, 불일치 시 설계자 결정
  - 마이그 0043 — `relocation_cables.total_length` (케이블 전체 실제 거리) + `end_distance` (마지막 경로점→도착시설 구간). 중간 구간거리·전주명은 waypoints jsonb 확장 (`{x,y,pole_name,dist}` — `dist`=직전 점→이 점 구간거리)
  - [cable-actions.ts](src/app/relocation/[id]/cable-actions.ts) — `updateCableFromCanvas` (규격·상태·설치구분·전체거리·waypoints 한 번에, JSON 반환) · `deleteCableFromCanvas` (JSON 반환). 기존 `deleteCable`(redirect) 은 CablesTab 용으로 유지
  - 신규 [CableInfoPanel.tsx](src/app/relocation/[id]/CableInfoPanel.tsx) — 케이블 클릭 시 캔버스 **우측 컬럼** 패널 (사이드바·캔버스·패널 가로 flex 3컬럼):
    - 규격·상태·설치구분·전체거리 수정
    - 경로점별 전주명 + 구간거리 입력 (시작→wp1→...→wpN→도착, 구간 N+1개)
    - 구간 합계 vs 전체거리 비교 — 불일치 시 amber 경고 + 「전체거리를 합계로 맞추기」 버튼
    - 케이블 삭제 (confirm 가드)
  - `saveCableWaypoints` 도 pole_name·dist 보존하도록 형식 확장 (캔버스 드래그 시 거리정보 안 날아감)
  - 케이블 선택(`selectedCableId`) 시 패널 마운트 — key=`{id}-{waypoint수}` 로 경로점 추가/삭제 시 재초기화
  - **케이블 클릭 디버깅** (owner 피드백 2회): (1) `onSvgPointerDown` 이 `setPointerCapture` 로 click 을 가로채던 문제 → SVG 배경 직접 클릭일 때만 pan 시작 (2) hit area `pointer-events="all"` + 보이는 polyline 에도 onClick (3) 패널이 `absolute` + `max-h-[calc(100%-1rem)]` 의 % 가 0 으로 접히던 문제 → flex 우측 컬럼 레이아웃으로 전환 (h-full)
- ✅ **Step C-2.5 접속함체 정보 패널 — 공종량·자재 (기별명세서)** (2026-05-20, owner 요청):
  - owner: "접속함체 선택했을 때 우상단에 정보 패널 추가. 접속함체도 접속작업 여부에 따라 기별명세서에 자재·공종량이 작성돼야 하니 감안해서."
  - 마이그 [`0044_relocation_facility_materials.sql`](./supabase/migrations/0044_relocation_facility_materials.sql) — `relocation_facility_materials` 신규 테이블 (시설별 사용 자재, 자유 텍스트 — 회사 자재 마스터와 FK 연결 안 함). 공종량은 0037 의 `relocation_facility_tasks` 재사용
  - server actions:
    - [facility-actions.ts](src/app/relocation/[id]/facility-actions.ts) — `updateFacilityFromCanvas` (이름·함체규격·비고, JSON 반환) · `deleteFacilityFromCanvas` (JSON 반환, FK 위반 친절 메시지). 기존 `updateFacility`/`deleteFacility`(redirect) 은 FacilitiesTab 용으로 유지
    - 신규 [facility-task-actions.ts](src/app/relocation/[id]/facility-task-actions.ts) — `addFacilityTask`(upsert, facility_id+task_type_id unique) · `removeFacilityTask` · `addFacilityMaterial` · `removeFacilityMaterial`
  - 신규 [FacilityInfoPanel.tsx](src/app/relocation/[id]/FacilityInfoPanel.tsx) — `CLOSURE_TYPE_CATEGORY === '접속함체'` 인 시설 선택 시 캔버스 **우측 컬럼** 패널 (CableInfoPanel 과 동일 패턴):
    - 기본 정보 수정 (이름·함체 규격·비고)
    - 공종량 섹션 — 공종 마스터(회사 단위) 드롭다운 + 수량. 예상 작업시간 합계(분) 표시 (차수 계획 참고)
    - 사용 자재 섹션 — 자재명·규격·수량·단위 자유 입력
    - 시설 삭제 (confirm 가드)
  - [page.tsx](src/app/relocation/[id]/page.tsx) — `relocation_task_type_master`(회사) + `relocation_facility_tasks` + `relocation_facility_materials` fetch → TopologyCanvas 전달. facilities 매핑에 closure_spec·notes 추가
  - selectedId(시설) 와 selectedCableId(케이블) 는 상호 배타 — 패널 1개만 표시
  - **패널 접기/펼치기** (후속) — CableInfoPanel·FacilityInfoPanel 헤더에 `>` 접기 버튼. 접으면 폭 36px 세로 스트립(세로 라벨). `infoPanelCollapsed` 공유 state — 선택 바꿔도 유지
- ✅ **Step C-2.6 고장점 검색 — 회선(코어연결) 기준** (2026-05-20, owner 요청):
  - owner: "고장점 확인용 검색 기능 필요" — OTDR 측정 거리로 고장점의 물리적 위치 추정. 앞서 정한 「기설 케이블 거리 = 함체 간 거리 파악·검색용」 규칙의 실제 활용처
  - **핵심 결정 (owner)**: 고장점은 **케이블 물리 연결이 아니라 회선(코어)연결 기준**. OTDR 빛은 회선이 실제 지나는 코어 경로를 따라가므로, 경로는 회선의 코어 배정(`relocation_core_assignments`)이 `segment_idx` 순으로 이루는 케이블 체인이어야 함
  - [FaultSearchPanel.tsx](src/app/relocation/[id]/FaultSearchPanel.tsx) — **캔버스 우측 컬럼 패널** (헤더 「고장점 검색」 버튼으로 토글). **읽기 전용 클라이언트 계산**
    - **선택 드릴다운 = ① 시설물 → ② 그 시설물에 연결된 케이블 → ③ 케이블의 코어선번별 회선**. 캔버스에서 시설물·케이블 직접 클릭도 같은 드릴다운에 반영 (시설 클릭=step1, 케이블 클릭=step1+2)
    - 회선 선택 → `buildCircuitPath` 가 그 회선의 코어 배정(segment_idx 순) → 케이블 체인 → 시설 경로 구성. 인접 케이블의 공유 시설로 방향 자동 판정. 경로가 끊기면 안내
    - 측정 기준 끝 토글(`fromEnd`) — 회선 경로의 어느 끝에서 OTDR 쟀는지
    - 고장점 — 측정 거리 입력 → 경로 구간 누적해 D 가 떨어지는 케이블·구간 산출. waypoints 의 전주명·구간거리(`dist`)로 전주 단위까지 좁힘. `orientedSegments` 가 traverse 방향(정/역) 정렬
    - **패널 너비 조절** — 좌측 가장자리 드래그 핸들 (`width` state, 260~680px). 드릴다운 진행 중에도 캔버스에 선택한 시설·케이블 하이라이트
  - 케이블 거리는 `total_length` 우선, 없으면 waypoints `dist` 합 (CableInfoPanel 입력값)
  - [page.tsx](src/app/relocation/[id]/page.tsx) — `relocation_core_assignments` 를 항상 fetch (기존엔 cores·migrations 탭만) → TopologyCanvas → FaultSearchPanel 전달
  - **변천**: 처음 별도 「고장점」 탭(케이블 BFS·시설 start/end 클릭) → owner 요청으로 ① 캔버스 우측 패널로 이전 ② 회선(코어연결) 기준으로 재설계 ③ 시설물→케이블→회선 드릴다운 + 패널 너비 조절. 탭 제거, FaultSearchTab→FaultSearchPanel
- ✅ **Step C-2.7 캔버스 하이라이트 + 전 시설 정보 패널** (2026-05-20, owner 요청):
  - **고장점 검색 결과 캔버스 하이라이트**:
    - 신규 [HighlightContext.tsx](src/app/relocation/[id]/HighlightContext.tsx) — `HighlightProvider` + `useHighlight`. FaultSearchTab(탭)·TopologyCanvas(캔버스)가 다른 패널이라 page 의 CollapsibleLayout 을 감싸는 context 로 연결
    - FaultSearchTab — 경로/고장점 계산 결과를 `useEffect` 로 context 에 push. 탭 떠나면(언마운트) 해제
    - TopologyCanvas — 경로 케이블 violet 글로우 + 경로 시설 violet 링 + 고장점 빨강 십자선 마커. 마커는 `pointAlongPolyline` 으로 케이블 polyline arc-length 비율 위치에 표시 (캔버스는 schematic 이라 근사). 새 검색 시 해당 경로로 viewport 자동 fit
  - **전 시설 정보 패널** — FacilityInfoPanel 을 접속함체뿐 아니라 **모든 시설 종류**에서 노출 (owner: "함체뿐 아니라 모든 시설물"). TopologyCanvas 의 `CLOSURE_TYPE_CATEGORY === '접속함체'` 게이트 제거
    - 함체 규격 필드는 접속함체 종류에만 표시 (`isClosure`)
    - 설치 주소·위치 필드 신규 (모든 종류). `updateFacilityFromCanvas` 에 `install_address` 추가
    - 헤더·라벨 「접속함체 정보」 → 「시설 정보」. 공종량 안내문 일반화
- ✅ **Step C-3 코드** (2026-05-20): 케이블 정보 패널에 회선·코어 인라인 입력 폼 — 워크플로우 3단계 (종단 케이블에 회선·사용코어 입력)
  - server actions [core-actions.ts](src/app/relocation/[id]/core-actions.ts) — `addCoreAssignmentFromCanvas` (JSON 반환. 새 회선번호 입력 시 회선 즉시 생성, 같은 번호 있으면 재사용. 코어 범위 중복 = exclusion constraint 친절 메시지) · `removeCoreAssignmentFromCanvas`
  - [CableInfoPanel.tsx](src/app/relocation/[id]/CableInfoPanel.tsx) — 케이블 클릭 시 우측 패널에 「회선·코어 배정」 섹션. 기존 배정 목록(코어범위·회선·구분·종단 배지·삭제) + 「추가」 폼 토글 (회선 select 또는 「+ 새 회선 입력」·시작/끝 코어·구분(lifecycle)·세그먼트·종단 체크박스). 종단 체크 기본 ON
  - [TopologyCanvas.tsx](src/app/relocation/[id]/TopologyCanvas.tsx) — `circuits`·`coreAssignments` 를 CableInfoPanel 에 전달. `coreAssignments` 프롭 타입을 `CanvasCoreAssignment` (id·lifecycle·is_terminal 포함)로 확장. 케이블 라벨에 회선·코어 배정 수 teal 배지 (`회선 N`). 코어 add/remove 후 `router.refresh()` (패널 유지)
  - CoresTab 의 전체 편집 흐름은 그대로 — 패널은 add/list/remove 만 (작업자 흐름 단순화)
- ✅ **고장점 검색 — 끊긴 중간경로 추정 표시** (2026-05-20, owner 요청): 중간 케이블이 삭제돼 회선 코어 체인이 끊겨도 에러로 중단하지 않고 추정 경로로 이어 표시
  - `buildCircuitPath` 재작성 — 인접 세그먼트가 시설을 공유하지 않으면 에러 대신 `gap leg` 삽입. 끊긴 케이블 방향은 다음 세그먼트와 공유하는 시설을 exit 으로 추정. 양쪽 연결 구간은 정상 추적 유지
  - [HighlightContext.tsx](src/app/relocation/[id]/HighlightContext.tsx) — `CanvasHighlight` 에 `gaps: {fromId,toId}[]` 추가
  - [TopologyCanvas.tsx](src/app/relocation/[id]/TopologyCanvas.tsx) — gap 을 amber 점선 + 방향 화살표 + 「추정경로」 라벨로 렌더 (끊긴 양쪽 시설 중심을 연결)
  - [FaultSearchPanel.tsx](src/app/relocation/[id]/FaultSearchPanel.tsx) — 회선 경로 시설 체인에서 gap 구간은 amber `⇢`, 상단에 끊긴 곳 수 경고 배너, leg 목록에 점선 「추정 중간경로」 행, 고장점 측정값이 gap 에 도달하면 `kind:'gap'` 결과 — 「약 N m 까지 정상 추적, 이후 끊긴 중간경로 부근 추정」 안내
- ✅ **Step C-4 — 자동 코어 배정 (2026-05-21)**: 종단 2개를 잇는 경유 케이블에 빈 코어 자동 배정. 마이그 없음 (기존 테이블만 사용)
  - 순수 알고리즘 [`src/lib/relocation-auto-assign.ts`](./src/lib/relocation-auto-assign.ts) — 케이블 그래프 BFS(`findCablePath`, 케이블끼리 시설 공유 시 인접) + 빈 코어 탐색(`findFreeCores`, 작은 번호 우선) + 계획 수립(`planAutoAssignments`)
  - 종단(`is_terminal`)을 (회선·세그먼트)로 그룹핑 → 종단이 양 끝 케이블 **정확히 2개**에 분포해야 처리 (1코어 회선=케이블당 1행, 2코어=2행). 코어 수는 종단 케이블의 종단 행 수로 산출. 철거(`removing`) 케이블은 경유 제외 (종단 케이블은 허용). 경유 케이블엔 코어 1개=1행으로 배정. 빈 코어 부족 시 그 회선 전체 건너뜀 (all-or-nothing)
  - server action [`auto-assign-actions.ts`](./src/app/relocation/[id]/auto-assign-actions.ts) `runAutoAssign` — 기존 자동 배정(`is_auto_assigned=true`) 삭제 후 재계산 (재실행 idempotent). 사람 입력(`is_auto_assigned=false`)·종단·기설(`preexisting`)은 보존. JSON 요약 반환
  - [`AutoAssignButton.tsx`](./src/app/relocation/[id]/AutoAssignButton.tsx) — 코어배정 탭 상단 「자동 배정 실행」 버튼 (confirm 가드 + 토스트 요약 + 건너뛴 회선 사유 표시)
  - 결과 미리보기 모달(사양 § 7-5-7)은 v1 생략 — 재실행 idempotent + ⚡ 배지로 식별·삭제 가능. 필요 시 후속
- ✅ **코어 입력 단순화 (2026-05-21)**: owner 결정 — **한 케이블·한 회선(세그먼트)은 코어 1개만 사용**. 코어 배정 입력을 「시작 코어 / 끝 코어」 두 칸 → 「코어 번호」 한 칸으로 ([CableInfoPanel](./src/app/relocation/[id]/CableInfoPanel.tsx)·[CoresTab](./src/app/relocation/[id]/CoresTab.tsx)·[core-actions](./src/app/relocation/[id]/core-actions.ts) `core_no` 필드). 2코어·이원화 회선은 코어마다 행을 나눠 입력. DB `core_range_start/end` 범위 컬럼·exclusion constraint 는 그대로 두고 start=end 로 저장 (마이그 없음). auto-assign(C-4)도 이 모델대로 2026-05-21 재작업 — 1코어·2코어 회선 모두 지원
- ✅ **Step C-5 — 카카오맵 연동 (Phase 1·1B·2·3·4 완료, 2026-05-20)** — 📋 계획: [docs/KAKAO_MAP_PLAN.md](./docs/KAKAO_MAP_PLAN.md)
  - **방식 (Option B)**: 카카오맵을 `TopologyCanvas` SVG 뒤 배경으로 통합. 상단 툴바 「도식/지도」 토글. 지도 모드는 시설 GPS(lat/lng)를 화면 픽셀로 투영(`containerPointFromCoords`)해 SVG 오버레이로 그림 — 29종 도형·케이블·정보 패널·고장점 검색 전부 지도 위에서 작동. 도식 모드는 무수정.
  - **신규 파일**: [`useKakaoMap.ts`](./src/app/relocation/[id]/useKakaoMap.ts) (지도 인스턴스 훅 — epoch 카운터로 pan/zoom 시 오버레이 재투영, 콜백 ref 로 컨테이너 전달) · [`MapSearchBox.tsx`](./src/app/relocation/[id]/MapSearchBox.tsx) (주소 Geocoder + 건물명 Places 검색) · [`canvas-data.ts`](./src/app/relocation/[id]/canvas-data.ts) (캔버스 8개 쿼리 공용 로더 — page.tsx·canvas 라우트 공유) · [`canvas/page.tsx`](./src/app/relocation/[id]/canvas/page.tsx) 전용 라우트
  - **Phase 1**: 지도 위 도형·케이블 표시 + 주소·건물명 검색. SVG 는 지도 모드에서 viewBox 생략(자연 1:1 px 좌표) + `pointer-events:none`(빈 영역 클릭은 지도로 통과), 시설·케이블만 개별로 pointer-events 켬
  - **Phase 2**: 지도에서 시설 배치 — 「미배치 N」 패널(일괄 펼치기 / 개별 「배치」 후 지도 클릭) + 마커 드래그 이동(드롭 픽셀 → GPS 역변환 `coordsFromContainerPoint` → `updateFacilityLatLng`)
  - **Phase 3**: 지도에서 시설·케이블 추가 — 도구 패널을 지도 모드에도 노출. 시설 종류 선택 → 지도 클릭으로 배치(`createFacilityAtLatLng` 확장: 마스터·규격·주소 수용), 케이블 규격 선택 → 시설 2개 클릭으로 연결
  - **Phase 4**: 지도에서 케이블 경로(waypoint) 편집 — `relocation_cables.waypoints` 가 jsonb 라 마이그 없이 경로점에 `lat`/`lng` 추가. 선분 클릭=경로점 추가 · 점 드래그=이동 · 우클릭=삭제. position-actions·cable-actions·CableInfoPanel 모두 lat/lng 보존
  - **Phase 1B**: 전용 캔버스 라우트 [`/relocation/[id]/canvas`](./src/app/relocation/[id]/canvas/page.tsx) — 프로젝트 페이지 헤더 「넓은 화면으로 열기」(새 탭). 앱 메뉴 없이 캔버스만, `initialCanvasSize='tall'`(90vh)로 크게 열림. BottomNav 는 이 라우트에서 숨김
  - **마이그**: [`0045_relocation_facility_geo.sql`](./supabase/migrations/0045_relocation_facility_geo.sql) — `relocation_facilities.lat`/`lng` (owner 실행 완료). Phase 2~4 는 추가 마이그 없음 (waypoints 는 jsonb)
  - **삭제**: 1차 시도의 `MapCanvas.tsx`·`RelocationCanvas.tsx`
  - **레이아웃 노하우** (정보 패널 잘림 디버깅 — owner 3회 반복 보고로 확인): 다단계 `flex-1`/`height:100%` 높이 체인은 일부 브라우저(크롬)에서 안쪽 자식까지 확정 높이를 전달 못 함 → 패널이 화면 밖으로 늘어남. **해결: 별도 레이아웃을 만들지 말고 검증된 코드 경로 재사용.** 캔버스 행은 명시적 `vh` 높이(`CANVAS_SIZE_HEIGHT`), 전용 라우트도 임베드 모드 그대로 쓰고 `initialCanvasSize` 만 다르게. 정보 패널 루트는 `h-full` 빼고 flex `stretch`+`min-h-0`+`overflow-y-auto`
  - **운영**: 카카오 JS 키·웹 도메인·`NEXT_PUBLIC_KAKAO_MAP_KEY`(.env.local + Vercel) 등록 완료
- ✅ **Step C-5.1 — 지도 모드 UX 일괄 보강 (2026-05-20)** (마이그 없음, [`TopologyCanvas.tsx`](./src/app/relocation/[id]/TopologyCanvas.tsx)·[`useKakaoMap.ts`](./src/app/relocation/[id]/useKakaoMap.ts)·[`CollapsibleLayout.tsx`](./src/app/relocation/[id]/CollapsibleLayout.tsx)·프로젝트 폼)
  - **지도 줌**: fit 시 `MAP_FIT_ZOOM_IN_STEPS=2` 만큼 더 확대 (setBounds 후 level 축소). 빈 프로젝트는 생성 시 level 3.
  - **시설물 줌 연동 축소**: 지도 축소(level 증가) 시 시설 도형도 함께 축소. 배율 = `MAP_NODE_SCALE_STEP(0.82) ^ (기본 단계 + 줌 단계)`. `MAP_NODE_BASE_SCALE_STEPS=2`(기본 ≈67%), `MAP_NODE_SCALE_MAX_STEPS=2`(2단계까지 추가 축소 후 최소 고정). 도형은 노드 중심 기준 scale → 케이블 연결점(GPS 투영점) 불변. `mapBaseLevel`(fit 직후 level) 기준.
  - **시설 라벨 글자 고정**: 도형은 축소돼도 글자(시설코드·시설명)는 원래 크기 유지 — 도형은 안쪽 scale 그룹, 라벨은 그룹 밖 별도 렌더 + y 위치만 축소 따라감. 배경 지도 글자와 구분 위해 흰색 외곽선(`paintOrder=stroke`, `LABEL_HALO_WIDTH=3`) + 시설명 fontWeight 600.
  - **패널 기본 접힘**: `CollapsibleLayout` 상·하단(집중 모드)·`toolsCollapsed`(시설·케이블 추가)·`sidebarCollapsed`(시설 목록) 모두 기본 접힘 — 설계 화면 진입 시 캔버스 집중.
  - **검색창 중앙 최상단 floating**: 캔버스 위 별도 바 → 지도 위 floating 오버레이(검색 + 미배치 패널). 가운데 정렬은 in-flow `relative` 블록 + `flex justify-center` (absolute + `left-0 right-0`/`left-1/2 -translate-x-1/2` 는 폭이 안 늘어나 정렬 실패 — owner 3회 보고). 래퍼 `pointer-events-none`/검색창 `pointer-events-auto` 로 빈 좌우는 지도 통과.
  - **지도 초기 위치**: 서울 시청 → `경기도 시흥시 미산로 62` (모든 프로젝트 공통). `useKakaoMap` 이 Kakao Geocoder 로 주소 변환 후 `ready` 처리 → `fitMapToFacilities` 와 경합 회피 (시설 있는 프로젝트는 fit 이 덮어씀). 지오코딩 실패 시 폴백 좌표(37.4243, 126.7929).
  - **프로젝트 생성 폼**: 제목·지역 placeholder 예시 제거. `현장답사일` → `공사계약일` 라벨 변경 (생성·상세 폼, 목록 카드·헤더 표시 텍스트). DB 컬럼·폼 필드명 `surveyed_at` 은 식별자라 유지.
- ✅ **Step D-1 — 자동 검증 (2026-05-21)**: 설계 검증 룰 엔진 + 검증 탭. 마이그 없음
  - 순수 엔진 [`src/lib/relocation-verify.ts`](./src/lib/relocation-verify.ts) `runVerification` — 룰 8종: C1·C2(함체 케이블·접속 코어 한도, 빨강) · C3(신설 분기 4조 초과, 노랑) · S1(함체 규격, 노랑) · R1(RN 스플리터 입력 다이버시티, 빨강) · D1·D2(이원화 회선 케이블·함체 분리, 빨강) · T1(작업 함체 공종 수량 미입력, 노랑)
  - O1·E1(코어 중복·기설 보존)은 DB exclusion constraint 가 강제 → 검증 탭 안내문으로만 표시. U1·U2(유니트·여장판 최적화)는 splice 입력 흐름 후 후속
  - [`VerifyTab.tsx`](./src/app/relocation/[id]/VerifyTab.tsx) — 검증 탭 (오류·주의 카운트 + 발견 항목 카드). [page.tsx](./src/app/relocation/[id]/page.tsx) 가 verify 탭일 때 splices·splitters 추가 조회 후 `runVerification` 실행
- ✅ **Step D-2 — 차수 자동 분할 (2026-05-21)**: 시설별 공종량으로 차수(새벽 02~05시 시공 단위) 자동 분할. 마이그 없음 (0038 테이블 사용)
  - 순수 알고리즘 [`src/lib/relocation-phase-planner.ts`](./src/lib/relocation-phase-planner.ts) `planPhases` — 시설별 작업시간을 받아 FFD(First-Fit-Decreasing) 빈패킹. 가장 큰 시설이 들어갈 최소 팀 수(2~4) 자동 결정, 차수 가용 = 팀 수 × 180분
  - server action [`phase-actions.ts`](./src/app/relocation/[id]/phase-actions.ts) `runPhasePlanning` — 시설별 공종량(`relocation_facility_tasks` × `task_type_master.standard_minutes`) 합계를 작업시간으로 산출 → `planPhases` → 기존 차수 삭제 후 `relocation_phases` + `relocation_phase_tasks` 생성 (재실행 idempotent). task_kind 는 신설 케이블 연결 시 '함체신설_절단' 그 외 '기설접속'
  - [`PhasesTab.tsx`](./src/app/relocation/[id]/PhasesTab.tsx) + [`PhasePlanButton.tsx`](./src/app/relocation/[id]/PhasePlanButton.tsx) — 차수 탭. 「차수 자동 분할」 버튼 + 요약
  - **차수 재조정 (2026-05-21)**: 실 시공 시 차수별 투입 가능 팀 수가 달라지는 것 대응. [`PhaseBoard.tsx`](./src/app/relocation/[id]/PhaseBoard.tsx) (client) — 차수별 「투입 팀」 1~4 조정 + 「차수 재조정」(설정 팀 수 용량대로 FFD 재패킹, 초과분은 새 차수) + 시설 수동 이동(차수 select) + 빈 차수 삭제. 알고리즘 `rebalanceIntoPhases`, server action `updatePhaseTeams`·`rebalancePhases`·`movePhaseTask`·`deletePhase`. 수동 이동으로 용량 초과 시 빨강 경고만 표시
- ✅ **P0-1 — 동시작업 페어링 + 작업 지시서 (2026-05-21)**: 전문가 검토 P0 반영. 마이그 없음 (0038 컬럼 사용)
  - **동시작업 그룹** — `buildSimultaneityGroups` ([phase-planner](./src/lib/relocation-phase-planner.ts)): 절체 대상 케이블(status≠기설)로 연결된 시설을 union-find 연결요소로 묶음. 한 케이블 양끝 함체가 다른 차수로 갈리면 회선 단절 → 차수 분할이 **그룹을 한 단위로** 패킹 (시설 단위 X). `runPhasePlanning`·`rebalancePhases` 둘 다 `buildGroupUnits`로 그룹 패킹, `phase_tasks.simultaneity_group` 기록
  - **작업 지시서** — [`/relocation/[id]/phases/[phaseNo]/instructions`](./src/app/relocation/[id]/phases/[phaseNo]/instructions/page.tsx): 차수별 현장 문서. 동시작업 그룹별로 시설·공종·시간 묶어 출력 + 인쇄([`PrintButton`](./src/app/relocation/[id]/PrintButton.tsx)). 차수 카드(PhaseBoard)에 「작업 지시서」 링크 + 「묶음 N」 배지
  - ⚠️ 후속: 의존성 DAG(신설→절체 선후), `relocation_task_pairs`(회선별 양끝 코어 명시), per-팀·짝 작업자 연락처는 팀-작업자 배정 기능 후
- ✅ **Step E-1 — 기별명세서 내보내기 (2026-05-21)**: 내보내기 탭 = 정산 문서. 마이그 없음
  - [`ExportTab.tsx`](./src/app/relocation/[id]/ExportTab.tsx) — 설계 요약(시설·케이블·회선·코어배정 수) + 케이블 포설 명세(status≠기설 — 구간·규격·상태·설치구분·거리 + 총 포설거리) + 함체별 공종 명세 + 함체별 자재 명세. 각 섹션 화면 표 + CSV 다운로드. 데이터는 canvas-data 재사용 (추가 쿼리 없음)
  - CSV Route Handler [`/api/reports/relocation-statement`](./src/app/api/reports/relocation-statement/route.ts) — `?project=&type=cable|task|material`. UTF-8+BOM+CRLF (csv.ts), 회사 스코프는 relocation_* RLS 강제
  - 기설(existing) 케이블은 정산 미반영 (포설 = Σ total_length where status≠existing)
- ✅ **접속(splice) 입력 기능 (2026-05-21)**: 직선도 탭 = 함체 안 입력 케이블 코어 ↔ 출력 케이블 코어 접속 매핑. 마이그 없음 (0037 `relocation_splices` 사용)
  - server action [`splice-actions.ts`](./src/app/relocation/[id]/splice-actions.ts) `createSplice`·`deleteSplice` (JSON 반환)
  - [`SpliceTab.tsx`](./src/app/relocation/[id]/SpliceTab.tsx) (client) — 함체·시설 선택 → 그 시설 접속 목록 + 추가 폼 (입력 케이블·코어 → 출력 케이블·코어, 연속 코어 체크). 연결 케이블만 in/out select 에 표시
  - [page.tsx](./src/app/relocation/[id]/page.tsx) — 직선도(splice) 탭일 때 splices 조회. `TabPlaceholder` 제거 (전 탭 구현 완료)
  - 검증 룰 C2·U1·U2, 차수 동시작업 페어링, 직선도 SVG 의 입력 데이터원
- ✅ **Step E-2 직선도 시각화 (2026-05-21)**: [`SpliceDiagram.tsx`](./src/app/relocation/[id]/SpliceDiagram.tsx) — 함체 접속(splice)을 입력 코어 ↔ 출력 코어 단선결선도(bipartite SVG)로 렌더. 좌=입력 케이블·코어, 우=출력 케이블·코어 (케이블별 정렬), 접속선 색은 연속(초록)/비연속(주황), 케이블은 C1·C2 태그+색. SpliceTab(직선도 탭)에 함체 선택 시 표시
- ⏳ **Step E-2 후속**: 직선도·코어구성도 SVG 파일·도면 PDF 다운로드 (현재는 화면 시각화까지). 코어구성도 토폴로지는 도식/지도 캔버스가 시각화 제공 중
- ✅ **P0-2 — LGU+ 표준 템플릿 임포터 (2026-05-21)**: 전문가 검토 P0 반영. 시설·케이블·회선 CSV 일괄 등록. 마이그 없음
  - owner 결정: **표준 템플릿 방식** — edenMG 양식 제공, LGU+ 데이터를 맞춰 채워 업로드 (자재·재고 임포트와 동일 패턴)
  - server action [`import-actions.ts`](./src/app/relocation/[id]/import-actions.ts) — `importRelocationFacilitiesCsv`·`importRelocationCablesCsv`·`importRelocationCircuitsCsv`. 행 단위 검증 (오류 행 건너뛰고 사유 보고, 정상 행만 등록). 종류·상태·종류 enum 은 값·한국어 라벨 둘 다 허용. 시설 번호는 카운터에서 일괄 발급. 케이블은 시설 이름으로 매칭 (이름 중복 시 오류)
  - 템플릿 CSV [`/api/templates/relocation-import.csv`](./src/app/api/templates/relocation-import.csv/route.ts) — `?type=facilities|cables|circuits`
  - [`/relocation/[id]/import`](./src/app/relocation/[id]/import/page.tsx) + [`RelocationImportClient.tsx`](./src/app/relocation/[id]/RelocationImportClient.tsx) — 시설→케이블→회선 3섹션 (템플릿 다운로드·업로드·결과). 프로젝트 헤더에 「데이터 가져오기」 진입점
- ✅ **P1 — 검증 강화 (2026-05-21)**: 전문가 검토 P1. 마이그 없음
  - 검증 룰 추가 ([relocation-verify.ts](./src/lib/relocation-verify.ts)) — **U1**(접속 코어가 여러 유니트에 분산, 노랑) · **U2**(접속이 여장판 1매 초과, 노랑) · **T2**(회선 종단 표시 불완전 — 코어 배정 있는데 종단 케이블 ≠ 2개, 노랑). splice 데이터 기반. 누적 룰 11종
  - **검증 게이트** ([relocation/actions.ts](./src/app/relocation/actions.ts) `updateProject`) — 프로젝트를 「확정」·「시공중」 으로 바꿀 때 `runVerification` 실행, 빨강 오류가 1건이라도 있으면 차단하고 검증 탭으로 이동. 시공 사고 방지
- ✅ **차수 시간대 (2026-05-21)**: 야간 작업이 02~05시 고정이 아니라 가변임을 반영. 마이그 [`0046_facility_work_window.sql`](./supabase/migrations/0046_facility_work_window.sql)
  - **차수별 시간대 편집** — `relocation_phases.window_start/end`(컬럼 기존) 를 PhaseBoard 에서 차수마다 `<input type=time>` 으로 편집. 차수 용량 = 팀 수 × 시간대 길이(`windowMinutes`, 자정 넘김 처리). `updatePhaseWindow` server action. 차수 재조정(`rebalanceIntoPhases`)이 차수별 시간대를 보존·반영
  - **시설 작업가능 시간대** — 마이그 0046 `relocation_facilities.work_window_start/end` (특정 시간대만 작업 가능한 시설). 시설 탭 편집 폼에서 입력
  - **시간대 충돌 경고** — 차수 탭(PhaseBoard) 에서 시설의 작업가능 시간대가 배정된 차수 시간대와 안 겹치면(`windowsOverlap`) 작업 행에 「시간대 불가」 빨강 배지. 00시 작업·특정 시간대 작업은 그 시간대로 차수를 만들고 작업 배정

### ✅ 완료 (지장이설 설계 UI/UX 개선 — 7항목 일괄, 2026-05-21)

UI/UX 검토 결과 owner 가 우선순위 순으로 진행하기로 한 7항목. "순서를 보여주고·할 일을 드러내고·중복을 정리" — 비개발자 owner 가 "어디서 뭘 하지" 를 겪지 않도록 정보구조(IA) 정돈. 마이그 없음.

1. **작업 순서 안내** — [`ProgressStepBar.tsx`](./src/app/relocation/[id]/ProgressStepBar.tsx) 신규. 프로젝트 페이지 최상단 항상 표시되는 진행 단계 표시줄 (시설→케이블→회선·코어→검증→차수→내보내기). 데이터 유무로 단계 완료 자동 판정, 각 단계 = 해당 탭 링크. 첫 미완료(또는 검증 빨강 오류) 단계를 「현재」 강조 + 하단에 「다음 할 일: …」 안내문. [page.tsx](./src/app/relocation/[id]/page.tsx) `CollapsibleLayout` 밖에 배치(접기 영향 없음).
2. **탭 바 상태 배지** — `page.tsx` 탭 바에 배지: 「검증」 빨강 오류 수(rose)/주의 수(amber) · 「코어배정」 미배정 회선 수(amber). `runVerification` 을 모든 탭에서 실행(splices·splitters·phases 항상 조회) → 검증/차수/접속 탭 전용 조건부 쿼리 제거·일원화.
3. **시설 목록 중복 제거** — `LeftPanel.tsx` 삭제. 「시설」 탭 목록·캔버스 좌측 사이드바와 3중 중복이었음. bottomPanel grid → 단일 컬럼.
4. **시설 편집기 단일화** — [`FacilityInfoPanel`](./src/app/relocation/[id]/FacilityInfoPanel.tsx) 을 시설의 유일 정식 편집기로 수렴. 「시설」 탭 폼에만 있던 부모 국사·작업 가능 시간대·노란 마크 필드 추가. `updateFacilityFromCanvas` ([facility-actions.ts](./src/app/relocation/[id]/facility-actions.ts)) 에 4필드(closure_type 포함) 추가 + 검증. TopologyCanvas `FacilityNode` 타입·매핑(page.tsx·canvas/page.tsx) 보강, `stations` prop 전달.
5. **프로젝트 정보 폼 접기** — `page.tsx` 하단 프로젝트 정보·삭제 폼을 `<details>` (기본 접힘, summary 「프로젝트 정보·설정」 + Settings 아이콘).
6. **「이전」 탭 라벨** — migration 탭 label 「이전」 → 「철거·이설」 (탭 id `migrations`·DB 무관).
7. **캔버스 컨트롤 정리** — TopologyCanvas 툴바의 캔버스 표시 크기 4단계 컨트롤을 native `<details>` 「⋯ 더보기」 드롭다운으로 묶음 (MoreHorizontal 아이콘). 클릭-아웃 리스너 없는 native disclosure 라 모바일 dropdown 버그 회피.

**부수 개선**: `CollapsibleLayout` 에 `bottomDefaultCollapsed` prop — URL 에 `?tab=` 이 있으면(탭·진행단계 클릭) 하단 패널 펼친 채 시작 → 탭 누를 때마다 다시 펼치는 수고 제거. 프로젝트 fresh 진입(탭 파라미터 없음)은 기존대로 캔버스 집중(접힘).

**기별명세서 정산 규칙** (owner 결정 2026-05-20):
- **광케이블 포설 공종** — 케이블 거리(`relocation_cables.total_length`)로 산출. **단 `status='existing'`(기설) 케이블 거리는 기별명세서 정산에 반영 금지.** 포설 정산 = Σ(total_length where status != existing).
- **기설 케이블 거리의 용도** — 정산이 아니라 「특정 함체 ~ 특정 함체 거리 파악」용. 향후 검색 기능(함체 간 거리 검색)에 활용 예정.
- CableInfoPanel 은 `status='existing'` 이면 거리 입력란을 「함체 간 거리 (검색용)」 로 라벨링 + 「정산 미반영」 안내. 그 외 상태는 「정산 기준 (포설)」.

**미해결 항목** (§ 9 of plan doc):
- 9-1: `1:2:8:4`·`1:3:8:4` 정확한 의미
- 9-2: 576C 케이블 유니트·함체 규격
- 9-3: 양쪽 모두 비연속 코어의 시간
- 9-4: 기설 코어ID 변경 가능 조건
- 9-5: 4분기 초과 승인 절차
- 9-6: 02~05 외 시간대 작업 가능 여부

→ 위 6개는 코드 작업 진행하면서 자연스럽게 채워질 가능성 큼. 합리적 기본값으로 시작 후 owner 검토 시 정정.

**운영 검토** (§ 11 of plan doc): Supabase 무료 플랜은 지장이설 모듈 자체 영향 0 (이미지 미저장). 다만 접속일보 사진 누적이 별도로 6-10개월 안 Storage 한도 도달 가능 → PhotoUploader 클라이언트 압축 권장.

### ✅ 완료 (접속 현황 · 로그 — 베타 사용 모니터링, 2026-05-21)

owner 요구: 베타 운영 중 사용자 경험 반영을 위해 현재 접속자·로그 기록을 관리자만 보게. "너무 복잡하지 않게" → 페이지 단위 분석 대신 접속 상태 + 로그인/로그아웃 기록만.

- **마이그** [`0047_activity_log.sql`](./supabase/migrations/0047_activity_log.sql) — `employees.last_seen_at timestamptz` + `activity_logs` 테이블(login/logout, append-only — update/delete GRANT 미부여) + RLS 2개(select=같은 회사 admin, insert=본인 행).
- **last_seen_at 갱신** [`proxy.ts`](./src/proxy.ts) — 인증된 요청마다 갱신하되 `em_seen` 쿠키(maxAge 300초)로 쿨다운 → 사용자당 최대 5분에 1회 DB 쓰기. 모든 요청마다 쓰지 않음.
- **로그인·로그아웃 기록** [`login/actions.ts`](./src/app/login/actions.ts) — `logActivity` 헬퍼. signIn 성공 후 'login', signOut 전(세션 유효 시)에 'logout' 1행 insert. 실패해도 로그인/로그아웃 흐름은 안 막음.
- **관리자 페이지** [`/admin/activity`](./src/app/admin/activity/page.tsx) — admin 전용. 「현재 접속 중」(last_seen 최근 10분) + 「로그인 기록」(activity_logs 최근 100건). 홈 관리 카드에 「접속 현황 · 로그」 진입점.

### ✅ 완료 (메뉴별 사용량 분석, 2026-05-21)

owner 요구: "어느 메뉴를 많이 쓰는지" 페이지 단위 분석. 접속 현황·로그의 후속.

- **마이그** [`0048_page_views.sql`](./supabase/migrations/0048_page_views.sql) — `page_views` 테이블(방문 1건=1행, append-only) + RLS 2개(select=같은 회사 admin, insert=본인 행) + `page_view_summary(_since)` RPC(경로별 방문수 집계, security definer 아님 → 호출자 RLS 적용).
- **페이지 방문 기록** [`proxy.ts`](./src/proxy.ts) — `isPageNavigation()` 으로 실제 네비게이션만 판별(프리페치·API·자산 제외. 소프트=`rsc` 헤더, 하드=`Accept: text/html`). `after()`(Next.js 16 — 응답 후 비동기)로 page_views insert → **네비게이션 지연 0**. `em_seen` 쿠키 값에 `employeeId.companyId` 를 담아 직원 조회를 캐시(5분).
- **관리자 페이지** [`/admin/activity`](./src/app/admin/activity/page.tsx) — 「메뉴별 사용량」 섹션 추가. 경로를 메뉴(작업관리·차량관리·지장이설 등)로 묶어 막대 랭킹 + 세부 페이지 TOP 12(UUID→`:id` 정규화). 7일/30일 토글.
- **후속 후보**: 사용자별·시간대별 분석은 owner 가 더 깊은 데이터를 원할 때. page_views 누적 시 보존 정책(오래된 행 정리) 검토.

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
  - [`0030_home_card_prefs.sql`](./supabase/migrations/0030_home_card_prefs.sql) — 홈 카드 개인화 (`employees.home_card_prefs jsonb`)
  - [`0031_annual_leaves.sql`](./supabase/migrations/0031_annual_leaves.sql) — 연차 (hire_date · annual_leave_balances · audit · apply_usage RPC)
  - [`0032_service_role_grants.sql`](./supabase/migrations/0032_service_role_grants.sql) — service_role 일괄 GRANT (회원가입 회사 조회 permission denied 해결)
  - [`0033_employee_resignation.sql`](./supabase/migrations/0033_employee_resignation.sql) — employees.resigned_at 컬럼 (퇴사 처리)
  - [`0034_vehicle_retirement.sql`](./supabase/migrations/0034_vehicle_retirement.sql) — vehicles.retired_at + retire_reason (사용 종료·영구 삭제)
  - [`0035_relocation_foundation.sql`](./supabase/migrations/0035_relocation_foundation.sql) — 지장이설 모듈 foundation: enums 9종 + relocation_projects + RLS + GRANT
  - [`0036_relocation_facilities_cables.sql`](./supabase/migrations/0036_relocation_facilities_cables.sql) — 지장이설 시설·케이블·회선·코어배정 + btree_gist + 동일 케이블 코어 범위 중복 금지 exclusion constraint + 시설/케이블 번호 카운터 2종
  - [`0037_relocation_splitters_tasks.sql`](./supabase/migrations/0037_relocation_splitters_tasks.sql) — 지장이설 splices + 1차 RN 스플리터 + 출력 포트 + 공종 마스터(시드 14종) + 시설별 공종 수량
  - [`0038_relocation_phases.sql`](./supabase/migrations/0038_relocation_phases.sql) — 지장이설 차수 + 차수별 작업 + 양쪽 작업자 페어링 (작업 지시서용)
  - [`0039_relocation_migrations.sql`](./supabase/migrations/0039_relocation_migrations.sql) — 지장이설 이전(migration) 워크플로우 audit: relocation_migrations + relocation_migration_circuits
  - [`0040_core_is_terminal.sql`](./supabase/migrations/0040_core_is_terminal.sql) — 지장이설 코어배정 종단 플래그: `relocation_core_assignments.is_terminal boolean` + partial index. **종단은 설계자가 명시** (자동 추론 안 함 — 가입자시설도 통과되는 경우 있음)
  - [`0041_relocation_lgu_legend.sql`](./supabase/migrations/0041_relocation_lgu_legend.sql) — 지장이설 LGU+ 표준 범례 적용: `relocation_closure_type` enum 21 ADD VALUE (국사 4·설치장소 2·모바일국소 8·접속함체 3·RN/IJP/광MUX 5) + `relocation_cables.installation_type text` (가공·구내·해저·입상·지중)
  - [`0042_cable_waypoints.sql`](./supabase/migrations/0042_cable_waypoints.sql) — 지장이설 케이블 경로 waypoint: `relocation_cables.waypoints jsonb` (중간 꺾임점 — 도로 경로 대응)
  - [`0043_cable_distances.sql`](./supabase/migrations/0043_cable_distances.sql) — 지장이설 케이블 정산 거리: `relocation_cables.total_length` + `end_distance` numeric (기별명세서용 구간 거리)
  - [`0044_relocation_facility_materials.sql`](./supabase/migrations/0044_relocation_facility_materials.sql) — 지장이설 접속함체 사용 자재: `relocation_facility_materials` 테이블 (시설별 자재, 기별명세서용). 공종량은 0037 의 `relocation_facility_tasks` 재사용
  - [`0045_relocation_facility_geo.sql`](./supabase/migrations/0045_relocation_facility_geo.sql) — 지장이설 시설 GPS 좌표: `relocation_facilities.lat`/`lng` (카카오맵 지도 모드 배치용)
  - [`0046_facility_work_window.sql`](./supabase/migrations/0046_facility_work_window.sql) — 지장이설 시설 작업 가능 시간대: `relocation_facilities.work_window_start`/`end` (owner 실행 완료)
  - [`0047_activity_log.sql`](./supabase/migrations/0047_activity_log.sql) — 베타 모니터링: `employees.last_seen_at` + `activity_logs`(로그인·로그아웃, append-only) + RLS
  - [`0048_page_views.sql`](./supabase/migrations/0048_page_views.sql) — 베타 모니터링: `page_views`(페이지 방문, append-only) + `page_view_summary` 집계 RPC + RLS
  - [`0059_relocation_realtime.sql`](./supabase/migrations/0059_relocation_realtime.sql) — 지장이설 프로젝트 동시 작업: `supabase_realtime` publication 에 relocation_* 테이블 11개 등록 (Realtime 구독 활성화)
  - [`0060_relocation_created_by.sql`](./supabase/migrations/0060_relocation_created_by.sql) — 지장이설 시설·케이블 작성자 추적: `relocation_facilities.created_by` + `relocation_cables.created_by` (employees.id FK, on delete set null). 캔버스의 「케이블 정렬」·「그래프 자동 배치」가 본인 작업분만 재배치하는 데 사용 (선택 도구 활성 시 선택 범위만)
  - [`0061_relocation_field_inspections.sql`](./supabase/migrations/0061_relocation_field_inspections.sql) — 지장이설 시설별 실사 캡처: `relocation_field_inspections` 테이블 + `relocation-field-inspections` Storage 버킷 (10MB, image/*). 실사(sketch) 모드에서 그린 그림+텍스트를 포함한 화면을 getDisplayMedia 로 캡처해 시설에 첨부. FacilityInfoPanel 에 「실사내용확인 N건」 amber 배지 + 갤러리
  - [`0062_relocation_field_inspections_storage_fix.sql`](./supabase/migrations/0062_relocation_field_inspections_storage_fix.sql) — 실사 캡처 Storage RLS 단순화 (0061 의 JOIN + current_employee 호출 제거, 시설 RLS 가 회사 스코프 자동 보장)
  - [`0063_relocation_field_inspections_name_alias_fix.sql`](./supabase/migrations/0063_relocation_field_inspections_name_alias_fix.sql) — Storage RLS column shadowing 버그 수정: subquery 안 `split_part(name, ...)` 의 `name` 이 `relocation_facilities.name` (시설명) 으로 잘못 바인딩되던 문제. 헬퍼 함수 `relocation_inspection_facility_id(text)` 도입 + `storage.objects.name` schema-qualify
  - [`0064_relocation_inspection_facility_type.sql`](./supabase/migrations/0064_relocation_inspection_facility_type.sql) — `relocation_closure_type` enum 에 '실사정보' 추가. 캔버스 실사 도구바 「실사정보입력」 버튼으로 임의 위치에 즉시 시설 배치 (이름 자동 「실사{seq}」, 빨간 원 + 흰 'i' + 펄스 후광 도형, 정보 패널은 비고 + 첨부 사진만 표시)
  - [`0065_relocation_project_category.sql`](./supabase/migrations/0065_relocation_project_category.sql) — 공사 설계 카테고리: `relocation_projects.category text not null default '지장이설'` + CHECK(청약·계획·지장이설) + (company_id, category) 인덱스. 「공사 설계」 진입 시 3 카테고리 허브로 분기
  - [`0066_relocation_subscription_fields.sql`](./supabase/migrations/0066_relocation_subscription_fields.sql) — 청약 카테고리 전용 8 컬럼 (subscription_id·subscriber_name·subscriber_address·branch_contact·branch_manager·subscribed_at·desired_open_at·order_no) + order_no partial 인덱스
  - [`0067_relocation_subscription_fields_v2.sql`](./supabase/migrations/0067_relocation_subscription_fields_v2.sql) — 청약 폼 보강: `expected_completion_at` (준공예정일) + `outside_workers` (외선) + `splice_workers` (접속)
  - [`0068_relocation_works_link.sql`](./supabase/migrations/0068_relocation_works_link.sql) — 청약 작업관리 연동: `completion_at`·`outside_worker_ids jsonb`·`splice_worker_ids jsonb`·`subcategory`(청약 sub CHECK) + `works.relocation_project_id` 역방향 FK (unique partial). 청약 프로젝트 생성 시 자동 `works` upsert + `work_assignments` 동기화 → 배정 작업자가 일보 작성 진입점 노출
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

### 보안·개인정보 점검 결과 (2026-05-19)

#### ✅ 검증된 안전 영역
- **RLS**: 0001~0031 모든 테이블 `enable row level security`. 회사 스코프 (`company_id = current_employee()`) + 본인 row 한정 적용.
- **append-only**: `leave_request_approvals` · `annual_leave_grants` · `work_daily_checks` · `attendances` · `vehicle_trips` · `connection_report_*` 모두 DELETE GRANT 미부여 (산안법 5년 보존 보장).
- **서비스 롤 키 격리**: `SUPABASE_SERVICE_ROLE_KEY` 는 `src/lib/supabase/admin.ts` (`'use server'`) 와 server actions 에서만 사용. 클라이언트 노출 0건.
- **XSS / CSRF**: `dangerouslySetInnerHTML` 사용 0건. Next.js 16 Server Actions 의 기본 CSRF 보호.
- **Storage 버킷**: `leave-attachments` · `connection-photos` 모두 private + MIME 화이트리스트 + 10MB 제한 + RLS (작성자·관계자만).
- **입력 검증**: 모든 server action 에서 `String()`·enum·길이·UUID 형식·MIME 화이트리스트 검증. RLS 가 한 번 더 막아주는 이중 안전망.
- **로깅 PII 미노출**: `console.log` 가 PII 를 찍는 곳 0건.

#### ⚠️ 적용된 보완 (2026-05-19 커밋)
- **CSV PIPA 안내**: `/admin/reports` · `/admin/annual-leaves` · `/vehicles/trips` · `/works/stats` 4곳의 CSV 다운로드 영역에 amber 안내 박스 (PIPA §22 의무 — 개인정보 처리자의 안전조치 의무).

#### 🟡 검토·정리 후순위 항목
- **`/signup` `email_confirm=true`**: 신청자가 즉시 인증 상태로 user 생성됨. `is_active=false` + 관리자 승인 게이트가 막아주지만, 누가 타인 이메일로 미리 가입(squatting) 가능성. v2 에 Supabase 이메일 검증 링크 흐름으로 재설계 검토.
- **RLS 정책의 leftover `'ceo'`**: 마이그 0018 에서 enum 통합됐지만 일부 정책에 `in ('admin', 'ceo')` 가 남아있음. 데이터엔 더 이상 `'ceo'` 값이 없어 보안 영향 0. 마이그 0032 로 정리 시 일괄 변경 가능.
- **CSV 위치·이름 노출**: 출퇴근 CSV 에 GPS 좌표 + 직원명 포함. 출퇴근 검증 목적상 의도된 동작이지만 외부 유출 시 민감. 권한이 admin·team_leader 로 좁혀져 있고 PIPA 안내가 노출되어 운영상 차단.
- **`hire_date` 노출**: 본인 + admin 만 접근. CSV 의 직원 잔여 보고서에만 포함 (admin 만 다운로드 가능).

#### 한국 규정 준수
| 규정 | 항목 | 상태 |
|---|---|---|
| **PIPA §22** (안전조치) | CSV 안내 + RLS + 암호화 채널 (HTTPS) | ✅ |
| **PIPA §39** (민감정보) | 주민번호 미수집 · 위치는 출퇴근·일보 한정 | ✅ |
| **산안법 §164** (기록 5년) | append-only audit log | ✅ |
| **근로기준법 §60** (연차) | 1년 미만 월 1일 + 1년 이상 15+가산일 자동 부여 | ✅ |
| **중대재해처벌법** | 안전 기록 무삭제 보존 | ✅ |

## 의사결정 컨벤션
- **빠른 MVP 우선**: 정식 자체 백엔드보다 Supabase 위에서 빠르게 구현. 추상화 미루기.
- **모바일 우선 반응형**: 모든 화면을 320~430px 폭에서 먼저 설계, 데스크톱은 그 다음.
- **한국어 UI**: 식별자(변수·테이블)는 영어, 사용자에게 보이는 모든 문구는 한국어.
- **간결한 코드**: 미래 가정용 추상화·feature flag·과도한 에러 처리 금지. 시스템 경계에서만 검증.

## 사용법 시나리오 (Help) 동기화 룰
- 직원 사용 가이드는 `src/app/help/[slug]/page.tsx` 와 메타 [`src/lib/help-scenarios.ts`](./src/lib/help-scenarios.ts) 의 `SCENARIOS` 배열에 있음. 각 시나리오는 `routes: ["/path"]` 와 `lastReviewed: "YYYY-MM-DD"` 메타를 가짐.
- **기능 수정 시 영향 받은 시나리오를 같은 커밋에서 같이 수정**. 작업 마무리 단계에서 변경한 라우트가 어느 시나리오의 `routes` 에 포함되는지 확인하고:
  1. 본문 내용이 화면 변경과 어긋나면 본문 수정
  2. 본문이 그대로 유효해도 `lastReviewed` 를 오늘 날짜로 갱신 (검토는 했다는 표시)
  3. 새 라우트가 시나리오 범위로 들어왔다면 해당 시나리오의 `routes` 배열에 추가
- 1차 7개 시나리오: 출퇴근(`/attendance`) · 휴가·외근(`/requests`·`/my-leaves`) · 차량(`/vehicles`) · 일반 일보·접속일보(`/works`) · 결재함(`/approvals`) · 직원 승인(`/admin/employees`). 새 시나리오 추가는 lib + 페이지 + 같은 라우트 영향 점검을 한 번에.
- 후속: 베타 사용 2~3주 후 git log 기반 자동 stale 배지 도입 예정 (`routes` 의 최근 코드 수정일 vs `lastReviewed` 비교). frontmatter 는 그대로 읽으면 됨 — 콘텐츠 재작성 불필요.
