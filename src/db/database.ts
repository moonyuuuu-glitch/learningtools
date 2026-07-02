import Dexie, { type Table } from 'dexie';
import type { KnowledgePoint, Article, Tag, Category } from '../types';

class KnowledgeDB extends Dexie {
  knowledgePoints!: Table<KnowledgePoint, string>;
  articles!: Table<Article, string>;
  tags!: Table<Tag, string>;
  categories!: Table<Category, string>;

  constructor() {
    super('KnowledgeBase');
    this.version(1).stores({
      knowledgePoints: 'id, parentId, *tags, *linkedPoints, createdAt, updatedAt',
      articles: 'id, categoryId, readDate, *tags, *knowledgePoints, createdAt',
      tags: 'id, name',
      categories: 'id, name, order',
    });
  }
}

export const db = new KnowledgeDB();

// ── CRUD helpers ──────────────────────────────────────────────

export async function getTagMap(): Promise<Map<string, Tag>> {
  const tags = await db.tags.toArray();
  return new Map(tags.map((t) => [t.id, t]));
}

export async function getCategoryMap(): Promise<Map<string, Category>> {
  const cats = await db.categories.orderBy('order').toArray();
  return new Map(cats.map((c) => [c.id, c]));
}

// When a KP is updated, ensure linkedPoints are bidirectional
export async function saveKnowledgePoint(kp: KnowledgePoint): Promise<void> {
  kp.updatedAt = Date.now();
  await db.knowledgePoints.put(kp);

  // Sync bidirectional links: for each linked target, add this kp.id if missing
  for (const targetId of kp.linkedPoints) {
    const target = await db.knowledgePoints.get(targetId);
    if (target && !target.linkedPoints.includes(kp.id)) {
      await db.knowledgePoints.update(targetId, {
        linkedPoints: [...target.linkedPoints, kp.id],
        updatedAt: Date.now(),
      });
    }
  }
}

export async function deleteKnowledgePoint(id: string): Promise<void> {
  // Remove from other kp linkedPoints
  const all = await db.knowledgePoints.toArray();
  for (const kp of all) {
    if (kp.linkedPoints.includes(id)) {
      await db.knowledgePoints.update(kp.id, {
        linkedPoints: kp.linkedPoints.filter((lid) => lid !== id),
        updatedAt: Date.now(),
      });
    }
  }
  // Remove from articles
  const arts = await db.articles.where('knowledgePoints').equals(id).toArray();
  for (const art of arts) {
    await db.articles.update(art.id, {
      knowledgePoints: art.knowledgePoints.filter((kid) => kid !== id),
    });
  }
  await db.knowledgePoints.delete(id);
}

// ── Export / Import ───────────────────────────────────────────

export async function exportAll() {
  return {
    knowledgePoints: await db.knowledgePoints.toArray(),
    articles: await db.articles.toArray(),
    tags: await db.tags.toArray(),
    categories: await db.categories.toArray(),
    exportedAt: new Date().toISOString(),
  };
}

export async function importAll(data: ReturnType<typeof exportAll> extends Promise<infer T> ? T : never) {
  await db.transaction('rw', db.knowledgePoints, db.articles, db.tags, db.categories, async () => {
    await db.tags.bulkPut(data.tags);
    await db.categories.bulkPut(data.categories);
    await db.knowledgePoints.bulkPut(data.knowledgePoints);
    await db.articles.bulkPut(data.articles);
  });
}

// ── Seed demo data ────────────────────────────────────────────

export async function seedDemo() {
  const count = await db.knowledgePoints.count();
  if (count > 0) return;

  const now = Date.now();
  const tags: Tag[] = [
    { id: 't1', name: 'JavaScript', color: '#E8A87C' },
    { id: 't2', name: 'React', color: '#85B7A7' },
    { id: 't3', name: 'CSS', color: '#8AACB8' },
    { id: 't4', name: '算法', color: '#D9534F' },
    { id: 't5', name: '系统设计', color: '#C7A4C0' },
  ];
  const categories: Category[] = [
    { id: 'c1', name: '前端技术', order: 0 },
    { id: 'c2', name: '算法与数据结构', order: 1 },
    { id: 'c3', name: '系统设计', order: 2 },
  ];
  const kps: KnowledgePoint[] = [
    { id: 'kp1', title: '事件循环', content: '<p>JavaScript 是单线程语言，通过事件循环机制处理异步操作。</p>', parentId: undefined, tags: ['t1'], linkedPoints: ['kp2'], createdAt: now, updatedAt: now },
    { id: 'kp2', title: 'Promise & async/await', content: '<p>Promise 是异步操作的包装对象，async/await 是其语法糖。</p>', parentId: undefined, tags: ['t1', 't2'], linkedPoints: ['kp1', 'kp3'], createdAt: now, updatedAt: now },
    { id: 'kp3', title: 'React 渲染机制', content: '<p>React 使用虚拟 DOM + Diff 算法优化渲染性能。</p>', parentId: undefined, tags: ['t2'], linkedPoints: ['kp2', 'kp4'], createdAt: now, updatedAt: now },
    { id: 'kp4', title: 'CSS Flexbox', content: '<p>Flexbox 是一维布局模型，用于行或列的排版。</p>', parentId: undefined, tags: ['t3'], linkedPoints: ['kp5'], createdAt: now, updatedAt: now },
    { id: 'kp5', title: '时间复杂度', content: '<p>时间复杂度描述算法执行时间随输入规模增长的趋势，常用 Big-O 表示。</p>', parentId: undefined, tags: ['t4'], linkedPoints: ['kp4'], createdAt: now, updatedAt: now },
    { id: 'kp6', title: '负载均衡', content: '<p>负载均衡将流量分发到多台服务器，提高系统可用性和吞吐量。</p>', parentId: undefined, tags: ['t5'], linkedPoints: [], createdAt: now, updatedAt: now },
  ];
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const d = (n: number) => { const x = new Date(today); x.setDate(x.getDate() - n); return fmt(x); };
  const articles: Article[] = [
    { id: 'a1', title: '深入理解 Event Loop', url: 'https://example.com/event-loop', summary: '详细讲解浏览器和 Node.js 的事件循环差异', categoryId: 'c1', tags: ['t1'], knowledgePoints: ['kp1'], readDate: d(0), createdAt: now },
    { id: 'a2', title: 'React 18 新特性解析', url: 'https://example.com/react18', summary: '并发模式、自动批处理等新特性', categoryId: 'c1', tags: ['t2'], knowledgePoints: ['kp3'], readDate: d(1), createdAt: now },
    { id: 'a3', title: 'CSS Grid vs Flexbox', url: 'https://example.com/css-layout', summary: '两种布局方案的适用场景对比', categoryId: 'c1', tags: ['t3'], knowledgePoints: ['kp4'], readDate: d(2), createdAt: now },
    { id: 'a4', title: '排序算法大全', url: 'https://example.com/sorting', summary: '快排、归并排序等经典算法', categoryId: 'c2', tags: ['t4'], knowledgePoints: ['kp5'], readDate: d(1), createdAt: now },
    { id: 'a5', title: '系统设计入门指南', url: 'https://example.com/system-design', summary: 'CAP 定理、分布式系统基础', categoryId: 'c3', tags: ['t5'], knowledgePoints: ['kp6'], readDate: d(3), createdAt: now },
    { id: 'a6', title: 'async/await 最佳实践', url: 'https://example.com/async', summary: '错误处理、并行执行技巧', categoryId: 'c1', tags: ['t1', 't2'], knowledgePoints: ['kp2'], readDate: d(4), createdAt: now },
  ];

  await db.tags.bulkPut(tags);
  await db.categories.bulkPut(categories);
  await db.knowledgePoints.bulkPut(kps);
  await db.articles.bulkPut(articles);
}
