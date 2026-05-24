'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { parseCsv, indexHeaders, getCell } from '@/lib/csv-parse'
import {
  CLOSURE_TYPE_VALUES,
  CLOSURE_TYPE_LABEL,
  CABLE_STATUS_VALUES,
  CABLE_STATUS_LABEL,
  CABLE_INSTALLATION_TYPE_VALUES,
  CIRCUIT_KIND_VALUES,
  CIRCUIT_KIND_LABEL,
  CIRCUIT_STATUS_VALUES,
  type ClosureType,
  type CableStatus,
  type CableInstallationType,
  type CircuitKind,
  type CircuitStatus,
} from '@/lib/relocation'
import { CABLE_SPEC_VALUES, type CableSpec } from '@/lib/connection'

// 지장이설 표준 템플릿 임포터 — 시설·케이블·회선 CSV 일괄 등록 (P0-2).
//   LGU+ DB 데이터를 표준 양식에 맞춰 채워 업로드한다.
//   행 단위 검증 — 오류 행은 건너뛰고 사유 보고, 정상 행만 등록.

type Permission = 'worker' | 'team_member' | 'team_leader' | 'admin'

async function requireMember() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: meRow } = await supabase
    .from('employees')
    .select('id, company_id, permission, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const me = meRow as
    | { id: string; company_id: string; permission: Permission; is_active: boolean }
    | null
  if (!me || !me.is_active) {
    redirect('/?err=' + encodeURIComponent('계정이 활성 상태가 아닙니다'))
  }
  return { supabase, me }
}

export type ImportResult = {
  ok: boolean
  message: string
  created: number
  skipped: number
  errors: Array<{ row: number; message: string }>
}

function fail(message: string): ImportResult {
  return { ok: false, message, created: 0, skipped: 0, errors: [] }
}

// ── 입력값 → enum 해석 맵 (enum 값 또는 한국어 라벨 둘 다 허용) ──────────
const closureTypeByInput = new Map<string, ClosureType>()
for (const t of CLOSURE_TYPE_VALUES) {
  closureTypeByInput.set(t, t)
  closureTypeByInput.set(CLOSURE_TYPE_LABEL[t], t)
}
const cableStatusByInput = new Map<string, CableStatus>()
for (const s of CABLE_STATUS_VALUES) {
  cableStatusByInput.set(s, s)
  cableStatusByInput.set(CABLE_STATUS_LABEL[s], s)
}
const circuitKindByInput = new Map<string, CircuitKind>()
for (const k of CIRCUIT_KIND_VALUES) {
  circuitKindByInput.set(k, k)
  circuitKindByInput.set(CIRCUIT_KIND_LABEL[k], k)
}

function isCableSpec(v: string): v is CableSpec {
  return (CABLE_SPEC_VALUES as readonly string[]).includes(v)
}

// ===== 시설 import ======================================================
// 헤더: 종류*, 이름*, 함체규격, 설치주소, 위도, 경도, 비고
export async function importRelocationFacilitiesCsv(
  formData: FormData,
): Promise<ImportResult> {
  const projectId = String(formData.get('project_id') ?? '').trim()
  const file = formData.get('file')
  if (!projectId) return fail('프로젝트 id 가 없습니다')
  if (!(file instanceof File) || file.size === 0) return fail('파일이 비어있습니다')

  const { rows } = parseCsv(await file.text())
  if (rows.length < 2) return fail('데이터 행이 없습니다 (헤더 1행 + 데이터 1행 이상)')
  const cols = indexHeaders(rows[0], [
    '종류',
    '이름',
    '함체규격',
    '설치주소',
    '위도',
    '경도',
    '비고',
  ])
  if (cols['종류'] < 0 || cols['이름'] < 0) {
    return fail('필수 헤더 「종류」「이름」 이 필요합니다')
  }

  const { supabase, me } = await requireMember()

  // 시설 번호 카운터 (프로젝트 × 종류)
  const { data: seqRows } = await supabase
    .from('relocation_facility_seq')
    .select('closure_type, last_seq')
    .eq('project_id', projectId)
  const lastSeq = new Map<string, number>()
  for (const s of (seqRows ?? []) as { closure_type: string; last_seq: number }[]) {
    lastSeq.set(s.closure_type, s.last_seq)
  }
  const usedTypes = new Set<string>()

  let created = 0
  const errors: Array<{ row: number; message: string }> = []

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const typeRaw = getCell(r, cols['종류'])
    const closure_type = closureTypeByInput.get(typeRaw)
    if (!closure_type) {
      errors.push({ row: i + 1, message: `종류 '${typeRaw}' 를 인식할 수 없습니다` })
      continue
    }
    const name = getCell(r, cols['이름'])
    if (!name) {
      errors.push({ row: i + 1, message: '이름이 비어있음' })
      continue
    }
    const specRaw = getCell(r, cols['함체규격'])
    if (specRaw && !isCableSpec(specRaw)) {
      errors.push({ row: i + 1, message: `함체규격 '${specRaw}' 가 올바르지 않음` })
      continue
    }
    const latRaw = getCell(r, cols['위도'])
    const lngRaw = getCell(r, cols['경도'])
    const lat = latRaw ? Number(latRaw) : null
    const lng = lngRaw ? Number(lngRaw) : null
    if (lat !== null && !Number.isFinite(lat)) {
      errors.push({ row: i + 1, message: `위도 '${latRaw}' 형식 오류` })
      continue
    }
    if (lng !== null && !Number.isFinite(lng)) {
      errors.push({ row: i + 1, message: `경도 '${lngRaw}' 형식 오류` })
      continue
    }

    const next = (lastSeq.get(closure_type) ?? 0) + 1
    lastSeq.set(closure_type, next)
    usedTypes.add(closure_type)

    const { error } = await supabase.from('relocation_facilities').insert({
      project_id: projectId,
      closure_type,
      seq_no: next,
      name,
      install_address: getCell(r, cols['설치주소']) || null,
      closure_spec: specRaw || null,
      lat,
      lng,
      notes: getCell(r, cols['비고']) || null,
      is_marked: false,
      created_by: me.id,
    })
    if (error) {
      errors.push({ row: i + 1, message: '추가 실패: ' + error.message })
      continue
    }
    created++
  }

  if (usedTypes.size > 0) {
    await supabase.from('relocation_facility_seq').upsert(
      [...usedTypes].map((t) => ({
        project_id: projectId,
        closure_type: t,
        last_seq: lastSeq.get(t) ?? 0,
      })),
    )
  }

  revalidatePath(`/relocation/${projectId}`)
  return {
    ok: true,
    message: `시설 가져오기 완료 — 신규 ${created} · 실패 ${errors.length}`,
    created,
    skipped: errors.length,
    errors,
  }
}

// ===== 케이블 import ====================================================
// 헤더: 케이블ID*, 출발시설*, 도착시설*, 규격*, 상태, 설치구분, 전체거리, 비고
export async function importRelocationCablesCsv(
  formData: FormData,
): Promise<ImportResult> {
  const projectId = String(formData.get('project_id') ?? '').trim()
  const file = formData.get('file')
  if (!projectId) return fail('프로젝트 id 가 없습니다')
  if (!(file instanceof File) || file.size === 0) return fail('파일이 비어있습니다')

  const { rows } = parseCsv(await file.text())
  if (rows.length < 2) return fail('데이터 행이 없습니다 (헤더 1행 + 데이터 1행 이상)')
  const cols = indexHeaders(rows[0], [
    '케이블ID',
    '출발시설',
    '도착시설',
    '규격',
    '상태',
    '설치구분',
    '전체거리',
    '비고',
  ])
  for (const k of ['케이블ID', '출발시설', '도착시설', '규격'] as const) {
    if (cols[k] < 0) return fail(`필수 헤더 「${k}」 이 필요합니다`)
  }

  const { supabase, me } = await requireMember()

  // 시설 이름 → id (이름 중복이면 null = 모호)
  const { data: facRows } = await supabase
    .from('relocation_facilities')
    .select('id, name')
    .eq('project_id', projectId)
  const nameToId = new Map<string, string | null>()
  for (const f of (facRows ?? []) as { id: string; name: string }[]) {
    nameToId.set(f.name, nameToId.has(f.name) ? null : f.id)
  }

  let created = 0
  const errors: Array<{ row: number; message: string }> = []

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const code = getCell(r, cols['케이블ID'])
    if (!code) {
      errors.push({ row: i + 1, message: '케이블ID가 비어있음' })
      continue
    }
    const fromName = getCell(r, cols['출발시설'])
    const toName = getCell(r, cols['도착시설'])
    const fromId = nameToId.get(fromName)
    const toId = nameToId.get(toName)
    if (fromId === undefined) {
      errors.push({ row: i + 1, message: `출발시설 '${fromName}' 을 찾을 수 없음 (시설 먼저 등록)` })
      continue
    }
    if (fromId === null) {
      errors.push({ row: i + 1, message: `출발시설 '${fromName}' 이름이 중복됨` })
      continue
    }
    if (toId === undefined) {
      errors.push({ row: i + 1, message: `도착시설 '${toName}' 을 찾을 수 없음` })
      continue
    }
    if (toId === null) {
      errors.push({ row: i + 1, message: `도착시설 '${toName}' 이름이 중복됨` })
      continue
    }
    if (fromId === toId) {
      errors.push({ row: i + 1, message: '출발시설과 도착시설이 같음' })
      continue
    }
    const specRaw = getCell(r, cols['규격'])
    if (!isCableSpec(specRaw)) {
      errors.push({ row: i + 1, message: `규격 '${specRaw}' 가 올바르지 않음` })
      continue
    }
    const statusRaw = getCell(r, cols['상태'])
    let status: CableStatus = 'existing'
    if (statusRaw) {
      const s = cableStatusByInput.get(statusRaw)
      if (!s) {
        errors.push({
          row: i + 1,
          message: `상태 '${statusRaw}' 불가 (기설/기설 이설/신설/철거)`,
        })
        continue
      }
      status = s
    }
    const instRaw = getCell(r, cols['설치구분'])
    if (instRaw && !(CABLE_INSTALLATION_TYPE_VALUES as readonly string[]).includes(instRaw)) {
      errors.push({ row: i + 1, message: `설치구분 '${instRaw}' 불가 (가공/구내/해저/입상/지중)` })
      continue
    }
    const lengthRaw = getCell(r, cols['전체거리'])
    const totalLength = lengthRaw ? Number(lengthRaw) : null
    if (totalLength !== null && (!Number.isFinite(totalLength) || totalLength < 0)) {
      errors.push({ row: i + 1, message: `전체거리 '${lengthRaw}' 형식 오류` })
      continue
    }

    const { error } = await supabase.from('relocation_cables').insert({
      project_id: projectId,
      from_facility_id: fromId,
      to_facility_id: toId,
      spec: specRaw,
      status,
      cable_code: code,
      installation_type: (instRaw as CableInstallationType) || null,
      total_length: totalLength,
      notes: getCell(r, cols['비고']) || null,
      created_by: me.id,
    })
    if (error) {
      const friendly =
        error.message.includes('unique') || error.code === '23505'
          ? `케이블ID '${code}' 가 이미 있음`
          : '추가 실패: ' + error.message
      errors.push({ row: i + 1, message: friendly })
      continue
    }
    created++
  }

  revalidatePath(`/relocation/${projectId}`)
  return {
    ok: true,
    message: `케이블 가져오기 완료 — 신규 ${created} · 실패 ${errors.length}`,
    created,
    skipped: errors.length,
    errors,
  }
}

// ===== 회선 import ======================================================
// 헤더: 회선번호*, 설치장소명, 종류*, 상태, 비고
export async function importRelocationCircuitsCsv(
  formData: FormData,
): Promise<ImportResult> {
  const projectId = String(formData.get('project_id') ?? '').trim()
  const file = formData.get('file')
  if (!projectId) return fail('프로젝트 id 가 없습니다')
  if (!(file instanceof File) || file.size === 0) return fail('파일이 비어있습니다')

  const { rows } = parseCsv(await file.text())
  if (rows.length < 2) return fail('데이터 행이 없습니다 (헤더 1행 + 데이터 1행 이상)')
  const cols = indexHeaders(rows[0], ['회선번호', '설치장소명', '종류', '상태', '비고'])
  if (cols['회선번호'] < 0 || cols['종류'] < 0) {
    return fail('필수 헤더 「회선번호」「종류」 가 필요합니다')
  }

  const { supabase } = await requireMember()

  let created = 0
  const errors: Array<{ row: number; message: string }> = []

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const circuitId = getCell(r, cols['회선번호'])
    if (!circuitId) {
      errors.push({ row: i + 1, message: '회선번호가 비어있음' })
      continue
    }
    const kindRaw = getCell(r, cols['종류'])
    const kind = circuitKindByInput.get(kindRaw)
    if (!kind) {
      errors.push({
        row: i + 1,
        message: `종류 '${kindRaw}' 불가 (1코어/2코어/이원화_1코어씩/이원화_2코어씩)`,
      })
      continue
    }
    const statusRaw = getCell(r, cols['상태'])
    const status: CircuitStatus =
      statusRaw && (CIRCUIT_STATUS_VALUES as readonly string[]).includes(statusRaw)
        ? (statusRaw as CircuitStatus)
        : 'OK'
    if (statusRaw && !(CIRCUIT_STATUS_VALUES as readonly string[]).includes(statusRaw)) {
      errors.push({ row: i + 1, message: `상태 '${statusRaw}' 불가 (OK/ER/확인/해지)` })
      continue
    }

    const { error } = await supabase.from('relocation_circuits').insert({
      project_id: projectId,
      circuit_id: circuitId,
      subscriber_name: getCell(r, cols['설치장소명']) || null,
      kind,
      status,
      notes: getCell(r, cols['비고']) || null,
    })
    if (error) {
      const friendly =
        error.message.includes('unique') || error.code === '23505'
          ? `회선번호 '${circuitId}' 가 이미 있음`
          : '추가 실패: ' + error.message
      errors.push({ row: i + 1, message: friendly })
      continue
    }
    created++
  }

  revalidatePath(`/relocation/${projectId}`)
  return {
    ok: true,
    message: `회선 가져오기 완료 — 신규 ${created} · 실패 ${errors.length}`,
    created,
    skipped: errors.length,
    errors,
  }
}
