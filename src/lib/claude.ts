import 'server-only'
import Anthropic from '@anthropic-ai/sdk'

// 서버에서만 import — 클라이언트로 노출 금지 (ANTHROPIC_API_KEY 보호)

let _client: Anthropic | null = null

export function getAnthropic(): Anthropic {
  if (_client) return _client
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    throw new Error(
      'ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다. .env.local + Vercel 양쪽 등록 필요.',
    )
  }
  _client = new Anthropic({ apiKey: key })
  return _client
}

// 모델 — Claude Opus 4.7. Sonnet 4.6 으로 비용 5x 절감하려면 'claude-sonnet-4-6' 으로 교체.
export const CLAUDE_MODEL = 'claude-opus-4-7'

// PoC 단계: owner 한 명만 접근. 추후 권한 토글로 확장.
export const OWNER_EMAIL = 'side0204@gmail.com'

// 시스템 프롬프트 — prompt caching 으로 캐시. 5분 TTL.
// 첫 호출 후엔 ~90% 단가 절감 (cache_read_input_tokens 로 처리).
export const RELOCATION_SYSTEM_PROMPT = `당신은 LGU+ 광케이블 지장이설 설계 자동화 도구의 AI 어시스턴트입니다.

# 도메인 배경
- 지장이설 = 도로공사·재개발 등으로 기존 광케이블 경로가 영향받을 때 새 경로로 옮기는 작업
- 작업 단위: 프로젝트 (현재 프로젝트 ID 는 시스템이 컨텍스트로 제공)
- 핵심 entity:
  - facility (시설): 국사·맨홀·함체·가입자시설 등 광망의 노드
  - cable (케이블): 두 시설을 잇는 광케이블

# 당신의 역할 — 도면작성 보조
사용자(설계자)가 한국어로 자연스럽게 요청합니다. 예:
  - "종로 본부국에서 청량리 함체까지 144C 신설 설계"
  - "맨홀 3개 추가하고 일렬로 연결"
  - "기존 함체 5개 확인하고 신설 케이블 그려줘"

당신은 도구를 적극 사용해 캔버스에 시설·케이블을 빠르게 그려야 합니다. 사용자의 가장 큰 목적은 "도면을 빠르게 그리는 것" 입니다.

# 도구 사용 규칙
1. **읽기 우선**: 시설/케이블을 만들기 전에 list_facilities·list_cables 로 현재 상태를 먼저 확인. 중복 방지 + 기존 시설 이름 정확 매칭에 필수.
2. **연속 호출**: 여러 시설·케이블을 만들어야 하면 도구를 연속 호출. "맨홀 3개" 요청은 3번 create_facility 호출.
3. **좌표**: x/y 는 캔버스 픽셀 좌표 (도식 모드). 보통 0~5000 범위. 다중 시설은 적절히 분산 (예: x 간격 200, y 간격 100). 이미 있는 시설 좌표와 겹치지 않게.
4. **시설명 매칭**: create_cable 의 from_facility_name / to_facility_name 은 list_facilities 결과의 name 과 정확히 일치해야 함.
5. **결과 보고**: 작업 완료 후 한국어로 간결하게 요약 (예: "맨홀 3개·신설 케이블 2개 추가했습니다.").

# 시설 종류 (closure_type) — 자주 쓰는 값
- 국사 계열: 국사 / 종합국사 / 집중국사 / 가입자국사 / 간이국사
- 함체 계열: 함체_가공형 / 함체_관로형 / 중간접속형 / 중간분기형 / SP내장형
- 기타: 맨홀 / 가입자시설 / 일반설치장소 / 창고
- (전체 enum 은 위와 별도로 모바일·RN·IJP 등 있으나 통상 위 항목으로 충분)

# 케이블 규격 (spec)
1C / 1C드랍 / 2C / 2C드랍 / 12C / 36C / 72C / 144C / 288C / 576C

# 케이블 상태 (status)
- existing: 기설 (이미 설치됨, 정산 미반영)
- new: 신설 (이번 작업에서 새로 설치)
- removing: 철거 (이번 작업에서 철거)

# 설치구분 (installation_type, 선택)
- 가공 / 구내 / 해저 / 입상 / 지중

# 안전 규칙
- 사용자가 명시하지 않은 작업은 추가하지 마세요. 예: "맨홀 추가" 요청에 케이블까지 임의로 만들지 말 것.
- 불확실하면 도구를 더 쓰지 말고 한국어로 다시 물어보세요.
- 도구 호출은 최대 10회 이내. 그 이상이 필요한 큰 작업은 부분 완료 후 사용자에게 다음 단계를 물어보세요.`

// 도구 정의 — Anthropic 의 tool input_schema JSON Schema 형식
export const RELOCATION_TOOLS = [
  {
    name: 'list_facilities',
    description:
      '현재 지장이설 프로젝트의 모든 시설을 조회합니다. 신규 시설을 추가하기 전 중복 확인 또는 케이블 연결 시 시설 이름·ID 매칭에 사용.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'list_cables',
    description: '현재 프로젝트의 모든 광케이블을 조회합니다. 시설 간 연결 상태 확인용.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'create_facility',
    description:
      '프로젝트에 새 시설을 추가합니다. 사전에 list_facilities 로 중복 여부를 확인하세요.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: '시설명 (예: "종로 본부국", "맨홀 1")' },
        closure_type: {
          type: 'string',
          description:
            '시설 종류. 자주 쓰는 값: 국사, 종합국사, 집중국사, 가입자국사, 간이국사, 함체_가공형, 함체_관로형, 중간접속형, 중간분기형, SP내장형, 맨홀, 가입자시설, 일반설치장소, 창고',
        },
        closure_spec: {
          type: 'string',
          description: '함체 규격 (접속함체일 때만, 예: "144C"). 케이블 규격 enum 과 동일 형식.',
        },
        x: { type: 'number', description: '캔버스 X 좌표 (도식 모드 픽셀). 미지정 시 0' },
        y: { type: 'number', description: '캔버스 Y 좌표 (도식 모드 픽셀). 미지정 시 0' },
      },
      required: ['name', 'closure_type'],
    },
  },
  {
    name: 'create_cable',
    description:
      '두 시설 사이에 광케이블을 추가합니다. from_facility_name·to_facility_name 은 list_facilities 결과의 name 과 정확히 일치해야 합니다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        from_facility_name: { type: 'string', description: '출발 시설명' },
        to_facility_name: { type: 'string', description: '도착 시설명' },
        spec: {
          type: 'string',
          enum: ['1C', '1C드랍', '2C', '2C드랍', '12C', '36C', '72C', '144C', '288C', '576C'],
          description: '케이블 규격',
        },
        status: {
          type: 'string',
          enum: ['existing', 'new', 'removing'],
          description: '케이블 상태 (existing=기설, new=신설, removing=철거)',
        },
        installation_type: {
          type: 'string',
          enum: ['가공', '구내', '해저', '입상', '지중'],
          description: '설치구분 (선택, 미지정 가능)',
        },
      },
      required: ['from_facility_name', 'to_facility_name', 'spec', 'status'],
    },
  },
] as const

export type RelocationToolName =
  | 'list_facilities'
  | 'list_cables'
  | 'create_facility'
  | 'create_cable'
