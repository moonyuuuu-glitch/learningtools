import type { VercelRequest, VercelResponse } from '@vercel/node'
import { callDeepSeek } from '../_lib/deepseek.js'

function parseJsonObject(content: string) {
  const cleaned = content.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('AI 返回内容不是合法 JSON')
  }
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
}

function text(value: unknown, max = 320) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function stringList(value: unknown, limit = 6, max = 180) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, max))
    .filter(Boolean)
    .slice(0, limit)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const { title, content, existingFrameworks = [] } = req.body ?? {}
    if (!title || !content) {
      res.status(400).json({ error: 'title and content are required' })
      return
    }

    const result = await callDeepSeek([
      {
        role: 'system',
        content:
          '你是个人知识库编辑。只识别真正可重复使用的框架、方法、检查清单或决策原则。不要把普通观点包装成框架。输出纯 JSON：{"frameworks":[{"title":"短标题","problem":"它解决什么问题","steps":["3-5个可执行步骤"],"useCases":["适用场景"],"reason":"为什么值得反复看","evidence":"原文中的简短证据摘录"}]}。没有合格内容时返回空数组。',
      },
      {
        role: 'user',
        content: `资料标题：${title}\n已有框架：${JSON.stringify(existingFrameworks)}\n资料正文：\n${String(content).slice(0, 12000)}`,
      },
    ])

    const parsed = parseJsonObject(result)
    const frameworks = (Array.isArray(parsed.frameworks) ? parsed.frameworks : [])
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item) => ({
        title: text(item.title, 80),
        problem: text(item.problem, 320),
        steps: stringList(item.steps, 5, 220),
        useCases: stringList(item.useCases, 5, 100),
        reason: text(item.reason, 260),
        evidence: text(item.evidence, 500),
      }))
      .filter((item) => item.title && item.problem && item.steps.length >= 2)
      .slice(0, 5)

    res.status(200).json({ frameworks })
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to extract frameworks',
    })
  }
}