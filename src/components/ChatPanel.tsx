import { useState, useRef, useEffect, useCallback } from 'react'
import { nanoid } from 'nanoid'
import { MessageSquare, Send, X, Loader2 } from 'lucide-react'
import { chatWithContext } from '../api/ai'
import { searchFragments } from '../engine/search'
import {
  listConversations,
  listMessages,
  saveConversation,
  saveMessage,
} from '../db/database'
import type { Conversation, Message } from '../types'

interface ChatPanelProps {
  contextType?: 'kp' | 'article' | 'global'
  contextId?: string
  contextTitle?: string
}

export default function ChatPanel({
  contextType = 'global',
  contextId,
  contextTitle,
}: ChatPanelProps) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [convId, setConvId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // 创建或恢复会话
  useEffect(() => {
    if (!open) return
    ;(async () => {
      // 尝试找已有的上下文会话
      if (contextId) {
        const existing = (await listConversations())
          .find((conversation) => conversation.contextId === contextId)
        if (existing) {
          setConvId(existing.id)
          const msgs = await listMessages(existing.id)
          setMessages(msgs)
          return
        }
      }
      // 创建新会话
      const conv: Conversation = {
        id: nanoid(),
        contextType,
        contextId,
        createdAt: Date.now(),
      }
      await saveConversation(conv)
      setConvId(conv.id)
      setMessages([])
    })()
  }, [open, contextType, contextId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading || !convId) return

    const userMsg: Message = {
      id: nanoid(),
      conversationId: convId,
      role: 'user',
      content: input.trim(),
      citations: [],
      createdAt: Date.now(),
    }

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      await saveMessage(userMsg)

      // RAG: 搜索相关片段
      const results = await searchFragments(input.trim(), 10)
      const fragments = results.map((r) => ({
        title: r.fragment.title,
        content: r.fragment.content,
      }))

      const response = await chatWithContext({
        message: input.trim(),
        context: { fragments, currentTitle: contextTitle },
      })

      const assistantMsg: Message = {
        id: nanoid(),
        conversationId: convId,
        role: 'assistant',
        content: response.reply,
        citations: response.citedFragments.map(
          (i) => results[i]?.fragment.id ?? '',
        ).filter(Boolean),
        createdAt: Date.now(),
      }

      await saveMessage(assistantMsg)
      setMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      const errorMsg: Message = {
        id: nanoid(),
        conversationId: convId,
        role: 'assistant',
        content: `抱歉，出错了：${err instanceof Error ? err.message : '未知错误'}`,
        citations: [],
        createdAt: Date.now(),
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setLoading(false)
    }
  }, [input, loading, convId, contextTitle])

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[#6b7c5e] text-white shadow-lg hover:bg-[#5a6a4e] transition-colors"
        title="AI 学习伙伴"
      >
        <MessageSquare size={22} />
      </button>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex h-[520px] w-[380px] flex-col rounded-xl border border-[#d5cdbc] bg-[#faf8f4] shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#d5cdbc] px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare size={18} className="text-[#6b7c5e]" />
          <span className="text-sm font-medium text-[#4a4a3a]">
            AI 学习伙伴
          </span>
          {contextTitle && (
            <span className="max-w-[150px] truncate text-xs text-[#8a8a7a]">
              · {contextTitle}
            </span>
          )}
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-[#8a8a7a] hover:text-[#4a4a3a]"
        >
          <X size={16} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-sm text-[#8a8a7a]">
              问我任何问题，我会结合你的知识库来回答
              {contextTitle && (
                <>
                  <br />
                  <span className="text-xs">
                    当前上下文：{contextTitle}
                  </span>
                </>
              )}
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[#6b7c5e] text-white'
                  : 'bg-white border border-[#e5ddd0] text-[#4a4a3a]'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
              {msg.citations.length > 0 && (
                <div className="mt-1 text-xs opacity-60">
                  引用了 {msg.citations.length} 个知识片段
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-lg border border-[#e5ddd0] bg-white px-3 py-2 text-sm text-[#8a8a7a]">
              <Loader2 size={14} className="animate-spin" />
              思考中...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[#d5cdbc] px-4 py-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
            placeholder="问一个问题..."
            className="flex-1 rounded-lg border border-[#d5cdbc] bg-white px-3 py-2 text-sm text-[#4a4a3a] placeholder-[#b5b0a0] outline-none focus:border-[#6b7c5e]"
            disabled={loading}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#6b7c5e] text-white disabled:opacity-40 hover:bg-[#5a6a4e] transition-colors"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
