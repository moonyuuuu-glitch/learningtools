import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callDeepSeek } from '../_lib/deepseek';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { source, candidates } = req.body ?? {};
  if (!source || !candidates?.length) {
    return res.status(400).json({ error: 'source and candidates are required' });
  }

  const candidateList = candidates
    .map((c: { title: string; tags?: string[] }, i: number) =>
      `[${i + 1}] 「${c.title}」标签: ${c.tags?.join(', ') || '无'}`,
    )
    .join('\n');

  const systemPrompt = `你是知识关联分析专家。给定一个知识点（来源）和一组候选知识点，判断它们之间是否存在有意义的关联。

关系类型只有这 5 种：
- similar: 内容相似或属于同一主题
- prerequisite: 候选是来源的前置知识
- application: 来源是候选的实际应用场景
- contrast: 两者是可对比的概念
- causal: 候选是来源的原因或结果

请用 JSON 数组返回，只返回确实有关联的候选。
格式: [{"index": 1, "relationType": "similar", "reason": "简短理由"}]
如果没有有意义的关联，返回空数组 []`;

  try {
    const raw = await callDeepSeek([
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `来源知识点：「${source.title}」\n标签: ${source.tags?.join(', ') || '无'}\n\n候选列表：\n${candidateList}`,
      },
    ]);

    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    const suggestions = parsed
      .filter((item: { index: number }) => item.index >= 1 && item.index <= candidates.length)
      .map((item: { index: number; relationType?: string; reason?: string }) => ({
        candidateId: candidates[item.index - 1].id,
        relationType: item.relationType || 'similar',
        reason: item.reason || '',
      }));

    res.json({ suggestions });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'suggest-links failed' });
  }
}
