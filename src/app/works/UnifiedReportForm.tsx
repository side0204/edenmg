'use client'

import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  CABLE_SPEC_VALUES,
  CONNECTION_TASK_TYPE_VALUES,
  PLAN_NODE_TYPE_LABEL,
  calcCoreCount,
  parseLineNumbers,
  type CableSpec,
  type ConnectionTaskType,
  type PlanNodeType,
} from '@/lib/connection'
import { REPORT_PROGRESS_VALUES } from '@/lib/work'

export type UnifiedNode = {
  id: string
  parent_id: string | null
  node_type: PlanNodeType
  name: string
  code: string | null
  spec_enum: CableSpec | null
}

export type MaterialMaster = {
  id: string
  name: string
  spec: string | null
  unit: string | null
}

type TaskRow = {
  task_type: ConnectionTaskType | ''
  custom_task_name: string
  task_count: string // 입력은 string, 검증 시 int
  notes: string
}

type MaterialRow = {
  material_id: string
  custom_name: string
  custom_spec: string
  custom_unit: string
  quantity: string
  notes: string
}

export function UnifiedReportForm({
  workId,
  chainName,
  segmentNodes,
  nodeMap,
  masters,
  defaultReportDate,
  action,
}: {
  workId: string
  chainName: string | null
  segmentNodes: UnifiedNode[]
  nodeMap: Record<string, UnifiedNode>
  masters: MaterialMaster[]
  defaultReportDate: string
  action: (formData: FormData) => void
}) {
  // 노드별 dynamic state
  const [tasksByNode, setTasksByNode] = useState<Record<string, TaskRow[]>>(() => {
    const init: Record<string, TaskRow[]> = {}
    for (const n of segmentNodes) init[n.id] = []
    return init
  })
  const [materialsByNode, setMaterialsByNode] = useState<Record<string, MaterialRow[]>>(() => {
    const init: Record<string, MaterialRow[]> = {}
    for (const n of segmentNodes) init[n.id] = []
    return init
  })

  // 서버로 보낼 JSON 직렬화 (hidden 필드 값)
  const tasksJson = useMemo(() => JSON.stringify(tasksByNode), [tasksByNode])
  const materialsJson = useMemo(() => JSON.stringify(materialsByNode), [materialsByNode])

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="work_id" value={workId} />
      <input type="hidden" name="tasks_json" value={tasksJson} />
      <input type="hidden" name="materials_json" value={materialsJson} />

      <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
        <h2 className="text-base font-semibold text-slate-700 tracking-tight">일보 기본 정보</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-sm font-medium text-slate-700">일자 *</span>
            <input
              type="date"
              name="report_date"
              defaultValue={defaultReportDate}
              required
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-slate-700">진행률 *</span>
            <select name="progress" defaultValue="진행중" className={inputClass}>
              {REPORT_PROGRESS_VALUES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="block text-sm font-medium text-slate-700">비고 (선택)</span>
          <textarea
            name="notes"
            rows={2}
            maxLength={1000}
            placeholder="협업 메모·특이사항"
            className={`${inputClass} resize-none`}
          />
        </label>
      </section>

      {segmentNodes.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          cable 이 없습니다. 먼저 chain 에 함체·하위국을 추가하세요.
        </p>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            {chainName ? `「${chainName}」` : 'chain'} — 각 cable 별로 케이블·선번·공종·자재를 한번에 입력합니다. cable 입력이 비어있으면 그 cable 은 미작업으로 처리됩니다.
          </p>
          <div className="space-y-3">
            {segmentNodes.map((n) => {
              const parent = n.parent_id ? nodeMap[n.parent_id] : null
              const parentLabel = parent
                ? `[${PLAN_NODE_TYPE_LABEL[parent.node_type]}] ${parent.name}${
                    parent.spec_enum ? ` (${parent.spec_enum})` : ''
                  }`
                : '?'
              const nodeLabel = `[${PLAN_NODE_TYPE_LABEL[n.node_type]}] ${n.name}${
                n.code ? ` ID:${n.code}` : ''
              }${n.spec_enum ? ` (${n.spec_enum})` : ''}`
              return (
                <NodeCard
                  key={n.id}
                  nodeId={n.id}
                  parentLabel={parentLabel}
                  nodeLabel={nodeLabel}
                  tasks={tasksByNode[n.id] ?? []}
                  setTasks={(rows) =>
                    setTasksByNode((prev) => ({ ...prev, [n.id]: rows }))
                  }
                  materials={materialsByNode[n.id] ?? []}
                  setMaterials={(rows) =>
                    setMaterialsByNode((prev) => ({ ...prev, [n.id]: rows }))
                  }
                  masters={masters}
                />
              )
            })}
          </div>
        </>
      )}

      <button
        type="submit"
        className="w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-medium text-white hover:bg-slate-800"
      >
        일보 제출
      </button>
    </form>
  )
}

function NodeCard({
  nodeId,
  parentLabel,
  nodeLabel,
  tasks,
  setTasks,
  materials,
  setMaterials,
  masters,
}: {
  nodeId: string
  parentLabel: string
  nodeLabel: string
  tasks: TaskRow[]
  setTasks: (rows: TaskRow[]) => void
  materials: MaterialRow[]
  setMaterials: (rows: MaterialRow[]) => void
  masters: MaterialMaster[]
}) {
  const [lineNumbers, setLineNumbers] = useState('')
  const trimmed = lineNumbers.trim()
  let preview: { ok: true; coreCount: number } | { ok: false; error: string } | null = null
  if (trimmed) {
    const r = parseLineNumbers(trimmed)
    preview = r.ok ? { ok: true, coreCount: r.coreCount } : { ok: false, error: r.error }
  }
  void calcCoreCount

  const addTask = () =>
    setTasks([
      ...tasks,
      { task_type: '', custom_task_name: '', task_count: '', notes: '' },
    ])
  const updateTask = (idx: number, patch: Partial<TaskRow>) =>
    setTasks(tasks.map((t, i) => (i === idx ? { ...t, ...patch } : t)))
  const removeTask = (idx: number) => setTasks(tasks.filter((_, i) => i !== idx))

  const addMaterial = () =>
    setMaterials([
      ...materials,
      {
        material_id: '',
        custom_name: '',
        custom_spec: '',
        custom_unit: '',
        quantity: '',
        notes: '',
      },
    ])
  const updateMaterial = (idx: number, patch: Partial<MaterialRow>) =>
    setMaterials(materials.map((m, i) => (i === idx ? { ...m, ...patch } : m)))
  const removeMaterial = (idx: number) => setMaterials(materials.filter((_, i) => i !== idx))

  return (
    <section className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
      <p className="text-xs text-slate-600">
        <span className="font-medium">{parentLabel}</span>
        <span className="mx-1 text-slate-400">→</span>
        <span className="font-medium">{nodeLabel}</span>
      </p>

      {/* cable 입력 */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
        <p className="text-xs font-medium text-slate-600">cable</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="block text-xs text-slate-600">케이블규격</span>
            <select name={`cable_spec_${nodeId}`} defaultValue="" className={smallInput}>
              <option value="">선택</option>
              {CABLE_SPEC_VALUES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-slate-600">사용선번</span>
            <input
              name={`line_numbers_${nodeId}`}
              value={lineNumbers}
              onChange={(e) => setLineNumbers(e.currentTarget.value)}
              placeholder="1-6 / 1,3,5 / 1-6,12-18"
              className={
                smallInput +
                (preview && !preview.ok
                  ? ' border-rose-400 focus:border-rose-500 focus:ring-rose-500'
                  : '')
              }
            />
          </label>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs">
          <div>
            {preview && preview.ok && (
              <span className="rounded bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">
                접속코어수: {preview.coreCount}
              </span>
            )}
            {preview && !preview.ok && (
              <span className="rounded bg-rose-100 px-2 py-0.5 font-medium text-rose-700">
                ⚠ {preview.error}
              </span>
            )}
          </div>
          <label className="inline-flex items-center gap-1 text-slate-600">
            <input
              type="checkbox"
              name={`completed_${nodeId}`}
              value="1"
              defaultChecked
              className="size-4"
            />
            완료
          </label>
        </div>
        <input
          name={`segment_notes_${nodeId}`}
          placeholder="cable 메모 (선택)"
          maxLength={200}
          className={smallInput}
        />
      </div>

      {/* 공종 입력 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-slate-600">공종 ({tasks.length})</p>
          <button
            type="button"
            onClick={addTask}
            className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs text-blue-600 hover:bg-blue-50"
          >
            <Plus className="h-3 w-3" />
            추가
          </button>
        </div>
        {tasks.map((t, idx) => (
          <div key={idx} className="rounded-lg border border-slate-200 p-2 space-y-1.5">
            <div className="grid grid-cols-[1fr_5rem_auto] gap-1.5">
              <select
                value={t.task_type}
                onChange={(e) =>
                  updateTask(idx, { task_type: e.currentTarget.value as ConnectionTaskType | '' })
                }
                className={smallInput}
              >
                <option value="">공종 선택</option>
                {CONNECTION_TASK_TYPE_VALUES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                value={t.task_count}
                onChange={(e) => updateTask(idx, { task_count: e.currentTarget.value })}
                placeholder="수량"
                className={smallInput}
              />
              <button
                type="button"
                onClick={() => removeTask(idx)}
                className="rounded p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                aria-label="삭제"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {t.task_type === '기타' && (
              <input
                value={t.custom_task_name}
                onChange={(e) => updateTask(idx, { custom_task_name: e.currentTarget.value })}
                placeholder="공종명 직접 입력"
                maxLength={50}
                className={smallInput}
              />
            )}
            <input
              value={t.notes}
              onChange={(e) => updateTask(idx, { notes: e.currentTarget.value })}
              placeholder="메모 (선택)"
              maxLength={200}
              className={smallInput}
            />
          </div>
        ))}
      </div>

      {/* 자재 입력 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-slate-600">자재 ({materials.length})</p>
          <button
            type="button"
            onClick={addMaterial}
            className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs text-blue-600 hover:bg-blue-50"
          >
            <Plus className="h-3 w-3" />
            추가
          </button>
        </div>
        {materials.map((m, idx) => {
          const useCustom = !m.material_id
          return (
            <div key={idx} className="rounded-lg border border-slate-200 p-2 space-y-1.5">
              <div className="grid grid-cols-[1fr_auto] gap-1.5">
                <select
                  value={m.material_id}
                  onChange={(e) => {
                    const id = e.currentTarget.value
                    updateMaterial(idx, {
                      material_id: id,
                      // 마스터 선택하면 custom 비움
                      custom_name: id ? '' : m.custom_name,
                      custom_spec: id ? '' : m.custom_spec,
                      custom_unit: id ? '' : m.custom_unit,
                    })
                  }}
                  className={smallInput}
                >
                  <option value="">마스터에서 선택 (또는 직접 입력)</option>
                  {masters.map((mst) => (
                    <option key={mst.id} value={mst.id}>
                      {mst.name}
                      {mst.spec ? ` (${mst.spec})` : ''}
                      {mst.unit ? ` · ${mst.unit}` : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeMaterial(idx)}
                  className="rounded p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                  aria-label="삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {useCustom && (
                <div className="grid grid-cols-3 gap-1.5">
                  <input
                    value={m.custom_name}
                    onChange={(e) => updateMaterial(idx, { custom_name: e.currentTarget.value })}
                    placeholder="자재명"
                    maxLength={100}
                    className={smallInput}
                  />
                  <input
                    value={m.custom_spec}
                    onChange={(e) => updateMaterial(idx, { custom_spec: e.currentTarget.value })}
                    placeholder="규격"
                    maxLength={100}
                    className={smallInput}
                  />
                  <input
                    value={m.custom_unit}
                    onChange={(e) => updateMaterial(idx, { custom_unit: e.currentTarget.value })}
                    placeholder="단위"
                    maxLength={20}
                    className={smallInput}
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={m.quantity}
                  onChange={(e) => updateMaterial(idx, { quantity: e.currentTarget.value })}
                  placeholder="수량 *"
                  className={smallInput}
                />
                <input
                  value={m.notes}
                  onChange={(e) => updateMaterial(idx, { notes: e.currentTarget.value })}
                  placeholder="메모 (선택)"
                  maxLength={200}
                  className={smallInput}
                />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900'

const smallInput =
  'w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900'
