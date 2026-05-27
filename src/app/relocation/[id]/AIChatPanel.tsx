'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Send, X, Loader2 } from 'lucide-react'
import { runAIChat, type ChatMessage } from './ai-actions'

type ToolCall = { name: string; input: unknown; result: unknown }

type Bubble = {
  role: 'user' | 'assistant'
  text: string
  toolCalls?: ToolCall[]
}

const SAMPLE_PROMPTS = [
  '맨홀 3개 추가하고 일렬로 연결',
  '종로 본부국에서 청량리 함체까지 144C 신설',
  '현재 시설 목록 알려줘',
]

export default function AIChatPanel({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  // 화면 표시용 bubble — assistant 의 도구 호출 요약도 포함
  const [bubbles, setBubbles] = useState<Bubble[]>([])
  // Claude 에게 보내는 history — assistant 는 최종 text 만
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [bubbles, loading])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  async function send(message?: string) {
    const text = (message ?? input).trim()
    if (!text || loading) return
    setInput('')
    setError(null)
    setLoading(true)

    const nextBubbles: Bubble[] = [...bubbles, { role: 'user', text }]
    setBubbles(nextBubbles)
    const historyForCall = history

    try {
      const result = await runAIChat(projectId, historyForCall, text)
      if (!result.ok) {
        setError(result.error)
      } else {
        setBubbles([
          ...nextBubbles,
          { role: 'assistant', text: result.reply, toolCalls: result.toolCalls },
        ])
        setHistory([
          ...historyForCall,
          { role: 'user', content: text },
          { role: 'assistant', content: result.reply },
        ])
        if (result.mutated) router.refresh()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  function reset() {
    if (loading) return
    setBubbles([])
    setHistory([])
    setError(null)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 px-4 py-3 text-sm font-medium text-white shadow-lg"
        aria-label="AI 도면 보조 열기"
      >
        <Sparkles className="h-4 w-4" />
        AI 도면 보조
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col w-[380px] sm:w-[440px] h-[640px] max-h-[85vh] rounded-xl bg-white border border-slate-300 shadow-2xl overflow-hidden">
      <header className="flex items-center justify-between px-3 py-2 bg-indigo-600 text-white shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <span className="font-medium text-sm">AI 도면 보조 (베타)</span>
        </div>
        <div className="flex items-center gap-1">
          {bubbles.length > 0 && (
            <button
              onClick={reset}
              className="rounded px-2 py-1 text-[11px] hover:bg-white/20"
              title="대화 초기화"
            >
              초기화
            </button>
          )}
          <button
            onClick={() => setOpen(false)}
            className="rounded p-1 hover:bg-white/20"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-3 text-sm bg-slate-50"
      >
        {bubbles.length === 0 && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              자연어로 요청하면 캔버스에 시설·케이블을 자동으로 그려드립니다.
            </p>
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-slate-600">예시:</p>
              {SAMPLE_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="block w-full rounded border border-slate-200 bg-white hover:bg-indigo-50 hover:border-indigo-300 px-2 py-1.5 text-left text-[12px] text-slate-700"
                >
                  · {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {bubbles.map((b, i) => (
          <div
            key={i}
            className={b.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
          >
            <div
              className={
                'rounded-lg px-3 py-2 max-w-[90%] whitespace-pre-wrap text-sm ' +
                (b.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-800')
              }
            >
              {b.text}
              {b.toolCalls && b.toolCalls.length > 0 && (
                <details className="mt-2 text-[11px]">
                  <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
                    도구 {b.toolCalls.length}회 사용
                  </summary>
                  <div className="mt-1 space-y-0.5 font-mono text-[10px] text-slate-600">
                    {b.toolCalls.map((t, j) => {
                      const isErr =
                        typeof t.result === 'object' &&
                        t.result !== null &&
                        'error' in t.result
                      return (
                        <div key={j} className={isErr ? 'text-rose-600' : 'text-slate-600'}>
                          {isErr ? '✗' : '✓'} {t.name}
                        </div>
                      )
                    })}
                  </div>
                </details>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-lg px-3 py-2 bg-white border border-slate-200 text-slate-500 text-xs flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              생각 중...
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
            {error}
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 p-2 shrink-0 bg-white">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={loading}
            rows={2}
            placeholder="자연어로 입력 (Enter 전송, Shift+Enter 줄바꿈)"
            className="flex-1 resize-none rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 px-3 py-2 text-white shrink-0"
            aria-label="전송"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-[10px] text-slate-400 text-center">
          PoC · Owner 전용 · Claude Opus 4.7
        </p>
      </div>
    </div>
  )
}
