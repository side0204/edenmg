'use client'

import { useMemo, useState } from 'react'
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
} from 'lucide-react'
import {
  CABLE_SPEC_VALUES,
  CLOSURE_TYPE_LABEL,
  CLOSURE_TYPE_CATEGORY,
  formatFacilityCode,
  type ClosureType,
} from '@/lib/relocation'
import type { CableSpec } from '@/lib/connection'
import { updateFacilityFromCanvas, deleteFacilityFromCanvas } from './facility-actions'
import {
  addFacilityTask,
  removeFacilityTask,
  addFacilityMaterial,
  removeFacilityMaterial,
} from './facility-task-actions'

// 시설 정보 패널 — 캔버스에서 시설(모든 종류) 선택 시 우측에 표시.
//   - 시설 기본 정보 수정 (이름·함체 규격·설치 주소·비고)
//   - 공종량 (relocation_facility_tasks) — 기별명세서용
//   - 사용 자재 (relocation_facility_materials) — 기별명세서용
// 작업이 있는 시설만 공종·자재를 등록. 없으면 비워둔다.
// 함체 규격은 접속함체 종류에만 표시.

export type FacilityPanelData = {
  id: string
  closure_type: ClosureType
  seq_no: number
  name: string
  closure_spec: CableSpec | null
  install_address: string | null
  notes: string | null
}

export type TaskTypeOption = {
  id: string
  name: string
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
  cableCount,
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
  cableCount: number
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
  const [spec, setSpec] = useState<string>(facility.closure_spec ?? '')
  const [address, setAddress] = useState(facility.install_address ?? '')
  const [notes, setNotes] = useState(facility.notes ?? '')

  // 함체 규격은 접속함체 종류에만 표시
  const isClosure = CLOSURE_TYPE_CATEGORY[facility.closure_type] === '접속함체'

  // 공종 추가 폼
  const [newTaskType, setNewTaskType] = useState('')
  const [newTaskQty, setNewTaskQty] = useState('1')

  // 자재 추가 폼
  const [mName, setMName] = useState('')
  const [mSpec, setMSpec] = useState('')
  const [mUnit, setMUnit] = useState('개')
  const [mQty, setMQty] = useState('1')

  const [busy, setBusy] = useState(false)

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
      name: name.trim(),
      closure_spec: isClosure && spec ? (spec as CableSpec) : null,
      install_address: address.trim() || null,
      notes: notes.trim() || null,
    })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success('시설 정보를 저장했습니다')
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

  async function onDelete() {
    if (busy) return
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

  return (
    <div className="w-80 shrink-0 min-h-0 overflow-y-auto border-l border-slate-300 bg-white">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-3 py-2 flex items-center justify-between">
        <span className="text-sm font-bold text-slate-900">시설 정보</span>
        <div className="flex items-center gap-1">
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

        {/* 시설 삭제 */}
        <div className="border-t border-slate-200 pt-2">
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-rose-300 px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            시설 삭제
          </button>
        </div>
      </div>
    </div>
  )
}
