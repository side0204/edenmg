import { Plus, Pencil, Trash2 } from 'lucide-react'
import {
  CLOSURE_TYPE_LABEL,
  CLOSURE_TYPE_VALUES,
  CABLE_SPEC_VALUES,
  FACILITY_INSTALL_STATUS_VALUES,
  FACILITY_INSTALL_STATUS_LABEL,
  formatFacilityCode,
  hasInstallStatus,
  isInternalNode,
  type ClosureType,
} from '@/lib/relocation'
import type { CableSpec } from '@/lib/connection'
import { createFacility, updateFacility, deleteFacility } from './facility-actions'

export type FacilityRow = {
  id: string
  closure_type: ClosureType
  seq_no: number
  name: string
  facility_code: string | null
  install_address: string | null
  closure_spec: CableSpec | null
  parent_facility_id: string | null
  is_marked: boolean
  mark_note: string | null
  notes: string | null
  inspection_request: string | null
  x_hint: number | null
  y_hint: number | null
  lat: number | null
  lng: number | null
  work_window_start: string | null
  work_window_end: string | null
  created_at: string | null
  install_status: string
  label_dx: number
  label_dy: number
  label_dx_map: number
  label_dy_map: number
  install_order: number | null
  created_by: string | null
  // 라벨 스타일 사용자 정의 (마이그 0081·0082). 캔버스 상단 「서식」 툴바.
  //   label_style — 도식 모드 전용. label_style_map — 지도 모드 전용.
  label_style?: {
    font_size_scale?: number
    color?: string
    font_family?: string
    bold?: boolean
    italic?: boolean
  } | null
  label_style_map?: {
    font_size_scale?: number
    color?: string
    font_family?: string
    bold?: boolean
    italic?: boolean
  } | null
}

// 함체일 때 보여줄 기본 권장 함체 규격 (참고용 — 폼에는 직접 추천 표시)
function recommendedClosureSpec(): string {
  return '함체 규격은 연결될 케이블 규격의 한 단계 위를 권장 (예: 72C 케이블 → 144C 함체)'
}

export default function FacilitiesTab({
  projectId,
  facilities,
}: {
  projectId: string
  facilities: FacilityRow[]
}) {
  // 부모 후보: 국사만
  const stations = facilities.filter((f) => f.closure_type === '국사')

  // 그룹별 묶기 (CLOSURE_TYPE_VALUES 순서로)
  const grouped = new Map<ClosureType, FacilityRow[]>()
  for (const t of CLOSURE_TYPE_VALUES) grouped.set(t, [])
  for (const f of facilities) grouped.get(f.closure_type)!.push(f)
  for (const arr of grouped.values()) arr.sort((a, b) => a.seq_no - b.seq_no)

  return (
    <div className="space-y-6">
      {/* 신규 등록 폼 — 헤더 클릭으로 접기/펼치기 */}
      <details
        open
        className="group border border-slate-200 rounded-xl bg-slate-50 [&[open]>summary>.chev]:rotate-180"
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">
          <Plus className="h-4 w-4" />
          <span className="flex-1">시설 추가</span>
          <span className="chev text-slate-400 transition-transform">▾</span>
        </summary>
        <form action={createFacility} className="grid gap-3 sm:grid-cols-2 px-4 pb-4">
          <input type="hidden" name="project_id" value={projectId} />

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600">
              종류 <span className="text-rose-600">*</span>
            </label>
            <select
              name="closure_type"
              required
              defaultValue="함체_가공형"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {CLOSURE_TYPE_VALUES.map((t) => (
                <option key={t} value={t}>
                  {CLOSURE_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600">
              이름 <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              name="name"
              required
              maxLength={200}
              placeholder="예: 0025A 79M3#1 또는 필동간이국사"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600">함체 규격</label>
            <select
              name="closure_spec"
              defaultValue=""
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">(미지정)</option>
              {CABLE_SPEC_VALUES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-500">{recommendedClosureSpec()}</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600">시설 ID</label>
            <input
              type="text"
              name="facility_code"
              maxLength={100}
              placeholder="미입력 시 자동 부여"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600">부모 국사 (MOFD·OJC·장비만)</label>
            <select
              name="parent_facility_id"
              defaultValue=""
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">(없음)</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatFacilityCode(s.closure_type, s.seq_no)} {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600">설치 구분 (접속함체·RN·IJP)</label>
            <select
              name="install_status"
              defaultValue="new"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {FACILITY_INSTALL_STATUS_VALUES.map((s) => (
                <option key={s} value={s}>
                  {FACILITY_INSTALL_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600">설치장소명 (가입자 시설)</label>
            <input
              type="text"
              name="install_address"
              maxLength={200}
              placeholder="예: 필동 충무영상센터"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600">비고</label>
            <textarea
              name="notes"
              rows={2}
              maxLength={1000}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <label className="sm:col-span-2 flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" name="is_marked" className="rounded" />
            노란색 마크 (내용은 등록 후 시설 정보 패널에서 입력)
          </label>

          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              시설 추가
            </button>
          </div>
        </form>
      </details>

      {/* 시설 목록 (종류별 그룹) */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">등록된 시설 ({facilities.length}건)</h3>
        {facilities.length === 0 ? (
          <p className="text-sm text-slate-500 italic px-2 py-4">등록된 시설이 없습니다.</p>
        ) : (
          CLOSURE_TYPE_VALUES.filter((t) => grouped.get(t)!.length > 0).map((t) => (
            <details key={t} open className="border border-slate-200 rounded-xl bg-white">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                {CLOSURE_TYPE_LABEL[t]} ({grouped.get(t)!.length})
              </summary>
              <ul className="divide-y divide-slate-100">
                {grouped.get(t)!.map((f) => (
                  <li key={f.id} className="px-4 py-3">
                    <FacilityRowItem
                      projectId={projectId}
                      facility={f}
                      stations={stations}
                    />
                  </li>
                ))}
              </ul>
            </details>
          ))
        )}
      </section>
    </div>
  )
}


function FacilityRowItem({
  projectId,
  facility,
  stations,
}: {
  projectId: string
  facility: FacilityRow
  stations: FacilityRow[]
}) {
  const code = formatFacilityCode(facility.closure_type, facility.seq_no)
  const parent = facility.parent_facility_id
    ? stations.find((s) => s.id === facility.parent_facility_id)
    : null

  return (
    <details className="group">
      <summary className="cursor-pointer flex items-start justify-between gap-3 list-none">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">
            <span className="font-mono text-xs text-slate-500">{code}</span>{' '}
            {facility.name}
            {facility.is_marked && (
              <span className="ml-2 inline-block bg-yellow-200 text-yellow-900 text-[10px] px-1.5 py-0.5 rounded">
                노랑
              </span>
            )}
          </p>
          {(facility.install_address || facility.closure_spec || parent) && (
            <p className="text-xs text-slate-500 mt-0.5">
              {facility.closure_spec && <span className="mr-2">{facility.closure_spec}</span>}
              {parent && (
                <span className="mr-2">
                  ← {formatFacilityCode(parent.closure_type, parent.seq_no)} {parent.name}
                </span>
              )}
              {facility.install_address && <span>{facility.install_address}</span>}
            </p>
          )}
        </div>
        <span className="text-xs text-slate-400 group-open:rotate-90 transition-transform">
          <Pencil className="h-3.5 w-3.5" />
        </span>
      </summary>

      {/* 편집 폼 + 삭제 */}
      <div className="mt-3 ml-2 pl-3 border-l-2 border-slate-200 space-y-3">
        <form action={updateFacility} className="grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="id" value={facility.id} />
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="closure_type" value={facility.closure_type} />

          <div className="sm:col-span-2">
            <label className="block text-[11px] text-slate-500">이름</label>
            <input
              type="text"
              name="name"
              required
              defaultValue={facility.name}
              maxLength={200}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-500">함체 규격</label>
            <select
              name="closure_spec"
              defaultValue={facility.closure_spec ?? ''}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">(미지정)</option>
              {CABLE_SPEC_VALUES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500">부모 국사</label>
            <select
              name="parent_facility_id"
              defaultValue={facility.parent_facility_id ?? ''}
              disabled={!isInternalNode(facility.closure_type)}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100"
            >
              <option value="">(없음)</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatFacilityCode(s.closure_type, s.seq_no)} {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500">시설 ID</label>
            <input
              type="text"
              name="facility_code"
              defaultValue={facility.facility_code ?? ''}
              maxLength={100}
              placeholder="미입력 시 자동 부여"
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          {hasInstallStatus(facility.closure_type) ? (
            <div>
              <label className="block text-[11px] text-slate-500">설치 구분</label>
              <select
                name="install_status"
                defaultValue={facility.install_status}
                className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              >
                {FACILITY_INSTALL_STATUS_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {FACILITY_INSTALL_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <input type="hidden" name="install_status" value={facility.install_status} />
          )}

          <div className="sm:col-span-2">
            <label className="block text-[11px] text-slate-500">설치장소명</label>
            <input
              type="text"
              name="install_address"
              defaultValue={facility.install_address ?? ''}
              maxLength={200}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[11px] text-slate-500">
              작업 가능 시간대 (선택 — 특정 시간대에만 작업 가능한 시설)
            </label>
            <div className="mt-0.5 flex items-center gap-1.5">
              <input
                type="time"
                name="work_window_start"
                defaultValue={facility.work_window_start?.slice(0, 5) ?? ''}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
              <span className="text-slate-400">~</span>
              <input
                type="time"
                name="work_window_end"
                defaultValue={facility.work_window_end?.slice(0, 5) ?? ''}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
              <span className="text-[11px] text-slate-400">
                비워두면 차수 시간대 안 아무때나
              </span>
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[11px] text-slate-500">비고</label>
            <textarea
              name="notes"
              rows={2}
              defaultValue={facility.notes ?? ''}
              maxLength={1000}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                name="is_marked"
                defaultChecked={facility.is_marked}
                className="rounded"
              />
              노란색 마크
            </label>
            <textarea
              name="mark_note"
              rows={2}
              defaultValue={facility.mark_note ?? ''}
              maxLength={500}
              placeholder="마크 내용 (체크 시에만 저장)"
              className="mt-1 w-full rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-sm"
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

        <form action={deleteFacility}>
          <input type="hidden" name="id" value={facility.id} />
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
