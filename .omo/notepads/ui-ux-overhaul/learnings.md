# UI/UX Overhaul — Learnings

跨任务积累的技术发现、决策依据与避坑指南。每个 Story 完成后追加。

---

## Task 1 — framer-motion 集成与 spike 验证

**日期**: 2026-06-18
**状态**: done
**提交**: `chore(web): 集成 framer-motion 与 spike 验证`

### 版本选型
- 选择 `framer-motion@^11.18.2`（最新 ^11 稳定版）。
- 理由：与 React 19.2.6 兼容，TypeScript 类型齐备，ESM/CJS 双格式。
- 避免 12.x：v12 处于较新的迭代路径上，生态对 React 19 的回归测试覆盖略少。

### Spike 验证结果
1. **`motion.div` 包裹 antd Button** — OK。`motion.div` 渲染为 `<div>` 容器，
   内部放 antd `<Button>` 无 ref 转发冲突，动画属性 (initial / animate / exit)
   按预期应用。Button 的 ref 仍由 antd 自己管理，不被 framer-motion 劫持。
2. **`AnimatePresence mode="wait"` + `useLocation`** — OK。
   用 `useLocation().pathname` 作为 key 驱动 `motion.div` 即可实现页面级过渡。
   `mode="wait"` 让旧元素 exit 完成后才挂载新元素，避免 layout shift。
3. **React 19 strict mode** — OK。
   framer-motion 11.x 已完全迁移到 `React.Children` + 自实现的
   `Presence` 上下文，dist 中**未引用 `findDOMNode`**（grep 验证）。
   已知 v10 之前的版本有 `findDOMNode` 警告。

### 工程上的关键约束
- 项目 `package.json` 中**没有 `typecheck` 脚本**（AGENTS.md 提到了，但未实现）。
  等价命令：`npx tsc -b`（与 `npm run build` 内部的类型检查步骤完全一致）。
- `npm run lint` 当前有 **18 个 pre-existing 错误**，
  全部在 `src/contexts/` 和 `src/modules/{admin,auth,settings}/` 业务组件中，
  属 baseline 技术债。本任务 MUST NOT 修改业务组件，故未处理。
- 后续 UI 任务做 `npm run lint` 校验时，**只需确保新增文件自身 0 错误**即可。
  推荐做法：CI 上跑 `npx eslint <新文件路径>` 而不是 `npm run lint`。

### 文件注入点
- `AppLayout.tsx` 第 14 行 `<Outlet />` 是 framer-motion 页面过渡的唯一注入点。
  Task 4（页面过渡）将把这一行包进 `<AnimatePresence>`。

### 决策记录
- **不引入** react-spring、@react-spring/web、gsap、lottie — 评估 framer-motion 已覆盖
  layout / presence / gesture 三大动画诉求，引入多库会导致包体膨胀和心智负担。
- **不修改** antd ConfigProvider 的 `motion` 配置（Task 8 才需要）—— 保持 spike 纯净。
- spike 文件 `src/_spike/FMCompatibility.tsx` 创建后已**主动删除**，
  避免污染生产代码树。验证证据完整保存在 `.omo/evidence/task-1-fm-installed.txt`。

### 阻塞解除
- Task 4（页面过渡 AnimatePresence）— 现在可以开工
- Task 5（卡片悬停 / 列表 stagger）— 现在可以开工
- Task 8（antd ConfigProvider motion 集成）— 现在可以开工
- Task 9（模态框 / Drawer 动画）— 现在可以开工

---

## Task 2 — 抽出 tools 元数据到 registry.ts

**日期**: 2026-06-18
**状态**: done
**提交**: `feat(web): 抽出 tools 元数据到 registry.ts`

### 现状
- 工具元数据原本硬编码在 `src/modules/tools/ToolsPage.tsx` 第 15-52 行的 `tools` 数组里。
- 共 4 个工具：translate / text-compare / image / voice，仅 `text-compare` 已实现（`path: '/tools/text-compare'`），其余三个 `path: null`。
- 后端无 `/api/tools` 元数据接口（不在本次改造范围）。

### 数据契约
- 新 `ToolMeta` 接口包含 9 个字段：`key / title / description / icon / status / tags / path / category / available`。
- `category` 取值 `'available' | 'coming-soon'`；`available` 是 `category === 'available'` 的便捷布尔。
- `icon` 以**组件引用**形式存为字段（`icon: TranslationOutlined`），消费方用 `<tool.icon />` 渲染。
  - 理由：注册表作为「纯数据 + 类型」层（无 React 组件），避免在数据层写 JSX，也避免引入字符串→组件的映射表。

### translate 工具分类的真实状态
- 原始 `status: '可用'`，但 `path: null` 且无入口实现。
- 按任务规格归为 `category: 'coming-soon'`、`available: false`——以 `path` 是否非空为最终判据。
- 原始 `status` 文案保持不动，以便消费方回退展示。
- 这暴露了原数据的脏点：`status` 字段与实际可访问性不一致。新增 `category` / `available` 是为了显式区分这两个语义。

### typecheck 脚本补齐
- `AGENTS.md` 文档中列出的 `npm run typecheck` 在 `package.json` 里**实际不存在**（只有 `build` 内部调用 `tsc -b`）。
- 为让任务规格中的 `npm run typecheck && npm run lint` 验证步骤可执行，新增 `"typecheck": "tsc -b"` 脚本。
- **不引入新依赖**——复用 TypeScript 自带 `tsc -b`。

### lint 基线
- 18 个 pre-existing 错误（与 Task 1 验证时完全一致），分布在 10 个业务组件文件中：
  - `src/contexts/AuthContext.tsx` / `ThemeContext.tsx`
  - `src/modules/admin/{DashboardPage,LogPage,UserManagePage}.tsx`
  - `src/modules/auth/{LoginPage,RegisterPage}.tsx`
  - `src/modules/settings/{ChangePasswordForm,GitHubBindSection,GoogleBindSection}.tsx`
- 错误类型主要为 `react-refresh/only-export-components`、`react-hooks/set-state-in-effect`、`@typescript-eslint/no-explicit-any`。
- **已通过 `git stash` 验证为本次任务前已存在**——与新增的 `registry.ts` 无关。
- 后续 Epic 任务需独立清理；不要混在功能 PR 里。

### tsconfig.app.json 关键开关
- `verbatimModuleSyntax: true` + `noUnusedLocals: true` + `noUnusedParameters: true` + `erasableSyntaxOnly: true`。
- 所有类型导入必须用 `import type { ... }`；未使用的局部变量/参数会直接报错。

### 验证结果
- `npm run typecheck`：✅ 通过（`tsc -b` 无错误）
- `npm run lint`：❌ 18 pre-existing 错误，本次新增 `registry.ts` 0 错误
- `npx tsx -e "import('./src/modules/tools/registry.ts').then(m => console.log(JSON.stringify(m.toolsRegistry.map(t => ({ key: t.key, title: t.title, path: t.path, category: t.category })), null, 2)))"`：✅ 输出 4 个工具
- `npx tsx -e "import('...').then(m => console.log(m.getToolByKey('text-compare')?.path))"`：✅ 输出 `/tools/text-compare`
- `npx tsx -e "import('...').then(m => console.log(m.getToolsByCategory('available').length))"`：✅ 输出 `1`
- 边界用例：未知 key 返回 `undefined`、未知 category 返回 `[]`、分类大小写敏感（`AVAILABLE` ≠ `available`）

### 证据
- `.omo/evidence/task-2-registry-export.json`
- `.omo/evidence/task-2-helpers-output.txt`
- `.omo/evidence/task-2-helpers-edge.txt`

### 给后续任务的建议
- Task 6 改造 `ToolsPage.tsx` 时，直接 `import { toolsRegistry } from './registry'` 替换内联数组，渲染处用 `<tool.icon />` 取代旧用法即可。
- Task 7 改造 `Sidebar.tsx` 时，可复用同一份 `toolsRegistry`（或仅取 `available` 工具），避免侧边栏与工具页数据漂移。
- 若后续需要把 `icon` 改为字符串 key（如 `'translation'`），消费方需在 `tools` 模块内建立映射表；当前组件引用方式更直接。
- 18 个 pre-existing lint 错误建议单独开一个清理 PR（不要混在功能任务里），否则后续每个 PR 都会「基线失败」。

### 阻塞解除
- Task 6（ToolsPage 重构消费 registry）— 现在可以开工
- Task 7（Sidebar 重构消费 registry）— 现在可以开工

---

## Task 7 — Sidebar 消费 tools registry

**日期**: 2026-06-18
**状态**: done
**提交**: `feat(web): Sidebar 消费 tools registry`

### 改造内容
- 移除 `Sidebar.tsx` 中硬编码的 `menuItems` 数组和 `MenuItem` 接口（原第 19-41 行）。
- 新增 `import { toolsRegistry } from '../../modules/tools/registry'`。
- 菜单结构改为动态生成：
  - "工具列表" 作为父级菜单项（key: `tools`），子项从 `toolsRegistry.filter(t => t.category === 'available')` 动态生成。
  - 每个工具子项的 `icon` 通过 `<t.icon />` 渲染（registry 以组件引用形式存储）。
  - "管理后台" 父项保留，通过 `isAdmin` 布尔值条件展开（替代原 `adminOnly` 过滤模式）。
  - admin 三个子项顺序不变：仪表盘 → 调用日志 → 用户管理。

### 设计决策
- **"工具列表" 从独立叶子节点变为父级菜单**：原结构是 `/tools` 的扁平入口，改造后变为可展开的父菜单，子项为已可用工具。这样侧边栏直接展示可用工具入口，用户无需先进入工具列表页。
- **adminOnly 改为条件展开**：原代码用 `filter(item => !item.adminOnly || isAdmin)` 过滤，新代码用 `isAdmin ? [adminItem] : []` 条件展开。语义等价但更直观，且不再需要 `MenuItem` 接口上的 `adminOnly` 字段。
- **defaultOpenKeys 扩展**：新增 `/tools/` 子路径匹配，当用户直接访问工具子页面时自动展开"工具列表"父菜单。
- **不引入 SidebarContext**：遵循 YAGNI，collapsed 状态仍为组件内 `useState`，`UserDropdown` 接收 `collapsed` prop 的模式不变。

### 验证结果
- `npm run typecheck`：✅ 通过
- `npm run build`：✅ 通过（标准 chunk size 警告，非本次引入）
- `npx eslint src/components/layout/Sidebar.tsx`：✅ 0 错误

### 给后续任务的建议
- Task 11（侧边栏 CSS 精修）现在可以开工，菜单结构已稳定。
- 当新工具从 `coming-soon` 变为 `available` 时，只需修改 `registry.ts` 中对应工具的 `category`、`available`、`path` 字段，Sidebar 会自动展示新入口，无需改动 Sidebar 代码。
- 若后续需要工具分组展示（如按 tags 分组），可在 `menuItems` 构建逻辑中增加 `groupBy` 处理，不影响 admin 部分。

---

## Task 5 — OAuthCallback 渐入渐出动画

**日期**: 2026-06-18
**状态**: done
**提交**: `feat(web): OAuthCallback 渐入渐出动画`

### 改造内容
- 将 `OAuthCallback.tsx` 外层 `<div>` 替换为 `<motion.div>`，添加 `initial/animate/exit` opacity 渐入渐出。
- 引入 `useReducedMotion` hook，当用户系统偏好 `prefers-reduced-motion: reduce` 时，`transition.duration` 降为 `0`（即时切换，无动画）。
- 缓动曲线 `[0.16, 1, 0.3, 1]`（easeOutExpo 变体），duration 0.22s，与后续页面过渡保持一致。
- 保留所有原有逻辑：fragment 解析、`processedRef` StrictMode 保护、`replaceState` URL 清理、navigate 路由。

### 技术要点
- `motion.div` 的 `style` prop 直接传入原有内联样式对象，无需额外 CSS 文件。
- `ease` 使用 cubic-bezier 数组 `[0.16, 1, 0.3, 1]`，framer-motion 原生支持，无需额外转换。
- `useReducedMotion()` 在组件顶层调用（非条件分支），符合 React hooks 规则。
- `transition.duration` 通过三元表达式动态设置：`reduceMotion ? 0 : 0.22`。

### 验证结果
- `npx tsc -b`：✅ 通过
- `npm run build`：✅ 通过
- `npx eslint src/modules/auth/OAuthCallback.tsx`：✅ 0 错误

### 给后续任务的建议
- Task 9（模态框/Drawer 动画）可复用同一模式：`motion.div` + `useReducedMotion` 动态 duration。
- `exit` 动画需要 `AnimatePresence` 包裹才能生效（Task 4 已处理页面级 AnimatePresence）。
- OAuthCallback 是纯展示+跳转页面，`exit` 动画实际触发场景有限（页面很快被 navigate 走），但为后续 AnimatePresence 集成预留了出口。

---

## Task 4 — LoginPage OAuth Button 化

**日期**: 2026-06-18
**状态**: done
**提交**: `feat(web): LoginPage OAuth 按钮 antd Button 化 + loading 态`

### 改造内容
- 将两个 `<a href>` OAuth 链接改为 antd `<Button>` 组件
- 新增 `oauthLoading` 状态（类型 `'github' | 'google' | null`）
- 新增 `handleOAuthClick(provider)` 异步处理函数：
  1. `setOauthLoading(provider)` 设置当前 provider 为 loading
  2. `await new Promise(r => setTimeout(r, 800))` 最少等待 800ms
  3. `window.location.href = /api/auth/oauth/${provider}` 跳转
- Button 属性：`loading={oauthLoading === provider}` + `disabled={oauthLoading !== null}`
- 保留 `miao-auth-social-link` className（移到外层 `<div>`）用于 hover 效果
- 视觉与登录 Button 保持一致：`block` + `size="large"` + `icon={<XxxOutlined />}`

### 设计决策
- **不引入额外图标**：使用 antd Button 内置 spinner（`loading` 属性自动处理）
- **不在 Button 上加 `href`**：改用 `onClick` + `window.location.href`，以便控制 loading 态
- **800ms 最小延迟**：让用户看到 loading 反馈，避免"点击即跳转"的突兀感
- **disabled 逻辑**：任一 OAuth 按钮 loading 时，两个按钮都 disabled，防止重复点击
- **className 迁移**：原 `<a>` 上的 `miao-auth-social-link` 移到外层 `<div>`，保持 hover 样式生效

### 验证结果
- `npm run typecheck`：✅ 通过（`tsc -b` 无错误）
- `npm run build`：✅ 通过（vite build 成功）
- `npx eslint src/modules/auth/LoginPage.tsx`：❌ 3 个 pre-existing 错误（与本次改造无关）
  - Line 26: `(location.state as any)` — pre-existing
  - Line 41: `catch (error: any)` — pre-existing
  - 新增代码（handleOAuthClick + Button）0 错误

### 给后续任务的建议
- Task 9（路由动画）现在可以开工，LoginPage 状态已稳定
- 若需统一 OAuth 按钮样式，可抽取为 `<OAuthButton provider="github" />` 组件
- `authService.getOAuthUrl()` 方法保留未动，备用场景仍可用

### 阻塞解除
- Task 9（路由动画需要 LoginPage 状态稳定）— 现在可以开工

---

## Task 6 — ToolsPage 消费 registry + 搜索绑定

**日期**: 2026-06-18
**状态**: done
**提交**: `feat(web): ToolsPage 消费 registry + 搜索绑定`

### 改造内容
- 移除 `ToolsPage.tsx` 中硬编码的 `tools` 数组（原第 15-52 行）及 4 个图标 import。
- 新增 `import { toolsRegistry, getToolsByCategory } from './registry'` + `import type { ToolMeta }`。
- 搜索框绑定 `useState('')`，`onChange` 实时更新 `search` 状态。
- 过滤逻辑：`title` + `tags` 双维度 `toLowerCase().includes()` 匹配。
- 按 `category` 分组渲染：先 `available`（标题"已可用"），再 `coming-soon`（标题"即将接入"），各组为空时不渲染。
- 提取 `renderToolCard(tool: ToolMeta)` 函数，`icon` 以 `<Icon />` 组件形式渲染（registry 存的是 `ComponentType`）。
- 统计卡片数字改为动态：`toolsRegistry.length` / `getToolsByCategory('available').length`。

### 设计决策
- **分组过滤策略**：先对 `toolsRegistry` 做搜索过滤得到 `filteredTools`，再分别用 `getToolsByCategory` 取各组后与 `filteredTools` 取交集。这样保证搜索和分组两个维度正交，互不干扰。
- **`miao-section-title` 未定义**：CSS 中不存在此 class，任务要求不修改其他文件，改用 `<h2>` 内联样式 `fontSize: 16, fontWeight: 600, margin: '24px 0 12px'`。后续 Task 10 视觉精修时可统一抽为 CSS class。
- **placeholder 文案不变**：保持 `"搜索工具"` 不动。
- **description / title / tags 文案不变**：全部来自 registry，消费方不硬编码。

### 验证结果
- `npx tsc -b`：✅ 通过
- `npm run build`：✅ 通过
- `npx eslint src/modules/tools/ToolsPage.tsx`：✅ 0 错误

### 给后续任务的建议
- Task 10（视觉精修）现在可以开工，骨架已稳定：搜索 + 分组 + registry 消费。
- 搜索过滤目前是全量遍历 `tags.some()`，工具数量 <20 时性能无影响；若后续工具数增长，可加 debounce 或 useMemo。
- 分组标题的内联样式应在 Task 10 中统一为 CSS class，避免散落在 JSX 中。

---

## Task 8 — AuthShell 包装 motion 容器

**日期**: 2026-06-18
**状态**: done
**提交**: `feat(web): AuthShell motion 包装渐入`

### 改造内容
- 将 `AuthShell.tsx` 最外层 `<main className="miao-auth-page">` 替换为 `<motion.main>`。
- 新增 `initial={{ opacity: 0, y: 8 }}` / `animate={{ opacity: 1, y: 0 }}` 实现 8px 上滑渐入。
- `transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}` — 与 Task 5 (OAuthCallback) 保持完全一致的缓动曲线和时长，形成统一的动效语言。
- 引入 `useReducedMotion()` hook 动态调整 `initialY` 和 `duration`：
  - 普通用户：`y: 8 → 0`，duration `0.22s`
  - reduce 偏好：`y: 0`（首尾无位移），duration `0`（即时呈现）
- 保留所有原有 className（`miao-auth-page` / `miao-auth-brand` / `miao-auth-panel-wrap` / `miao-auth-panel` / `miao-auth-heading` 等）和子结构，未触动 props 接口。

### 技术要点
- `motion.main` 是 framer-motion `motion` 工厂对 HTML5 语义标签的内置支持，等价于 `motion('main')`，渲染为 `<main>` 而非 `<div>`，**保留 SEO / a11y 语义**。
- `useReducedMotion()` 必须在组件顶层无条件调用（React hooks 规则），动态值通过三元表达式作用于 `initialY` 和 `duration` 常量。
- 把派生值（`initialY`、`duration`）抽成局部常量后，`<motion.main>` 的 props 表达式保持简洁可读，避免在 JSX 里写内联三元。
- 与 Task 5 模式一致：reduce 时**不省略动画**，而是 `duration: 0` —— framer-motion 对 `duration: 0` 走即时路径，无 layout shift，无 RAF 调度。
- `ease: [0.16, 1, 0.3, 1]` 直接传入 cubic-bezier 数组，framer-motion 原生支持，无需 `cubicBezier()` 包装。

### tsc -b 缓存陷阱
- 第一次运行 `npm run typecheck` 时报 `Sidebar.tsx` 12 个 TS 错误（与本任务无关，是 Task 7 Sidebar 重构的进行中状态污染了 tsc 增量缓存）。
- `npx tsc -b --force` 强制重建后**全部通过**。
- `npm run build`（`tsc -b && vite build`）同样依赖增量缓存，受污染时也会失败 —— 任务验证时如遇 `Sidebar.tsx` 类错误，**先 `tsc -b --force` 清缓存再判定**。
- 这是项目共性问题，建议 AGENTS.md 后续补充一条：「类型/构建验证前先 `npx tsc -b --force` 清缓存」。

### 验证结果
- `npx tsc -b --force`：✅ 通过（exit 0）
- `npm run build`：✅ 通过（vite build 成功，dist 体积 2.21 MB gzip 717 KB，与改造前一致）
- `npx eslint src/modules/auth/AuthShell.tsx`：✅ 0 错误
- `git diff AuthShell.tsx`：仅修改 import、函数体顶部 3 行新增、`main` ↔ `motion.main` 互换闭合标签，**未触碰 props 接口 / className / 网格结构**。

### 给后续任务的建议
- Task 9（模态框/Drawer 动画）可复用「`motion.X` + `useReducedMotion` 动态 duration」模式，建议在 `learnings.md` 中总结成统一片段供后续任务直接复制。
- 全站动效语言已统一在 `duration: 0.22` + `ease: [0.16, 1, 0.3, 1]`，后续任何页面级 / 组件级动画都应沿用此 token，避免视觉割裂。可考虑抽到 `src/styles/motion.ts` 导出常量（下一轮 UI polish 时可做）。
- AuthShell 此次只做渐入，未做 `exit` 动画。考虑到 `<main>` 通常由 React Router 控制挂载/卸载，未来若在 `AppLayout` 的 `<AnimatePresence>` 包裹下出现闪烁，可补 `exit={{ opacity: 0, y: -8 }}` 与 `mode="wait"` 配合。

### 阻塞解除
- Task 9（模态框/Drawer 动画）— 现在可以开工
- 整站动效 token（`duration: 0.22` / `ease: easeOutExpo`）已收敛，后续任务可直接复用
