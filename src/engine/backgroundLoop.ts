import { nanoid } from 'nanoid'
import {
  listKnowledgePoints,
  listArticles,
  listLinkSuggestions,
  saveLinkSuggestion,
  saveArticle,
} from '../db/database'
import { findLinkCandidates } from './graphAnalytics'
import type { LinkSuggestion } from '../types'

/**
 * 后台认知循环 — 参考 AEGIS backgroundCognition
 *
 * 定期（默认 5 分钟）自动运行：
 * 1. 图谱健康分析 → 生成 Insight（孤岛、过时、空白）
 * 2. 候选关联生成 → 写入 LinkSuggestion（待确认）
 * 3. 复习提醒 → 生成 Insight
 * 4. 一次性修复：按标签匹配把孤立知识点关联回文章
 *
 * 全部纯脚本，零 AI 调用
 */

const DEFAULT_INTERVAL = 5 * 60_000 // 5 分钟
const ORPHAN_FIX_KEY = 'learningtools.orphan-kp-fix.v1'
let _intervalId: ReturnType<typeof setInterval> | null = null

/** 启动后台循环 */
export function startBackgroundLoop(intervalMs = DEFAULT_INTERVAL) {
  stopBackgroundLoop()
  // 启动后延迟 10s 跑第一次（避免阻塞初始渲染）
  setTimeout(() => {
    void fixOrphanKnowledgePoints()
    runCognitionCycle()
    _intervalId = setInterval(runCognitionCycle, intervalMs)
  }, 10_000)
}
/** 停止后台循环 */
export function stopBackgroundLoop() {
  if (_intervalId) {
    clearInterval(_intervalId)
    _intervalId = null
  }
}
/** 手动触发一次分析 */
export async function runCognitionCycle(): Promise<void> {
  try {
    await generateLinkSuggestions()
  } catch (err) {
    console.warn('[backgroundLoop] Cognition cycle error:', err)
  }
}

// ─── 候选关联建议 ──────────────────────────────────

async function generateLinkSuggestions() {
  const allKPs = await listKnowledgePoints()
  const allSuggestions = await listLinkSuggestions()
  const existingPending = allSuggestions.filter((item) => item.status === 'pending').length

  // 如果已经有超过 20 条未处理建议，不再生成
  if (existingPending > 20) return

  const suggestions: LinkSuggestion[] = []

  for (const kp of allKPs) {
    const candidates = await findLinkCandidates(kp.id, 3)
    for (const c of candidates) {
      // 去重：检查是否已有相同 pair 的建议
      const exists = allSuggestions.filter(
        (suggestion) =>
          (suggestion.fromId === kp.id && suggestion.toId === c.id)
          || (suggestion.fromId === c.id && suggestion.toId === kp.id),
      ).length
      if (exists > 0) continue

      suggestions.push({
        id: nanoid(),
        fromId: kp.id,
        toId: c.id,
        relationType: 'similar', // 脚本只能判断"相似"，精确类型交给 AI
        reason: c.reason,
        status: 'pending',
        createdAt: Date.now(),
      })
    }
  }

  if (suggestions.length > 0) {
    await Promise.all(suggestions.slice(0, 20).map(saveLinkSuggestion))
  }
}

// ─── 一次性修复：按标签匹配把孤立知识点关联回文章 ──────

async function fixOrphanKnowledgePoints() {
  try {
    if (localStorage.getItem(ORPHAN_FIX_KEY)) return
    const allKPs = await listKnowledgePoints()
    const allArticles = await listArticles()
    if (allKPs.length === 0 || allArticles.length === 0) return

    const referencedKPIds = new Set(allArticles.flatMap((a) => a.knowledgePoints))
    const orphans = allKPs.filter((kp) => !referencedKPIds.has(kp.id))
    if (orphans.length === 0) {
      localStorage.setItem(ORPHAN_FIX_KEY, String(Date.now()))
      return
    }

    let fixCount = 0
    for (const article of allArticles) {
      if (article.tags.length === 0) continue
      const matched = orphans.filter(
        (kp) => kp.tags.length > 0 && kp.tags.some((tag) => article.tags.includes(tag)),
      )
      if (matched.length === 0) continue
      const newIds = matched
        .map((kp) => kp.id)
        .filter((id) => !article.knowledgePoints.includes(id))
      if (newIds.length === 0) continue
      await saveArticle({
        ...article,
        knowledgePoints: [...article.knowledgePoints, ...newIds],
      })
      fixCount += newIds.length
    }
    console.info(`[backgroundLoop] Fixed ${fixCount} orphan KP-article links`)
    localStorage.setItem(ORPHAN_FIX_KEY, String(Date.now()))
  } catch (err) {
    console.warn('[backgroundLoop] Orphan fix error:', err)
  }
}
