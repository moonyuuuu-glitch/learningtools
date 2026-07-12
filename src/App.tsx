import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { useStore } from './hooks/useStore';
import Navbar from './components/Navbar';
import KnowledgeGraph from './components/KnowledgeGraph';
import ArticleLibrary from './components/ArticleLibrary';
import ChatPanel from './components/ChatPanel';
import ImportFlow from './components/ImportFlow';
import HomeWorkspace from './components/HomeWorkspace';
import GraphDetailPanel from './components/GraphDetailPanel';
import ReviewInbox from './components/ReviewInbox';
import AgentSettingsModal from './components/AgentSettingsModal';
import { useAgentBridge } from './hooks/useAgentBridge';
import { startBackgroundLoop, stopBackgroundLoop } from './engine/backgroundLoop';
import { exportAll, importAll } from './db/database';
import { pushSnapshot, pullSnapshot } from './api/sync';
import { startRelationJobLoop } from './engine/relationJobs';

export default function App() {
  const store = useStore();
  const [showImport, setShowImport] = useState(false);
  const [showAgent, setShowAgent] = useState(false);
  const bridge = useAgentBridge(store);

  // 启动后台认知循环
  useEffect(() => {
    startBackgroundLoop();
    const stopRelationJobs = startRelationJobLoop();
    return () => {
      stopBackgroundLoop();
      stopRelationJobs();
    };
  }, []);

  const selectedKP = store.knowledgePoints.find(
    (kp) => kp.id === store.selectedKPId,
  );
  const selectedArticle = store.articles.find(
    (article) => article.id === store.selectedArticleId,
  );
  const chatContextType = selectedKP
    ? 'kp'
    : selectedArticle
      ? 'article'
      : 'global';
  const chatContextId = selectedKP?.id ?? selectedArticle?.id;
  const chatContextTitle = selectedKP?.title ?? selectedArticle?.title;

  return (
    <ReactFlowProvider>
      <div className="flex flex-col h-screen overflow-hidden">
        <Navbar
          store={store}
          onOpenImport={() => setShowImport(true)}
          onToggleInsights={() => store.setViewMode('review')}
          onOpenAgent={() => setShowAgent(true)}
          agentPending={bridge.pendingCount}
          onSyncPush={async () => {
            if (store.syncStatus !== 'ready') {
              alert(`云同步不可用：${store.syncMessage || '当前环境未配置云同步'}`);
              return;
            }
            const hasLocalContent =
              store.articles.length > 0
              || store.knowledgePoints.length > 0
              || store.frameworks.length > 0
              || store.relations.length > 0
              || store.candidates.length > 0;
            if (!hasLocalContent) {
              alert('当前浏览器还没有可上传的本地知识。先导入资料，或从云端恢复自己的快照。');
              return;
            }
            try {
              const data = await exportAll();
              const r = await pushSnapshot(data);
              alert(r.success ? `已上传当前浏览器的本地快照 v${r.version}` : `同步失败: ${r.error}`);
            } catch (e: unknown) {
              alert(`同步失败: ${e instanceof Error ? e.message : e}`);
            }
          }}
          onSyncPull={async () => {
            if (store.syncStatus !== 'ready') {
              alert(`云同步不可用：${store.syncMessage || '当前环境未配置云同步'}`);
              return;
            }
            if (!confirm('这会用云端快照覆盖当前浏览器里的本地数据，确定继续吗？')) return;
            try {
              const r = await pullSnapshot();
              if (r.success && r.payload) {
                await importAll(r.payload as Parameters<typeof importAll>[0]);
                window.location.reload();
              } else {
                alert(`恢复失败: ${r.error || '无快照'}`);
              }
            } catch (e: unknown) {
              alert(`恢复失败: ${e instanceof Error ? e.message : e}`);
            }
          }}
        />
        <main className="flex-1 flex overflow-hidden app-main">
          {store.viewMode === 'home' && (
            <HomeWorkspace store={store} />
          )}
          {store.viewMode === 'graph' && (
            <>
              <div className="flex-1 overflow-hidden">
                <KnowledgeGraph store={store} />
              </div>
              <GraphDetailPanel store={store} />
            </>
          )}
          {store.viewMode === 'articles' && (
            <div className="flex-1 overflow-hidden">
              <ArticleLibrary store={store} />
            </div>
          )}
          {store.viewMode === 'review' && (
            <ReviewInbox
              store={store}
              agentProposals={bridge.proposals}
              onApproveAgent={bridge.approve}
              onRejectAgent={bridge.reject}
            />
          )}
        </main>

        {/* AI 聊天浮窗 */}
        <ChatPanel
          contextType={chatContextType}
          contextId={chatContextId}
          contextTitle={chatContextTitle}
        />

        {/* 导入弹窗 */}
        {showImport && (
          <ImportFlow
            existingTags={store.tags}
            onComplete={() => {
              setShowImport(false);
              store.refresh();
            }}
            onClose={() => setShowImport(false)}
          />
        )}

        {/* Agent 接入设置 */}
        {showAgent && (
          <AgentSettingsModal
            enabled={bridge.enabled}
            setEnabled={bridge.setEnabled}
            onClose={() => setShowAgent(false)}
          />
        )}
      </div>
    </ReactFlowProvider>
  );
}
