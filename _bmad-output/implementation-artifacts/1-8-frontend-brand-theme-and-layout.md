---
title: '1.8: 前端品牌主题系统与布局'
type: 'feature'
created: '2026-06-07'
status: 'done'
---

## Intent

实现 Ant Design 6 ConfigProvider 品牌主题（亮色/暗色模式）和响应式布局（Sidebar + Header + Content），提供品牌化的用户体验。

**Problem:** 前端仅有 Vite 默认模板，无主题系统和布局结构。

**Approach:** ThemeContext（react context + useReducer）+ AppLayout（Ant Design Layout 组件），品牌色 #D97020 注入。

## Acceptance Criteria

- Ant Design 6 ConfigProvider 主题：colorPrimary=#D97020
- 亮色/暗色模式切换（prefers-color-scheme 检测 + localStorage 持久化）
- AppLayout：响应式 Sidebar（可折叠）+ Header + Content
- Sidebar：导航入口（工具/管理）+ 折叠按钮
- Header：亮暗切换按钮 + 用户头像下拉菜单
- OAuthCallback：URL 参数解析 token 并存储
- index.html：中文 title/lang
- 前端编译通过（tsc -b && vite build）

## Code Map

- `src/contexts/ThemeContext.tsx` — Ant Design 主题 + 亮暗模式
- `src/components/layout/AppLayout.tsx` — 响应式布局
- `src/components/layout/Sidebar.tsx` — 可折叠导航侧栏
- `src/components/layout/Header.tsx` — 顶栏（主题切换 + 用户菜单）
- `src/modules/auth/OAuthCallback.tsx` — OAuth 回调页
- `src/App.tsx` — 路由配置
- `src/main.tsx` — 入口文件
- `index.html` — 中文标题/lang

## Verification

- `cd miao-toolbox-web && npm run build` — 编译通过
