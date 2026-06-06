# Responsive Design Review — 阿渺工具箱

Review date: 2026-06-07
Source files: EXPERIENCE.md, DESIGN.md

---

## 1. Breakpoints (lg / md / sm) — Ant Design 6 Grid Consistency

**OK.** The three breakpoints are correctly mapped to Ant Design 6's `Grid` responsive tiers:

| Breakpoint | Ant Design 6 token | Value | Documented in |
|---|---|---|---|
| Desktop | `lg` | `≥ 992px` | EXPERIENCE.md, DESIGN.md |
| Tablet | `md` | `768–991px` | EXPERIENCE.md, DESIGN.md |
| Mobile | `sm` | `< 768px` | EXPERIENCE.md, DESIGN.md |

Ant Design 6's default responsive grid breakpoints are: `xs` (480px), `sm` (576px), `md` (768px), `lg` (992px), `xl` (1200px), `xxl` (1600px). The design uses `lg` / `md` / `sm` correctly and the `≥ 992px` threshold aligns with the framework.

**WARNING: `xs` (< 576px) is not addressed.** Ant Design defines `xs` as a distinct tier. On devices narrower than 576px (e.g., iPhone SE, many Android phones in portrait), the "mobile" rules from the `< 768px` breakpoint apply — but there is no differentiation between a 575px phone and a 767px tablet-in-portrait. The sidebar drawer, 1-column grid, and horizontal-scrolling tables will still work, but form inputs (especially inline form items with labels + inputs) may become cramped. Consider adding an `xs` tier if form layout issues arise during testing.

---

## 2. Sidebar Collapse Strategy (fixed → icon → drawer)

**OK.** The three-state sidebar transition is well-conceived and maps cleanly to the three breakpoints:

- **`≥ 992px`** — Fixed sidebar, 240px width, full icon + label Menu items. Standard Ant Design Pro layout pattern.
- **`768–991px`** — Collapsed icon-mode sidebar, 64px width. Ant Design `Sider` supports this natively via `collapsed={true}` and `collapsedWidth={64}`. No layout shift because the 64px variant is still part of the flow.
- **`< 768px`** — Drawer (antd `Drawer`), overlaid on content. The 64px icon sidebar would be too wide for a 375px phone and too narrow to tap accurately; a drawer is the correct choice.

**OK: Ant Design Drawer in dark mode.** The Drawer component inherits `theme="dark"` from ConfigProvider automatically — no additional dark-mode handling is needed for the sidebar drawer. The overlay mask (`maskStyle`) will also respect the theme's opacity and color tokens.

**WARNING: Drawer overlay on mobile + admin panel.** On mobile, if an admin opens the sidebar drawer and then taps to navigate to a page with a data table, the drawer closes — but the table's filter/search bar needs to be visible above the fold. On `< 576px` devices, the admin page title + filter bar may push the table below the viewport, making the drawer feel obstructive rather than helpful. Consider: (a) ensuring the drawer's overlay mask is dismissible via tap on the content area (antd Drawer's `closable` + mask `onClick` default behavior), and (b) adding a small top-margin to the page content on mobile so the filter bar is always reachable.

---

## 3. Tool List Grid (3 → 2 → 1 Columns)

**OK for a 10-user private tool.** The progression 3→2→1 columns is standard and works well for card-based layouts. The card widths at each tier:

- **3 columns at `≥ 992px`** — Each card occupies ~300px (content area ~900px with 240px sidebar, gaps). This is comfortable for an icon + name + short description card.
- **2 columns at `768–991px`** — Cards ~320px each (content area ~700px with 64px collapsed sidebar). Works fine.
- **1 column at `< 768px`** — Full-width card, ~350px on a typical phone. The single column ensures the tool-card's brand-purple background and 24px padding have room to breathe.

**WARNING: Cold-start skeleton cards (EXPERIENCE.md line 79).** The spec says "antd Skeleton 卡片占位（3-4 个）". On mobile (1-column), showing 3-4 skeleton cards means the user scrolls past 3-4 loading cards before seeing any real content. Consider reducing skeleton count to 1-2 on mobile breakpoints. Alternatively, use a single `Skeleton` with `active` that matches the eventual 1-card layout.

**WARNING: Tool card content on narrow screens.** The tool card spec (DESIGN.md) specifies: brand-purple background, white text, 24px padding, rounded corners. On a 360px-wide phone with 24px padding on each side, the text area is ~312px wide. If a tool name is long (e.g., "AI 智能文本翻译优化助手"), it must truncate with ellipsis rather than wrapping to 2-3 lines and breaking the card's visual rhythm. Ensure `text-overflow: ellipsis; white-space: nowrap;` or `-webkit-line-clamp: 2` is applied to the card title on all breakpoints, especially mobile.

---

## 4. Admin Tables on Mobile — Horizontal Scroll vs. Card Views

**WARNING: Horizontal scroll is the right choice but needs execution discipline.** The design calls for "表格横向滚动 + 筛选折叠" on mobile. This is appropriate for a desktop-priority admin panel with 10 users — building card views for mobile would be disproportionate effort. However, three specific issues need attention:

### 4a. Filter collapse behavior is underspecified
EXPERIENCE.md says "筛选折叠" but does not specify the collapsed UI. On desktop, filters appear as inline form items above the table. On mobile, these should collapse into either:
- An antd `Collapse` panel labeled "筛选", or
- An antd `Drawer` triggered by a "筛选" button above the table.

The current spec is ambiguous — if filters remain inline on mobile, they will occupy most of the viewport before the user sees any data. **Recommendation:** explicitly specify an antd `Collapse` with default `collapsed` state on `< 768px`, showing 1-2 most-used filter fields (e.g., time range) and hiding advanced filters.

### 4b. Table action columns on mobile
Admin tables (user management, tool management) have action columns with switches, popovers, and dropdowns. On mobile with horizontal scroll, the user must scroll horizontally to reach the action column, then interact with a small target. Switch components on a 375px screen with 6+ columns will be very small. **Recommendation:** Pin the action column as the last column using `fixed: 'right'` in antd Table's `columns` config, so users can always reach it after horizontal scroll. Also increase the Switch `size` prop or use a custom larger touch target on mobile.

### 4c. Pagination vs. horizontal scroll
Ant Design's Table pagination renders a full pagination bar below the table. On mobile, this adds vertical space after an already-scrolled table. Ensure the pagination is compact (`showSizeChanger={false}`, `simple` mode) on mobile breakpoints.

### Verdict: Card views are **not necessary** for v1. The horizontal scroll approach is pragmatic for 10-user scale. But the three items above must be explicitly spec'd to avoid a broken mobile experience.

---

## 5. Unaddressed Surfaces That Would Break on Mobile

### ISSUE: User dropdown at sidebar bottom (EXPERIENCE.md lines 32, 61)
The user avatar + name at the bottom of the sidebar triggers a dropdown for personal settings / logout. On desktop (fixed sidebar) and tablet (collapsed icon sidebar), this works — the user can see and tap the avatar. On mobile (drawer mode), the dropdown **inside the drawer** is fine. However, when the drawer is closed, **there is no user menu trigger on mobile**. The user has no visible way to access personal settings or log out unless they open the sidebar drawer first. This is a usability gap.

**Recommendation:** Add a secondary user menu trigger in the mobile top bar (e.g., an avatar icon in the top-right corner that becomes visible only on `< 768px`). This ensures the user can always reach settings/logout without opening the sidebar drawer.

### WARNING: Login page on mobile (not explicitly discussed)
The login page (password + GitHub OAuth) is mentioned but not given responsive rules. On mobile, the login form must:
- Not exceed the viewport width (likely 320-375px)
- Stack the "GitHub OAuth" and "password login" options vertically
- Avoid horizontal scrolling entirely (this is the first impression)

Since the login page has no sidebar, it can use full viewport width. But the spec doesn't mention responsive form layout for login. This is low-risk because antd Form with `Col`/`Row` will wrap naturally, but worth noting.

### WARNING: Tool operation page result area on mobile
The v1 tool operation template (EXPERIENCE.md line 56) has: title + parameter form + submit button + result area. On mobile:
- The parameter form may contain multiple input fields — these should stack vertically (antd Form's default behavior).
- The submit button should be full-width on mobile (`block` prop on `Button`).
- The result area may contain long text output (e.g., translation results). If the result is displayed in a `Typography.Paragraph` or similar, ensure `word-break: break-word` so long unbroken strings don't cause horizontal overflow.

This is generally fine with antd defaults, but the spec should explicitly call out `Button block` for mobile submit and result-area word wrapping.

---

## 6. Dark Mode + Responsive — Interaction Issues

**OK: No fundamental conflicts.** Ant Design 6's `ConfigProvider` + `theme.algorithm` (dark/light) handles all component-level theming. The Drawer, Menu, Table, and Form components all respond to theme changes automatically.

**OK: Sidebar drawer in dark mode.** As noted in section 2, the Drawer inherits the dark theme tokens correctly. No special handling needed.

**OK: `prefers-color-scheme` media query (EXPERIENCE.md line 103).** The spec correctly calls for using the system preference as the default while allowing manual override. This is the standard pattern.

**WARNING: Tool cards with brand-purple background in dark mode.** DESIGN.md specifies `primary-dark: '#A29BFE'` for the brand purple in dark mode. The tool card background uses `{colors.primary}` which becomes `#A29BFE` in dark mode. The text color becomes `primary-foreground-dark: '#1A1A2E'` — a dark navy on a light purple. This combination has a contrast ratio of approximately 5.8:1 (passes WCAG AA for normal text). However, the hover effect (`translateY(-2px)` + `rgba(108, 92, 231, 0.25)` shadow) uses the light-mode purple shadow value. In dark mode, a `rgba(108, 92, 231, 0.25)` shadow on a `#A29BFE` card will be barely visible. **Recommendation:** The hover shadow should reference `colors.primary-dark` in dark mode, e.g., `rgba(162, 155, 254, 0.3)`.

**WARNING: Accent color usage in dark mode.** The accent orange is `#FFB07A` in dark mode. If used for notification badges or anomaly markers on a dark background, this is fine. But if used on a card or stat component that inherits a dark surface background (e.g., `#141414`), the orange may need sufficient contrast. `#FFB07A` on `#141414` is approximately 8.2:1 — well above AA. No issue here, but worth verifying during implementation for the specific components that use accent.

---

## 7. Tool Operation Page on Mobile — Form Inputs, Submit Button, Results Display

**WARNING: Form layout on narrow screens.** The v1 tool operation template is YAML-driven (FR-13), meaning the form fields are dynamic. On mobile:
- If a form has label + input side-by-side (antd `labelCol` with `span`), the label may be too wide on a 375px screen.
- **Recommendation:** Set `labelCol={{ xs: { span: 24 }, sm: { span: 8 } }}` and `wrapperCol={{ xs: { span: 24 }, sm: { span: 16 } }}` for all tool operation forms — or use `labelCol={{ flex: '80px' }}` for a fixed-width label. This should be part of the base template, not left to each YAML config.

**OK: Submit button loading state (EXPERIENCE.md line 84).** The loading state prevents double-submission. On mobile, the button should use `block` prop to span full width, as noted above. This is a small addition to the spec.

**WARNING: Result area — copy button on mobile.** The spec mentions a copy button on the result (Flow 1, line 136: "她点击结果旁的复制按钮"). On mobile, if the result is wide text and the copy button is positioned to the right, the user must scroll to find it. **Recommendation:** Place the copy button inline with the result (e.g., top-right corner of the result container) or use a sticky-positioned copy button that stays visible as the user scrolls through long results.

**ISSUE: No explicit mobile behavior for tool operation page.** The responsive section (EXPERIENCE.md lines 108-114) covers sidebar, tool grid, and admin tables — but **does not mention the tool operation page at all**. The operation page is the core interaction surface (the reason users visit the app). It needs its own responsive rules, at minimum:
- Form layout: vertical stack on mobile (as discussed above)
- Submit button: full-width on mobile
- Result area: allow horizontal scroll for code/monospace output, but wrap for natural language
- Back button: mobile users need an easy way to return to the tool list (e.g., an antd `Button` with an arrow icon above the title, visible only on `< 768px`)

---

## Summary

| Severity | Count | Key Items |
|---|---|---|
| **ISSUE** | 2 | No user menu trigger on mobile when drawer is closed; tool operation page has no responsive rules |
| **WARNING** | 8 | `xs` breakpoint unaddressed; skeleton count on mobile; long tool names on narrow cards; admin filter collapse unspecific; action column not pinned; pagination not compacted on mobile; dark mode card hover shadow uses wrong color; copy button placement on mobile |
| **OK** | 4 | Breakpoints align with antd 6; sidebar three-state transition; drawer dark mode inheritance; `prefers-color-scheme` support |

The responsive strategy is fundamentally sound for a desktop-first, 10-user tool. The two **ISSUE** items (user menu on mobile, tool operation page responsive rules) should be addressed in the spec before implementation begins. The **WARNING** items are refinements that can be handled during development with clear guidance.

**Most impactful fix:** Add a "Tool Operation Page — Mobile" subsection to the Responsive section of EXPERIENCE.md, specifying form layout, submit button width, result area overflow, and back-navigation behavior.