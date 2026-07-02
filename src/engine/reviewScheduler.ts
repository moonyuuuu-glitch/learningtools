import type { KnowledgePoint } from '../types'
import { db } from '../db/database'

/**
 * 复习调度器 — 纯规则，不调 AI
 *
 * 基于 Ebbinghaus 遗忘曲线 + 简化 SM-2 算法
 * 复习间隔：1天 → 3天 → 7天 → 14天 → 30天
 */

const REVIEW_INTERVALS = [1, 3, 7, 14, 30] // 天数

export interface ReviewItem {
  kpId: string
  title: string
  daysSinceUpdate: number
  urgency: 'overdue' | 'today' | 'upcoming'
  nextReviewIn: number   // 距离下次复习天数（负数=已过期）
}

/**
 * 计算保留率 — Ebbinghaus 公式 R(t) = e^(-t/S)
 * S 是稳定性参数，由复习次数决定
 */
export function retentionRate(daysSince: number, stability: number): number {
  return Math.exp(-daysSince / stability)
}

/**
 * 根据知识点更新历史，推算下一次复习时间
 * 简化版：根据 updatedAt 和 createdAt 的差值推断复习了几次
 */
function estimateReviewCount(kp: KnowledgePoint): number {
  if (kp.updatedAt === kp.createdAt) return 0

  const daysBetween =
    (kp.updatedAt - kp.createdAt) / 86_400_000
  // 粗略估计：如果更新过，至少算一次复习
  // 每 7 天内的更新算一次额外复习
  return Math.min(Math.floor(daysBetween / 7) + 1, REVIEW_INTERVALS.length)
}

/**
 * 获取需要复习的知识点列表
 */
export async function getReviewSchedule(): Promise<ReviewItem[]> {
  const allKPs = await db.knowledgePoints.toArray()
  const now = Date.now()
  const msPerDay = 86_400_000

  const items: ReviewItem[] = []

  for (const kp of allKPs) {
    const daysSinceUpdate = (now - kp.updatedAt) / msPerDay
    const reviewCount = estimateReviewCount(kp)
    const intervalIndex = Math.min(reviewCount, REVIEW_INTERVALS.length - 1)
    const nextIntervalDays = REVIEW_INTERVALS[intervalIndex]
    const nextReviewIn = nextIntervalDays - daysSinceUpdate

    let urgency: ReviewItem['urgency']
    if (nextReviewIn < 0) {
      urgency = 'overdue'
    } else if (nextReviewIn < 1) {
      urgency = 'today'
    } else {
      urgency = 'upcoming'
    }

    // 只返回 7 天内需要复习的
    if (nextReviewIn <= 7) {
      items.push({
        kpId: kp.id,
        title: kp.title,
        daysSinceUpdate: Math.floor(daysSinceUpdate),
        urgency,
        nextReviewIn: Math.round(nextReviewIn * 10) / 10,
      })
    }
  }

  // overdue 排最前，然后 today，然后 upcoming
  const urgencyOrder = { overdue: 0, today: 1, upcoming: 2 }
  return items.sort(
    (a, b) =>
      urgencyOrder[a.urgency] - urgencyOrder[b.urgency] ||
      a.nextReviewIn - b.nextReviewIn,
  )
}
