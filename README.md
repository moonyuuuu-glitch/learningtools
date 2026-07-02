# LearningTools

一个以“标签串联知识”的个人学习系统。

当前版本包含：

- 知识图谱 / 知识点详情面板
- 文章库（分类、标签、关联知识点）
- 日历看板（分类 × 日期）
- 本地 IndexedDB 数据存储
- JSON 导入 / 导出
- GitHub Pages 自动部署
- 预留 AI API 接入层（推荐 Vercel Functions）

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

## 本地构建

```bash
npm run build
npm run preview
```

## 数据存储说明

当前数据保存在浏览器本地的 IndexedDB 中。

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

## AI API 架构建议

推荐组合：

- 前端：GitHub Pages
- API 代理：Vercel Functions
- 本地数据：IndexedDB

前端已预留 API 客户端层：

- `src/api/client.ts`
- `src/api/ai.ts`
- `src/config.ts`

前端通过环境变量读取 API 地址：

```bash
VITE_API_BASE_URL=https://your-api.vercel.app
```

推荐 API 仓库单独维护，例如：

- `learningtools-api`

建议首批接口：

- `GET /api/health`
- `POST /api/ai/summarize`
- `POST /api/ai/tags`

## 后续建议

- 为 Dexie 增加版本迁移逻辑
- 在知识点详情页接入 AI 总结 / 标签建议
- 单独创建 `learningtools-api` 仓库并部署到 Vercel
