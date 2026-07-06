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
  existingTags?: string[]
  relatedKnowledgePoints?: string[]
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

// ─── 概念抽取 ─────────────────────────────────────

export type ConceptsInput = {
  title: string
  content: string
  existingConcepts?: string[]
}

export type ConceptsResponse = {
  concepts: string[]
}

export async function extractConcepts(input: ConceptsInput) {
  return apiRequest<ConceptsResponse>('/api/ai/concepts', {
    method: 'POST',
    body: input,
  })
}

// ─── 一键整理概念（归一 + 合并建议）───────────────

export type OrganizeConceptsInput = {
  concepts: { id: string; title: string }[]
}

export type OrganizeConceptsResponse = {
  items: { id: string; shortName: string; mergeIntoId?: string }[]
}

export async function organizeConcepts(input: OrganizeConceptsInput) {
  return apiRequest<OrganizeConceptsResponse>('/api/ai/organize-concepts', {
    method: 'POST',
    body: input,
  })
}

// ─── V2: Chat (RAG) ───────────────────────────────

export type ChatInput = {
  message: string
  context: {
    fragments: { title: string; content: string }[]
    currentTitle?: string
  }
}

export type ChatResponse = {
  reply: string
  citedFragments: number[]
}

export async function chatWithContext(input: ChatInput) {
  return apiRequest<ChatResponse>('/api/ai/chat', {
    method: 'POST',
    body: input,
  })
}

// ─── V2: Suggest Links ───────────────────────────

export type SuggestLinksInput = {
  source: { title: string; content: string; tags: string[] }
  candidates: { id: string; title: string; content: string; tags: string[] }[]
}

export type SuggestLinksResponse = {
  suggestions: {
    candidateId: string
    relationType: string
    reason: string
  }[]
}

export async function suggestLinks(input: SuggestLinksInput) {
  return apiRequest<SuggestLinksResponse>('/api/ai/suggest-links', {
    method: 'POST',
    body: input,
  })
}

// ─── V2: Import Process ──────────────────────────

export type ImportProcessInput = {
  text: string
}

export type ImportGroup = {
  date: string
  title: string
  items: {
    title: string
    content: string
    tags: string[]
    summary: string
  }[]
}

export type ImportProcessResponse = {
  groups: ImportGroup[]
}

export async function processImport(input: ImportProcessInput) {
  return apiRequest<ImportProcessResponse>('/api/ai/import-process', {
    method: 'POST',
    body: input,
  })
}