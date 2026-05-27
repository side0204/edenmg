'use server'

import type Anthropic from '@anthropic-ai/sdk'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  getAnthropic,
  CLAUDE_MODEL,
  OWNER_EMAIL,
  RELOCATION_SYSTEM_PROMPT,
  RELOCATION_TOOLS,
} from '@/lib/claude'
import { createFacilityAtPosition } from './facility-actions'
import { createCableFromCanvas } from './cable-actions'
import { CLOSURE_TYPE_VALUES, type ClosureType, CABLE_SPEC_VALUES, type CableSpec } from '@/lib/relocation'

// 대화 히스토리 (클라이언트가 보관, 매번 서버 액션에 넘김)
export type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string }

const MAX_ITERATIONS = 10

// owner 게이트 — PoC 단계에서 단 한 명만
async function requireOwner() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: '로그인이 필요합니다.' }
  if (user.email !== OWNER_EMAIL) {
    return { ok: false as const, error: 'AI 어시스턴트는 현재 owner 전용 PoC 입니다.' }
  }
  return { ok: true as const, user }
}

// ===== 도구 구현 =========================================================

async function listFacilitiesImpl(projectId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('relocation_facilities')
    .select('id, name, closure_type, facility_code, seq_no, x_hint, y_hint, closure_spec')
    .eq('project_id', projectId)
    .order('seq_no', { ascending: true })
  if (error) return { error: error.message }
  return { count: data?.length ?? 0, facilities: data ?? [] }
}

async function listCablesImpl(projectId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('relocation_cables')
    .select(
      'id, cable_code, spec, status, installation_type, from_facility_id, to_facility_id, total_length',
    )
    .eq('project_id', projectId)
  if (error) return { error: error.message }
  return { count: data?.length ?? 0, cables: data ?? [] }
}

async function createFacilityImpl(
  projectId: string,
  args: {
    name?: string
    closure_type?: string
    closure_spec?: string
    x?: number
    y?: number
  },
) {
  if (!args.name || typeof args.name !== 'string') {
    return { error: 'name 이 필요합니다.' }
  }
  if (!args.closure_type || !CLOSURE_TYPE_VALUES.includes(args.closure_type as ClosureType)) {
    return {
      error: `closure_type 이 유효하지 않습니다: ${args.closure_type}. 사용 가능한 값: ${CLOSURE_TYPE_VALUES.slice(0, 10).join(', ')} 등`,
    }
  }
  const closureSpec =
    args.closure_spec && CABLE_SPEC_VALUES.includes(args.closure_spec as CableSpec)
      ? (args.closure_spec as CableSpec)
      : null
  const result = await createFacilityAtPosition({
    project_id: projectId,
    closure_type: args.closure_type as ClosureType,
    name: args.name,
    x: typeof args.x === 'number' ? args.x : 0,
    y: typeof args.y === 'number' ? args.y : 0,
    closure_spec: closureSpec,
  })
  if (!result.ok) return { error: result.error }
  return { ok: true, id: result.id, seq_no: result.seq_no, name: args.name }
}

async function createCableImpl(
  projectId: string,
  args: {
    from_facility_name?: string
    to_facility_name?: string
    spec?: string
    status?: string
    installation_type?: string
  },
) {
  const fromName = (args.from_facility_name ?? '').trim()
  const toName = (args.to_facility_name ?? '').trim()
  if (!fromName || !toName) {
    return { error: 'from_facility_name 과 to_facility_name 이 모두 필요합니다.' }
  }
  if (!args.spec) return { error: 'spec 이 필요합니다.' }
  if (!args.status) return { error: 'status 가 필요합니다.' }

  const supabase = await createClient()
  const { data: facilities } = await supabase
    .from('relocation_facilities')
    .select('id, name')
    .eq('project_id', projectId)
  const byName = new Map<string, string>()
  for (const f of (facilities ?? []) as { id: string; name: string }[]) {
    byName.set(f.name, f.id)
  }
  const fromId = byName.get(fromName)
  const toId = byName.get(toName)
  if (!fromId) {
    return {
      error: `시설을 찾을 수 없습니다: "${fromName}". list_facilities 로 정확한 이름을 확인하세요.`,
    }
  }
  if (!toId) {
    return {
      error: `시설을 찾을 수 없습니다: "${toName}". list_facilities 로 정확한 이름을 확인하세요.`,
    }
  }

  const result = await createCableFromCanvas({
    project_id: projectId,
    from_facility_id: fromId,
    to_facility_id: toId,
    spec: args.spec,
    status: args.status,
    cable_code: '',
    installation_type: args.installation_type ?? null,
    total_length: null,
    notes: null,
  })
  if (!result.ok) return { error: result.error }
  return { ok: true, cable_code: result.cable_code, from: fromName, to: toName }
}

async function executeTool(name: string, input: unknown, projectId: string) {
  const args = (input ?? {}) as Record<string, unknown>
  try {
    switch (name) {
      case 'list_facilities':
        return await listFacilitiesImpl(projectId)
      case 'list_cables':
        return await listCablesImpl(projectId)
      case 'create_facility':
        return await createFacilityImpl(projectId, args as Parameters<typeof createFacilityImpl>[1])
      case 'create_cable':
        return await createCableImpl(projectId, args as Parameters<typeof createCableImpl>[1])
      default:
        return { error: `알 수 없는 도구: ${name}` }
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// ===== 메인 server action: tool use 루프 =================================

export async function runAIChat(
  projectId: string,
  history: ChatMessage[],
  userMessage: string,
): Promise<
  | {
      ok: true
      reply: string
      toolCalls: { name: string; input: unknown; result: unknown }[]
      mutated: boolean
    }
  | { ok: false; error: string }
> {
  const gate = await requireOwner()
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!projectId) return { ok: false, error: '프로젝트 id 가 없습니다.' }
  const userText = (userMessage ?? '').trim()
  if (!userText) return { ok: false, error: '메시지를 입력하세요.' }

  let client
  try {
    client = getAnthropic()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  // Anthropic 메시지 빌드
  const messages: Anthropic.MessageParam[] = []
  for (const m of history) {
    messages.push({ role: m.role, content: m.content })
  }
  messages.push({ role: 'user', content: userText })

  const toolCalls: { name: string; input: unknown; result: unknown }[] = []
  let finalText = ''
  let mutated = false

  try {
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const response = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 8000,
        output_config: { effort: 'high' },
        system: [
          {
            type: 'text',
            text: RELOCATION_SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
          {
            // 컨텍스트 부분 — 캐싱 안 함 (프로젝트마다 다름)
            type: 'text',
            text: `# 현재 컨텍스트\nproject_id: ${projectId}`,
          },
        ],
        tools: RELOCATION_TOOLS as unknown as Anthropic.ToolUnion[],
        messages,
      })

      // assistant 턴을 messages 에 추가 (content 블록 통째 — tool_use 보존)
      messages.push({ role: 'assistant', content: response.content })

      if (response.stop_reason === 'tool_use') {
        const toolResults: Anthropic.ToolResultBlockParam[] = []
        for (const block of response.content) {
          if (block.type === 'tool_use') {
            const result = await executeTool(block.name, block.input, projectId)
            toolCalls.push({ name: block.name, input: block.input, result })
            if (
              (block.name === 'create_facility' || block.name === 'create_cable') &&
              (result as { ok?: boolean }).ok
            ) {
              mutated = true
            }
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
              is_error: 'error' in (result as object),
            })
          }
        }
        messages.push({ role: 'user', content: toolResults })
        continue
      }

      // end_turn 또는 기타 — 텍스트 추출 후 종료
      for (const block of response.content) {
        if (block.type === 'text') finalText += block.text
      }
      break
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `Claude API 호출 실패: ${msg}` }
  }

  if (mutated) {
    revalidatePath(`/relocation/${projectId}`)
  }

  return {
    ok: true,
    reply: finalText || '(응답 없음)',
    toolCalls,
    mutated,
  }
}
