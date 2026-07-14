# LearningTools

一个以“标签串联知识”的个人学习系统。

当前版本包含：

- 知识图谱 / 知识点详情面板
- 文章库（分类、标签、关联知识点）
- 日历看板（分类 × 日期）
- 本地 IndexedDB 数据存储
- JSON 导入 / 导出
- GitHub Pages 自动部署
- 文章 AI 辅助（总结、标签、概念抽取、关系建议）
- 云同步（本地快照 ↔ 云端）
- Agent MCP 接入（读写 + 人在环审批）

## 技术栈

- React + TypeScript + Vite
- Tailwind CSS
- Dexie (IndexedDB)
- React Flow + dagre
- Tiptap

## 本地运行

```bash
npm install
npm run dev
```

默认地址：

- `http://localhost:5173`

## 安装与使用说明（简版）

### 1. 本地安装

```bash
npm install
npm run dev
```

打开：

- `http://localhost:5173`

### 2. 基础使用

- **资料库**：新增文章、分类、标签，并给文章关联知识点
- **图谱**：查看知识点之间的关系网络
- **审核箱**：处理 3 类待办
  - `AI 建议`：AI 提取的概念、框架、关系
  - `知识治理`：已有正式关系因为来源变化、缺证据等需要复核
  - `Agent 审批`：外部 Agent 的写入请求，必须人工批准后才会生效

### 3. 图谱录入建议

- 一篇文章建议关联 **3~8 个知识点**
- 一篇文章建议设置 **2~4 个标签**
- 图谱显示的是 **知识点**，不是文章本身
- 标签主要用于筛选，不是图谱节点

### 4. 接入外部 Agent（MCP）

在网页右上角打开 **「接入 Agent」** 后：

1. 生成一个带权限的 token
2. 保持网页开启，并开启浏览器桥接
3. 在 MCP 客户端中配置：

```json
{
  "mcpServers": {
    "verdent-study-kb": {
      "url": "https://learningtools-six.vercel.app/api/agent/mcp",
      "headers": {
        "Authorization": "Bearer <你的令牌>"
      }
    }
  }
}
```

如果客户端只支持 stdio，可用：

```bash
npx -y mcp-remote@latest "https://learningtools-six.vercel.app/api/agent/mcp" \
  --transport http-only \
  --header "Authorization: Bearer <你的令牌>"
```

### 5. Agent 使用注意事项

- **读操作**：可直接读取当前浏览器里的本地知识库
- **写操作**：不会直接落库，必须经过网页里的人工审批
- **网页关闭时**：Agent 会因为桥接离线而无法正常调用
- **token 吊销后**：旧客户端会立刻失效

## 本地构建

```bash
npm run build
npm run preview
```

## 数据存储说明

当前数据保存在浏览器本地的 localStorage 中（MVP 阶段，后续可扩展回 IndexedDB / 云同步）。

- 正常部署更新不会自动清空数据
- 清除浏览器站点数据后会丢失
- 建议定期使用应用内 JSON 导出做备份

## GitHub Pages 部署

当前仓库已按 GitHub Pages 项目站点方式配置：

- 仓库：`learningtools`
- Pages 路径：`/learningtools/`

需要在 GitHub 仓库里开启：

- `Settings -> Pages -> Source -> GitHub Actions`

推送到 `main` 后会自动触发：

- 安装依赖
- 执行 `npm run build`
- 部署 `dist/`

## 单仓库部署说明

当前项目已经可以作为**一个仓库单独运行**：

- 前端页面：`src/`
- Serverless 接口：`api/`
- 生产部署：Vercel

### 需要的环境变量

在 Vercel 项目里配置：

```bash
DEEPSEEK_API_KEY=your_key
OPENAI_API_KEY=your_key
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SYNC_SECRET=your_sync_secret
FEISHU_APP_ID=your_feishu_app_id
FEISHU_APP_SECRET=your_feishu_app_secret
UPSTASH_REDIS_REST_URL=your_upstash_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_token
```

### 前端如果本域部署

如果前端和 API 同域部署，`VITE_API_BASE_URL` 可以留空；如果分开部署，再填：

```bash
VITE_API_BASE_URL=https://your-domain.vercel.app
```

### 这个仓库现在已经包含

- `api/health.ts`
- `api/sync.ts`
- `api/agent.ts`
- `api/ai/*`
- `src/api/client.ts`
- `src/api/ai.ts`
- `src/api/sync.ts`
- `src/api/agent.ts`

### 还要保留的能力

- AI 总结 / 标签 / 概念 / 关系建议
- Agent MCP 读写与审批
- 本地快照云同步
- 健康检查

## 后续建议

- 保持单仓库结构，避免拆分成两个仓库导致部署/配置混乱
- 如果后面要做完全静态化，再单独评估是否保留后端能力
