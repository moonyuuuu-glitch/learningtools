import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callDeepSeek } from '../_lib/deepseek.js';

const RELATION_TYPES = new Set([
  'part_of',
  'explains',
  'prerequisite',
  'derived_from',
  'related_to',
]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { article, currentNodes, candidates, feedbackPatterns = [] } = req.body ?? {};
  if (!article || !currentNodes?.length || !candidates?.length) {
    return res.status(400).json({ error: 'article, currentNodes and candidates are required' });
  }

  const currentList = currentNodes
    .map((node: { id: string; type: string; title: string; summary?: string }, index: number) =>
      `[C${index + 1}] id=${node.id} type=${node.type} title=${node.title} summary=${node.summary || ''}`,
    )
    .join('\n');
  const candidateList = candidates
    .map((node: { id: string; type: string; title: string; summary?: string }, index: number) =>
      `[H${index + 1}] id=${node.id} type=${node.type} title=${node.title} summary=${node.summary || ''}`,
    )
    .join('\n');

  const systemPrompt = `你是个人知识库的关系编辑。根据一篇来源资料，将本篇关联的当前节点与最相关历史节点编织成少量、可解释的知识关系。

只允许关系类型：
- part_of：from 是 to 的组成部分
- explains：from 帮助解释 to
- prerequisite：from 是理解 to 的前置
- derived_from：from 的方法或观点来源于 to 所代表的框架/知识
- related_to：确实相关但没有更强语义

要求：
1. 最多返回 8 条，宁缺毋滥。
2. 必须使用提供的真实节点 id，不能自环。
3. reason 用一句话解释为什么相关。
4. evidence 必须是来源资料正文中的简短原文摘录。
5. confidence 只能是 high、medium、low。
6. 参考负反馈模式，避免重复用户不喜欢的连法。
7. 输出纯 JSON 数组，不要 Markdown。

格式：
[{"fromId":"真实id","toId":"真实id","relationType":"explains","reason":"一句话","evidence":"原文摘录","confidence":"high"}]`;

  try {
    const raw = await callDeepSeek([
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `来源资料：${article.title}
正文：
${String(article.content || '').slice(0, 6000)}

当前节点：
${currentList}

历史候选：
${candidateList}

用户否定过的关系模式：
${JSON.stringify(feedbackPatterns).slice(0, 3000)}`,
      },
    ]);

    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    const knownIds = new Set([
      ...currentNodes.map((node: { id: string }) => node.id),
      ...candidates.map((node: { id: string }) => node.id),
    ]);
    const sourceText = String(article.content || '').replace(/\s+/g, ' ');
    const seen = new Set<string>();
    const relations = parsed
      .filter((item: Record<string, unknown>) => {
        const fromId = String(item.fromId || '');
        const toId = String(item.toId || '');
        const relationType = String(item.relationType || '');
        const evidence = String(item.evidence || '').trim();
        const key = `${fromId}|${toId}|${relationType}`;
        if (!knownIds.has(fromId) || !knownIds.has(toId) || fromId === toId) return false;
        if (!RELATION_TYPES.has(relationType) || seen.has(key)) return false;
        if (!String(item.reason || '').trim() || !evidence) return false;
        if (!sourceText.includes(evidence.replace(/\s+/g, ' '))) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8)
      .map((item: Record<string, unknown>) => ({
        fromId: String(item.fromId),
        toId: String(item.toId),
        relationType: String(item.relationType),
        reason: String(item.reason).trim().slice(0, 320),
        evidence: String(item.evidence).trim().slice(0, 500),
        confidence: ['high', 'medium', 'low'].includes(String(item.confidence))
          ? String(item.confidence)
          : 'medium',
      }));

    res.json({ relations });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'suggest-links failed' });
  }
}
