import { useState, useEffect, useCallback } from 'react';
import {
  listKnowledgePoints,
  listArticles,
  listTags,
  listCategories,
  getTagMap,
  getCategoryMap,
  saveKnowledgePoint,
  deleteKnowledgePoint,
  saveArticle,
  deleteArticle,
  saveTag,
  deleteTag,
  saveCategory,
  deleteCategory,
  exportAll,
  importAll,
  listScenes,
  listFrameworks,
  listRelations,
  listRelationAnalysisJobs,
  listRelationFeedbackPatterns,
  listCandidates,
  listInteractionEvents,
  getGraphViewState,
  saveFramework,
  deleteFramework,
  saveRelation,
  saveRelationAnalysisJob,
  saveRelationFeedbackPattern,
  deleteRelation,
  saveCandidate,
  recordInteraction,
  saveGraphViewState,
  saveScene as dbSaveScene,
  deleteScene as dbDeleteScene,
} from '../db/database';
import { checkApiHealth } from '../api/ai';
import { createRelationAnalysisJob } from '../engine/relationInference';
import type {
  KnowledgePoint,
  Article,
  FrameworkCard,
  GraphViewState,
  InteractionEvent,
  KnowledgeRelation,
  RelationAnalysisJob,
  RelationFeedbackPattern,
  ReviewCandidate,
  Tag,
  Category,
  Scene,
  ViewMode,
} from '../types';

export function useStore() {
  const [viewMode, setViewMode] = useState<ViewMode>('home');
  const [knowledgePoints, setKPs] = useState<KnowledgePoint[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [frameworks, setFrameworks] = useState<FrameworkCard[]>([]);
  const [relations, setRelations] = useState<KnowledgeRelation[]>([]);
  const [relationAnalysisJobs, setRelationAnalysisJobs] = useState<RelationAnalysisJob[]>([]);
  const [relationFeedbackPatterns, setRelationFeedbackPatterns] = useState<RelationFeedbackPattern[]>([]);
  const [candidates, setCandidates] = useState<ReviewCandidate[]>([]);
  const [interactionEvents, setInteractionEvents] = useState<InteractionEvent[]>([]);
  const [graphViewState, setGraphViewState] = useState<GraphViewState | undefined>();
  const [tags, setTags] = useState<Tag[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [tagMap, setTagMap] = useState<Map<string, Tag>>(new Map());
  const [categoryMap, setCategoryMap] = useState<Map<string, Category>>(new Map());
  const [selectedKPId, setSelectedKPId] = useState<string | null>(null);
  const [selectedFrameworkId, setSelectedFrameworkId] = useState<string | null>(null);
  const [selectedRelationId, setSelectedRelationId] = useState<string | null>(null);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [apiStatus, setApiStatus] = useState<'idle' | 'checking' | 'configured' | 'ready' | 'error'>('idle');
  const [apiMessage, setApiMessage] = useState('');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'ready' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState('');

  const refresh = useCallback(async () => {
    const [kps, arts, tgs, cats, scs, frs, rels, jobs, feedback, cands, events, savedGraphState] = await Promise.all([
      listKnowledgePoints(),
      listArticles(),
      listTags(),
      listCategories(),
      listScenes(),
      listFrameworks(),
      listRelations(),
      listRelationAnalysisJobs(),
      listRelationFeedbackPatterns(),
      listCandidates(),
      listInteractionEvents(),
      getGraphViewState(),
    ]);
    const tm = await getTagMap();
    const cm = await getCategoryMap();
    setKPs(kps);
    setArticles(arts);
    setTags(tgs);
    setCategories(cats);
    setScenes(scs);
    setFrameworks(frs);
    setRelations(rels);
    setRelationAnalysisJobs(jobs);
    setRelationFeedbackPatterns(feedback);
    setCandidates(cands);
    setInteractionEvents(events);
    setGraphViewState(savedGraphState);
    setTagMap(tm);
    setCategoryMap(cm);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const applyHealthStatus = useCallback((health: Awaited<ReturnType<typeof checkApiHealth>>) => {
    const ai = health.capabilities.ai;
    if (!ai.configured) {
      setApiStatus('error');
      setApiMessage(ai.message);
    } else if (ai.available) {
      setApiStatus(ai.checkedLive ? 'ready' : 'configured');
      setApiMessage(ai.message);
    } else {
      setApiStatus('error');
      setApiMessage(ai.message);
    }

    const sync = health.capabilities.sync;
    setSyncStatus(sync.available ? 'ready' : 'error');
    setSyncMessage(sync.message);
  }, []);

  const refreshHealth = useCallback(async (probe = false) => {
    setApiStatus('checking');
    setApiMessage('');
    try {
      const health = await checkApiHealth(probe);
      applyHealthStatus(health);
    } catch (error) {
      setApiStatus('error');
      setApiMessage(error instanceof Error ? error.message : 'AI 状态检测失败');
      setSyncStatus('error');
      setSyncMessage('云同步状态检测失败');
    }
  }, [applyHealthStatus]);

  const verifyApi = useCallback(async () => {
    await refreshHealth(true);
  }, [refreshHealth]);

  useEffect(() => {
    void refreshHealth(false);
  }, [refreshHealth]);

  // Scene actions
  const activateScene = useCallback((id: string | null) => {
    setActiveSceneId(id);
    if (id) {
      const scene = scenes.find((s) => s.id === id);
      if (scene) setFilterTags(scene.tagIds);
    } else {
      setFilterTags([]);
    }
  }, [scenes]);

  const upsertScene = useCallback(async (scene: Scene) => {
    await dbSaveScene(scene);
    await refresh();
  }, [refresh]);

  const removeScene = useCallback(async (id: string) => {
    await dbDeleteScene(id);
    if (activeSceneId === id) {
      setActiveSceneId(null);
      setFilterTags([]);
    }
    await refresh();
  }, [refresh, activeSceneId]);

  // KnowledgePoint CRUD
  const upsertKP = useCallback(async (kp: KnowledgePoint) => {
    await saveKnowledgePoint(kp);
    await refresh();
  }, [refresh]);

  const removeKP = useCallback(async (id: string) => {
    await deleteKnowledgePoint(id);
    if (selectedKPId === id) setSelectedKPId(null);
    await refresh();
  }, [refresh, selectedKPId]);

  // Article CRUD
  const upsertArticle = useCallback(async (art: Article) => {
    await saveArticle(art);
    await createRelationAnalysisJob(art);
    await refresh();
  }, [refresh]);

  const removeArticle = useCallback(async (id: string) => {
    await deleteArticle(id);
    if (selectedArticleId === id) setSelectedArticleId(null);
    await refresh();
  }, [refresh, selectedArticleId]);

  const upsertFramework = useCallback(async (framework: FrameworkCard) => {
    await saveFramework(framework);
    await refresh();
  }, [refresh]);

  const removeFramework = useCallback(async (id: string) => {
    await deleteFramework(id);
    await refresh();
  }, [refresh]);

  const upsertRelation = useCallback(async (relation: KnowledgeRelation) => {
    await saveRelation(relation);
    await refresh();
  }, [refresh]);

  const removeRelation = useCallback(async (id: string) => {
    await deleteRelation(id);
    await refresh();
  }, [refresh]);

  const upsertCandidate = useCallback(async (candidate: ReviewCandidate) => {
    await saveCandidate(candidate);
    await refresh();
  }, [refresh]);

  const upsertRelationAnalysisJob = useCallback(async (job: RelationAnalysisJob) => {
    await saveRelationAnalysisJob(job);
    await refresh();
  }, [refresh]);

  const upsertRelationFeedbackPattern = useCallback(async (pattern: RelationFeedbackPattern) => {
    await saveRelationFeedbackPattern(pattern);
    await refresh();
  }, [refresh]);

  const addInteraction = useCallback(async (event: InteractionEvent) => {
    await recordInteraction(event);
    setInteractionEvents((previous) => [...previous, event].slice(-2000));
  }, []);

  const updateGraphViewState = useCallback(async (state: GraphViewState) => {
    setGraphViewState(state);
    await saveGraphViewState(state);
  }, []);

  // Tag CRUD
  const upsertTag = useCallback(async (tag: Tag) => {
    await saveTag(tag);
    await refresh();
  }, [refresh]);

  const removeTag = useCallback(async (id: string) => {
    await deleteTag(id);
    await refresh();
  }, [refresh]);

  // Category CRUD
  const upsertCategory = useCallback(async (cat: Category) => {
    await saveCategory(cat);
    await refresh();
  }, [refresh]);

  const removeCategory = useCallback(async (id: string) => {
    await deleteCategory(id);
    await refresh();
  }, [refresh]);

  // Export / Import
  const handleExport = useCallback(async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `knowledge-base-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImport = useCallback(async (file: File) => {
    const text = await file.text();
    const data = JSON.parse(text);
    await importAll(data);
    await refresh();
  }, [refresh]);

  return {
    viewMode, setViewMode,
    knowledgePoints, articles, setArticles, frameworks, relations,
    relationAnalysisJobs, relationFeedbackPatterns, candidates, interactionEvents,
    graphViewState, updateGraphViewState,
    tags, categories, tagMap, categoryMap,
    scenes, activeSceneId, activateScene, upsertScene, removeScene,
    selectedKPId, setSelectedKPId,
    selectedFrameworkId, setSelectedFrameworkId,
    selectedRelationId, setSelectedRelationId,
    selectedArticleId, setSelectedArticleId,
    filterTags, setFilterTags,
    searchQuery, setSearchQuery,
    upsertKP, removeKP,
    upsertArticle, removeArticle,
    upsertFramework, removeFramework,
    upsertRelation, removeRelation,
    upsertCandidate, upsertRelationAnalysisJob, upsertRelationFeedbackPattern, addInteraction,
    upsertTag, removeTag,
    upsertCategory, removeCategory,
    handleExport, handleImport,
    apiStatus, apiMessage, verifyApi,
    syncStatus, syncMessage,
    refresh,
  };
}

export type Store = ReturnType<typeof useStore>;
