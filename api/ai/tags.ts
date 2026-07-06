import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callDeepSeek } from '../_lib/deepseek.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    title = '',
    content = '',
    existingTags = [],
    relatedKnowledgePoints = [],
  } = req.body ?? {};
  if (!String(title).trim() && !String(content).trim()) {
    return res.status(400).json({ error: 'title or content is required' });
  }

  try {
    const existingTagList = Array.isArray(existingTags)
      ? existingTags.map((item) => String(item).trim()).filter(Boolean).slice(0, 80)
      : [];
    const relatedPointList = Array.isArray(relatedKnowledgePoints)
      ? relatedKnowledgePoints
          .map((item) => String(item).trim())
          .filter(Boolean)
          .slice(0, 20)
      : [];

    const raw = await callDeepSeek(
      [
        {
          role: 'system',
          content:
            '你是一个学习知识管理助手。任务：给文章推荐 3-6 个标签。优先复用 existingTags 中最相关标签，只有在确实缺失时才补充极少量新标签。避免泛标签（如“学习”“知识”“思考”），标签要紧贴文章主题和技术名词。请输出 JSON：{"suggestions":["标签1","标签2"]}，只输出 JSON。',
        },
        {
          role: 'user',
          content: [
            `标题：${title}`,
            `内容：${String(content).trim()}`,
            `existingTags：${existingTagList.join('、') || '无'}`,
            `relatedKnowledgePoints：${relatedPointList.join('、') || '无'}`,
          ].join('\n'),
        },
      ],
      { responseFormat: { type: 'json_object' }, temperature: 0.2 },
    );

    const parsed = JSON.parse(raw);
    res.json({
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 8) : [],
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'tags failed' });
  }
}
