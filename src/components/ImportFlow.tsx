import { useState, useCallback } from 'react'
import { nanoid } from 'nanoid'
import {
  Upload,
  Loader2,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
} from 'lucide-react'
import { processImport, type ImportGroup } from '../api/ai'
import { saveKnowledgePoint, saveTag } from '../db/database'
import { chunkDocument } from '../engine/chunker'
import { bulkSaveFragments } from '../db/database'
import type { KnowledgePoint, Tag, Fragment } from '../types'

interface ImportFlowProps {
  existingTags: Tag[]
  onComplete: () => void
  onClose: () => void
}

type Step = 'input' | 'processing' | 'review' | 'saving' | 'done'

export default function ImportFlow({
  existingTags,
  onComplete,
  onClose,
}: ImportFlowProps) {
  const [step, setStep] = useState<Step>('input')
  const [rawText, setRawText] = useState('')
  const [groups, setGroups] = useState<ImportGroup[]>([])
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')

  // ─── Step 1: 提交文本给 AI ──────────────────────

  const handleProcess = useCallback(async () => {
    if (!rawText.trim()) return
    setStep('processing')
    setError('')

    try {
      const result = await processImport({ text: rawText.trim() })
      setGroups(result.groups ?? [])
      setExpandedGroups(new Set(result.groups?.map((_, i) => i) ?? []))
      setStep('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : '处理失败')
      setStep('input')
    }
  }, [rawText])

  // ─── Step 2: 编辑 ───────────────────────────────

  const updateGroupTitle = (gi: number, title: string) => {
    setGroups((prev) =>
      prev.map((g, i) => (i === gi ? { ...g, title } : g)),
    )
  }

  const updateItem = (
    gi: number,
    ii: number,
    field: string,
    value: string | string[],
  ) => {
    setGroups((prev) =>
      prev.map((g, i) =>
        i === gi
          ? {
              ...g,
              items: g.items.map((item, j) =>
                j === ii ? { ...item, [field]: value } : item,
              ),
            }
          : g,
      ),
    )
  }

  const removeItem = (gi: number, ii: number) => {
    setGroups((prev) =>
      prev.map((g, i) =>
        i === gi
          ? { ...g, items: g.items.filter((_, j) => j !== ii) }
          : g,
      ),
    )
  }

  const removeGroup = (gi: number) => {
    setGroups((prev) => prev.filter((_, i) => i !== gi))
  }

  const toggleGroup = (gi: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      next.has(gi) ? next.delete(gi) : next.add(gi)
      return next
    })
  }

  // ─── Step 3: 确认入库 ──────────────────────────

  const handleSave = useCallback(async () => {
    setStep('saving')
    const now = Date.now()

    try {
      const existingTagNames = new Map(
        existingTags.map((t) => [t.name.toLowerCase(), t]),
      )
      const newTagMap = new Map<string, string>() // tagName → tagId

      const allFragments: Fragment[] = []

      for (const group of groups) {
        for (const item of group.items) {
          const kpId = nanoid()
          const tagIds: string[] = []

          // 处理标签
          for (const tagName of item.tags) {
            const lower = tagName.toLowerCase()
            const existing = existingTagNames.get(lower)
            if (existing) {
              tagIds.push(existing.id)
            } else if (newTagMap.has(lower)) {
              tagIds.push(newTagMap.get(lower)!)
            } else {
              const newTag: Tag = {
                id: nanoid(),
                name: tagName,
                color: randomTagColor(),
              }
              await saveTag(newTag)
              newTagMap.set(lower, newTag.id)
              tagIds.push(newTag.id)
            }
          }

          const kp: KnowledgePoint = {
            id: kpId,
            title: item.title,
            content: `<p>${item.content}</p>`,
            tags: tagIds,
            linkedPoints: [],
            createdAt: now,
            updatedAt: now,
          }
          await saveKnowledgePoint(kp)

          // 生成 Fragment
          const fragments = chunkDocument(item.content, {
            sourceId: kpId,
            sourceType: 'import',
          })
          allFragments.push(...fragments)
        }
      }

      if (allFragments.length > 0) {
        await bulkSaveFragments(allFragments)
      }

      setStep('done')
      setTimeout(onComplete, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
      setStep('review')
    }
  }, [groups, existingTags, onComplete])

  const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0)

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
      <div className="relative flex h-[85vh] w-[700px] max-w-[90vw] flex-col rounded-xl border border-[#d5cdbc] bg-[#faf8f4] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#d5cdbc] px-6 py-4">
          <div className="flex items-center gap-2">
            <Upload size={18} className="text-[#6b7c5e]" />
            <span className="text-sm font-medium text-[#4a4a3a]">
              导入知识文档
            </span>
          </div>
          <button onClick={onClose} className="text-[#8a8a7a] hover:text-[#4a4a3a]">
            <X size={16} />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-2 border-b border-[#e5ddd0] px-6 py-2">
          {(['粘贴内容', 'AI 处理', '确认调整', '入库'] as const).map(
            (label, i) => {
              const stepIdx = ['input', 'processing', 'review', 'saving'].indexOf(
                step === 'done' ? 'saving' : step,
              )
              return (
                <div key={label} className="flex items-center gap-1">
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                      i <= stepIdx
                        ? 'bg-[#6b7c5e] text-white'
                        : 'bg-[#e5ddd0] text-[#8a8a7a]'
                    }`}
                  >
                    {i < stepIdx ? <Check size={12} /> : i + 1}
                  </div>
                  <span className="text-xs text-[#8a8a7a]">{label}</span>
                  {i < 3 && (
                    <div className="mx-1 h-px w-4 bg-[#d5cdbc]" />
                  )}
                </div>
              )
            },
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* ─── Input Step ──────── */}
          {step === 'input' && (
            <div className="flex h-full flex-col gap-3">
              <p className="text-sm text-[#8a8a7a]">
                粘贴飞书文档或任意学习笔记内容，AI 会自动按日期/主题分组、分类、生成摘要。
              </p>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="在这里粘贴文档内容..."
                className="flex-1 resize-none rounded-lg border border-[#d5cdbc] bg-white p-3 text-sm text-[#4a4a3a] placeholder-[#b5b0a0] outline-none focus:border-[#6b7c5e]"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#b5b0a0]">
                  {rawText.length} 字符
                </span>
                <button
                  onClick={handleProcess}
                  disabled={!rawText.trim()}
                  className="rounded-lg bg-[#6b7c5e] px-4 py-2 text-sm text-white disabled:opacity-40 hover:bg-[#5a6a4e] transition-colors"
                >
                  开始处理
                </button>
              </div>
            </div>
          )}

          {/* ─── Processing Step ──── */}
          {step === 'processing' && (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <Loader2 size={32} className="animate-spin text-[#6b7c5e]" />
              <p className="text-sm text-[#8a8a7a]">
                AI 正在分析文档内容...
              </p>
            </div>
          )}

          {/* ─── Review Step ─────── */}
          {step === 'review' && (
            <div className="space-y-3">
              <p className="text-sm text-[#8a8a7a]">
                共 {groups.length} 个分组、{totalItems} 个知识条目。你可以编辑后再确认入库。
              </p>
              {groups.map((group, gi) => (
                <div
                  key={gi}
                  className="rounded-lg border border-[#e5ddd0] bg-white"
                >
                  {/* Group header */}
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-[#e5ddd0]">
                    <button onClick={() => toggleGroup(gi)}>
                      {expandedGroups.has(gi) ? (
                        <ChevronDown size={14} className="text-[#8a8a7a]" />
                      ) : (
                        <ChevronRight size={14} className="text-[#8a8a7a]" />
                      )}
                    </button>
                    <input
                      value={group.title}
                      onChange={(e) => updateGroupTitle(gi, e.target.value)}
                      className="flex-1 bg-transparent text-sm font-medium text-[#4a4a3a] outline-none"
                    />
                    {group.date && (
                      <span className="text-xs text-[#b5b0a0]">
                        {group.date}
                      </span>
                    )}
                    <span className="text-xs text-[#b5b0a0]">
                      {group.items.length} 条
                    </span>
                    <button
                      onClick={() => removeGroup(gi)}
                      className="text-[#b5b0a0] hover:text-red-400"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>

                  {/* Items */}
                  {expandedGroups.has(gi) && (
                    <div className="divide-y divide-[#f0ece4]">
                      {group.items.map((item, ii) => (
                        <div key={ii} className="px-3 py-2 space-y-1">
                          <div className="flex items-center gap-2">
                            <Pencil
                              size={10}
                              className="flex-shrink-0 text-[#b5b0a0]"
                            />
                            <input
                              value={item.title}
                              onChange={(e) =>
                                updateItem(gi, ii, 'title', e.target.value)
                              }
                              className="flex-1 bg-transparent text-sm font-medium text-[#4a4a3a] outline-none"
                            />
                            <button
                              onClick={() => removeItem(gi, ii)}
                              className="text-[#b5b0a0] hover:text-red-400"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                          <textarea
                            value={item.content}
                            onChange={(e) =>
                              updateItem(gi, ii, 'content', e.target.value)
                            }
                            rows={2}
                            className="w-full resize-none bg-transparent text-xs text-[#6a6a5a] outline-none"
                          />
                          <div className="flex flex-wrap gap-1">
                            {item.tags.map((tag, ti) => (
                              <span
                                key={ti}
                                className="rounded-full bg-[#e8e2d6] px-2 py-0.5 text-xs text-[#6a6a5a]"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                          {item.summary && (
                            <p className="text-xs text-[#b5b0a0] italic">
                              {item.summary}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ─── Saving / Done ───── */}
          {(step === 'saving' || step === 'done') && (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              {step === 'saving' ? (
                <>
                  <Loader2
                    size={32}
                    className="animate-spin text-[#6b7c5e]"
                  />
                  <p className="text-sm text-[#8a8a7a]">正在保存...</p>
                </>
              ) : (
                <>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#6b7c5e]">
                    <Check size={24} className="text-white" />
                  </div>
                  <p className="text-sm text-[#4a4a3a]">
                    成功导入 {totalItems} 条知识！
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'review' && (
          <div className="flex items-center justify-end gap-2 border-t border-[#d5cdbc] px-6 py-3">
            <button
              onClick={() => setStep('input')}
              className="rounded-lg border border-[#d5cdbc] px-4 py-2 text-sm text-[#8a8a7a] hover:bg-[#f0ece4]"
            >
              返回编辑
            </button>
            <button
              onClick={handleSave}
              disabled={totalItems === 0}
              className="rounded-lg bg-[#6b7c5e] px-4 py-2 text-sm text-white disabled:opacity-40 hover:bg-[#5a6a4e] transition-colors"
            >
              确认入库（{totalItems} 条）
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function randomTagColor(): string {
  const colors = [
    '#E8A87C', '#85B7A7', '#8AACB8', '#D9534F', '#C7A4C0',
    '#A8C686', '#B8A9C9', '#E6B980', '#7FB3D8', '#D4A5A5',
  ]
  return colors[Math.floor(Math.random() * colors.length)]
}
