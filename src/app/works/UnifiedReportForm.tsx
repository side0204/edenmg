'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Pencil, Plus, Trash2 } from 'lucide-react'
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

export type CableMaster = {
  id: string
  code: string
  spec_enum: CableSpec | null
}

type TaskRow = {
  task_type: ConnectionTaskType | ''
  custom_task_name: string
  task_count: string
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

type RenderItem =
  | { kind: 'node'; node: UnifiedNode }
  | { kind: 'cable'; childNode: UnifiedNode; parentNode: UnifiedNode }

export function UnifiedReportForm({
  workId,
  chainId,
  chainName,
  segmentNodes,
  nodeMap,
  masters,
  cableMasters,
  defaultReportDate,
  action,
  returnTo,
  canEditNode,
  canAddNode,
}: {
  workId: string
  chainId: string
  chainName: string | null
  segmentNodes: UnifiedNode[]
  nodeMap: Record<string, UnifiedNode>
  masters: MaterialMaster[]
  cableMasters: CableMaster[]
  defaultReportDate: string
  action: (formData: FormData) => void
  returnTo: string
  /** 노드 수정 권한: admin/ceo/담당자 */
  canEditNode: boolean
  /** 사이끼우기(노드 추가) 권한: admin/ceo/담당자 + 배정 작업자 */
  canAddNode: boolean
}) {
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

  const tasksJson = useMemo(() => JSON.stringify(tasksByNode), [tasksByNode])
  const materialsJson = useMemo(() => JSON.stringify(materialsByNode), [materialsByNode])

  // DFS flat list (node + cable interleaved)
  const flatList = useMemo<RenderItem[]>(() => {
    const result: RenderItem[] = []
    const childrenByParent = new Map<string, UnifiedNode[]>()
    for (const n of segmentNodes) {
      if (n.parent_id) {
        const arr = childrenByParent.get(n.parent_id) ?? []
        arr.push(n)
        childrenByParent.set(n.parent_id, arr)
      }
    }
    const root = Object.values(nodeMap).find((n) => !n.parent_id) ?? null
    if (!root) return result
    const visit = (node: UnifiedNode) => {
      result.push({ kind: 'node', node })
      const children = childrenByParent.get(node.id) ?? []
      for (const child of children) {
        result.push({ kind: 'cable', childNode: child, parentNode: node })
        visit(child)
      }
    }
    visit(root)
    return result
  }, [segmentNodes, nodeMap])

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

      {flatList.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          작업구간이 없습니다. 먼저 작업구간에 함체·하위국을 추가하세요.
        </p>
      ) : (
        <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-2">
          <h2 className="text-base font-semibold text-slate-700 tracking-tight">
            {chainName ? `「${chainName}」` : '작업구간'}
          </h2>
          <p className="text-xs text-slate-500">
            노드 사이 cable 카드에 케이블·선번·자재·공종을 입력하세요. 빈 cable 은 미작업 처리.
          </p>

          <div className="space-y-1.5 pt-2">
            {flatList.map((item, idx) => {
              if (item.kind === 'node') {
                return (
                  <NodeRow
                    key={`node-${item.node.id}-${idx}`}
                    node={item.node}
                    workId={workId}
                    chainId={chainId}
                    returnTo={returnTo}
                    canEditNode={canEditNode}
                  />
                )
              }
              return (
                <CableCard
                  key={`cable-${item.childNode.id}-${idx}`}
                  nodeId={item.childNode.id}
                  parentId={item.parentNode.id}
                  workId={workId}
                  chainId={chainId}
                  returnTo={returnTo}
                  parentName={item.parentNode.name}
                  childName={item.childNode.name}
                  tasks={tasksByNode[item.childNode.id] ?? []}
                  setTasks={(rows) =>
                    setTasksByNode((prev) => ({ ...prev, [item.childNode.id]: rows }))
                  }
                  materials={materialsByNode[item.childNode.id] ?? []}
                  setMaterials={(rows) =>
                    setMaterialsByNode((prev) => ({ ...prev, [item.childNode.id]: rows }))
                  }
                  masters={masters}
                  cableMasters={cableMasters}
                  canAddNode={canAddNode}
                />
              )
            })}
          </div>
        </section>
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

// ===== 노드 라인 (이름만) =============================================
function NodeRow({
  node,
  workId,
  chainId,
  returnTo,
  canEditNode,
}: {
  node: UnifiedNode
  workId: string
  chainId: string
  returnTo: string
  canEditNode: boolean
}) {
  const returnToParam = encodeURIComponent(returnTo)
  const editNodeHref =
    node.parent_id // 상위국은 수정 페이지 진입 불가 (작업구간 edit 으로만)
      ? `/works/${workId}/chains/${chainId}/nodes/${node.id}/edit?return_to=${returnToParam}`
      : null
  const meta = [node.code && `ID: ${node.code}`, node.spec_enum].filter(Boolean).join(' · ')

  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <div className="min-w-0">
        <p className="text-base font-semibold text-slate-900">
          <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
            {PLAN_NODE_TYPE_LABEL[node.node_type]}
          </span>
          {node.name}
        </p>
        {meta && <p className="mt-0.5 text-xs text-slate-500">{meta}</p>}
      </div>
      {canEditNode && editNodeHref && (
        <Link
          href={editNodeHref}
          className="shrink-0 inline-flex items-center gap-0.5 rounded border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
          title="노드 정보 수정"
        >
          <Pencil className="h-3 w-3" />
          수정
        </Link>
      )}
    </div>
  )
}

// ===== cable 카드 (노드 사이, indented) ===============================
function CableCard({
  nodeId,
  parentId,
  workId,
  chainId,
  returnTo,
  parentName,
  childName,
  tasks,
  setTasks,
  materials,
  setMaterials,
  masters,
  cableMasters,
  canAddNode,
}: {
  nodeId: string
  parentId: string
  workId: string
  chainId: string
  returnTo: string
  parentName: string
  childName: string
  tasks: TaskRow[]
  setTasks: (rows: TaskRow[]) => void
  materials: MaterialRow[]
  setMaterials: (rows: MaterialRow[]) => void
  masters: MaterialMaster[]
  cableMasters: CableMaster[]
  /** 사이끼우기 노출 권한 — admin/ceo/담당자 + 배정 작업자 */
  canAddNode: boolean
}) {
  const [lineNumbers, setLineNumbers] = useState('')
  const [cableCode, setCableCode] = useState('')
  const [cableSpec, setCableSpec] = useState<CableSpec | ''>('')

  const trimmed = lineNumbers.trim()
  let preview: { ok: true; coreCount: number } | { ok: false; error: string } | null = null
  if (trimmed) {
    const r = parseLineNumbers(trimmed)
    preview = r.ok ? { ok: true, coreCount: r.coreCount } : { ok: false, error: r.error }
  }
  void calcCoreCount

  const handleCableCodeChange = (next: string) => {
    setCableCode(next)
    const hit = cableMasters.find((m) => m.code === next.trim())
    if (hit && hit.spec_enum && !cableSpec) {
      setCableSpec(hit.spec_enum)
    }
  }

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
      { material_id: '', custom_name: '', custom_spec: '', custom_unit: '', quantity: '', notes: '' },
    ])
  const updateMaterial = (idx: number, patch: Partial<MaterialRow>) =>
    setMaterials(materials.map((m, i) => (i === idx ? { ...m, ...patch } : m)))
  const removeMaterial = (idx: number) => setMaterials(materials.filter((_, i) => i !== idx))

  const returnToParam = encodeURIComponent(returnTo)
  const insertBetweenHref = `/works/${workId}/chains/${chainId}/edit?parent=${parentId}&between_child=${nodeId}&return_to=${returnToParam}#노드추가`

  return (
    <div className="ml-6 border-l-2 border-slate-200 pl-3">
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-slate-500">
            <span>{parentName}</span>
            <span className="mx-1 text-slate-400">→</span>
            <span>{childName}</span>
          </p>
          {canAddNode && (
            <Link
              href={insertBetweenHref}
              className="shrink-0 inline-flex items-center gap-0.5 rounded border border-dashed border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-500 hover:border-slate-900 hover:text-slate-900"
              title="이 cable 중간에 함체 끼우기"
            >
              <Plus className="h-3 w-3" />
              사이 끼우기
            </Link>
          )}
        </div>

        {/* 행 1: 케이블ID */}
        <Row label="케이블ID">
          <input
            name={`cable_code_${nodeId}`}
            value={cableCode}
            onChange={(e) => handleCableCodeChange(e.currentTarget.value)}
            list={`cable-codes-${nodeId}`}
            placeholder="마스터 검색 또는 직접 입력 (또는 공란)"
            maxLength={100}
            className={smallInput}
          />
          <datalist id={`cable-codes-${nodeId}`}>
            {cableMasters.map((m) => (
              <option key={m.id} value={m.code}>
                {m.spec_enum ?? ''}
              </option>
            ))}
          </datalist>
        </Row>

        {/* 행 2: 케이블규격 */}
        <Row label="케이블규격">
          <select
            name={`cable_spec_${nodeId}`}
            value={cableSpec}
            onChange={(e) => setCableSpec(e.currentTarget.value as CableSpec | '')}
            className={smallInput}
          >
            <option value="">선택</option>
            {CABLE_SPEC_VALUES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Row>

        {/* 행 3: 선번 + 코어수 */}
        <Row
          label="선번"
          trailing={
            preview && preview.ok ? (
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                {preview.coreCount} 코어
              </span>
            ) : preview && !preview.ok ? (
              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-medium text-rose-700">
                ⚠ {preview.error}
              </span>
            ) : null
          }
        >
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
        </Row>

        {/* 행 4: 사용자재 */}
        <Row
          label="사용자재"
          trailing={
            <button
              type="button"
              onClick={addMaterial}
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] text-blue-600 hover:bg-blue-50"
            >
              <Plus className="h-3 w-3" />
              추가
            </button>
          }
        >
          {materials.length === 0 ? (
            <span className="text-xs text-slate-400">없음</span>
          ) : (
            <div className="space-y-1">
              {materials.map((m, idx) => (
                <MaterialRowInput
                  key={idx}
                  row={m}
                  masters={masters}
                  onUpdate={(patch) => updateMaterial(idx, patch)}
                  onRemove={() => removeMaterial(idx)}
                />
              ))}
            </div>
          )}
        </Row>

        {/* 행 5: 공종 */}
        <Row
          label="공종"
          trailing={
            <button
              type="button"
              onClick={addTask}
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] text-blue-600 hover:bg-blue-50"
            >
              <Plus className="h-3 w-3" />
              추가
            </button>
          }
        >
          {tasks.length === 0 ? (
            <span className="text-xs text-slate-400">없음</span>
          ) : (
            <div className="space-y-1">
              {tasks.map((t, idx) => (
                <TaskRowInput
                  key={idx}
                  row={t}
                  onUpdate={(patch) => updateTask(idx, patch)}
                  onRemove={() => removeTask(idx)}
                />
              ))}
            </div>
          )}
        </Row>

        {/* 행 6: 완료 토글 + 메모 */}
        <div className="flex items-center gap-2 pt-1">
          <label className="inline-flex items-center gap-1 text-xs text-slate-600">
            <input
              type="checkbox"
              name={`completed_${nodeId}`}
              value="1"
              defaultChecked
              className="size-4"
            />
            완료
          </label>
          <input
            name={`segment_notes_${nodeId}`}
            placeholder="cable 메모 (선택)"
            maxLength={200}
            className={smallInput + ' flex-1'}
          />
        </div>
      </div>
    </div>
  )
}

// ===== 행 레이아웃 헬퍼 ================================================
function Row({
  label,
  trailing,
  children,
}: {
  label: string
  trailing?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[5rem_1fr_auto] items-start gap-2">
      <span className="pt-1.5 text-xs font-medium text-slate-600">{label}</span>
      <div className="min-w-0">{children}</div>
      <div className="pt-1">{trailing}</div>
    </div>
  )
}

// ===== 자재 행 입력 ====================================================
function MaterialRowInput({
  row,
  masters,
  onUpdate,
  onRemove,
}: {
  row: MaterialRow
  masters: MaterialMaster[]
  onUpdate: (patch: Partial<MaterialRow>) => void
  onRemove: () => void
}) {
  const useCustom = !row.material_id
  return (
    <div className="rounded-md border border-slate-200 bg-white p-1.5 space-y-1">
      <div className="grid grid-cols-[1fr_auto] gap-1">
        <select
          value={row.material_id}
          onChange={(e) => {
            const id = e.currentTarget.value
            onUpdate({
              material_id: id,
              custom_name: id ? '' : row.custom_name,
              custom_spec: id ? '' : row.custom_spec,
              custom_unit: id ? '' : row.custom_unit,
            })
          }}
          className={smallInput}
        >
          <option value="">마스터 선택 (또는 직접 입력)</option>
          {masters.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.spec ? ` (${m.spec})` : ''}
              {m.unit ? ` · ${m.unit}` : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRemove}
          className="rounded p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {useCustom && (
        <div className="grid grid-cols-3 gap-1">
          <input
            value={row.custom_name}
            onChange={(e) => onUpdate({ custom_name: e.currentTarget.value })}
            placeholder="명"
            maxLength={100}
            className={smallInput}
          />
          <input
            value={row.custom_spec}
            onChange={(e) => onUpdate({ custom_spec: e.currentTarget.value })}
            placeholder="규격"
            maxLength={100}
            className={smallInput}
          />
          <input
            value={row.custom_unit}
            onChange={(e) => onUpdate({ custom_unit: e.currentTarget.value })}
            placeholder="단위"
            maxLength={20}
            className={smallInput}
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-1">
        <input
          type="number"
          step="0.001"
          min="0.001"
          value={row.quantity}
          onChange={(e) => onUpdate({ quantity: e.currentTarget.value })}
          placeholder="수량 *"
          className={smallInput}
        />
        <input
          value={row.notes}
          onChange={(e) => onUpdate({ notes: e.currentTarget.value })}
          placeholder="메모"
          maxLength={200}
          className={smallInput}
        />
      </div>
    </div>
  )
}

// ===== 공종 행 입력 ====================================================
function TaskRowInput({
  row,
  onUpdate,
  onRemove,
}: {
  row: TaskRow
  onUpdate: (patch: Partial<TaskRow>) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-1.5 space-y-1">
      <div className="grid grid-cols-[1fr_5rem_auto] gap-1">
        <select
          value={row.task_type}
          onChange={(e) => onUpdate({ task_type: e.currentTarget.value as ConnectionTaskType | '' })}
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
          value={row.task_count}
          onChange={(e) => onUpdate({ task_count: e.currentTarget.value })}
          placeholder="수량"
          className={smallInput}
        />
        <button
          type="button"
          onClick={onRemove}
          className="rounded p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {row.task_type === '기타' && (
        <input
          value={row.custom_task_name}
          onChange={(e) => onUpdate({ custom_task_name: e.currentTarget.value })}
          placeholder="공종명 직접 입력"
          maxLength={50}
          className={smallInput}
        />
      )}
      <input
        value={row.notes}
        onChange={(e) => onUpdate({ notes: e.currentTarget.value })}
        placeholder="메모 (선택)"
        maxLength={200}
        className={smallInput}
      />
    </div>
  )
}

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900'

const smallInput =
  'w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900'
