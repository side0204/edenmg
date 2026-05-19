import { buildCsv, csvResponse } from '@/lib/csv'

export async function GET() {
  const header = ['자재명', '규격', '단위', '카테고리', '발주처', '발주처코드']
  const sampleRows: string[][] = [
    ['광케이블 12C', '12C', 'm', '케이블', 'KT', 'KT-CABLE-12'],
    ['접속단자', '', 'ea', '접속자재', 'KT', 'KT-TERM-001'],
    ['나사 M6', 'M6', 'box', '일반자재', '', ''],
  ]
  return csvResponse(buildCsv(header, sampleRows), '자재마스터_템플릿.csv')
}
