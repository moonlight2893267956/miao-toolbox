# UX Consistency Review: DESIGN.md vs EXPERIENCE.md

**Reviewer:** Claude Code  
**Date:** 2026-06-07  
**Scope:** DESIGN.md, EXPERIENCE.md, PRD.md (cross-reference)

---

## Token References

### OK-1: `{sidebar-nav-item-active}` reference resolves correctly
**Files:** EXPERIENCE.md §Component Patterns (Sidebar nav row, line 60), DESIGN.md §Components (line 63-65)  
EXPERIENCE.md delegates sidebar active-item styling to `{sidebar-nav-item-active}`. DESIGN.md defines this component with `background: rgba(108, 92, 231, 0.1)`, `foreground: '{colors.primary}'`, `radius: '{rounded.md}'`. The RGB values `108,92,231` correctly match `#6C5CE7` at 10% opacity. No resolution gap.

### OK-2: No inline hex colors in EXPERIENCE.md
**Files:** EXPERIENCE.md (entire document)  
EXPERIENCE.md never specifies color values, font sizes, or radius values directly. All visual delegation is done via description ("品牌紫") or token reference (`{sidebar-nav-item-active}`). This is consistent with the DESIGN.md-first visual authority model.

### OK-3: `tool-card` hover behavior reference is consistent
**Files:** EXPERIENCE.md §Interaction Primitives (line 84), DESIGN.md §Components.tool-card  
EXPERIENCE.md says "悬停上浮（参见 DESIGN.md.Components.tool-card）". DESIGN.md specifies `translateY(-2px)` + `0 8px 24px rgba(108, 92, 231, 0.25)`. No contradiction.

### ISSUE-1: Dark mode switching mechanism vs. custom `-dark` token naming
**Files:** EXPERIENCE.md §Interaction Primitives (line 89), DESIGN.md §Colors (lines 19-24)

EXPERIENCE.md states dark/light switching uses "antd 6 ConfigProvider token 切换" — the standard antd 6 approach using `theme.darkAlgorithm` to auto-compute dark variants from light tokens. However, DESIGN.md defines custom `-dark` suffixed tokens (`primary-dark: '#A29BFE'`, `primary-foreground-dark: '#1A1A2E'`, etc.) with exact hex values that differ from what antd 6's `darkAlgorithm` would compute automatically from the light tokens (`#6C5CE7` → antd auto-dark would produce a desaturated variant, not `#A29BFE`).

**Gap:** The mechanism described in EXPERIENCE.md (ConfigProvider + `darkAlgorithm`) will NOT produce the exact dark-mode brand colors specified in DESIGN.md. If `#A29BFE` and `#1A1A2E` are intentional design choices, the implementation needs a custom `theme.darkAlgorithm` override or manual token mapping, not a simple `darkAlgorithm` swap. This is a cross-document contradiction about how dark mode is applied.

---

## Component Consistency

### OK-4: Three custom components in DESIGN.md are all referenced in EXPERIENCE.md
**Files:** DESIGN.md §Components (lines 53-70), EXPERIENCE.md §Component Patterns (lines 53-61)  
DESIGN.md defines exactly three custom components: `tool-card`, `sidebar-nav-item-active`, `admin-stat-card`. All three appear in EXPERIENCE.md's Component Patterns table (Tool card, Sidebar nav row references `{sidebar-nav-item-active}`, Admin stat card). No orphaned components.

### OK-5: EXPERIENCE.md components that are not in DESIGN.md are antd defaults — consistent with brand contract
**Files:** DESIGN.md §Components (lines 129-130), EXPERIENCE.md §Component Patterns  
EXPERIENCE.md lists Tool operation template, Log table, User action menu — none of which appear in DESIGN.md's custom component list. This is consistent with DESIGN.md's explicit contract: "antd 组件保持默认，不做视觉自定义" (Button, Table, Form, Input, Select, Modal, etc.). These are behavioral/composition patterns, not visual overrides.

### OK-6: Tool card spec alignment
**Files:** DESIGN.md §Components.tool-card (lines 54-61), EXPERIENCE.md §Component Patterns (line 55), §Flow 1 (line 133)  
Both documents agree: brand purple background, white text, rounded corners (`{rounded.lg}` = 14px), 24px padding, hover lift. EXPERIENCE.md adds behavioral rules (click enters tool, disabled tools hidden per FR-15). No contradiction.

### OK-7: Admin stat card spec alignment
**Files:** DESIGN.md §Components.admin-stat-card (lines 66-70), EXPERIENCE.md §Component Patterns (line 57)  
DESIGN.md specifies `background: inherit`, `foreground: inherit`, `radius: '{rounded.md}'`, `border: '1px solid var(--ant-border-color)'`. EXPERIENCE.md says "展示单一指标" and "点击可跳转关联详情页". The visual spec and behavioral spec are orthogonal — no contradiction.

---

## Behavioral Rules vs. Visual Specs

### OK-8: Sidebar collapse/expand behavior matches across both docs
**Files:** DESIGN.md §Layout & Spacing (lines 111-113), EXPERIENCE.md §Responsive & Platform (lines 110-113)  
Both documents describe the same three breakpoints with the same sidebar behavior:
- ≥ 992px: fixed 240px
- 768-991px: icon mode 64px
- < 768px: Drawer

DESIGN.md uses antd breakpoint labels (`lg`, `md`, `sm`) while EXPERIENCE.md uses pixel ranges. The pixel values match antd's breakpoints exactly. Consistent.

### OK-9: Content max-width rules in DESIGN.md have no contradictory behavior in EXPERIENCE.md
**Files:** DESIGN.md §Layout & Spacing (lines 106-107), EXPERIENCE.md §Responsive & Platform  
DESIGN.md specifies `max-w-5xl` (1024px) for user side and `max-w-7xl` (1280px) for admin side. EXPERIENCE.md doesn't mention max-widths, which means no contradiction. However, EXPERIENCE.md's grid column counts (3/2/1 for tool list) should naturally fit within these max-widths — no implicit conflict.

### OK-10: Form interaction rules are consistent
**Files:** EXPERIENCE.md §Interaction Primitives (lines 85-88), DESIGN.md §Components (antd defaults)  
EXPERIENCE.md specifies Enter/submit button, loading state, no double-submit, high-risk operations need Popconfirm. DESIGN.md delegates form visuals to antd defaults. No visual-behavioral conflict.

---

## IA Coverage

### OK-11: All DESIGN.md component surfaces appear in the IA
**Files:** DESIGN.md §Components, EXPERIENCE.md §Information Architecture  
The IA defines 8 pages. Mapping:
| IA Page | DESIGN.md Component(s) | Coverage |
|---------|----------------------|----------|
| 登录/注册 | (antd defaults only) | OK — no custom components needed |
| 工具列表 | tool-card | OK |
| 工具操作页 | (antd defaults: Form, Input, Select, Button) | OK — no custom components |
| 管理后台-仪表盘 | admin-stat-card | OK |
| 管理后台-工具管理 | (antd defaults: Table, Switch) | OK |
| 管理后台-调用日志 | (antd defaults: Table) | OK |
| 管理后台-用户管理 | (antd defaults: Table, Switch, Popover, Dropdown) | OK |
| 个人设置 | (antd defaults: Form, Dropdown) | OK |

Every IA page is accounted for. Every DESIGN.md custom component has a home in the IA.

### OK-12: Sidebar nav structure in IA matches DESIGN.md layout
**Files:** EXPERIENCE.md §Information Architecture (lines 30-33), DESIGN.md §Layout & Spacing  
Both agree on: user sees "工具", admin sees "工具" + "管理" with sub-items. Sidebar bottom has avatar+username dropdown. Consistent.

---

## Dark Mode Consistency

### OK-13: `prefers-color-scheme` default is consistent
**Files:** EXPERIENCE.md §Accessibility Floor (line 103), DESIGN.md §Colors  
EXPERIENCE.md says the media query serves as the default, with manual override available. DESIGN.md defines both light and dark tokens. The intent to support both modes is aligned.

### ISSUE-1 (repeated): Dark mode mechanism vs. exact color tokens
See ISSUE-1 above. This is the only dark-mode-specific finding. The intent (support dark mode) is aligned; the implementation mechanism is contradicted.

---

## Summary

| Category | OK | ISSUE |
|----------|----|-------|
| Token references | 3 | 0 |
| Component consistency | 4 | 0 |
| Behavioral vs. visual | 3 | 0 |
| IA coverage | 2 | 0 |
| Dark mode | 1 | 1 |
| **Total** | **13** | **1** |

**One issue found:** The dark mode switching mechanism described in EXPERIENCE.md (standard antd 6 `ConfigProvider` + `darkAlgorithm`) is incompatible with DESIGN.md's specification of exact custom dark-mode color tokens (`primary-dark: '#A29BFE'`, etc.). These exact colors cannot be produced by antd 6's automatic dark algorithm alone. This needs resolution: either DESIGN.md should drop the exact `-dark` tokens and accept antd-computed dark variants, or EXPERIENCE.md should specify that dark mode requires a custom theme override (e.g., manually mapping `-dark` tokens into a `theme.darkAlgorithm` customization or using `theme.token` overrides for dark mode).