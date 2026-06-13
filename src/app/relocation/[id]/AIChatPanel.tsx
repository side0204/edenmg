'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Send, X, Loader2, ImagePlus } from 'lucide-react'
import { runAIChat, type ChatMessage } from './ai-actions'

type ToolCall = { name: string; input: unknown; result: unknown }

type Bubble = {
  role: 'user' | 'assistant'
  text: string
  toolCalls?: ToolCall[]
  image?: string // 첨부 캡처 썸네일 (data URL)
}

type PendingImage = { dataUrl: string; base64: string; mediaType: string }

// 캡처 화면을 캔버스로 축소(긴 변 1568px) — Claude 비전 권장 해상도 + 단가 절감.
// PNG 유지로 선·글자 선명도 보존.
async function fileToDownscaledImage(file: File): Promise<PendingImage> {
  const MAX_EDGE = 1568
  const srcUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(new Error('read failed'))
    r.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = () => reject(new Error('decode failed'))
    im.src = srcUrl
  })
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')
  ctx.drawImage(img, 0, 0, w, h)
  const out = canvas.toDataURL('image/png')
  return { dataUrl: out, base64: out.split(',')[1] ?? '', mediaType: 'image/png' }
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
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // 같은 파일 다시 선택 가능하게
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 첨부할 수 있습니다.')
      return
    }
    try {
      const img = await fileToDownscaledImage(file)
      setPendingImage(img)
      setError(null)
    } catch {
      setError('이미지를 읽지 못했습니다.')
    }
  }

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [bubbles, loading])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  async function send(message?: string) {
    const text = (message ?? input).trim()
    const img = pendingImage
    if ((!text && !img) || loading) return
    setInput('')
    setError(null)
    setLoading(true)

    const nextBubbles: Bubble[] = [
      ...bubbles,
      { role: 'user', text: text || '(캡처 화면 분석)', image: img?.dataUrl },
    ]
    setBubbles(nextBubbles)
    setPendingImage(null)
    const historyForCall = history

    try {
      const result = await runAIChat(
        projectId,
        historyForCall,
        text,
        img ? { data: img.base64, mediaType: img.mediaType } : null,
      )
      if (!result.ok) {
        setError(result.error)
      } else {
        setBubbles([
          ...nextBubbles,
          { role: 'assistant', text: result.reply, toolCalls: result.toolCalls },
        ])
        setHistory([
          ...historyForCall,
          { role: 'user', content: text || '(캡처 화면을 첨부해 시설·케이블 자동 분석 요청)' },
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
    setPendingImage(null)
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
            <p className="rounded border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-[11px] text-indigo-700">
              📷 <strong>캡처 화면을 첨부</strong>하면 시설·케이블을 자동으로 읽어 그립니다. (아래 사진 버튼)
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
              {b.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={b.image}
                  alt="첨부 캡처"
                  className="mb-1.5 max-h-40 w-full rounded border border-white/30 object-contain bg-white"
                />
              )}
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
        {pendingImage && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pendingImage.dataUrl}
              alt="첨부 예정 캡처"
              className="h-12 w-16 rounded border border-indigo-200 object-cover"
            />
            <span className="flex-1 text-[11px] text-indigo-700">
              캡처 화면 첨부됨 — 전송하면 분석합니다.
            </span>
            <button
              onClick={() => setPendingImage(null)}
              className="rounded p-1 text-indigo-500 hover:bg-indigo-100"
              aria-label="첨부 제거"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onPickImage}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            className="rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-40 p-2 text-slate-600 shrink-0"
            aria-label="캡처 화면 첨부"
            title="캡처 화면 첨부"
          >
            <ImagePlus className="h-4 w-4" />
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={loading}
            rows={2}
            placeholder="자연어로 입력 · 사진 버튼으로 캡처 첨부 (Enter 전송)"
            className="flex-1 resize-none rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={() => send()}
            disabled={loading || (!input.trim() && !pendingImage)}
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
