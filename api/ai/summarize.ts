import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callDeepSeek } from '../_lib/deepseek.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { title = '', content = '' } = req.body ?? {};
  if (!String(content).trim()) return res.status(400).json({ error: 'content is required' });

  try {
    const raw = await callDeepSeek(
      [
        {
          role: 'system',
          content:
            '你是一个学习助手。请输出 JSON：{"summary":"一句简明摘要","bullets":["要点1","要点2","要点3"]}。只输出 JSON，不要附加解释。',
        },
        { role: 'user', content: `标题：${title}\n内容：${String(content).trim()}` },
      ],
      { responseFormat: { type: 'json_object' }, temperature: 0.2 },
    );

    const parsed = JSON.parse(raw);
    res.json({
      summary: parsed.summary || '',
      bullets: Array.isArray(parsed.bullets) ? parsed.bullets.slice(0, 6) : [],
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'summarize failed' });
  }
}
