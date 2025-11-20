# PolyNBA — 体育市场概率与战力分析引擎

PolyNBA 是一个面向 Polymarket/NBA 市场的专业级数据洞察工具：以 Next.js 14 App Router 为核心，结合免费体育数据源与市场价格，构建“隐含概率 ↔ 历史战力”统一视图，帮助交易者识别赔率误价与风险暴露。

## 特性

- 高性能前端：Next.js 14 + React 18，`next/image` 优化静态资源，Tailwind 快速迭代样式
- 智能缓存：5 分钟本地缓存与版本控制，冷启动秒开、热路径稳定
- 背景预取：市场列表加载后异步抓取队伍统计，交互流畅且数据渐进增强
- 数据融合：市场隐含概率 + 球队近期状态（W/L）+ 胜率与均分等统计维度
- 零后端架构：通过 `app/api/*` 轻量路由代理与整合，适配 Vercel Serverless
- 部署即用：一条命令发布到 Vercel 生产环境，支持自定义域名与多环境

## 架构

- UI 层：`app/page.tsx` 首页卡片网格 + 导航品牌区，细粒度交互与渐进数据
- API 路由：
  - `app/api/polymarket/route.ts` 市场数据入口
  - `app/api/team-stats/route.ts` 球队统计预取
  - `app/api/game-data/route.ts` 辅助数据与对战信息
- 工具库：`src/lib/utils/*` 负责缓存、队伍解析、ESPN 映射与推断
- 类型系统：`src/types` 统一约束数据结构，保障渲染与接口稳定
- 静态资源：`public/` 与 `app/icon.png`，即开即用 favicon 与品牌 Logo

## 性能与缓存

- 本地缓存：命中后直接渲染市场列表，并在后台预取队伍统计；失败自动回退 API
- 版本控制：缓存包含版本号，前端启动时进行校验，避免旧结构导致的渲染异常
- 资源优化：Logo 与图片统一使用 `next/image`，自动处理尺寸与格式

## 快速开始

```bash
npm i
npm run dev
# 打包
npm run build && npm run start
```

## 部署

- Vercel 生产发布：

```bash
npx vercel --prod --yes
```

- 自定义域名：

```bash
npx vercel domains add <your-domain>
```

## 工程规范

- 代码风格：TypeScript + ESLint（`eslint-config-next`），统一校验与约束
- 样式系统：Tailwind 原子化 + 组件化约定，品牌区采用圆角胶囊与轻描边
- 安全实践：不在仓库提交任何密钥；接口请求附带明确 UA 与限流预案

## 路线图

- 深色模式与图表主题统一
- 赔率误差告警与交易建议评分
- 更细的队伍对战因子（主客场、背靠背、伤病影响）
- API 速率监控与降级策略

## 许可证

Copyright © 2025 PolyNBA. All rights reserved.

