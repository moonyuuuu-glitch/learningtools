import { ReactFlowProvider } from '@xyflow/react';
import { useStore } from './hooks/useStore';
import Navbar from './components/Navbar';
import KnowledgeGraph from './components/KnowledgeGraph';
import DetailPanel from './components/DetailPanel';
import ArticleLibrary from './components/ArticleLibrary';
import CalendarBoard from './components/CalendarBoard';

export default function App() {
  const store = useStore();

  return (
    <ReactFlowProvider>
      <div className="flex flex-col h-screen overflow-hidden">
        <Navbar store={store} />
        <main className="flex-1 flex overflow-hidden">
          {store.viewMode === 'graph' && (
            <>
              <div className="flex-1 overflow-hidden">
                <KnowledgeGraph store={store} />
              </div>
              <DetailPanel store={store} />
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
      </div>
    </ReactFlowProvider>
  );
}
