import { Download, Cable, Wrench, Package, FileText } from 'lucide-react'
import {
  CABLE_STATUS_LABEL,
  formatFacilityCode,
  type ClosureType,
  type CableStatus,
} from '@/lib/relocation'
import type { CableSpec } from '@/lib/connection'

// 내보내기 탭 — 기별명세서(정산 문서). page.tsx 에서 데이터 전달, 읽기 전용.
//   - 케이블 포설 명세 (status != 기설 — 정산 대상)
//   - 함체별 공종 명세
//   - 함체별 자재 명세
//   각 섹션 화면 표 + CSV 다운로드.
//
// 코어구성도는 도식/지도 캔버스가 시각화를 제공. 직선도 SVG 는 splice 입력 후 후속.

export type ExportFacility = {
  id: string
  closure_type: ClosureType
  seq_no: number
  name: string
}

export type ExportCable = {
  from_facility_id: string
  to_facility_id: string
  spec: CableSpec
  status: CableStatus
  cable_code: string
  installation_type: string | null
  total_length: number | null
}

export type ExportFacilityTask = {
  facility_id: string
  task_type_id: string
  quantity: number
}

export type ExportFacilityMaterial = {
  facility_id: string
  name: string
  spec: string | null
  unit: string
  quantity: number
}

export type ExportTaskType = {
  id: string
  name: string
  unit_label: string
}

function num(n: number | null | undefined): string {
  if (n == null) return '-'
  return n.toLocaleString()
}

export default function ExportTab({
  projectId,
  facilities,
  cables,
  facilityTasks,
  facilityMaterials,
  taskTypes,
  circuitCount,
  coreAssignmentCount,
}: {
  projectId: string
  facilities: ExportFacility[]
  cables: ExportCable[]
  facilityTasks: ExportFacilityTask[]
  facilityMaterials: ExportFacilityMaterial[]
  taskTypes: ExportTaskType[]
  circuitCount: number
  coreAssignmentCount: number
}) {
  const facilityLabel = new Map(
    facilities.map((f) => [
      f.id,
      `${formatFacilityCode(f.closure_type, f.seq_no)} ${f.name}`,
    ]),
  )
  const taskTypeById = new Map(taskTypes.map((t) => [t.id, t]))

  // 케이블 포설 — 기설 제외 (정산 미반영)
  const layCables = cables.filter((c) => c.status !== 'existing')
  const totalLength = layCables.reduce((acc, c) => acc + (c.total_length ?? 0), 0)

  // 공종 — 시설 라벨 순 정렬
  const tasks = [...facilityTasks].sort((a, b) =>
    (facilityLabel.get(a.facility_id) ?? '').localeCompare(
      facilityLabel.get(b.facility_id) ?? '',
    ),
  )
  const materials = [...facilityMaterials].sort((a, b) =>
    (facilityLabel.get(a.facility_id) ?? '').localeCompare(
      facilityLabel.get(b.facility_id) ?? '',
    ),
  )

  const csvHref = (type: string) =>
    `/api/reports/relocation-statement?project=${projectId}&type=${type}`

  return (
    <div className="space-y-6">
      {/* 설계 요약 */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="flex items-center gap-1 text-sm font-semibold text-slate-700">
          <FileText className="h-4 w-4" />
          설계 요약
        </h3>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: '시설', value: facilities.length },
            { label: '케이블', value: cables.length },
            { label: '회선', value: circuitCount },
            { label: '코어 배정', value: coreAssignmentCount },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className="text-lg font-bold text-slate-900">{s.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 케이블 포설 명세 */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1 text-sm font-semibold text-slate-700">
            <Cable className="h-4 w-4" />
            케이블 포설 명세 ({layCables.length})
          </h3>
          {layCables.length > 0 && (
            <a
              href={csvHref('cable')}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </a>
          )}
        </div>
        {layCables.length === 0 ? (
          <p className="px-4 py-4 text-xs text-slate-400 italic">
            정산 대상 케이블(신설·이설·철거)이 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">구간</th>
                  <th className="px-3 py-2 text-left font-medium">규격</th>
                  <th className="px-3 py-2 text-left font-medium">상태</th>
                  <th className="px-3 py-2 text-left font-medium">설치구분</th>
                  <th className="px-3 py-2 text-right font-medium">거리(m)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {layCables.map((c, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-slate-800">
                      {facilityLabel.get(c.from_facility_id) ?? '?'}
                      <span className="text-slate-400"> ~ </span>
                      {facilityLabel.get(c.to_facility_id) ?? '?'}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{c.spec}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {CABLE_STATUS_LABEL[c.status]}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {c.installation_type ?? '-'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                      {num(c.total_length)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-semibold text-slate-900">
                  <td className="px-3 py-2" colSpan={4}>
                    총 포설 거리
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {num(totalLength)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="px-4 py-2 text-[11px] text-slate-400 border-t border-slate-100">
          기설(existing) 케이블은 정산에 반영되지 않아 제외됩니다.
        </p>
      </section>

      {/* 함체별 공종 명세 */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1 text-sm font-semibold text-slate-700">
            <Wrench className="h-4 w-4" />
            함체별 공종 명세 ({tasks.length})
          </h3>
          {tasks.length > 0 && (
            <a
              href={csvHref('task')}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </a>
          )}
        </div>
        {tasks.length === 0 ? (
          <p className="px-4 py-4 text-xs text-slate-400 italic">
            등록된 공종이 없습니다. 시설 정보 패널에서 공종·수량을 입력하세요.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">시설</th>
                  <th className="px-3 py-2 text-left font-medium">공종</th>
                  <th className="px-3 py-2 text-right font-medium">수량</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {tasks.map((t, i) => {
                  const tt = taskTypeById.get(t.task_type_id)
                  return (
                    <tr key={i}>
                      <td className="px-3 py-2 text-slate-800">
                        {facilityLabel.get(t.facility_id) ?? '?'}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {tt?.name ?? '(삭제된 공종)'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                        {t.quantity}
                        {tt?.unit_label ?? ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 함체별 자재 명세 */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1 text-sm font-semibold text-slate-700">
            <Package className="h-4 w-4" />
            함체별 자재 명세 ({materials.length})
          </h3>
          {materials.length > 0 && (
            <a
              href={csvHref('material')}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </a>
          )}
        </div>
        {materials.length === 0 ? (
          <p className="px-4 py-4 text-xs text-slate-400 italic">
            등록된 자재가 없습니다. 시설 정보 패널에서 사용 자재를 입력하세요.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">시설</th>
                  <th className="px-3 py-2 text-left font-medium">자재명</th>
                  <th className="px-3 py-2 text-left font-medium">규격</th>
                  <th className="px-3 py-2 text-right font-medium">수량</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {materials.map((m, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-slate-800">
                      {facilityLabel.get(m.facility_id) ?? '?'}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{m.name}</td>
                    <td className="px-3 py-2 text-slate-500">{m.spec ?? '-'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                      {m.quantity}
                      {m.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-slate-400">
        코어구성도(토폴로지)는 위쪽 캔버스에서 도식·지도로 확인할 수 있습니다.
        직선도 SVG·도면 PDF 내보내기는 접속(splice) 입력 기능 이후 추가됩니다.
      </p>
    </div>
  )
}
