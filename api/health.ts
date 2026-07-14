import type { VercelRequest, VercelResponse } from '@vercel/node';

function hasAiConfig() {
  return Boolean(
    process.env.deepseek
    || process.env.DEEPSEEK_API_KEY
    || process.env.OPENAI_API_KEY,
  );
}

function hasSyncConfig() {
  return Boolean(
    process.env.SUPABASE_URL
    && process.env.SUPABASE_SERVICE_ROLE_KEY
    && process.env.SYNC_SECRET,
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const probe = req.query.probe === '1' || req.query.probe === 'true';
  const aiConfigured = hasAiConfig();
  const syncConfigured = hasSyncConfig();

  let aiAvailable = aiConfigured;
  let aiMessage = aiConfigured
    ? 'AI 已配置，尚未执行实时检测'
    : '未配置 DeepSeek API Key';

  if (probe && aiConfigured) {
    try {
      const { callDeepSeek } = await import('./_lib/deepseek.js');
      await callDeepSeek(
        [{ role: 'user', content: 'Reply with ok.' }],
        { temperature: 0 },
      );
      aiAvailable = true;
      aiMessage = 'AI 实时检测通过';
    } catch (error) {
      aiAvailable = false;
      aiMessage = error instanceof Error ? error.message : 'AI 实时检测失败';
    }
  } else if (probe && !aiConfigured) {
    aiAvailable = false;
    aiMessage = '未配置 DeepSeek API Key';
  }

  const syncMessage =
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
      ? process.env.SYNC_SECRET
        ? '云同步已配置'
        : '未配置同步密钥，云同步已禁用'
      : '未配置云同步存储';

  res.json({
    ok: true,
    service: 'learningtools',
    capabilities: {
      ai: {
        configured: aiConfigured,
        available: aiAvailable,
        checkedLive: probe,
        message: aiMessage,
      },
      sync: {
        configured: syncConfigured,
        available: syncConfigured,
        checkedLive: false,
        message: syncMessage,
      },
    },
  });
}
