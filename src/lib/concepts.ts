import type { Article, KnowledgePoint } from '../types';

/** 归一化概念名：去首尾空格、去 # 前缀、小写，用于匹配比较 */
export function normalizeConcept(value: string): string {
  return value.trim().replace(/^#+\s*/, '').toLowerCase();
}

/** 清洗 AI 建议：去掉 # 前缀与首尾空格，保留原始大小写用于展示 */
export function sanitizeConcept(value: string): string {
  return value.trim().replace(/^#+\s*/, '');
}

/** Levenshtein 编辑距离 */
export function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]) + 1;
    }
  }
  return dp[a.length][b.length];
}

export interface ConceptMatch {
  /** 匹配到的已有知识点 id；为空表示需要新建 */
  matchedId?: string;
  /** 用于展示/新建的短名（已清洗） */
  name: string;
}

/**
 * 把一个概念名对齐到已有知识点：先精确归一匹配，再模糊匹配（编辑距离）。
 * 匹配不到则返回 matchedId=undefined，表示需要新建。
 */
export function matchConcept(
  raw: string,
  existingKPs: Pick<KnowledgePoint, 'id' | 'title'>[],
  maxDistance = 2,
): ConceptMatch {
  const name = sanitizeConcept(raw);
  const normalized = normalizeConcept(name);
  if (!normalized) return { name };

  // 精确归一匹配
  for (const kp of existingKPs) {
    if (normalizeConcept(kp.title) === normalized) {
      return { matchedId: kp.id, name: kp.title };
    }
  }

  // 模糊匹配：取编辑距离最近且在阈值内的
  let bestId: string | undefined;
  let bestTitle = name;
  let bestDistance = Number.MAX_SAFE_INTEGER;
  for (const kp of existingKPs) {
    const distance = levenshtein(normalized, normalizeConcept(kp.title));
    if (distance <= maxDistance && distance < bestDistance) {
      bestDistance = distance;
      bestId = kp.id;
      bestTitle = kp.title;
    }
  }
  return bestId ? { matchedId: bestId, name: bestTitle } : { name };
}

export interface GraphData {
  /** 每个知识点被多少篇文章引用（用于节点大小） */
  nodeWeight: Map<string, number>;
  /** 共现边：key = "idA|idB"（id 升序），value = 同篇共现次数（用于连线粗细） */
  edges: Map<string, number>;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * 从文章的 knowledgePoints 计算图数据：
 * - 节点权重 = 引用该知识点的文章数
 * - 共现边 = 同一篇文章里两两概念的共现次数
 * 不落库，纯派生。
 */
export function computeGraph(articles: Article[], kps: KnowledgePoint[]): GraphData {
  const valid = new Set(kps.map((k) => k.id));
  const nodeWeight = new Map<string, number>();
  const edges = new Map<string, number>();

  for (const article of articles) {
    const ids = Array.from(new Set(article.knowledgePoints.filter((id) => valid.has(id))));
    for (const id of ids) {
      nodeWeight.set(id, (nodeWeight.get(id) ?? 0) + 1);
    }
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const key = pairKey(ids[i], ids[j]);
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
  }

  return { nodeWeight, edges };
}

/** 解析共现边 key 回两个 id */
export function parsePairKey(key: string): [string, string] {
  const [a, b] = key.split('|');
  return [a, b];
}

/**
 * 计算某个概念的相邻概念 id（共现邻居 + 手动 linkedPoints），按共现次数降序。
 */
export function neighborConcepts(
  id: string,
  graph: GraphData,
  linkedPoints: string[] = [],
): { id: string; weight: number }[] {
  const scores = new Map<string, number>();
  for (const [key, weight] of graph.edges.entries()) {
    const [a, b] = parsePairKey(key);
    if (a === id) scores.set(b, (scores.get(b) ?? 0) + weight);
    else if (b === id) scores.set(a, (scores.get(a) ?? 0) + weight);
  }
  for (const linked of linkedPoints) {
    scores.set(linked, (scores.get(linked) ?? 0) + 1);
  }
  return Array.from(scores.entries())
    .map(([nid, weight]) => ({ id: nid, weight }))
    .sort((x, y) => y.weight - x.weight);
}
