import { nanoid } from 'nanoid'
import type { Fragment, SourceType } from '../types'

/**
 * 文档切片器 — 纯规则，不调 AI
 *
 * 策略：
 * 1. 按日期标题行（YYYY-MM-DD / MM月DD日 等）切分
 * 2. 按 Markdown 标题层级切分
 * 3. 按连续空行分段
 * 4. 每个片段最大 maxLen 字符，超长则按句子边界二次切分
 */

const DATE_RE =
  /^(?:#{1,3}\s+)?(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?)/m

const HEADING_RE = /^#{1,3}\s+/m

export interface ChunkOptions {
  sourceId: string
  sourceType: SourceType
  maxLen?: number
}

export function chunkDocument(
  text: string,
  opts: ChunkOptions,
): Fragment[] {
  const { sourceId, sourceType, maxLen = 800 } = opts
  const lines = text.split('\n')
  const rawSections: { title: string; lines: string[] }[] = []

  let currentTitle = ''
  let currentLines: string[] = []

  for (const line of lines) {
    const dateMatch = line.match(DATE_RE)
    const headingMatch = line.match(HEADING_RE)

    if (dateMatch || headingMatch) {
      // 遇到新标题，把前面的内容保存
      if (currentLines.length > 0) {
        rawSections.push({ title: currentTitle, lines: [...currentLines] })
      }
      currentTitle = line.replace(/^#+\s+/, '').trim()
      currentLines = []
    } else {
      currentLines.push(line)
    }
  }
  // 最后一段
  if (currentLines.length > 0) {
    rawSections.push({ title: currentTitle, lines: [...currentLines] })
  }

  // 如果没有任何标题，整体作为一个 section
  if (rawSections.length === 0) {
    rawSections.push({ title: '', lines })
  }

  const fragments: Fragment[] = []

  for (const section of rawSections) {
    const content = section.lines.join('\n').trim()
    if (!content) continue

    const subChunks = splitByLength(content, maxLen)
    for (const chunk of subChunks) {
      fragments.push({
        id: nanoid(),
        sourceId,
        sourceType,
        title: section.title || extractFirstLine(chunk),
        content: chunk,
        keywords: extractKeywords(chunk),
        createdAt: Date.now(),
      })
    }
  }

  return fragments
}

/** 按最大长度切分，优先在句子边界切 */
function splitByLength(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text]

  const sentences = text.split(/(?<=[。！？；\n.!?;])\s*/)
  const chunks: string[] = []
  let current = ''

  for (const sentence of sentences) {
    if (current.length + sentence.length > maxLen && current.length > 0) {
      chunks.push(current.trim())
      current = ''
    }
    current += sentence
  }
  if (current.trim()) {
    chunks.push(current.trim())
  }

  return chunks
}

function extractFirstLine(text: string): string {
  const first = text.split('\n')[0]?.trim() ?? ''
  return first.slice(0, 60)
}

/** 简单关键词提取 — 提取中文词组和英文单词，过滤停用词 */
export function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
    '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for',
    'of', 'and', 'or', 'but', 'it', 'this', 'that', 'with', 'from', 'by', 'as',
    'be', 'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'can',
  ])

  // 匹配中文词组（2-6字）和英文单词（3+字母）
  const cnTokens = text.match(/[\u4e00-\u9fa5]{2,6}/g) ?? []
  const enTokens = (text.match(/[a-zA-Z][a-zA-Z0-9_.-]{2,}/g) ?? [])
    .map((w) => w.toLowerCase())

  const all = [...cnTokens, ...enTokens]
  const freq = new Map<string, number>()
  for (const w of all) {
    if (stopWords.has(w)) continue
    freq.set(w, (freq.get(w) ?? 0) + 1)
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([w]) => w)
}

/** HTML → 纯文本（用于把 Tiptap content 转成可切分文本） */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|li|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
