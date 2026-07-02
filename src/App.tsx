import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { useStore } from './hooks/useStore';
import Navbar from './components/Navbar';
import KnowledgeGraph from './components/KnowledgeGraph';
import DetailPanel from './components/DetailPanel';
import ArticleLibrary from './components/ArticleLibrary';
import CalendarBoard from './components/CalendarBoard';
import ChatPanel from './components/ChatPanel';
import ImportFlow from './components/ImportFlow';
import InsightsPanel from './components/InsightsPanel';
import { startBackgroundLoop, stopBackgroundLoop } from './engine/backgroundLoop';

export default function App() {
  const store = useStore();
  const [showImport, setShowImport] = useState(false);
  const [showInsights, setShowInsights] = useState(false);

  // 启动后台认知循环
  useEffect(() => {
    startBackgroundLoop();
    return () => stopBackgroundLoop();
  }, []);

  // 获取当前选中 KP 的上下文信息
  const selectedKP = store.knowledgePoints.find(
    (kp) => kp.id === store.selectedKPId,
  );

  return (
    <ReactFlowProvider>
      <div className="flex flex-col h-screen overflow-hidden">
        <Navbar
          store={store}
          onOpenImport={() => setShowImport(true)}
          onToggleInsights={() => setShowInsights((p) => !p)}
        />
        <main className="flex-1 flex overflow-hidden">
          {store.viewMode === 'graph' && (
            <>
              <div className="flex-1 overflow-hidden">
                <KnowledgeGraph store={store} />
              </div>
              {showInsights ? (
                <div className="w-80 border-l border-[#d5cdbc] bg-[#faf8f4]">
                  <InsightsPanel
                    onNavigateToKP={(id) => {
                      store.setSelectedKPId(id);
                      setShowInsights(false);
                    }}
                  />
                </div>
              ) : (
                <DetailPanel store={store} />
              )}
            </>
          )}
          {store.viewMode === 'articles' && (
            <div className="flex-1 overflow-hidden">
              <ArticleLibrary store={store} />
            </div>
          )}
          {store.viewMode === 'calendar' && (
            <div className="flex-1 overflow-hidden">
              <CalendarBoard store={store} />
            </div>
          )}
        </main>

        {/* AI 聊天浮窗 */}
        <ChatPanel
          contextType={selectedKP ? 'kp' : 'global'}
          contextId={selectedKP?.id}
          contextTitle={selectedKP?.title}
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
      </div>
    </ReactFlowProvider>
  );
}
