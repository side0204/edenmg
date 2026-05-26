import { Plus, Pencil, Trash2, Cable } from 'lucide-react'
import {
  CABLE_STATUS_LABEL,
  CABLE_STATUS_VALUES,
  CABLE_STATUS_COLOR,
  CABLE_INSTALLATION_TYPE_VALUES,
  formatFacilityCode,
  type CableStatus,
  type CableInstallationType,
  type ClosureType,
} from '@/lib/relocation'
import type { CableSpec } from '@/lib/connection'
import { CABLE_SPEC_VALUES } from '@/lib/connection'
import { createCable, updateCable, deleteCable } from './cable-actions'

export type CableRow = {
  id: string
  from_facility_id: string
  to_facility_id: string
  spec: CableSpec
  status: CableStatus
  cable_code: string
  installation_type: CableInstallationType | null
  // 도식 모드 경로점 (x/y)
  waypoints: { x: number; y: number; pole_name?: string | null; dist?: number | null }[]
  // 지도 모드 경로점 (lat/lng) — 도식과 분리 (마이그 0056)
  map_waypoints:
    | {
        x: number
        y: number
        lat?: number | null
        lng?: number | null
        pole_name?: string | null
        dist?: number | null
      }[]
    | null
  total_length: number | null
  end_distance: number | null
  notes: string | null
  created_by: string | null
  // 사용코어 라벨 박스 위치 사용자 정의 (마이그 0080). 캔버스 드래그로 갱신.
  core_label_offsets?:
    | {
        designer?: { dx: number; dy: number }
        worker?: { dx: number; dy: number }
        single?: { dx: number; dy: number }
      }
    | null
  // 케이블 선 스타일 사용자 정의 (마이그 0081·0082). 캔버스 상단 「서식」 툴바.
  //   line_style — 도식 모드 전용. line_style_map — 지도 모드 전용.
  line_style?: { width_scale?: number } | null
  line_style_map?: { width_scale?: number } | null
}

type FacilityMini = {
  id: string
  closure_type: ClosureType
  seq_no: number
  name: string
}

export default function CablesTab({
  projectId,
  cables,
  facilities,
}: {
  projectId: string
  cables: CableRow[]
  facilities: FacilityMini[]
}) {
  const facilityMap = new Map(facilities.map((f) => [f.id, f]))

  function facilityLabel(id: string): string {
    const f = facilityMap.get(id)
    if (!f) return '(삭제됨)'
    return `${formatFacilityCode(f.closure_type, f.seq_no)} ${f.name}`
  }

  return (
    <div className="space-y-6">
      {/* 신규 등록 폼 — 헤더 클릭으로 접기/펼치기 */}
      <details
        open
        className="group border border-slate-200 rounded-xl bg-slate-50 [&[open]>summary>.chev]:rotate-180"
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">
          <Plus className="h-4 w-4" />
          <span className="flex-1">케이블 추가</span>
          <span className="chev text-slate-400 transition-transform">▾</span>
        </summary>
        <div className="px-4 pb-4">

        {facilities.length < 2 ? (
          <p className="text-sm text-slate-500 italic px-2 py-2">
            먼저 시설을 2 개 이상 등록해야 합니다. 시설 탭에서 추가해주세요.
          </p>
        ) : (
          <form action={createCable} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="project_id" value={projectId} />

            <div>
              <label className="block text-xs font-medium text-slate-600">
                출발 시설 <span className="text-rose-600">*</span>
              </label>
              <select
                name="from_facility_id"
                required
                defaultValue=""
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  선택
                </option>
                {facilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {facilityLabel(f.id)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600">
                도착 시설 <span className="text-rose-600">*</span>
              </label>
              <select
                name="to_facility_id"
                required
                defaultValue=""
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  선택
                </option>
                {facilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {facilityLabel(f.id)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600">
                케이블 규격 <span className="text-rose-600">*</span>
              </label>
              <select
                name="spec"
                required
                defaultValue=""
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  선택
                </option>
                {CABLE_SPEC_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600">상태</label>
              <select
                name="status"
                defaultValue="new"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {CABLE_STATUS_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {CABLE_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600">
                케이블 ID (신설은 비워두면 자동 생성, 기설은 LGU+ 제공 ID 입력)
              </label>
              <input
                type="text"
                name="cable_code"
                maxLength={100}
                placeholder="예: C1종로중구23  /  비우면 NEW-XXXX-NNNNNN 자동"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600">설치 구분</label>
              <select
                name="installation_type"
                defaultValue=""
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">(미지정)</option>
                {CABLE_INSTALLATION_TYPE_VALUES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600">비고</label>
              <input
                type="text"
                name="notes"
                maxLength={1000}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="sm:col-span-2 flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
                케이블 추가
              </button>
            </div>
          </form>
        )}
        </div>
      </details>

      {/* 케이블 목록 */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">등록된 케이블 ({cables.length}건)</h3>
        {cables.length === 0 ? (
          <p className="text-sm text-slate-500 italic px-2 py-4">등록된 케이블이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white overflow-hidden">
            {cables.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <CableRowItem
                  projectId={projectId}
                  cable={c}
                  facilities={facilities}
                  facilityLabel={facilityLabel}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}


function CableRowItem({
  projectId,
  cable,
  facilities,
  facilityLabel,
}: {
  projectId: string
  cable: CableRow
  facilities: FacilityMini[]
  facilityLabel: (id: string) => string
}) {
  return (
    <details className="group">
      <summary className="cursor-pointer flex items-start justify-between gap-3 list-none">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900 flex items-center gap-2 flex-wrap">
            <Cable className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-mono text-xs text-slate-700">{cable.cable_code}</span>
            <span className="text-xs text-slate-500">{cable.spec}</span>
            <span
              className={
                'inline-block text-[10px] font-medium px-1.5 py-0.5 rounded border ' +
                CABLE_STATUS_COLOR[cable.status]
              }
            >
              {CABLE_STATUS_LABEL[cable.status]}
            </span>
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {facilityLabel(cable.from_facility_id)} → {facilityLabel(cable.to_facility_id)}
            {cable.installation_type && ` · ${cable.installation_type}`}
          </p>
        </div>
        <span className="text-xs text-slate-400 group-open:rotate-90 transition-transform">
          <Pencil className="h-3.5 w-3.5" />
        </span>
      </summary>

      <div className="mt-3 ml-2 pl-3 border-l-2 border-slate-200 space-y-3">
        <form action={updateCable} className="grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="id" value={cable.id} />
          <input type="hidden" name="project_id" value={projectId} />

          <div>
            <label className="block text-[11px] text-slate-500">출발 시설</label>
            <select
              name="from_facility_id"
              defaultValue={cable.from_facility_id}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {facilityLabel(f.id)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500">도착 시설</label>
            <select
              name="to_facility_id"
              defaultValue={cable.to_facility_id}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {facilityLabel(f.id)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500">규격</label>
            <select
              name="spec"
              defaultValue={cable.spec}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              {CABLE_SPEC_VALUES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500">상태</label>
            <select
              name="status"
              defaultValue={cable.status}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              {CABLE_STATUS_VALUES.map((s) => (
                <option key={s} value={s}>
                  {CABLE_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[11px] text-slate-500">케이블 ID</label>
            <input
              type="text"
              name="cable_code"
              defaultValue={cable.cable_code}
              required
              maxLength={100}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-500">설치 구분</label>
            <select
              name="installation_type"
              defaultValue={cable.installation_type ?? ''}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">(미지정)</option>
              {CABLE_INSTALLATION_TYPE_VALUES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500">비고</label>
            <input
              type="text"
              name="notes"
              defaultValue={cable.notes ?? ''}
              maxLength={1000}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>

          <div className="sm:col-span-2 flex justify-end gap-2">
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
            >
              <Pencil className="h-3.5 w-3.5" />
              저장
            </button>
          </div>
        </form>

        <form action={deleteCable}>
          <input type="hidden" name="id" value={cable.id} />
          <input type="hidden" name="project_id" value={projectId} />
          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            삭제
          </button>
        </form>
      </div>
    </details>
  )
}
