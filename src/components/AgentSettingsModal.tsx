import { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, Copy, Check, KeyRound, Power } from 'lucide-react';
import type { AgentScope, AgentTokenMeta } from '../types';
import { SCOPE_LIST, SCOPE_LABELS } from '../lib/agentScopes';
import { createToken, listTokens, revokeToken, registerWorkspace } from '../api/agent';

export default function AgentSettingsModal({
  enabled,
  setEnabled,
  onClose,
}: {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  onClose: () => void;
}) {
  const [tokens, setTokens] = useState<AgentTokenMeta[]>([]);
  const [label, setLabel] = useState('');
  const [scopes, setScopes] = useState<AgentScope[]>(['read']);
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const mcpUrl = `${window.location.origin}/api/agent/mcp`;

  const refresh = useCallback(async () => {
    try { setTokens(await listTokens()); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void registerWorkspace().then(refresh).catch((error) => {
      setError(error instanceof Error ? error.message : 'Agent 服务暂时不可用');
    });
  }, [refresh]);

  const toggleScope = (s: AgentScope) => {
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const handleCreate = async () => {
    setError('');
    if (scopes.length === 0) { setError('请至少选择一个权限'); return; }
    setCreating(true);
    try {
      const r = await createToken(label.trim() || 'Agent 令牌', scopes);
      if (r.success && r.token) {
        setNewToken(r.token);
        setLabel('');
        setScopes(['read']);
        if (!enabled) setEnabled(true); // 生成令牌后自动开启桥接
        await refresh();
      } else {
        setError(r.error || '生成失败');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!window.confirm('吊销后使用该令牌的 agent 将立即失效，确定吗？')) return;
    await revokeToken(id);
    await refresh();
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const claudeConfig = `{
  "mcpServers": {
    "verdent-study-kb": {
      "url": "${mcpUrl}",
      "headers": { "Authorization": "Bearer <你的令牌>" }
    }
  }
}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(59,47,47,0.25)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="w-[30rem] max-h-[85vh] overflow-y-auto rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
            <KeyRound size={15} /> 接入 Agent（MCP）
          </h3>
          <button onClick={onClose}><X size={16} style={{ color: 'var(--text-muted)' }} /></button>
        </div>

        {/* 桥接开关 */}
        <div className="flex items-center justify-between rounded-xl px-3 py-2.5 mb-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)' }}>
          <div className="flex items-center gap-2">
            <Power size={14} style={{ color: enabled ? '#2f855a' : 'var(--text-muted)' }} />
            <div>
              <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>浏览器桥接</div>
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {enabled ? '已开启：agent 可读写（写需你审批）' : '关闭时 agent 调用会超时'}
              </div>
            </div>
          </div>
          <button
            onClick={() => setEnabled(!enabled)}
            className="w-10 h-5 rounded-full relative transition-colors"
            style={{ background: enabled ? 'var(--accent)' : 'var(--border-light)' }}
          >
            <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: enabled ? 22 : 2 }} />
          </button>
        </div>

        {/* 生成令牌 */}
        <div className="rounded-xl p-3 mb-4 space-y-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)' }}>
          <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>生成新令牌</div>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="备注名（如：我的 Claude 桌面端）" className="input-base" />
          <div className="grid grid-cols-2 gap-1.5">
            {SCOPE_LIST.map((s) => (
              <label key={s.scope} className="flex items-center gap-1.5 text-[11px] cursor-pointer px-1 py-0.5" style={{ color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={scopes.includes(s.scope)} onChange={() => toggleScope(s.scope)} />
                <span>{s.label}</span>
                {s.needsApproval && <span className="text-[9px]" style={{ color: 'var(--accent)' }}>需审批</span>}
              </label>
            ))}
          </div>
          {error && <div className="text-[11px]" style={{ color: 'var(--accent)' }}>{error}</div>}
          <button onClick={handleCreate} disabled={creating} className="flex items-center gap-1.5 text-xs text-white px-3 py-1.5 rounded-lg font-medium disabled:opacity-60" style={{ background: 'var(--accent)' }}>
            <Plus size={13} /> {creating ? '生成中…' : '生成令牌'}
          </button>

          {newToken && (
            <div className="rounded-lg p-2.5 mt-1" style={{ background: 'var(--accent-light)', border: '1px solid var(--border-light)' }}>
              <div className="text-[10px] mb-1" style={{ color: 'var(--text-secondary)' }}>令牌仅此一次显示，请复制保存：</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[10px] break-all" style={{ color: 'var(--text-primary)' }}>{newToken}</code>
                <button onClick={() => copy(newToken)} className="shrink-0" title="复制">
                  {copied ? <Check size={13} style={{ color: '#2f855a' }} /> : <Copy size={13} style={{ color: 'var(--text-muted)' }} />}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 令牌列表 */}
        <div className="mb-4">
          <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-primary)' }}>已生成令牌</div>
          {tokens.length === 0 ? (
            <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>暂无令牌</div>
          ) : (
            <div className="space-y-1.5">
              {tokens.map((t) => (
                <div key={t.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs" style={{ color: 'var(--text-primary)' }}>{t.label}</div>
                    <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {t.scopes.map((s) => SCOPE_LABELS[s] || s).join('、')} · id {t.id}
                    </div>
                  </div>
                  <button onClick={() => handleRevoke(t.id)} title="吊销"><Trash2 size={13} style={{ color: 'var(--text-muted)' }} className="hover:text-red-500" /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 接入说明 */}
        <div className="rounded-xl p-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)' }}>
          <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>如何接入（Claude 桌面端等 MCP 客户端）</div>
          <div className="text-[10px] mb-1" style={{ color: 'var(--text-secondary)' }}>MCP 端点 URL：</div>
          <div className="flex items-center gap-2 mb-2">
            <code className="flex-1 text-[10px] break-all" style={{ color: 'var(--text-primary)' }}>{mcpUrl}</code>
            <button onClick={() => copy(mcpUrl)} title="复制"><Copy size={12} style={{ color: 'var(--text-muted)' }} /></button>
          </div>
          <div className="text-[10px] mb-1" style={{ color: 'var(--text-secondary)' }}>配置示例：</div>
          <pre className="text-[9.5px] rounded-md p-2 overflow-x-auto" style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}>{claudeConfig}</pre>
          <div className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
            使用时请保持本网页开启：读操作即时返回，写操作会在此弹出审批卡，批准后才生效。
          </div>
        </div>
      </div>
    </div>
  );
}
