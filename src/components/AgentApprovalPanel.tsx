import { useState } from 'react';
import { Check, X, ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react';
import type { AgentProposal } from '../types';
import { SCOPE_LABELS } from '../lib/agentScopes';

export default function AgentApprovalPanel({
  proposals,
  onApprove,
  onReject,
  embedded = false,
}: {
  proposals: AgentProposal[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  embedded?: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (proposals.length === 0) return null;

  const handle = async (id: string, fn: (id: string) => void) => {
    setBusy(id);
    try { await fn(id); } finally { setBusy(null); }
  };

  return (
    <div
      className={embedded ? 'agent-approval-embedded overflow-hidden' : 'fixed bottom-4 right-4 z-50 w-80 rounded-xl overflow-hidden'}
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', boxShadow: '0 8px 30px rgba(0,0,0,0.15)' }}
    >
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: 'var(--accent-light)', borderBottom: '1px solid var(--border-light)' }}>
        <ShieldAlert size={15} style={{ color: 'var(--accent)' }} />
        <div className="min-w-0">
          <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
            Agent 写入审批（{proposals.length}）
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            只有外部 Agent 想修改知识库时才会出现在这里；批准后才真正写入。
          </div>
        </div>
      </div>
      <div className="max-h-96 overflow-y-auto">
        {proposals.map((p) => (
          <div key={p.id} className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-light)' }}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{p.summary}</div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  权限：{SCOPE_LABELS[p.scope] || p.scope} · {p.tool}
                </div>
              </div>
              <button
                onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                className="shrink-0"
                style={{ color: 'var(--text-muted)' }}
                title="查看详情"
              >
                {expanded === p.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>
            {expanded === p.id && (
              <pre
                className="mt-2 text-[10px] rounded-md p-2 overflow-x-auto"
                style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', maxHeight: 160 }}
              >
                {JSON.stringify(p.params, null, 2)}
              </pre>
            )}
            <div className="flex gap-2 mt-2.5">
              <button
                disabled={busy === p.id}
                onClick={() => handle(p.id, onApprove)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-xs font-medium text-white transition-opacity disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
              >
                <Check size={12} /> 批准
              </button>
              <button
                disabled={busy === p.id}
                onClick={() => handle(p.id, onReject)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
                style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}
              >
                <X size={12} /> 拒绝
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
