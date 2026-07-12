import type { FrameworkCard, ReviewCandidate } from '../types'
import { nanoid } from '../utils'

interface FrameworkExtraction {
  title: string
  problem: string
  steps: string[]
  useCases: string[]
  reason: string
  evidence: string
}

export async function generateFrameworkCandidates(input: {
  articleId: string
  title: string
  content: string
  existingFrameworks: FrameworkCard[]
}): Promise<ReviewCandidate[]> {
  const response = await fetch('/api/ai/extract-frameworks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: input.title,
      content: input.content,
      existingFrameworks: input.existingFrameworks.map((framework) => framework.title),
    }),
  })
  const data = await response.json() as {
    frameworks?: FrameworkExtraction[]
    error?: string
  }
  if (!response.ok || data.error) {
    throw new Error(data.error || `HTTP ${response.status}`)
  }

  const existing = new Set(
    input.existingFrameworks.map((framework) => framework.title.trim().toLowerCase()),
  )
  return (data.frameworks ?? [])
    .filter((framework) => !existing.has(framework.title.trim().toLowerCase()))
    .map((framework) => ({
      id: nanoid(),
      type: 'framework' as const,
      title: framework.title,
      summary: framework.reason || framework.problem,
      payload: {
        title: framework.title,
        problem: framework.problem,
        steps: framework.steps,
        useCases: framework.useCases,
        sourceArticleIds: [input.articleId],
        knowledgePointIds: [],
      },
      sourceArticleIds: [input.articleId],
      evidence: framework.evidence,
      status: 'pending' as const,
      createdAt: Date.now(),
    }))
}