import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callDeepSeek } from '../_lib/deepseek';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { title = '', content = '' } = req.body ?? {};
  if (!String(title).trim() && !String(content).trim()) {
    return res.status(400).json({ error: 'title or content is required' });
  }

  try {
    const raw = await callDeepSeek(
      [
        {
          role: 'system',
          content:
            '你是一个学习知识管理助手。请输出 JSON：{"suggestions":["标签1","标签2","标签3"]}。标签使用简洁中文或常见技术名词，只输出 JSON。',
        },
        { role: 'user', content: `标题：${title}\n内容：${String(content).trim()}` },
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
