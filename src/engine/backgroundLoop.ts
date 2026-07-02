import { nanoid } from 'nanoid'
import { db } from '../db/database'
import { analyzeGraph, findLinkCandidates } from './graphAnalytics'
import { getReviewSchedule } from './reviewScheduler'
import type { Insight, LinkSuggestion } from '../types'

/**
 * 后台认知循环 — 参考 AEGIS backgroundCognition
 *
 * 定期（默认 5 分钟）自动运行：
 * 1. 图谱健康分析 → 生成 Insight（孤岛、过时、空白）
 * 2. 候选关联生成 → 写入 LinkSuggestion（待确认）
 * 3. 复习提醒 → 生成 Insight
 *
 * 全部纯脚本，零 AI 调用
 */

const DEFAULT_INTERVAL = 5 * 60_000 // 5 分钟
const STALE_DAYS = 14

let _intervalId: ReturnType<typeof setInterval> | null = null

/** 启动后台循环 */
export function startBackgroundLoop(intervalMs = DEFAULT_INTERVAL) {
  stopBackgroundLoop()
  // 启动后延迟 10s 跑第一次（避免阻塞初始渲染）
  setTimeout(() => {
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
    await Promise.all([
      detectIslands(),
      detectStaleNodes(),
      generateLinkSuggestions(),
      generateReviewInsights(),
    ])
  } catch (err) {
    console.warn('[backgroundLoop] Cognition cycle error:', err)
  }
}

// ─── 孤岛检测 ─────────────────────────────────────

async function detectIslands() {
  const report = await analyzeGraph(STALE_DAYS)
  if (report.islands.length === 0) return

  // 检查是否已有未读的同类 insight
  const existing = await db.insights
    .where('type')
    .equals('island')
    .and((i) => i.status === 'unread')
    .count()
  if (existing > 0) return

  const insight: Insight = {
    id: nanoid(),
    type: 'island',
    title: `${report.islands.length} 个知识点没有任何关联`,
    description: report.islands
      .slice(0, 5)
      .map((n) => `• ${n.title}`)
      .join('\n'),
    payload: { nodeIds: report.islands.map((n) => n.id) },
    status: 'unread',
    createdAt: Date.now(),
  }

  await db.insights.put(insight)
}

// ─── 过时节点检测 ──────────────────────────────────

async function detectStaleNodes() {
  const report = await analyzeGraph(STALE_DAYS)
  if (report.staleNodes.length === 0) return

  const existing = await db.insights
    .where('type')
    .equals('stale')
    .and((i) => i.status === 'unread')
    .count()
  if (existing > 0) return

  const insight: Insight = {
    id: nanoid(),
    type: 'stale',
    title: `${report.staleNodes.length} 个知识点超过 ${STALE_DAYS} 天未更新`,
    description: report.staleNodes
      .slice(0, 5)
      .map((n) => `• ${n.title}（${n.daysSinceUpdate} 天前）`)
      .join('\n'),
    payload: { nodeIds: report.staleNodes.map((n) => n.id) },
    status: 'unread',
    createdAt: Date.now(),
  }

  await db.insights.put(insight)
}

// ─── 候选关联建议 ──────────────────────────────────

async function generateLinkSuggestions() {
  const allKPs = await db.knowledgePoints.toArray()
  const existingPending = await db.linkSuggestions
    .where('status')
    .equals('pending')
    .count()

  // 如果已经有超过 20 条未处理建议，不再生成
  if (existingPending > 20) return

  const suggestions: LinkSuggestion[] = []

  for (const kp of allKPs) {
    const candidates = await findLinkCandidates(kp.id, 3)
    for (const c of candidates) {
      // 去重：检查是否已有相同 pair 的建议
      const exists = await db.linkSuggestions
        .filter(
          (s) =>
            (s.fromId === kp.id && s.toId === c.id) ||
            (s.fromId === c.id && s.toId === kp.id),
        )
        .count()
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
    await db.linkSuggestions.bulkPut(suggestions.slice(0, 20))
  }
}

// ─── 复习提醒 ──────────────────────────────────────

async function generateReviewInsights() {
  const schedule = await getReviewSchedule()
  const overdueOrToday = schedule.filter(
    (r) => r.urgency === 'overdue' || r.urgency === 'today',
  )
  if (overdueOrToday.length === 0) return

  const existing = await db.insights
    .where('type')
    .equals('gap')
    .and((i) => i.status === 'unread')
    .count()
  if (existing > 0) return

  const insight: Insight = {
    id: nanoid(),
    type: 'gap',
    title: `${overdueOrToday.length} 个知识点需要复习`,
    description: overdueOrToday
      .slice(0, 5)
      .map(
        (r) =>
          `• ${r.title}（${r.urgency === 'overdue' ? `已过期 ${Math.abs(Math.round(r.nextReviewIn))} 天` : '今天复习'}）`,
      )
      .join('\n'),
    payload: { kpIds: overdueOrToday.map((r) => r.kpId) },
    status: 'unread',
    createdAt: Date.now(),
  }

  await db.insights.put(insight)
}
