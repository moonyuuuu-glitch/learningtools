import { apiRequest } from './client'

export type HealthResponse = {
  ok: boolean
  service: string
}

export type SummarizeInput = {
  title?: string
  content: string
}

export type SummarizeResponse = {
  summary: string
  bullets: string[]
}

export type TagsInput = {
  title: string
  content: string
}

export type TagsResponse = {
  suggestions: string[]
}

export async function checkApiHealth() {
  return apiRequest<HealthResponse>('/api/health')
}

export async function summarizeContent(input: SummarizeInput) {
  return apiRequest<SummarizeResponse>('/api/ai/summarize', {
    method: 'POST',
    body: input,
  })
}

export async function suggestTags(input: TagsInput) {
  return apiRequest<TagsResponse>('/api/ai/tags', {
    method: 'POST',
    body: input,
  })
}