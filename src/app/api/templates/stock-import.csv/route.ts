import { buildCsv, csvResponse } from '@/lib/csv'

// 보유자재 CSV import 템플릿. 헤더 + 예시 2행.
export async function GET() {
  const header = [
    '자재명',
    '발주처코드',
    '규격',
    '단위',
    '사급지입',
    '입고형태',
    '발주처',
    '수량',
    '단가',
    '관련공사번호',
    '메모',
  ]
  const sampleRows: string[][] = [
    ['광케이블 12C', 'KT-CABLE-12', '12C', 'm', '사급', '일반입고', 'KT', '500', '', '', '예시 행'],
    ['나사 M6', '', 'M6', 'box', '지입', '일반입고', '', '20', '5000', '', '예시 행'],
  ]
  return csvResponse(buildCsv(header, sampleRows), '자재import_템플릿.csv')
}
