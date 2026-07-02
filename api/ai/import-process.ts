import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callDeepSeek } from '../_lib/deepseek';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text } = req.body ?? {};
  if (!text) return res.status(400).json({ error: 'text is required' });

  const systemPrompt = `你是知识整理专家。用户会粘贴一段学习笔记或文档内容，请你：

1. 按日期分组（如果文本中有日期信息）；如果没有日期，按主题分组
2. 每组内把内容拆分成独立的知识条目
3. 为每个条目：
   - 起一个简短标题
   - 保留原始内容（可以适度整理格式）
   - 建议 1-3 个标签
   - 写一句话摘要

用 JSON 返回：
{
  "groups": [
    {
      "date": "2024-01-15 或空字符串",
      "title": "分组标题",
      "items": [
        { "title": "条目标题", "content": "条目内容", "tags": ["标签1"], "summary": "一句话摘要" }
      ]
    }
  ]
}`;

  try {
    const raw = await callDeepSeek([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ]);

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { groups: [] };
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'import-process failed' });
  }
}
