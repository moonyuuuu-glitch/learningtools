/**
 * DeepSeek API 调用层（纯脚本，无框架依赖）
 * 环境变量：`deepseek`（Vercel 里设的那个 key）
 */

function getApiKey(): string {
  // 兼容多种命名：deepseek / DEEPSEEK_API_KEY / OPENAI_API_KEY
  const key =
    process.env.deepseek ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENAI_API_KEY ||
    '';
  if (!key) throw new Error('未配置 DeepSeek API Key，请在 Vercel 环境变量中设置 `deepseek`');
  return key;
}

interface CallOptions {
  temperature?: number;
  responseFormat?: { type: string };
}

export async function callDeepSeek(
  messages: { role: string; content: string }[],
  options: CallOptions = {},
): Promise<string> {
  const apiKey = getApiKey();
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      temperature: options.temperature ?? 0.3,
      response_format: options.responseFormat,
      messages,
    }),
  });

  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload?.error?.message || `DeepSeek 请求失败 (${res.status})`);
  }
  return payload.choices?.[0]?.message?.content || '';
}
