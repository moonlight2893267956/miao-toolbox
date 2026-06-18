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
