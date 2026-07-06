import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callDeepSeek } from '../_lib/deepseek.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { title = '', content = '', existingConcepts = [] } = req.body ?? {};
  if (!String(title).trim() && !String(content).trim()) {
    return res.status(400).json({ error: 'title or content is required' });
  }

  try {
    const existingList = Array.isArray(existingConcepts)
      ? existingConcepts.map((item) => String(item).trim()).filter(Boolean).slice(0, 120)
      : [];

    const raw = await callDeepSeek(
      [
        {
          role: 'system',
          content:
            '你是知识管理助手。任务：从文章中抽取 3-5 个“核心概念”。规则：' +
            '1) 每个概念必须是 2-6 个字的短名词或术语（如“Agent”“强化学习”“上下文工程”“Token经济”），禁止整句或短语；' +
            '2) 优先复用 existingConcepts 里已存在的概念名（大小写/措辞对齐），只有确实缺失时才补新概念；' +
            '3) 避免泛概念（如“学习”“知识”“思考”“方法”）；' +
            '4) 概念要紧扣文章主题。请只输出 JSON：{"concepts":["概念1","概念2"]}。',
        },
        {
          role: 'user',
          content: [
            `标题：${title}`,
            `内容：${String(content).trim()}`,
            `existingConcepts：${existingList.join('、') || '无'}`,
          ].join('\n'),
        },
      ],
      { responseFormat: { type: 'json_object' }, temperature: 0.2 },
    );

    const parsed = JSON.parse(raw);
    res.json({
      concepts: Array.isArray(parsed.concepts) ? parsed.concepts.slice(0, 6) : [],
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'concepts failed' });
  }
}
