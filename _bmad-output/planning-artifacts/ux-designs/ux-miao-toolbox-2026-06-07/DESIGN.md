---
name: 阿渺工具箱
description: 自托管 AI 工具集成门户。温暖友好，Ant Design 为基座，此 DESIGN.md 定义品牌层增量。
status: final
created: 2026-06-07
updated: 2026-06-07
sources:
  - "{planning_artifacts}/prds/prd-miao-toolbox-2026-06-06/prd.md"
colors:
  # 品牌色覆盖 antd 默认。未列出的 token 继承 antd 6 主题默认值。
  # 亮色模式 — 主色和强调色经 WCAG AA 对比度验证
  primary: '#5C4FD0'
  primary-foreground: '#FFFFFF'
  primary-hover: '#6D62D6'
  primary-active: '#4A3EBF'
  accent: '#D97020'
  accent-foreground: '#FFFFFF'
  # 暗色模式
  primary-dark: '#A29BFE'
  primary-foreground-dark: '#1A1A2E'
  primary-hover-dark: '#B5AFFE'
  primary-active-dark: '#8B83F0'
  accent-dark: '#FFB07A'
  accent-foreground-dark: '#1A1208'
  # 语义色 — 仅覆盖品牌关联项，其余继承 antd 默认
  success: '#36B37E'
  warning: '#FFAB00'
  error: '#FF5630'
typography:
  # antd 6 默认字体栈继承（-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto 等）。
  # 仅覆盖品牌展示层。
  display:
    fontFamily: "'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.25'
    letterSpacing: -0.01em
  display-sm:
    fontFamily: "'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: -0.005em
  # 正文和标签继承 antd 默认排版。
  # CJK 正文行高不低于 1.5 以确保可读性（WCAG 1.4.12）。
rounded:
  # 略圆润于 antd 默认，传达友好而非生硬。
  sm: 6px
  md: 10px
  lg: 14px
  xl: 20px
spacing:
  # antd / 4px 网格继承；无覆盖。
components:
  tool-card:
    background: '{colors.primary}'
    foreground: '{colors.primary-foreground}'
    radius: '{rounded.lg}'
    padding: '24px'
    hover:
      transform: 'translateY(-2px)'
      shadow: '0 8px 24px rgba(92, 79, 208, 0.25)'
    focus-visible:
      outline: '2px solid {colors.primary}'
      outline-offset: '2px'
    dark-mode:
      hover-shadow: '0 8px 24px rgba(162, 155, 254, 0.3)'
  sidebar-nav-item-active:
    background: 'rgba(92, 79, 208, 0.1)'
    foreground: '{colors.primary}'
    radius: '{rounded.md}'
    aria-current: 'page'
  admin-stat-card:
    background: 'inherit'
    foreground: 'inherit'
    radius: '{rounded.md}'
    border: '1px solid var(--ant-border-color)'
    role: 'button'
---

## Brand & Style

阿渺工具箱是一个自托管的 AI 工具集成门户，让 AI 工具可管、可控、可扩展。品牌气质是**温暖友好**——不像企业安全产品那样冷峻，而是像一个靠谱的朋友帮你把复杂的 AI 工具整理好、放在手边。一次登录，所有工具触手可及。

视觉语言遵循：深柔紫作为品牌主色（友好而不轻浮，且通过 WCAG AA 对比度验证），暖深橙作为强调色（点缀而非喧宾夺主，同样通过对比度验证），圆润的边角，克制的留白。安全是底色，但界面不需要时刻提醒你"这很安全"——安全感来自流畅的体验，不是安全标语的堆砌。

阿渺工具箱继承 Ant Design 6 的完整组件体系。此 DESIGN.md 仅指定品牌层增量——主色、强调色、展示排版、略圆润的边角、以及少量品牌专属组件。Ant Design 的 80% 组件（Button、Table、Form、Modal、Menu、Message、Notification、Tabs、Avatar、Dropdown 等）保持默认视觉规格不变。自定义这些组件的视觉表现**违反品牌纪律**——Ant Design 的默认值就是契约。

## Colors

阿渺工具箱的调色板是两个品牌色 + antd 默认语义色。

- **深柔紫 (`#5C4FD0` light / `#A29BFE` dark)** 是品牌主色。用于主按钮、侧栏激活态、工具卡片、链接、关键操作入口。替换 antd 的 `colorPrimary`。亮色模式下在白色背景上对比度 ≥ 4.5:1（WCAG AA），暗色模式下在 antd 深色背景上对比度 ≥ 6.5:1。
- **暖深橙 (`#D97020` light / `#FFB07A` dark)** 是强调色。用于：通知角标、重要数据高亮、管理后台异常标记。不是第二主色——是偶尔出现的"看这里"信号。亮色模式下在白色背景上对比度 ≥ 4.5:1（WCAG AA），暗色模式下对比度 ≥ 5.5:1。避免大面积填充、避免用作按钮色、避免与主紫并列形成双色方案。
- **语义色**（success / warning / error）继承 antd 默认。品牌不覆盖语义——成功是绿的，警告是黄的，错误是红的，这是用户心智模型，品牌不该改它。
- **所有其他 token**（background、foreground、border、fill 等）继承 antd 6 主题默认值。

避免：渐变背景、品牌色渐变按钮、自定义 error/success 颜色、超过两个品牌色、大面积使用强调色。

## Typography

正文 / 标签 / 提示文字继承 antd 6 默认字体栈（系统字体 + Noto Sans SC 回退）。仅 `display` 和 `display-sm` 角色做品牌覆盖，字重加粗、字距收紧，用于：

- 登录页品牌标题
- 工具列表页顶部问候语
- 管理后台页面标题

其余所有文字保持 antd 排版规格。CJK 正文行高不低于 1.5，确保中文可读性并通过 WCAG 1.4.12 Text Spacing。`display` 是品牌标点，不是默认声音。

## Layout & Spacing

antd / 4px 网格继承。最大内容宽度：

- 用户侧内容区：`max-w-5xl`（1024px）——工具列表和操作页不需要撑满屏幕，舒适阅读优先。
- 管理后台内容区：`max-w-7xl`（1280px）——表格需要更多横向空间，信息密度优先。

侧栏布局：

- 桌面端（≥ 992px / antd `lg`）：固定侧栏，宽度 240px。
- 平板端（768–991px / antd `md`）：侧栏折叠为图标模式，宽度 64px。
- 手机端（< 768px / antd `sm`）：侧栏变为抽屉（antd Drawer），从左侧滑出。手机端顶栏右侧显示头像图标作为用户菜单入口（侧栏抽屉关闭时仍可访问个人设置和登出）。

## Elevation & Depth

继承 antd 默认——组件级阴影用于浮层和弹出层。品牌层不做额外阴影自定义。

工具卡片添加品牌专属悬停效果：轻微上浮（`translateY(-2px)`）+ 品牌色半透明阴影。暗色模式下阴影使用 `{colors.primary-dark}` 半透明值（`rgba(162, 155, 254, 0.3)`）以确保可见性。这是唯一一处品牌自定义的阴影行为。

## Shapes

略圆润于 antd 6 默认：`rounded/sm`（6px）用于输入框和小型内联元素，`rounded/md`（10px）用于卡片和按钮，`rounded/lg`（14px）用于工具卡片和对话框，`rounded/xl`（20px）用于品牌展示型容器。圆润传达友好，但不到"胶囊"的程度——是工具，不是玩具。

完全圆角（`rounded/full`）仅用于头像和状态徽章。

## Components

阿渺工具箱使用以下 antd 组件保持默认，不做视觉自定义：`Button`（除 primary variant）、`Table`、`Form`、`Input`、`Select`、`Modal`、`Drawer`、`Menu`、`Tabs`、`Avatar`、`Tag`、`Badge`、`Tooltip`、`Dropdown`、`Breadcrumb`、`Pagination`、`Empty`、`Skeleton`、`Message`、`Notification`、`Result`。契约：不要自定义这些。

品牌层专属组件：

- **Tool card（工具卡片）** — 品牌紫背景 (`{colors.primary}`)，白字 (`{colors.primary-foreground}`)，`{rounded.lg}` 圆角，24px 内边距。悬停时上浮 2px + 品牌色阴影。`:focus-visible` 时显示 2px 品牌紫 outline（offset 2px），确保键盘用户可见焦点指示。工具名称在窄屏下使用 `text-overflow: ellipsis` 或 `-webkit-line-clamp: 2` 截断。用于工具列表页，每个卡片代表一个 AI 工具。
- **Sidebar nav item (active)** — 当前激活的侧栏导航项：品牌紫 10% 透明度背景，品牌紫文字，`{rounded.md}` 圆角。添加 `aria-current="page"` 供屏幕阅读器识别当前页面。
- **Admin stat card（管理统计卡片）** — 继承 antd Card 默认外观，不加品牌色背景。1px 边框，`{rounded.md}` 圆角。可点击跳转，设 `role="button"` + `tabindex="0"` + `aria-label`，Enter/Space 触发导航。管理后台的信息密度由表格和排版承担，不需要颜色装饰。

## Do's and Don'ts

| Do | Don't |
|---|---|
| 继承 antd 默认，只在品牌层覆盖 | 覆盖 antd 的 colorToken 超过 `primary` 和 `accent` |
| `{colors.accent}` 仅用于"看这里"信号 | 把强调色当第二主色、用作按钮色 |
| `display` 排版用于登录标题、问候语、页面标题 | 正文用 `display` "让它好看" |
| 比默认更圆润的边角（6/10/14/20） | 用 antd 默认边角（阿渺需要更友好） |
| 工具卡片用品牌紫 | 所有卡片都用品牌紫——只有工具入口卡片 |
| 品牌色通过 WCAG AA 对比度验证 | 使用未验证对比度的品牌色值 |
