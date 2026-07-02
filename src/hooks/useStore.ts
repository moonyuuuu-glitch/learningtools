import { useState, useEffect, useCallback } from 'react';
import { db, getTagMap, getCategoryMap, saveKnowledgePoint, deleteKnowledgePoint, exportAll, importAll, seedDemo } from '../db/database';
import type { KnowledgePoint, Article, Tag, Category, ViewMode } from '../types';

export function useStore() {
  const [viewMode, setViewMode] = useState<ViewMode>('graph');
  const [knowledgePoints, setKPs] = useState<KnowledgePoint[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tagMap, setTagMap] = useState<Map<string, Tag>>(new Map());
  const [categoryMap, setCategoryMap] = useState<Map<string, Category>>(new Map());
  const [selectedKPId, setSelectedKPId] = useState<string | null>(null);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const refresh = useCallback(async () => {
    const [kps, arts, tgs, cats] = await Promise.all([
      db.knowledgePoints.orderBy('createdAt').toArray(),
      db.articles.orderBy('readDate').reverse().toArray(),
      db.tags.toArray(),
      db.categories.orderBy('order').toArray(),
    ]);
    const tm = await getTagMap();
    const cm = await getCategoryMap();
    setKPs(kps);
    setArticles(arts);
    setTags(tgs);
    setCategories(cats);
    setTagMap(tm);
    setCategoryMap(cm);
  }, []);

  useEffect(() => {
    seedDemo().then(refresh);
  }, [refresh]);

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
    await db.articles.put(art);
    await refresh();
  }, [refresh]);

  const removeArticle = useCallback(async (id: string) => {
    await db.articles.delete(id);
    if (selectedArticleId === id) setSelectedArticleId(null);
    await refresh();
  }, [refresh, selectedArticleId]);

  // Tag CRUD
  const upsertTag = useCallback(async (tag: Tag) => {
    await db.tags.put(tag);
    await refresh();
  }, [refresh]);

  const removeTag = useCallback(async (id: string) => {
    // remove from all kps and articles
    const allKPs = await db.knowledgePoints.toArray();
    for (const kp of allKPs) {
      if (kp.tags.includes(id)) {
        await db.knowledgePoints.update(kp.id, { tags: kp.tags.filter((t) => t !== id) });
      }
    }
    const allArts = await db.articles.toArray();
    for (const art of allArts) {
      if (art.tags.includes(id)) {
        await db.articles.update(art.id, { tags: art.tags.filter((t) => t !== id) });
      }
    }
    await db.tags.delete(id);
    await refresh();
  }, [refresh]);

  // Category CRUD
  const upsertCategory = useCallback(async (cat: Category) => {
    await db.categories.put(cat);
    await refresh();
  }, [refresh]);

  const removeCategory = useCallback(async (id: string) => {
    await db.categories.delete(id);
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
    knowledgePoints, articles, tags, categories, tagMap, categoryMap,
    selectedKPId, setSelectedKPId,
    selectedArticleId, setSelectedArticleId,
    filterTags, setFilterTags,
    searchQuery, setSearchQuery,
    upsertKP, removeKP,
    upsertArticle, removeArticle,
    upsertTag, removeTag,
    upsertCategory, removeCategory,
    handleExport, handleImport,
    refresh,
  };
}

export type Store = ReturnType<typeof useStore>;
