# 국사출입등록 — Power Automate 연동 가이드 (무료 방식)

> 이든 앱에서 출입요청 → **Power Automate Desktop(무료)** 이 주기적으로 가져가 국사출입등록시스템에 자동 입력 → 결과를 앱에 회신.
> **프리미엄(유료) 불필요.** 클라우드 흐름 없이 데스크톱 흐름 하나로 끝.
> 비개발자 기준 click 단위 안내. **자동화 실행 PC(등록시스템·엑셀이 있는 PC)에서** 진행하세요.

---

## 0. 전체 그림 (폴링 방식)

```
[이든 앱]  출입요청 작성 → 저장 (상태: 대기)   ← 아무 데도 안 보냄
                  │
[Power Automate Desktop / 자동화 PC]   ← 무료. PC에서 계속 돌아감
   ① 1분마다 Supabase 에 "대기 중인 요청 있어?" 물어봄 (가져오며 '등록중'으로 잠금)
   ② 있으면 → 엑셀에서 이름 매칭 → 인적사항 읽기
   ③ 등록시스템에 입력·제출
   ④ 끝나면 → "완료/실패" 회신
   ⑤ 1분 대기 후 다시 ①
```

**핵심 약속 2가지** (앱과 PA 가 맞춰야 함):
1. 주고받는 **JSON 필드 이름** (부록 참고)
2. 엑셀에서 사람을 찾는 **매칭 키 = 이름**

> 무료 방식은 "즉시"가 아니라 "1분 주기"입니다. 국사 출입요청은 즉시일 필요가 없어 충분합니다.

---

## 1. 사전 준비

| 항목 | 내용 |
|---|---|
| **Microsoft 계정** | 무료 계정으로 가능 (회사 계정도 OK) |
| **라이센스** | **불필요** — Power Automate Desktop 의 "웹 서비스 호출" 액션은 무료 |
| **Power Automate Desktop 앱** | 자동화 PC에 설치 (Windows 10/11 무료. Microsoft Store 검색 "Power Automate") |
| **출입자 엑셀** | 자동화 PC에 저장. **이름 열 필수** (매칭 키). 예: `C:\출입\출입자.xlsx` |

### 준비해둘 값 3개 (메모장에 적어두세요)

| 이름 | 어디서 | 용도 |
|---|---|---|
| **SUPABASE_URL** | Supabase → Settings → API → Project URL | 호출 주소 (예: `https://alhsklyqsbekfgwnyzap.supabase.co`) |
| **ANON_KEY** | Supabase → Settings → API → `anon public` 키 | 인증(공개키, 안전) |
| **시크릿 A** | 이미 정함 (Supabase `station_access_config` 에 저장한 값) | 위조 방지 |

> 무료 방식에서는 **웹훅 URL·시크릿 B 가 필요 없습니다.** (Vercel 환경변수 추가 안 해도 됨)

### 출입자 엑셀 양식 예시

| 이름 | 주민등록번호 | 연락처 | 소속 | 차량번호 |
|---|---|---|---|---|
| 홍길동 | (등록시스템 요구 시) | 010-0000-0000 | 이든정보기술 | 12가3456 |

> **이름** 열이 앱이 보내는 값과 정확히 일치해야 합니다. (앞뒤 공백 주의)

---

## 2. 〔Part 1〕 데스크톱 흐름 만들기 (자동화 PC)

### 2-1. 새 흐름
1. **Power Automate Desktop** 실행 → Microsoft 계정 로그인
2. **새 흐름** → 이름 `국사출입자동등록` → **만들기**

### 2-2. 무한 반복 시작
> 1분마다 확인을 반복하게 만듭니다.
1. 액션 검색 → **반복 조건(Loop condition)** 끌어다 놓기
2. 조건: **첫 번째 피연산자** `1`, 연산자 **같음**, **두 번째 피연산자** `1` → 항상 참(무한 반복)
3. 아래 단계들은 모두 이 반복 블록 **안에** 넣습니다.

### 2-3. 대기 요청 가져오기 (claim)
1. 액션 검색 → **웹 서비스 호출(Invoke web service)** → 반복 안에 넣기
2. 설정:
   - **URL**: `{SUPABASE_URL}/rest/v1/rpc/station_access_claim_pending`
   - **메서드(Method)**: `POST`
   - **사용자 지정 헤더(Custom headers)**:
     ```
     apikey: {ANON_KEY}
     Authorization: Bearer {ANON_KEY}
     Content-Type: application/json
     ```
   - **요청 본문(Request body)**:
     ```json
     { "_secret": "{시크릿 A}" }
     ```
   - **응답 저장 변수**: `WebServiceResponse` (기본값)
3. 다음 액션 → **JSON을 사용자 지정 개체로 변환(Convert JSON to custom object)**
   - **JSON**: `%WebServiceResponse%`
   - **결과 변수**: `Pending` (대기 요청들의 목록)

### 2-4. 요청마다 처리
1. **각각의 경우(For each)** → **반복할 값**: `%Pending%` → 현재 항목 변수: `CurrentItem`
2. (For each 안) 처리할 값들:
   - 요청 id = `%CurrentItem['id']%`
   - 이름 = `%CurrentItem['requester_name']%`
   - 국사 = `%CurrentItem['station_name']%`
   - 시작일시 = `%CurrentItem['access_start']%`  (날짜+시간, 예: `2026-06-25T14:30:00+09:00`)
   - 종료일시 = `%CurrentItem['access_end']%`

### 2-5. 엑셀에서 인적사항 찾기 (For each 안)
1. **Excel 시작** → 출입자 엑셀 열기
2. **Excel 워크시트에서 읽기** → 사용된 셀 모두 → `ExcelData`
3. **각각의 경우(For each)** `ExcelData` 반복 → **만약(If)** `%CurrentRow['이름']% = %CurrentItem['requester_name']%` 이면
   - 주민번호·연락처 등을 변수(`vJumin`, `vPhone`)에 저장
   - **반복 종료**

### 2-6. 등록시스템에 입력 (For each 안)
> owner 의 등록시스템 화면에 맞춰 만드는 부분.
1. 브라우저/프로그램 실행 → 등록시스템 열기
2. **UI 요소에 텍스트 채우기** 로 칸마다 입력 (국사·이름·인적사항·기간 — 목적 등 나머지는 엑셀/고정값)
3. **버튼 클릭** 으로 제출

### 2-7. 결과 회신 — 완료 (For each 안)
1. **웹 서비스 호출**:
   - **URL**: `{SUPABASE_URL}/rest/v1/rpc/station_access_set_result`
   - **메서드**: `POST`
   - **헤더**: 2-3 과 동일 (apikey / Authorization / Content-Type)
   - **요청 본문**:
     ```json
     {
       "_request_id": "%CurrentItem['id']%",
       "_status": "완료",
       "_message": "등록 완료",
       "_secret": "{시크릿 A}"
     }
     ```

### 2-8. 결과 회신 — 실패 (선택)
> 등록 단계(2-6)를 오류 처리로 감싸서, 실패하면 "실패" 로 회신.
1. 2-6 단계들을 **블록 오류 발생 시(On block error)** 영역으로 감싸기
2. 오류 시: **웹 서비스 호출** (2-7 과 같은 형식, 본문만 다름):
   ```json
   {
     "_request_id": "%CurrentItem['id']%",
     "_status": "실패",
     "_message": "등록 실패 (자동화 오류)",
     "_secret": "{시크릿 A}"
   }
   ```
> 처음엔 2-7(완료)만 만들고 동작 확인 후, 2-8(실패 회신)을 추가해도 됩니다.

### 2-9. 1분 대기 (반복 안, For each 밖)
1. For each 가 끝난 다음(반복 조건 안) → **대기(Wait)** → `60` 초

### 2-10. 저장
- 상단 **저장**.

---

## 3. 〔Part 2〕 흐름 실행해두기

> 자동화 PC가 켜져 있고 이 흐름이 돌고 있어야 요청이 처리됩니다.

**방법 A — 수동 실행 (제일 간단)**
- Power Automate Desktop 에서 `국사출입자동등록` 흐름을 **실행(▶)** → 켜두면 끝.

**방법 B — PC 켜질 때 자동 시작 (선택)**
- Windows **작업 스케줄러** → 새 작업 → 트리거 "로그온할 때" → 동작에서 PAD 콘솔로 이 흐름 실행. (필요하면 따로 안내드릴게요)

---

## 4. 테스트

1. 자동화 PC **켜두고 로그인** + `국사출입자동등록` 흐름 **실행 중**
2. 핸드폰/PC 이든 앱 → **작업 → 국사출입등록 → 출입요청** 작성·제출
3. 기대 결과 (1분 이내):
   - 앱: "출입요청을 저장했습니다 · 자동등록 대기 중" → 상태가 **등록중 → 완료** 로 바뀜
   - 자동화 PC: 등록시스템에 자동 입력
4. 실패하면 상세의 **다시 전송(재시도)** → 다시 "대기" 가 되어 1분 내 재처리

---

## 5. 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| 상태가 계속 "대기" | PAD 흐름이 안 돌고 있음 → Power Automate Desktop 에서 실행(▶) 확인. PC 켜짐·로그인 확인 |
| 가져오기 호출 "invalid secret" | 본문 `_secret` 이 Supabase 저장값(시크릿 A)과 다름 → 2-3 본문 확인 |
| 응답이 비어 있음(`[]`) | 대기 요청이 없거나 이미 등록중 → 앱에서 새 요청 만들고 다시 확인 |
| 상태가 "등록중"에서 안 변함 | 회신(2-7) 미설정/오류 → set_result URL·시크릿 A·`_request_id` 필드 확인 |
| 엑셀에서 사람 못 찾음 | 이름 불일치(공백·오타) → 엑셀 이름 열과 직원 이름 정확히 일치 |
| 401/permission 오류 | 헤더에 `apikey` 누락 → 2-3 헤더 3줄 모두 넣었는지 확인 |

---

## 부록. 값·JSON 정리

**준비값**

| 값 | 보관 위치 | 사용처 |
|---|---|---|
| SUPABASE_URL | Supabase Settings → API | 웹 서비스 호출 URL |
| ANON_KEY | Supabase Settings → API (anon public) | 헤더 apikey / Authorization |
| 시크릿 A | Supabase `station_access_config` | 본문 `_secret` |

**가져오기 응답 형식** (Supabase → PAD)
```json
[
  { "id": "...", "requester_name": "홍길동", "station_name": "종로국사",
    "access_start": "2026-06-25T14:30:00+09:00", "access_end": "2026-06-25T17:00:00+09:00" }
]
```

**회신 본문 형식** (PAD → Supabase)
```json
{ "_request_id": "...", "_status": "완료", "_message": "등록 완료", "_secret": "시크릿 A" }
```
- `_status` 는 `등록중` / `완료` / `실패` 중 하나.

---

## 참고: 유료(웹훅) 방식과의 차이

| | 무료 (이 문서, 폴링) | 유료 (웹훅) |
|---|---|---|
| 반응 속도 | 1분 주기 | 즉시 |
| 구성 | 데스크톱 흐름 1개 | 클라우드+데스크톱 2개 |
| 비용 | **0원** | 월 구독 |
| 환경변수 | 불필요 | WEBHOOK_URL·시크릿 B 필요 |

> 나중에 "즉시" 가 꼭 필요해지면 유료 웹훅 방식으로 전환 가능 (앱은 그대로, PA 구성만 변경).

---

## 부록 C — 연결 테스트용 최소 흐름 (실제 등록 전 검증)

엑셀·등록시스템 입력을 붙이기 전에, **"앱에서 요청하면 PAD 가 가져오는지"** 만 먼저 확인하는 흐름입니다. 받은 데이터를 메시지 창으로 띄워 눈으로 보고, 한 건 잡으면 멈춥니다.

### 흐름 구조
```
루프 조건 (1 = 1)
    웹 서비스 호출 (claim_pending)          ← 본문 인코딩 OFF
    만약(If)  %WebServiceResponse%  포함(Contains)  requester_name
        메시지 표시  →  %WebServiceResponse%
        반복 종료(Exit loop)
    End
    대기  10초
End
```

### 만드는 순서
1. **루프 조건(Loop condition)** 추가 → 첫 피연산자 `1`, 연산자 `같음(=)`, 둘째 `1` → 저장 (무한 반복)
2. **웹 서비스 호출(Invoke web service)** 을 루프 안으로. 설정:
   - URL `https://alhsklyqsbekfgwnyzap.supabase.co/rest/v1/rpc/station_access_claim_pending`
   - 메서드 `POST` · 콘텐츠 형식 `application/json`
   - 헤더 2줄: `apikey: {ANON_KEY}` / `Authorization: Bearer {ANON_KEY}`
   - 요청 본문 `{"_secret":"{시크릿 A}"}`
   - **⚠️ `고급` → 「요청 본문 인코딩」 OFF** (이걸 안 끄면 PGRST102 오류)
3. **만약(If)** 추가 → 첫 피연산자 `%WebServiceResponse%`, 연산자 `포함(Contains)`, 둘째 `requester_name`
4. **메시지 표시(Display message)** → 표시할 메시지 `%WebServiceResponse%`
5. **반복 종료(Exit loop)** (메시지 다음, If 안)
6. **대기(Wait)** `10` 초 (If 밖, End 위)

### 실행 & 확인
1. **▶ 실행** (요청 들어올 때까지 대기 상태로 돎)
2. 앱에서 **출입요청 1건** 만들기 (또는 기존 건 「다시 전송(재시도)」 로 `대기` 로)
3. 10초 안에 **메시지 창**이 뜨고 `requester_name`·`station_name`·`access_start`·`access_end` 가 보이면 ✅ 검증 완료
4. 확인 후 **「만약·메시지·반복 종료」 3개는 삭제** — 그 자리에 실제 처리(JSON 변환 → 엑셀 → 등록시스템 입력 → `set_result` 회신)를 넣으면 본 흐름(부록 A·Part 1)이 됩니다.

> 메시지로 한 번 본 요청은 이미 `등록중` 으로 바뀌어 있습니다. 다시 테스트하려면 앱에서 「다시 전송(재시도)」.
