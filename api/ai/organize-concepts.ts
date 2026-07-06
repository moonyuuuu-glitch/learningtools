import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callDeepSeek } from '../_lib/deepseek.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { concepts = [] } = req.body ?? {};
  const list = Array.isArray(concepts)
    ? concepts
        .map((c) => ({ id: String(c?.id ?? '').trim(), title: String(c?.title ?? '').trim() }))
        .filter((c) => c.id && c.title)
        .slice(0, 200)
    : [];
  if (list.length === 0) {
    return res.status(400).json({ error: 'concepts is required' });
  }

  try {
    const raw = await callDeepSeek(
      [
        {
          role: 'system',
          content:
            '你是知识管理助手。给你一批知识点，每个有 id 和 title。任务：' +
            '1) 把每个 title 归一成 2-6 个字的“概念短名”（去掉句子化、动词化表达，例如“Agent学习”→“Agent”，“如何做提示词压缩”→“提示词压缩”）；' +
            '2) 如果两个知识点其实是同一概念，用 mergeIntoId 指向要保留的那个 id（被合并方也要给出 shortName）；' +
            '3) 保持 id 原样返回。请只输出 JSON：{"items":[{"id":"...","shortName":"...","mergeIntoId":"可选"}]}。',
        },
        {
          role: 'user',
          content: JSON.stringify(list),
        },
      ],
      { responseFormat: { type: 'json_object' }, temperature: 0.2 },
    );

    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed.items)
      ? parsed.items
          .map((it: Record<string, unknown>) => ({
            id: String(it.id ?? '').trim(),
            shortName: String(it.shortName ?? '').trim(),
            mergeIntoId: it.mergeIntoId ? String(it.mergeIntoId).trim() : undefined,
          }))
          .filter((it: { id: string; shortName: string }) => it.id && it.shortName)
      : [];
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'organize failed' });
  }
}
