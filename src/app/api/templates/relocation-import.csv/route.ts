import type { NextRequest } from 'next/server'
import { buildCsv, csvResponse } from '@/lib/csv'

// 지장이설 표준 임포트 템플릿 CSV — ?type=facilities|cables|circuits
//   헤더 + 예시 1~2행. owner 가 LGU+ 데이터를 이 양식에 맞춰 채워 업로드.

export function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') ?? 'facilities'

  if (type === 'facilities') {
    const csv = buildCsv(
      ['종류', '이름', '함체규격', '설치주소', '위도', '경도', '비고'],
      [
        ['종합국사', '역삼국사', '', '서울 강남구 테헤란로 1', '37.5006', '127.0366', ''],
        ['함체(가공형)', '0025A 79M3#1', '144C', '서울 강남구 역삼동', '', '', '도로변'],
      ],
    )
    return csvResponse(csv, '지장이설_시설_템플릿.csv')
  }

  if (type === 'cables') {
    const csv = buildCsv(
      ['케이블ID', '출발시설', '도착시설', '규격', '상태', '설치구분', '전체거리', '비고'],
      [['LGU-100023', '역삼국사', '0025A 79M3#1', '144C', '기설', '가공', '320', '']],
    )
    return csvResponse(csv, '지장이설_케이블_템플릿.csv')
  }

  if (type === 'circuits') {
    const csv = buildCsv(
      ['회선번호', '설치장소명', '종류', '상태', '비고'],
      [['5632751', '역삼빌딩 3층', '1코어', 'OK', '']],
    )
    return csvResponse(csv, '지장이설_회선_템플릿.csv')
  }

  return new Response('알 수 없는 type 입니다 (facilities|cables|circuits)', {
    status: 400,
  })
}
