import { useState, useRef } from 'react';
import { Home, Network, Library, Inbox, Search, Tags, Download, Upload, Plus, FileText, Lightbulb, Bot } from 'lucide-react';
import type { Store } from '../hooks/useStore';
import TagManagerModal from './TagManagerModal';
import CategoryManagerModal from './CategoryManagerModal';

export default function Navbar({ store, onOpenImport, onToggleInsights, onSyncPush, onSyncPull, onOpenAgent, agentPending = 0 }: { store: Store; onOpenImport?: () => void; onToggleInsights?: () => void; onSyncPush?: () => void; onSyncPull?: () => void; onOpenAgent?: () => void; agentPending?: number }) {
  const {
    viewMode,
    setViewMode,
    searchQuery,
    setSearchQuery,
    upsertTag,
    upsertCategory,
    handleExport,
    handleImport,
    apiStatus,
    apiMessage,
    verifyApi,
    syncStatus,
    syncMessage,
  } = store;
  const [showTagMgr, setShowTagMgr] = useState(false);
  const [showCatMgr, setShowCatMgr] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const navItems = [
    { id: 'home', label: '首页', icon: Home },
    { id: 'graph', label: '图谱', icon: Network },
    { id: 'articles', label: '资料库', icon: Library },
    { id: 'review', label: '审核箱', icon: Inbox },
  ] as const;

  const syncReady = syncStatus === 'ready';
  const aiConnected = apiStatus === 'configured' || apiStatus === 'ready';

  return (
    <>
      <nav className="h-13 flex items-center gap-3 px-5 border-b"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-light)' }}>
        {/* Logo */}
        <div className="flex items-center gap-2 mr-4 shrink-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
            style={{ background: 'var(--accent)' }}>V</div>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Verdent Study</span>
        </div>

        {/* View toggle */}
        <div className="flex gap-0.5 p-0.5 rounded-lg" style={{ background: 'var(--bg-surface)' }}>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setViewMode(id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
              style={{
                background: viewMode === id ? 'var(--bg-card)' : 'transparent',
                color: viewMode === id ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: viewMode === id ? 'var(--shadow)' : 'none',
              }}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex-1 max-w-xs relative ml-2">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索资料、知识点或框架…"
            className="w-full rounded-lg pl-7 pr-3 py-1.5 text-xs focus:outline-none transition-all"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-light)',
              color: 'var(--text-primary)',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(217,83,79,0.1)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.boxShadow = 'none'; }}
          />
        </div>

        <div className="flex-1" />

        <button
          onClick={() => void verifyApi()}
          className="text-[11px] px-2.5 py-1 rounded-full border transition-colors"
          style={{
            color:
              apiStatus === 'ready'
                ? '#2f855a'
                : apiStatus === 'configured'
                  ? '#8b6b3f'
                : apiStatus === 'error'
                  ? 'var(--accent)'
                  : 'var(--text-secondary)',
            background:
              apiStatus === 'ready'
                ? 'rgba(47,133,90,0.10)'
                : apiStatus === 'configured'
                  ? 'rgba(139,107,63,0.10)'
                : apiStatus === 'error'
                  ? 'var(--accent-light)'
                  : 'var(--bg-surface)',
            borderColor:
              apiStatus === 'ready'
                ? 'rgba(47,133,90,0.25)'
                : apiStatus === 'configured'
                  ? 'rgba(139,107,63,0.22)'
                : 'var(--border-light)',
          }}
          title={apiMessage || '检测 AI API 状态'}
        >
          {apiStatus === 'checking'
            ? 'AI 检测中'
            : apiStatus === 'ready'
              ? 'AI 可用'
              : apiStatus === 'configured'
                ? 'AI 已配置'
              : apiStatus === 'error'
                ? 'AI 不可用'
                : '连接 AI'}
        </button>

        {!aiConnected && (
          <button
            onClick={() => void verifyApi()}
            className="text-[11px] px-2.5 py-1 rounded-full border transition-colors"
            style={{
              color: 'var(--text-secondary)',
              background: 'var(--bg-surface)',
              borderColor: 'var(--border-light)',
            }}
            title="本浏览器需要自己连接一次 AI"
          >
            连接 AI
          </button>
        )}

        <div
          className="text-[11px] px-2.5 py-1 rounded-full border"
          style={{
            color: syncReady ? '#2f855a' : 'var(--text-secondary)',
            background: syncReady ? 'rgba(47,133,90,0.10)' : 'var(--bg-surface)',
            borderColor: syncReady ? 'rgba(47,133,90,0.25)' : 'var(--border-light)',
          }}
          title={syncMessage || '检测云同步状态'}
        >
          {syncReady ? '云同步可用' : '云同步未配置'}
        </div>

        {/* V2: Import + Insights */}
        <button onClick={onOpenImport} className="nav-tool-btn" title="导入文档">
          <FileText size={15} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <button onClick={onToggleInsights} className="nav-tool-btn" title="AI 洞察">
          <Lightbulb size={15} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <button onClick={onOpenAgent} className="nav-tool-btn relative" title="接入 Agent">
          <Bot size={15} style={{ color: 'var(--text-secondary)' }} />
          {agentPending > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 rounded-full text-[9px] font-bold text-white flex items-center justify-center"
              style={{ background: 'var(--accent)' }}
            >
              {agentPending}
            </span>
          )}
        </button>

        {/* Tools */}
        <button onClick={() => setShowTagMgr(true)} className="nav-tool-btn" title="标签管理">
          <Tags size={15} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <button onClick={() => setShowCatMgr(true)} className="nav-tool-btn" title="分类管理">
          <Plus size={15} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <button
          onClick={onSyncPush}
          className="nav-tool-btn"
          title={syncReady ? '把当前浏览器数据上传到云端' : (syncMessage || '云同步未配置')}
          disabled={!syncReady}
          style={{ opacity: syncReady ? 1 : 0.45 }}
        >
          <span style={{ fontSize: 14 }}>☁️</span>
        </button>
        <button
          onClick={onSyncPull}
          className="nav-tool-btn"
          title={syncReady ? '从云端恢复到当前浏览器' : (syncMessage || '云同步未配置')}
          disabled={!syncReady}
          style={{ opacity: syncReady ? 1 : 0.45 }}
        >
          <span style={{ fontSize: 14 }}>⬇️</span>
        </button>
        <button onClick={handleExport} className="nav-tool-btn" title="导出备份">
          <Download size={15} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <button onClick={() => fileRef.current?.click()} className="nav-tool-btn" title="导入数据">
          <Upload size={15} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) { handleImport(f); e.target.value = ''; }
        }} />
      </nav>

      {showTagMgr && (
        <TagManagerModal
          tags={store.tags}
          onUpsert={upsertTag}
          onDelete={store.removeTag}
          onClose={() => setShowTagMgr(false)}
          tagColors={['#E8A87C','#D9534F','#85B7A7','#7DB8B0','#C7A4C0','#F0C987','#8AACB8','#C8B8DB','#F4B9B2']}
        />
      )}
      {showCatMgr && (
        <CategoryManagerModal
          categories={store.categories}
          onUpsert={upsertCategory}
          onDelete={store.removeCategory}
          onClose={() => setShowCatMgr(false)}
        />
      )}
    </>
  );
}
