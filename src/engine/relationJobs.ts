import {
  listArticles,
  listRelationAnalysisJobs,
  saveRelationAnalysisJob,
} from '../db/database'
import { analyzeArticleRelations, createRelationAnalysisJob, relationAnalysisHash } from './relationInference'

let running = false

const DAILY_ANALYSIS_LIMIT = 8
const BUDGET_STORAGE_KEY = 'learningtools.relation-ai-budget.v1'

type DailyBudget = {
  date: string
  used: number
}

function readDailyBudget(): DailyBudget {
  const today = new Date().toISOString().slice(0, 10)
  try {
    const saved = JSON.parse(window.localStorage.getItem(BUDGET_STORAGE_KEY) || 'null') as DailyBudget | null
    if (saved?.date === today) return saved
  } catch {}
  return { date: today, used: 0 }
}

function consumeDailyBudget() {
  const budget = readDailyBudget()
  if (budget.used >= DAILY_ANALYSIS_LIMIT) return false
  window.localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify({
    ...budget,
    used: budget.used + 1,
  }))
  return true
}

export function getRelationAnalysisBudget() {
  const budget = readDailyBudget()
  return {
    used: budget.used,
    limit: DAILY_ANALYSIS_LIMIT,
    remaining: Math.max(DAILY_ANALYSIS_LIMIT - budget.used, 0),
  }
}

export async function queueHistoricalRelationAnalysis() {
  const [articles, jobs] = await Promise.all([
    listArticles(),
    listRelationAnalysisJobs(),
  ])
  const completedHashes = new Set(
    jobs
      .filter((job) => ['completed', 'skipped', 'running', 'queued'].includes(job.status))
      .map((job) => `${job.articleId}:${job.analysisHash}`),
  )
  for (const article of articles) {
    const key = `${article.id}:${relationAnalysisHash(article)}`
    if (!completedHashes.has(key)) await createRelationAnalysisJob(article)
  }
}

export async function processNextRelationJob() {
  if (running) return
  running = true
  try {
    const jobs = await listRelationAnalysisJobs()
    const next = jobs
      .filter((job) =>
        job.status === 'queued'
        || (job.status === 'failed' && job.retryCount < 2))
      .sort((left, right) => left.createdAt - right.createdAt)[0]
    if (!next) return
    if (!consumeDailyBudget()) return
    try {
      await analyzeArticleRelations(next)
    } catch (error) {
      await saveRelationAnalysisJob({
        ...next,
        status: 'failed',
        retryCount: next.retryCount + 1,
        error: error instanceof Error ? error.message : 'AI 关系分析失败',
        updatedAt: Date.now(),
      })
    }
  } finally {
    running = false
  }
}

export async function retryRelationAnalysis(articleId: string) {
  const articles = await listArticles()
  const article = articles.find((item) => item.id === articleId)
  if (!article) return
  await createRelationAnalysisJob(article, true)
  await processNextRelationJob()
}

export function startRelationJobLoop(intervalMs = 12_000) {
  let stopped = false
  const tick = async () => {
    if (stopped) return
    await processNextRelationJob()
  }
  void queueHistoricalRelationAnalysis().then(tick)
  const intervalId = window.setInterval(() => void tick(), Math.max(intervalMs, 60_000))
  return () => {
    stopped = true
    window.clearInterval(intervalId)
  }
}