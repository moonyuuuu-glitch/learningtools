import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callDeepSeek } from '../_lib/deepseek.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { message, context } = req.body ?? {};
  if (!message) return res.status(400).json({ error: 'message is required' });

  const fragments = context?.fragments ?? [];
  const currentTitle = context?.currentTitle ?? '';

  let contextBlock = '';
  if (fragments.length > 0) {
    contextBlock = fragments
      .map((f: { title: string; content: string }, i: number) => `[片段${i + 1}] ${f.title}\n${f.content}`)
      .join('\n\n');
  }

  const systemPrompt = `你是一个个人知识管理助手和学习伙伴。你的特点：
- 回答问题时，优先引用用户已有的知识片段
- 如果用户的问题和历史知识有关联，主动指出："这和你之前学过的 XX 有关系"
- 不只是回答问题，还会补充一句：引导用户思考、或指出可以深入的方向
- 如果发现用户的理解有矛盾或不完整，温和地指出
- 保持简洁，不啰嗦

当你引用用户的知识片段时，用 [片段N] 标注。`;

  const userPrompt = currentTitle
    ? `我正在看「${currentTitle}」，我的问题是：${message}`
    : message;

  const messages: { role: string; content: string }[] = [
    { role: 'system', content: systemPrompt },
  ];
  if (contextBlock) {
    messages.push({ role: 'system', content: `以下是用户知识库中与当前问题最相关的内容：\n\n${contextBlock}` });
  }
  messages.push({ role: 'user', content: userPrompt });

  try {
    const reply = await callDeepSeek(messages);
    const cited: number[] = [];
    for (const m of reply.matchAll(/\[片段(\d+)\]/g)) {
      cited.push(parseInt(m[1], 10) - 1);
    }
    res.json({ reply, citedFragments: [...new Set(cited)] });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'chat failed' });
  }
}
