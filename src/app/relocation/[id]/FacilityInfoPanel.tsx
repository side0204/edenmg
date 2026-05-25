'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  X,
  Trash2,
  Save,
  Plus,
  Wrench,
  Package,
  ChevronLeft,
  ChevronRight,
  Camera,
} from 'lucide-react'
import {
  CABLE_SPEC_VALUES,
  CLOSURE_TYPE_LABEL,
  CLOSURE_TYPE_CATEGORY,
  FACILITY_INSTALL_STATUS_VALUES,
  FACILITY_INSTALL_STATUS_LABEL,
  formatFacilityCode,
  facilityIdLabel,
  hasInstallStatus,
  isInternalNode,
  type ClosureType,
  type FacilityInstallStatus,
} from '@/lib/relocation'
import type { CableSpec } from '@/lib/connection'
import {
  updateFacilityFromCanvas,
  deleteFacilityFromCanvas,
  saveFacilityLabelOffset,
  setFacilityInstallOrder,
} from './facility-actions'
import {
  addFacilityTask,
  removeFacilityTask,
  addFacilityMaterial,
  removeFacilityMaterial,
} from './facility-task-actions'
import {
  listFieldInspections,
  getFieldInspectionUrls,
  deleteFieldInspection,
} from './field-inspection-actions'

// 시설 정보 패널 — 캔버스에서 시설(모든 종류) 선택 시 우측에 표시.
//   시설의 유일 정식 편집기 (「시설」 탭 폼과 필드를 일치시킴).
//   - 시설 기본 정보 (이름·함체 규격·설치 주소·비고)
//   - 부모 국사 (MOFD·OJC·국사내장비) · 작업 가능 시간대 · 노란 마크
//   - 공종량 (relocation_facility_tasks) — 기별명세서용
//   - 사용 자재 (relocation_facility_materials) — 기별명세서용
// 작업이 있는 시설만 공종·자재를 등록. 없으면 비워둔다.
// 함체 규격은 접속함체 종류에만, 부모 국사는 국사 내부 노드에만 표시.

export type FacilityPanelData = {
  id: string
  closure_type: ClosureType
  seq_no: number
  name: string
  facility_code: string | null
  closure_spec: CableSpec | null
  install_address: string | null
  notes: string | null
  inspection_request: string | null
  parent_facility_id: string | null
  is_marked: boolean
  mark_note: string | null
  work_window_start: string | null
  work_window_end: string | null
  install_status: string
}

// 부모 국사 후보 (국사 종류 시설)
export type FacilityStationOption = {
  id: string
  closure_type: ClosureType
  seq_no: number
  name: string
}

export type TaskTypeOption = {
  id: string
  name: string
  code: string | null
  unit_label: string
  standard_minutes_per_unit: number
}

export type FacilityTaskItem = {
  id: string
  task_type_id: string
  quantity: number
}

export type FacilityMaterialItem = {
  id: string
  name: string
  spec: string | null
  unit: string
  quantity: number
}

export default function FacilityInfoPanel({
  projectId,
  facility,
  stations,
  cableCount,
  installNo,
  position,
  taskTypes,
  tasks,
  materials,
  onClose,
  onChanged,
  collapsed,
  onToggleCollapse,
}: {
  projectId: string
  facility: FacilityPanelData
  stations: FacilityStationOption[]
  cableCount: number
  // 시설명 앞 설치 순번 배지 번호 — 배지 대상이 아니면 null
  installNo: number | null
  // 캔버스 좌표 (효과 위치 = drag offset + DB x_hint/y_hint). 진단용 좌표 표시.
  position?: { x: number; y: number } | null
  taskTypes: TaskTypeOption[]
  tasks: FacilityTaskItem[]
  materials: FacilityMaterialItem[]
  onClose: () => void
  onChanged: () => void
  collapsed: boolean
  onToggleCollapse: () => void
}) {
  // 기본 정보 편집
  const [name, setName] = useState(facility.name)
  const [facilityCode, setFacilityCode] = useState(facility.facility_code ?? '')
  const [spec, setSpec] = useState<string>(facility.closure_spec ?? '')
  const [address, setAddress] = useState(facility.install_address ?? '')
  const [notes, setNotes] = useState(facility.notes ?? '')
  // 실사정보 시설 전용 — 실사요청(작업자에게 무엇을 확인할지). 다른 시설엔 미사용.
  const [inspectionRequest, setInspectionRequest] = useState(
    facility.inspection_request ?? '',
  )
  const [parentId, setParentId] = useState<string>(facility.parent_facility_id ?? '')
  const [isMarked, setIsMarked] = useState(facility.is_marked)
  const [markNote, setMarkNote] = useState(facility.mark_note ?? '')
  const [windowStart, setWindowStart] = useState(
    facility.work_window_start?.slice(0, 5) ?? '',
  )
  const [windowEnd, setWindowEnd] = useState(
    facility.work_window_end?.slice(0, 5) ?? '',
  )
  const [installStatus, setInstallStatus] = useState<FacilityInstallStatus>(
    facility.install_status === 'existing' ? 'existing' : 'new',
  )
  // 설치 순번 배지 — 시설명 앞 숫자. installNo 가 null 이면 배지 대상 아님 (필드 숨김).
  const [installNoInput, setInstallNoInput] = useState(
    installNo != null ? String(installNo) : '',
  )

  // 함체 규격은 접속함체 종류에만, 부모 국사는 국사 내부 노드에만 표시
  const isClosure = CLOSURE_TYPE_CATEGORY[facility.closure_type] === '접속함체'
  // 설치 구분(기설/신설) 은 접속함체 + RN/IJP 에 표시
  const showInstallStatus = hasInstallStatus(facility.closure_type)
  const isInternal = isInternalNode(facility.closure_type)
  // 실사정보 시설 — 정보 패널을 비고 + 첨부 사진만 노출 (다른 필드 숨김)
  const isInspectionFacility = facility.closure_type === '실사정보'

  // 공종 추가 폼
  const [newTaskType, setNewTaskType] = useState('')
  const [newTaskQty, setNewTaskQty] = useState('1')

  // 자재 추가 폼
  const [mName, setMName] = useState('')
  const [mSpec, setMSpec] = useState('')
  const [mUnit, setMUnit] = useState('개')
  const [mQty, setMQty] = useState('1')

  const [busy, setBusy] = useState(false)

  // 실사 캡처 — facility 변경 시 fetch + signed URL.
  //   휘발 없음: DB 저장. 갤러리에 amber 「실사내용확인」 배지.
  type InspectionRow = {
    id: string
    image_path: string
    note: string | null
    captured_at: string
  }
  const [inspections, setInspections] = useState<InspectionRow[]>([])
  const [inspectionUrls, setInspectionUrls] = useState<Record<string, string>>({})
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [inspectionRefreshSeq, setInspectionRefreshSeq] = useState(0)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const rows = (await listFieldInspections(facility.id)) as InspectionRow[]
      if (cancelled) return
      setInspections(rows)
      const paths = rows.map((r) => r.image_path)
      if (paths.length > 0) {
        const urls = await getFieldInspectionUrls(paths)
        if (cancelled) return
        setInspectionUrls(urls)
      } else {
        setInspectionUrls({})
      }
    })()
    return () => {
      cancelled = true
    }
  }, [facility.id, inspectionRefreshSeq])

  async function onDeleteInspection(id: string) {
    if (!confirm('이 실사 캡처를 삭제하시겠습니까?')) return
    const fd = new FormData()
    fd.append('inspection_id', id)
    fd.append('project_id', projectId)
    const res = await deleteFieldInspection(fd)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success('실사 캡처를 삭제했습니다')
    setInspectionRefreshSeq((n) => n + 1)
  }

  const taskTypeById = useMemo(
    () => new Map(taskTypes.map((t) => [t.id, t])),
    [taskTypes],
  )
  const usedTaskTypeIds = useMemo(
    () => new Set(tasks.map((t) => t.task_type_id)),
    [tasks],
  )
  const availableTaskTypes = useMemo(
    () => taskTypes.filter((t) => !usedTaskTypeIds.has(t.id)),
    [taskTypes, usedTaskTypeIds],
  )
  // 예상 작업시간 합계 (분) — 차수 계획 참고
  const totalMinutes = useMemo(
    () =>
      tasks.reduce((acc, t) => {
        const tt = taskTypeById.get(t.task_type_id)
        return acc + (tt ? tt.standard_minutes_per_unit * t.quantity : 0)
      }, 0),
    [tasks, taskTypeById],
  )

  async function onSaveInfo() {
    if (busy) return
    setBusy(true)
    const result = await updateFacilityFromCanvas({
      project_id: projectId,
      id: facility.id,
      closure_type: facility.closure_type,
      name: name.trim(),
      facility_code: facilityCode.trim() || null,
      closure_spec: isClosure && spec ? (spec as CableSpec) : null,
      install_address: address.trim() || null,
      notes: notes.trim() || null,
      inspection_request: isInspectionFacility
        ? inspectionRequest.trim() || null
        : null,
      parent_facility_id: isInternal && parentId ? parentId : null,
      is_marked: isMarked,
      mark_note: isMarked ? markNote.trim() || null : null,
      work_window_start: windowStart || null,
      work_window_end: windowEnd || null,
      install_status: installStatus,
    })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success('시설 정보를 저장했습니다')
    onChanged()
  }

  async function onSaveInstallNo() {
    if (busy) return
    const n = Number(installNoInput)
    if (!Number.isInteger(n) || n < 1) {
      toast.error('순번은 1 이상의 정수로 입력하세요')
      return
    }
    setBusy(true)
    const result = await setFacilityInstallOrder({
      project_id: projectId,
      facility_id: facility.id,
      desired_no: n,
    })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success('설치 순번을 변경했습니다')
    onChanged()
  }

  async function onAddTask() {
    if (busy) return
    if (!newTaskType) {
      toast.error('공종을 선택하세요')
      return
    }
    const qty = Number(newTaskQty)
    if (!Number.isInteger(qty) || qty < 1) {
      toast.error('수량은 1 이상의 정수로 입력하세요')
      return
    }
    setBusy(true)
    const result = await addFacilityTask({
      project_id: projectId,
      facility_id: facility.id,
      task_type_id: newTaskType,
      quantity: qty,
    })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setNewTaskType('')
    setNewTaskQty('1')
    onChanged()
  }

  async function onRemoveTask(id: string) {
    if (busy) return
    setBusy(true)
    const result = await removeFacilityTask({ project_id: projectId, id })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onChanged()
  }

  async function onAddMaterial() {
    if (busy) return
    if (!mName.trim()) {
      toast.error('자재명을 입력하세요')
      return
    }
    const qty = Number(mQty)
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error('수량은 0 보다 큰 값으로 입력하세요')
      return
    }
    setBusy(true)
    const result = await addFacilityMaterial({
      project_id: projectId,
      facility_id: facility.id,
      name: mName.trim(),
      spec: mSpec.trim() || null,
      unit: mUnit.trim() || '개',
      quantity: qty,
    })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setMName('')
    setMSpec('')
    setMUnit('개')
    setMQty('1')
    onChanged()
  }

  async function onRemoveMaterial(id: string) {
    if (busy) return
    setBusy(true)
    const result = await removeFacilityMaterial({ project_id: projectId, id })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onChanged()
  }

  async function onResetLabel() {
    if (busy) return
    setBusy(true)
    const result = await saveFacilityLabelOffset(projectId, facility.id, 0, 0)
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success('라벨 위치를 초기화했습니다')
    onChanged()
  }

  async function onDelete() {
    if (busy) return
    // 연결된 케이블이 있으면 FK 제약으로 삭제 불가 — 미리 안내
    if (cableCount > 0) {
      toast.error(
        `연결된 케이블 ${cableCount}개를 먼저 삭제해야 이 시설을 삭제할 수 있습니다.`,
      )
      return
    }
    if (
      !confirm(
        `${facility.name} 시설을 삭제하시겠습니까?\n등록된 공종·자재도 함께 삭제됩니다.`,
      )
    ) {
      return
    }
    setBusy(true)
    const result = await deleteFacilityFromCanvas(projectId, facility.id)
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success('시설을 삭제했습니다')
    onClose()
    onChanged()
  }

  // 접힘 — 얇은 세로 스트립. 캔버스 작업 공간 확보용.
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapse}
        title="시설 정보 펼치기"
        className="w-9 shrink-0 h-full border-l border-slate-300 bg-white flex flex-col items-center gap-2 py-2 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="text-[11px] font-bold [writing-mode:vertical-rl]">
          시설 정보
        </span>
      </button>
    )
  }

  // 실사정보 시설 — 단순화된 패널 (식별·이름·비고·갤러리만, 다른 필드 숨김).
  //   owner 결정 (2026-05-24): "정보패널에서 첨부사진과 비고에 들어가는
  //   실사내용만 표시하면 돼".
  if (isInspectionFacility) {
    return (
      <div className="w-80 shrink-0 min-h-0 overflow-y-auto border-l border-slate-300 bg-white">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-3 py-2 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-900">실사정보</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              title="실사정보 시설 삭제"
              className="inline-flex items-center gap-0.5 rounded-md border border-rose-300 px-1.5 py-0.5 text-[11px] font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              삭제
            </button>
            <button
              type="button"
              onClick={onToggleCollapse}
              title="패널 접기"
              className="text-slate-400 hover:text-slate-900"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="닫기"
              className="text-slate-400 hover:text-slate-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-3 space-y-3">
          {/* 식별 정보 */}
          <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600">
            <p className="font-mono font-semibold text-slate-800">
              {formatFacilityCode(facility.closure_type, facility.seq_no)}
              <span className="ml-1.5 font-sans font-normal text-slate-500">실사정보</span>
            </p>
            {position && (
              <p className="mt-0.5 font-mono text-[10px] text-slate-500">
                좌표 ({Math.round(position.x)}, {Math.round(position.y)})
              </p>
            )}
          </div>

          {/* 이름 + 실사요청 (위) + 실사내용/비고 (아래, 두 배 크기) + 저장 */}
          <div className="space-y-2">
            <div>
              <label className="block text-[11px] font-medium text-slate-600">이름</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600">
                실사 요청
                <span className="ml-1 text-slate-400 font-normal">(작업자에게 확인 요청)</span>
              </label>
              <textarea
                value={inspectionRequest}
                onChange={(e) => setInspectionRequest(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="예) 함체 우측에 신설 분기함 자리가 있는지 확인해 주세요"
                className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs resize-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600">
                실사 내용
                <span className="ml-1 text-slate-400 font-normal">(비고)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={8}
                maxLength={1000}
                placeholder="이 위치에서 확인한 실사 내용을 적어주세요"
                className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs resize-none"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onSaveInfo}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1 text-[11px] font-medium text-white hover:bg-slate-800 disabled:bg-slate-300"
              >
                <Save className="h-3.5 w-3.5" />
                정보 저장
              </button>
            </div>
          </div>

          {/* 첨부 사진 (실사 캡처 갤러리) */}
          <div className="border-t border-slate-200 pt-2">
            <p className="flex items-center gap-1 text-[11px] font-bold text-slate-700">
              <Camera className="h-3.5 w-3.5" />
              첨부 사진
              {inspections.length > 0 && (
                <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                  실사내용확인 · {inspections.length}건
                </span>
              )}
            </p>
            {inspections.length === 0 ? (
              <p className="mt-1.5 text-[11px] text-slate-400 italic">
                저장된 실사 캡처 없음
              </p>
            ) : (
              <ul className="mt-1.5 grid grid-cols-2 gap-1.5">
                {inspections.map((insp) => {
                  const url = inspectionUrls[insp.image_path]
                  const date = new Date(insp.captured_at)
                  const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${String(
                    date.getHours(),
                  ).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
                  return (
                    <li
                      key={insp.id}
                      className="group relative rounded-md border border-slate-200 overflow-hidden bg-slate-100"
                    >
                      {url ? (
                        <button
                          type="button"
                          onClick={() => setPreviewUrl(url)}
                          className="block w-full"
                          title={insp.note ?? '클릭하여 크게 보기'}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt={insp.note ?? '실사 캡처'}
                            className="w-full h-24 object-cover"
                          />
                        </button>
                      ) : (
                        <div className="w-full h-24 flex items-center justify-center text-[10px] text-slate-400">
                          로딩 중…
                        </div>
                      )}
                      <div className="px-1.5 py-1 bg-white">
                        <p className="text-[10px] text-slate-500">{dateStr}</p>
                        {insp.note && (
                          <p className="text-[10px] text-slate-700 truncate" title={insp.note}>
                            {insp.note}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteInspection(insp.id)}
                        className="absolute top-1 right-1 rounded-md bg-white/90 p-1 text-slate-400 opacity-0 group-hover:opacity-100 hover:text-rose-600 transition"
                        title="삭제"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Lightbox */}
          {previewUrl && (
            <div
              className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 cursor-zoom-out"
              onClick={() => setPreviewUrl(null)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="실사 캡처"
                className="max-w-full max-h-full rounded-lg shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
              <button
                type="button"
                onClick={() => setPreviewUrl(null)}
                className="absolute top-4 right-4 rounded-full bg-white/90 p-2 text-slate-700 hover:bg-white"
                title="닫기"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="w-80 shrink-0 min-h-0 overflow-y-auto border-l border-slate-300 bg-white">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-3 py-2 flex items-center justify-between">
        <span className="text-sm font-bold text-slate-900">시설 정보</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            title="시설 삭제"
            className="inline-flex items-center gap-0.5 rounded-md border border-rose-300 px-1.5 py-0.5 text-[11px] font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            삭제
          </button>
          <button
            type="button"
            onClick={onToggleCollapse}
            title="패널 접기"
            className="text-slate-400 hover:text-slate-900"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="닫기"
            className="text-slate-400 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* 식별 정보 */}
        <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600">
          <p className="font-mono font-semibold text-slate-800">
            {formatFacilityCode(facility.closure_type, facility.seq_no)}
            <span className="ml-1.5 font-sans font-normal text-slate-500">
              {CLOSURE_TYPE_LABEL[facility.closure_type]}
            </span>
          </p>
          <p className="mt-0.5">연결 케이블 {cableCount}개</p>
          {position && (
            <p className="mt-0.5 font-mono text-[10px] text-slate-500">
              좌표 ({Math.round(position.x)}, {Math.round(position.y)})
            </p>
          )}
        </div>

        {/* 기본 정보 편집 */}
        <div className="space-y-2">
          <div>
            <label className="block text-[11px] font-medium text-slate-600">
              시설 이름
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
            />
          </div>
          {installNo != null && (
            <div>
              <label className="block text-[11px] font-medium text-slate-600">
                설치 순번 (시설명 앞 숫자 배지)
              </label>
              <div className="mt-0.5 flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={installNoInput}
                  onChange={(e) => setInstallNoInput(e.target.value)}
                  className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={onSaveInstallNo}
                  disabled={busy}
                  className="inline-flex items-center gap-0.5 rounded-md border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Save className="h-3 w-3" />
                  적용
                </button>
              </div>
              <p className="mt-0.5 text-[10px] text-slate-400">
                입력한 번호를 그대로 적용합니다. 실제 시설 수보다 큰 번호도
                가능하고, 같은 번호를 쓰던 시설이 있으면 두 시설의 번호를 서로
                맞바꿉니다.
              </p>
            </div>
          )}
          {isClosure && (
            <div>
              <label className="block text-[11px] font-medium text-slate-600">
                함체 규격
              </label>
              <select
                value={spec}
                onChange={(e) => setSpec(e.target.value)}
                className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
              >
                <option value="">(미지정)</option>
                {CABLE_SPEC_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-[11px] font-medium text-slate-600">
              {facilityIdLabel(facility.closure_type)}
            </label>
            <input
              type="text"
              value={facilityCode}
              onChange={(e) => setFacilityCode(e.target.value)}
              maxLength={100}
              placeholder="미입력 시 자동 부여"
              className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
            />
          </div>
          {showInstallStatus && (
            <div>
              <label className="block text-[11px] font-medium text-slate-600">
                설치 구분
              </label>
              <select
                value={installStatus}
                onChange={(e) =>
                  setInstallStatus(e.target.value as FacilityInstallStatus)
                }
                className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
              >
                {FACILITY_INSTALL_STATUS_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {FACILITY_INSTALL_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-[11px] font-medium text-slate-600">
              설치 주소·위치
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={500}
              placeholder="선택 입력"
              className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600">비고</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={1000}
              className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs resize-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600">
              라벨 위치
            </label>
            <p className="mt-0.5 text-[10px] text-slate-400">
              캔버스에서 시설명을 마우스로 끌어 원하는 곳에 둘 수 있습니다.
            </p>
            <button
              type="button"
              onClick={onResetLabel}
              disabled={busy}
              className="mt-1 inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              라벨 위치 초기화
            </button>
          </div>
          {isInternal && (
            <div>
              <label className="block text-[11px] font-medium text-slate-600">
                부모 국사
              </label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
              >
                <option value="">(없음)</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {formatFacilityCode(s.closure_type, s.seq_no)} {s.name}
                  </option>
                ))}
              </select>
              <p className="mt-0.5 text-[10px] text-slate-400">
                MOFD·OJC·국사내장비는 소속 국사를 지정합니다.
              </p>
            </div>
          )}
          <div>
            <label className="block text-[11px] font-medium text-slate-600">
              작업 가능 시간대
            </label>
            <div className="mt-0.5 flex items-center gap-1">
              <input
                type="time"
                value={windowStart}
                onChange={(e) => setWindowStart(e.target.value)}
                className="rounded-md border border-slate-300 px-1.5 py-1 text-xs"
              />
              <span className="text-slate-400">~</span>
              <input
                type="time"
                value={windowEnd}
                onChange={(e) => setWindowEnd(e.target.value)}
                className="rounded-md border border-slate-300 px-1.5 py-1 text-xs"
              />
            </div>
            <p className="mt-0.5 text-[10px] text-slate-400">
              특정 시간대에만 작업 가능한 시설. 비우면 차수 시간대 안 아무때나.
            </p>
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
              <input
                type="checkbox"
                checked={isMarked}
                onChange={(e) => setIsMarked(e.target.checked)}
                className="rounded"
              />
              노란색 마크
            </label>
            {isMarked && (
              <textarea
                value={markNote}
                onChange={(e) => setMarkNote(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="마크 내용 — 이 시설을 표시한 이유·메모"
                className="mt-1 w-full rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs resize-none"
              />
            )}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onSaveInfo}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1 text-[11px] font-medium text-white hover:bg-slate-800 disabled:bg-slate-300"
            >
              <Save className="h-3.5 w-3.5" />
              정보 저장
            </button>
          </div>
        </div>

        {/* 공종량 — 기별명세서 */}
        <div className="border-t border-slate-200 pt-2">
          <p className="flex items-center gap-1 text-[11px] font-bold text-slate-700">
            <Wrench className="h-3.5 w-3.5" />
            공종량 (기별명세서)
          </p>
          <p className="mt-0.5 text-[10px] text-slate-400">
            이 시설에서 작업이 있으면 공종·수량을 등록하세요. 없으면 비워둡니다.
          </p>

          <ul className="mt-1.5 space-y-1">
            {tasks.length === 0 ? (
              <li className="text-[11px] text-slate-400 italic">등록된 공종 없음</li>
            ) : (
              tasks.map((t) => {
                const tt = taskTypeById.get(t.task_type_id)
                return (
                  <li
                    key={t.id}
                    className="flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1 text-[11px]"
                  >
                    <span className="flex-1 text-slate-700">
                      {tt?.name ?? '(삭제된 공종)'}
                    </span>
                    <span className="font-semibold text-slate-900">
                      {t.quantity}
                      {tt?.unit_label ?? ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveTask(t.id)}
                      disabled={busy}
                      className="text-slate-400 hover:text-rose-600 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                )
              })
            )}
          </ul>

          {totalMinutes > 0 && (
            <p className="mt-1 text-[10px] text-slate-500">
              예상 작업시간 약{' '}
              <span className="font-semibold text-slate-700">{totalMinutes}분</span>
            </p>
          )}

          {/* 공종 추가 */}
          {availableTaskTypes.length > 0 ? (
            <div className="mt-1.5 flex items-center gap-1">
              <select
                value={newTaskType}
                onChange={(e) => setNewTaskType(e.target.value)}
                className="flex-1 min-w-0 rounded-md border border-slate-300 px-1.5 py-1 text-[11px]"
              >
                <option value="">공종 선택…</option>
                {availableTaskTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                step={1}
                value={newTaskQty}
                onChange={(e) => setNewTaskQty(e.target.value)}
                className="w-12 rounded-md border border-slate-300 px-1.5 py-1 text-[11px]"
              />
              <button
                type="button"
                onClick={onAddTask}
                disabled={busy}
                className="inline-flex items-center gap-0.5 rounded-md border border-slate-300 px-1.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Plus className="h-3 w-3" />
                추가
              </button>
            </div>
          ) : taskTypes.length === 0 ? (
            <p className="mt-1.5 text-[10px] text-amber-600">
              공종 마스터가 없습니다. 마이그레이션 시드(0037)를 확인하세요.
            </p>
          ) : (
            <p className="mt-1.5 text-[10px] text-slate-400">모든 공종이 등록되었습니다.</p>
          )}
        </div>

        {/* 사용 자재 — 기별명세서 */}
        <div className="border-t border-slate-200 pt-2">
          <p className="flex items-center gap-1 text-[11px] font-bold text-slate-700">
            <Package className="h-3.5 w-3.5" />
            사용 자재 (기별명세서)
          </p>

          <ul className="mt-1.5 space-y-1">
            {materials.length === 0 ? (
              <li className="text-[11px] text-slate-400 italic">등록된 자재 없음</li>
            ) : (
              materials.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1 text-[11px]"
                >
                  <span className="flex-1 min-w-0 text-slate-700">
                    <span className="truncate">{m.name}</span>
                    {m.spec && (
                      <span className="ml-1 text-slate-400">{m.spec}</span>
                    )}
                  </span>
                  <span className="font-semibold text-slate-900 shrink-0">
                    {m.quantity}
                    {m.unit}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveMaterial(m.id)}
                    disabled={busy}
                    className="text-slate-400 hover:text-rose-600 disabled:opacity-50 shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))
            )}
          </ul>

          {/* 자재 추가 */}
          <div className="mt-1.5 space-y-1">
            <input
              type="text"
              value={mName}
              onChange={(e) => setMName(e.target.value)}
              placeholder="자재명"
              maxLength={200}
              className="w-full rounded-md border border-slate-300 px-2 py-1 text-[11px]"
            />
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={mSpec}
                onChange={(e) => setMSpec(e.target.value)}
                placeholder="규격 (선택)"
                maxLength={100}
                className="flex-1 min-w-0 rounded-md border border-slate-300 px-2 py-1 text-[11px]"
              />
              <input
                type="number"
                min={0}
                step="0.01"
                value={mQty}
                onChange={(e) => setMQty(e.target.value)}
                placeholder="수량"
                className="w-14 rounded-md border border-slate-300 px-1.5 py-1 text-[11px]"
              />
              <input
                type="text"
                value={mUnit}
                onChange={(e) => setMUnit(e.target.value)}
                placeholder="단위"
                maxLength={20}
                className="w-12 rounded-md border border-slate-300 px-1.5 py-1 text-[11px]"
              />
              <button
                type="button"
                onClick={onAddMaterial}
                disabled={busy}
                className="inline-flex items-center gap-0.5 rounded-md border border-slate-300 px-1.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Plus className="h-3 w-3" />
                추가
              </button>
            </div>
          </div>
        </div>

        {/* 실사 내용 — 캔버스 실사 그림+텍스트를 캡처해 저장한 이미지 */}
        <div className="border-t border-slate-200 pt-2">
          <p className="flex items-center gap-1 text-[11px] font-bold text-slate-700">
            <Camera className="h-3.5 w-3.5" />
            실사 내용
            {inspections.length > 0 && (
              <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                실사내용확인 · {inspections.length}건
              </span>
            )}
          </p>
          {inspections.length === 0 ? (
            <p className="mt-1.5 text-[11px] text-slate-400 italic">
              저장된 실사 캡처 없음
            </p>
          ) : (
            <ul className="mt-1.5 grid grid-cols-2 gap-1.5">
              {inspections.map((insp) => {
                const url = inspectionUrls[insp.image_path]
                const date = new Date(insp.captured_at)
                const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${String(
                  date.getHours(),
                ).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
                return (
                  <li
                    key={insp.id}
                    className="group relative rounded-md border border-slate-200 overflow-hidden bg-slate-100"
                  >
                    {url ? (
                      <button
                        type="button"
                        onClick={() => setPreviewUrl(url)}
                        className="block w-full"
                        title={insp.note ?? '클릭하여 크게 보기'}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={insp.note ?? '실사 캡처'}
                          className="w-full h-24 object-cover"
                        />
                      </button>
                    ) : (
                      <div className="w-full h-24 flex items-center justify-center text-[10px] text-slate-400">
                        로딩 중…
                      </div>
                    )}
                    <div className="px-1.5 py-1 bg-white">
                      <p className="text-[10px] text-slate-500">{dateStr}</p>
                      {insp.note && (
                        <p className="text-[10px] text-slate-700 truncate" title={insp.note}>
                          {insp.note}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteInspection(insp.id)}
                      className="absolute top-1 right-1 rounded-md bg-white/90 p-1 text-slate-400 opacity-0 group-hover:opacity-100 hover:text-rose-600 transition"
                      title="삭제"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* 실사 캡처 크게 보기 — 클릭 시 풀스크린 모달 */}
        {previewUrl && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 cursor-zoom-out"
            onClick={() => setPreviewUrl(null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="실사 캡처"
              className="max-w-full max-h-full rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              onClick={() => setPreviewUrl(null)}
              className="absolute top-4 right-4 rounded-full bg-white/90 p-2 text-slate-700 hover:bg-white"
              title="닫기"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
