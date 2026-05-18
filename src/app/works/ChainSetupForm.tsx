'use client'

import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { CABLE_SPEC_VALUES, type CableSpec } from '@/lib/connection'

type BoxRow = {
  name: string
  code: string
  spec_enum: CableSpec | ''
  lat: string
  lng: string
  address: string
  notes: string
  master_id: string
}

export type FacilityMaster = {
  id: string
  name: string
  code: string | null
  spec_enum: CableSpec | null
  address: string | null
  lat: number | null
  lng: number | null
}

// 마스터 옵션 라벨 — 같은 이름 여러 개일 때 코드로 구분
function labelOfMaster(m: FacilityMaster): string {
  return m.code ? `${m.name} (${m.code})` : m.name
}

// 입력값이 마스터 라벨과 일치하는지 lookup
function findMasterByLabel(masters: FacilityMaster[], value: string): FacilityMaster | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  return masters.find((m) => labelOfMaster(m) === trimmed) ?? null
}

/**
 * chain 한번에 등록: 상위국 → 함체들(가변) → 하위국.
 * - 상위국·하위국 이름 필수
 * - 함체는 0개 이상 (없으면 상위국 → 하위국 직선)
 * - 함체 추가/삭제·정보 입력
 * - submit 시 boxes_json 으로 함체 정보 직렬화 → server action 이 chain + 모든 노드 생성
 */
export function ChainSetupForm({
  workId,
  action,
  stationMasters = [],
  boxMasters = [],
}: {
  workId: string
  action: (formData: FormData) => void
  stationMasters?: FacilityMaster[]
  boxMasters?: FacilityMaster[]
}) {
  const [boxes, setBoxes] = useState<BoxRow[]>([])
  const [upperMasterId, setUpperMasterId] = useState('')
  const [lowerMasterId, setLowerMasterId] = useState('')

  const addBox = () =>
    setBoxes([
      ...boxes,
      {
        name: '',
        code: '',
        spec_enum: '',
        lat: '',
        lng: '',
        address: '',
        notes: '',
        master_id: '',
      },
    ])
  const updateBox = (idx: number, patch: Partial<BoxRow>) =>
    setBoxes(boxes.map((b, i) => (i === idx ? { ...b, ...patch } : b)))
  const removeBox = (idx: number) => setBoxes(boxes.filter((_, i) => i !== idx))

  // 함체 이름 입력 시 마스터 매칭 → 자동 채움
  const handleBoxNameChange = (idx: number, value: string) => {
    const match = findMasterByLabel(boxMasters, value)
    if (match) {
      updateBox(idx, {
        name: match.name,
        code: match.code ?? '',
        spec_enum: match.spec_enum ?? '',
        address: match.address ?? '',
        lat: match.lat !== null ? String(match.lat) : '',
        lng: match.lng !== null ? String(match.lng) : '',
        master_id: match.id,
      })
    } else {
      updateBox(idx, { name: value, master_id: '' })
    }
  }

  const boxesJson = useMemo(() => JSON.stringify(boxes), [boxes])

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="work_id" value={workId} />
      <input type="hidden" name="boxes_json" value={boxesJson} />

      <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
        <h2 className="text-base font-semibold text-slate-700 tracking-tight">작업구간 정보</h2>
        <Field label="작업구간 이름 (선택)">
          <input
            name="name"
            maxLength={100}
            placeholder="예: 강남 A동 ↔ B동"
            className={inputClass}
          />
        </Field>
      </section>

      <input type="hidden" name="upper_station_master_id" value={upperMasterId} />
      <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
        <h2 className="text-base font-semibold text-slate-700 tracking-tight">상위국 *</h2>
        <Field label="이름 *">
          <input
            name="upper_station_name"
            required
            maxLength={100}
            list="station-masters"
            placeholder={stationMasters.length > 0 ? '입력 시 등록된 국사 자동완성' : '예: 강남A국'}
            onChange={(e) => {
              const m = findMasterByLabel(stationMasters, e.currentTarget.value)
              setUpperMasterId(m?.id ?? '')
              if (m) e.currentTarget.value = m.name
            }}
            className={inputClass}
          />
          {stationMasters.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">등록된 국사 {stationMasters.length}개 자동완성</p>
          )}
        </Field>
      </section>

      <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-700 tracking-tight">
            접속함체 ({boxes.length})
          </h2>
          <button
            type="button"
            onClick={addBox}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" />
            함체 추가
          </button>
        </div>
        <p className="text-xs text-slate-500">
          상위국과 하위국 사이에 들어갈 함체들을 순서대로 추가하세요. 함체 없이 상위국 → 하위국 직선 작업구간도 가능.
        </p>

        {boxes.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            함체가 없습니다. 「함체 추가」 버튼으로 추가하세요.
          </p>
        ) : (
          <div className="space-y-3">
            {boxes.map((b, idx) => (
              <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50/40 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-600">함체 {idx + 1}</p>
                  <button
                    type="button"
                    onClick={() => removeBox(idx)}
                    className="rounded p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                    aria-label="삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <Field label="함체명 *">
                  <input
                    value={b.name}
                    onChange={(e) => handleBoxNameChange(idx, e.currentTarget.value)}
                    maxLength={100}
                    list="box-masters"
                    placeholder={boxMasters.length > 0 ? '입력 시 등록된 함체 자동완성' : '예: 1번 함체'}
                    className={inputClass}
                  />
                  {b.master_id && (
                    <p className="mt-1 text-[11px] text-emerald-700">★ 마스터에서 자동 채움</p>
                  )}
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="함체ID (선택)">
                    <input
                      value={b.code}
                      onChange={(e) => updateBox(idx, { code: e.currentTarget.value })}
                      maxLength={50}
                      placeholder="예: H001"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="함체 규격 (선택)">
                    <select
                      value={b.spec_enum}
                      onChange={(e) =>
                        updateBox(idx, { spec_enum: e.currentTarget.value as CableSpec | '' })
                      }
                      className={inputClass}
                    >
                      <option value="">선택 안 함</option>
                      {CABLE_SPEC_VALUES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="위도 (선택)">
                    <input
                      type="number"
                      step="any"
                      value={b.lat}
                      onChange={(e) => updateBox(idx, { lat: e.currentTarget.value })}
                      placeholder="37.4912"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="경도 (선택)">
                    <input
                      type="number"
                      step="any"
                      value={b.lng}
                      onChange={(e) => updateBox(idx, { lng: e.currentTarget.value })}
                      placeholder="127.0231"
                      className={inputClass}
                    />
                  </Field>
                </div>

                <Field label="주소 (선택)">
                  <input
                    value={b.address}
                    onChange={(e) => updateBox(idx, { address: e.currentTarget.value })}
                    maxLength={200}
                    className={inputClass}
                  />
                </Field>

                <Field label="메모 (선택)">
                  <textarea
                    value={b.notes}
                    onChange={(e) => updateBox(idx, { notes: e.currentTarget.value })}
                    rows={2}
                    maxLength={500}
                    className={`${inputClass} resize-none`}
                  />
                </Field>
              </div>
            ))}
          </div>
        )}
      </section>

      <input type="hidden" name="lower_station_master_id" value={lowerMasterId} />
      <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
        <h2 className="text-base font-semibold text-slate-700 tracking-tight">하위국 *</h2>
        <Field label="이름 *">
          <input
            name="lower_station_name"
            required
            maxLength={100}
            list="station-masters"
            placeholder={stationMasters.length > 0 ? '입력 시 등록된 국사 자동완성' : '예: B동 1층'}
            onChange={(e) => {
              const m = findMasterByLabel(stationMasters, e.currentTarget.value)
              setLowerMasterId(m?.id ?? '')
              if (m) e.currentTarget.value = m.name
            }}
            className={inputClass}
          />
        </Field>
      </section>

      {/* 자동완성용 datalist (한 form 에 공통) */}
      {stationMasters.length > 0 && (
        <datalist id="station-masters">
          {stationMasters.map((m) => (
            <option key={m.id} value={labelOfMaster(m)} />
          ))}
        </datalist>
      )}
      {boxMasters.length > 0 && (
        <datalist id="box-masters">
          {boxMasters.map((m) => (
            <option key={m.id} value={labelOfMaster(m)} />
          ))}
        </datalist>
      )}

      <button
        type="submit"
        className="w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-medium text-white hover:bg-slate-800"
      >
        작업구간 등록
      </button>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900'
