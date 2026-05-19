'use client'

export type MaterialFormValues = {
  id: string | null
  name: string
  spec: string
  unit: string
  category: string
  default_supplier: string
  supplier_code: string
  low_value: boolean
}

export function MaterialForm({
  initial,
  action,
  submitLabel,
}: {
  initial: MaterialFormValues
  action: (formData: FormData) => void
  submitLabel: string
}) {
  return (
    <form
      action={action}
      className="space-y-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200"
    >
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <Field label="자재명 *">
        <input
          name="name"
          required
          defaultValue={initial.name}
          maxLength={100}
          placeholder="예: 광커넥터 SC/APC"
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="규격 (선택)">
          <input
            name="spec"
            defaultValue={initial.spec}
            maxLength={100}
            placeholder="예: 12C, M6, SM-9/125"
            className={inputClass}
          />
        </Field>
        <Field label="단위 (선택)">
          <input
            name="unit"
            defaultValue={initial.unit}
            maxLength={20}
            placeholder="예: EA, m, 식, box"
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="카테고리 (선택)">
        <input
          name="category"
          defaultValue={initial.category}
          maxLength={50}
          placeholder="예: 케이블, 접속자재, 일반자재"
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="발주처 (사급 시)">
          <input
            name="default_supplier"
            defaultValue={initial.default_supplier}
            maxLength={100}
            placeholder="예: KT, LG U+, SKB"
            className={inputClass}
          />
        </Field>
        <Field label="발주처 코드">
          <input
            name="supplier_code"
            defaultValue={initial.supplier_code}
            maxLength={100}
            placeholder="발주처가 정한 자재코드"
            className={inputClass}
          />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-slate-500">
        지입 자재면 발주처·코드 비움. 사급은 둘 다 입력하면 같은 코드 자재 정확 매칭 가능.
      </p>

      <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/40 p-3">
        <input
          type="checkbox"
          name="low_value"
          defaultChecked={initial.low_value}
          className="mt-0.5"
        />
        <div className="text-sm">
          <p className="font-medium text-slate-700">저비용 자재 (사후 신고 허용)</p>
          <p className="mt-0.5 text-xs text-slate-500">
            체크 시 <b>지입 자재</b>는 작업 외 사용도 사전 승인 없이 즉시 사용 가능 (사후 신고).
            나사·테이프 같은 저가 소모품에 권장. 사급 자재는 영향 없음.
          </p>
        </div>
      </label>

      <button
        type="submit"
        className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-base font-medium text-white hover:bg-slate-800 active:bg-slate-700"
      >
        {submitLabel}
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
