export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Category {
  id: string;
  name: string;
  order: number;
}

export interface KnowledgePoint {
  id: string;
  title: string;
  content: string;          // Tiptap JSON string
  parentId?: string;        // optional manual hierarchy
  tags: string[];           // Tag.id[]
  linkedPoints: string[];   // explicit bidirectional links (KnowledgePoint.id[])
  createdAt: number;
  updatedAt: number;
}

export interface Article {
  id: string;
  title: string;
  url?: string;
  summary?: string;
  categoryId: string;       // Category.id
  tags: string[];           // Tag.id[]
  knowledgePoints: string[]; // KnowledgePoint.id[]
  readDate: string;         // "YYYY-MM-DD"
  createdAt: number;
}

export type ViewMode = 'graph' | 'articles' | 'calendar';
