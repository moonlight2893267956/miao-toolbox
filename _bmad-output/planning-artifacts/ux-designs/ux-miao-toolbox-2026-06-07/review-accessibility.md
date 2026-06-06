# 阿渺工具箱 — Accessibility Review (WCAG 2.2 AA)

**Reviewer:** WCAG 2.2 AA compliance audit  
**Scope:** EXPERIENCE.md + DESIGN.md  
**Date:** 2026-06-07  

---

## Summary

| Rating | Count |
|--------|-------|
| GAP (needs fix) | 5 |
| WARNING (should consider) | 5 |
| OK (covered) | 8 |

---

## 1. Keyboard Operability and Focus Indicators

### GAP-01: Focus indicator unspecified for tool cards
- **Section:** EXPERIENCE.md > Accessibility Floor, DESIGN.md > Components > tool-card
- **WCAG SC:** 2.4.7 Focus Visible (AA), 2.1.1 Keyboard (A)
- **Detail:** The tool card specifies `role="button"`, `tabindex="0"`, and keyboard activation via Enter/Space, but does NOT specify a visible focus indicator style. The hover state (`translateY(-2px)` + shadow) is only visual-on-hover. With a mouse user the card lifts; with a keyboard user tabbing to it, there is no specified focus ring or outline. Antd default outlines may apply, but the card has a brand-specific custom component (`background: {colors.primary}`, custom `rounded.lg`, custom `padding`) — it is unclear whether antd's default `:focus-visible` outline survives these overrides. **Fix:** Specify `:focus-visible` outline (e.g., `2px solid {colors.primary}`, offset 2px, or use antd's `outline` token) explicitly on the tool card.

### GAP-02: No keyboard interaction defined for stat cards on admin dashboard
- **Section:** EXPERIENCE.md > Component Patterns > Admin stat card
- **WCAG SC:** 2.1.1 Keyboard (A), 4.1.2 Name/Role/Value (A)
- **Detail:** "点击可跳转关联详情页" — the admin stat card is clickable and navigates. But the pattern table lists it as a stat card (not a link or button), and the Accessibility Floor only covers tool cards for keyboard semantics. Stat cards need the same treatment: `role="button"` or `<a>` with `href`, `tabindex="0"`, and keyboard activation. **Fix:** Add stat card keyboard semantics to the Accessibility Floor section alongside the tool card rules.

### OK-01: General keyboard navigation
- **Section:** EXPERIENCE.md > Accessibility Floor
- **Detail:** Tab order matching reading order, Enter activates buttons/cards, Esc closes popups. Covered.

### OK-02: Admin table keyboard navigation
- **Section:** EXPERIENCE.md > Accessibility Floor
- **Detail:** antd Table has built-in keyboard navigation. Covered by inheritance.

### OK-03: Form submit via Enter
- **Section:** EXPERIENCE.md > Interaction Primitives
- **Detail:** Enter key triggers form submission. Covered.

---

## 2. ARIA Roles and Labels for Custom Components

### OK-04: Tool card ARIA semantics
- **Section:** EXPERIENCE.md > Accessibility Floor
- **Detail:** `role="button"` + `tabindex="0"` + `aria-label="{工具名称} — {工具简介}"`. Explicitly specified. Covered.

### GAP-03: No ARIA for admin stat card
- **Section:** EXPERIENCE.md > Accessibility Floor, Component Patterns > Admin stat card
- **WCAG SC:** 4.1.2 Name, Role, Value (A)
- **Detail:** Same as GAP-02. The stat card is clickable and navigates, but no ARIA role or label is specified anywhere in either document. **Fix:** Add `role="button"` or `<a>` treatment with `aria-label` in the Accessibility Floor section, or in the component pattern definition.

### WARNING-01: Sidebar nav item active state — no ARIA current
- **Section:** DESIGN.md > Components > sidebar-nav-item-active
- **WCAG SC:** 4.1.2 Name, Role, Value (A)
- **Detail:** The active sidebar item has a visual style (10% primary bg + primary text) but no mention of `aria-current="page"`. This is a screen reader affordance gap: a blind user tabs through the sidebar but gets no programmatic indication of which page is currently active. **Recommendation:** Add `aria-current="page"` to the active sidebar item, documented alongside the active style.

---

## 3. Color Contrast

### GAP-04: Light mode primary `#6C5CE7` on white background fails AA for normal text
- **Section:** DESIGN.md > Colors, EXPERIENCE.md > Accessibility Floor
- **WCAG SC:** 1.4.3 Contrast (Minimum) (AA)
- **Detail:** Contrast ratio of `#6C5CE7` (primary) on `#FFFFFF` is approximately **3.88:1**. WCAG AA requires 4.5:1 for normal text (<18pt / <bold 14pt) and 3:1 for large text. This means:
  - Tool card text (white on `#6C5CE7` bg): same ~3.88:1 — **fails AA for normal text** (but passes AA-large for the card title if rendered at >=18pt or >=14pt bold).
  - Sidebar active nav text (`#6C5CE7` on near-white composite bg): similar ~3.9:1 — **fails AA**.
  - Any primary-colored link or label on white background: **fails AA**.
  - **Fix:** Either darken the light-mode primary to at least `#5A4BD6` (estimated ~4.6:1), or document that primary color is only used for large text (headings, card titles >=18pt) and interactive elements (where 3:1 is sufficient for non-text content per SC 1.4.11).

### GAP-05: Light mode accent `#FF8C42` on white background fails AA
- **Section:** DESIGN.md > Colors
- **WCAG SC:** 1.4.3 Contrast (Minimum) (AA), 1.4.11 Non-text Contrast (AA)
- **Detail:** Contrast ratio of `#FF8C42` (accent) on `#FFFFFF` is approximately **2.78:1**. This fails:
  - AA normal text (needs 4.5:1)
  - AA large text (needs 3:1)
  - AA non-text contrast (needs 3:1 for UI components and graphical objects)
  - The accent is used for: notification badges, important data highlights, admin dashboard anomaly markers — all of which are UI components requiring non-text contrast. **Fix:** Darken the light-mode accent to at least `#E67A22` (estimated ~3.2:1 for non-text, or ~`#CC6B0A` for ~4.5:1 for text). Alternatively, use the accent only on dark/colored backgrounds (e.g., dark mode is fine at ~5.5:1) and restrict its light-mode use to non-text elements where 3:1 is sufficient — but the current value 2.78:1 doesn't even clear 3:1.

### WARNING-02: Accent foreground `#1A1208` on dark background
- **Section:** DESIGN.md > Colors (accent-foreground-dark: `#1A1208`)
- **WCAG SC:** 1.4.3 Contrast (Minimum) (AA)
- **Detail:** `#1A1208` (very dark brown) on `#141414` (dark bg) or `#1F1F1F` (dark surface) yields approximately **1.1:1**. If this foreground color is ever rendered on a dark background (e.g., accent text on a dark card), it will be completely invisible. However, the DESIGN.md likely intends this for light-mode accent-on-foreground (where it works at ~15:1), and the dark-mode accent is `#FFB07A` which passes. The naming is confusing — `accent-foreground-dark` sounds like "accent text on dark background" but the hex value suggests otherwise. **Recommendation:** Clarify the naming convention. If `accent-foreground-dark` means "text color placed ON TOP of accent-dark background", it should be documented as such. If it means "accent text on a dark page background", the value is dangerously low contrast.

### OK-05: Dark mode contrast passes
- **Section:** DESIGN.md > Colors
- **Detail:** `#A29BFE` (primary-dark) on `#141414` (antd dark bg): ~6.8:1 — PASS AA. `#FFB07A` (accent-dark) on `#141414`: ~5.5:1 — PASS AA. `#1A1A2E` on `#A29BFE` (tool card): ~6.3:1 — PASS AA.

---

## 4. Form Error States

### OK-06: Error association with inputs
- **Section:** EXPERIENCE.md > Accessibility Floor
- **Detail:** "内联错误提示关联到对应输入（antd Form 内建 `aria-describedby`）". antd Form's built-in error handling provides programmatic association between error messages and their input fields. Covered.

### OK-07: Error messages content
- **Section:** EXPERIENCE.md > State Patterns (登录失败, 工具执行失败)
- **Detail:** Error messages are specific and actionable: "用户名或密码错误", "请求失败，请稍后重试". Not vague or technical. Covered.

### WARNING-03: No mention of error announcement for screen readers
- **Section:** EXPERIENCE.md > Accessibility Floor
- **WCAG SC:** 4.1.3 Status Messages (AA)
- **Detail:** antd Form errors appear inline and use `aria-describedby`, but there is no mention of `aria-live` regions or `role="alert"` for dynamic error messages that appear after form submission. antd's `message.error()` and `notification.warning()` (used for tool execution failures and rate limiting) may or may not use live regions depending on version. **Recommendation:** Add a note in the Accessibility Floor that form submission errors should be announced via `aria-live="polite"` or `role="alert"`, and verify that antd's Message/Notification components use live regions by default.

---

## 5. Dark Mode Switching

### OK-08: prefers-color-scheme as default
- **Section:** EXPERIENCE.md > Accessibility Floor
- **Detail:** "`prefers-color-scheme` 媒体查询作为默认值，用户可手动覆盖." This is the correct approach per WCAG — respect system preference first, allow manual override. Covered.

### OK-09: Smooth transition
- **Section:** EXPERIENCE.md > Interaction Primitives
- **Detail:** "切换即时生效，无页面刷新" via antd 6 ConfigProvider token switching. No flash of unstyled content (FOUC). Covered.

### WARNING-04: No transition timing consideration for users with photosensitive epilepsy
- **Section:** EXPERIENCE.md > Interaction Primitives, Accessibility Floor
- **WCAG SC:** 2.3.1 Three Flashes or Below Threshold (A)
- **Detail:** While not a flash animation, an abrupt full-page color inversion can be disorienting for some users. antd's ConfigProvider swap happens instantly — there is no CSS transition on `background-color` or `color` at the page level. **Recommendation:** Consider adding a brief CSS transition (200-300ms) on `background-color` and `color` at the root level to smooth the theme switch, and document it as a user preference consideration.

---

## 6. Admin Tables and Management Operations

### OK-10: Table accessibility via antd inheritance
- **Section:** EXPERIENCE.md > Component Patterns > Log table
- **Detail:** antd Table provides built-in keyboard navigation, column sorting, and `aria-label` support. Covered by inheritance.

### OK-11: Confirmation dialogs for destructive actions
- **Section:** EXPERIENCE.md > State Patterns (禁用用户, 禁用工具), Interaction Primitives
- **Detail:** High-risk operations require Popconfirm or Modal.confirm before executing. This prevents irreversible errors and follows WCAG 3.3.4 Error Prevention (Legal, Financial, Data). Covered.

### GAP-06: No accessible name for action menus in user management table rows
- **Section:** EXPERIENCE.md > Component Patterns > User action menu
- **WCAG SC:** 4.1.2 Name, Role, Value (A)
- **Detail:** The user action menu contains a Switch, a Popover form, and a Dropdown in each table row. There is no specification for `aria-label` on these per-row controls. Without unique labels (e.g., `aria-label="禁用用户 {用户名}"`), a screen reader user tabbing through the table will hear "Switch, on" or "Dropdown, collapsed" with no context of which user this action applies to. **Fix:** Add a note in the Accessibility Floor that all per-row controls (Switch, Popover trigger, Dropdown trigger) must have unique `aria-label` attributes incorporating the user's name or identifier.

### WARNING-05: Filter form association not specified
- **Section:** EXPERIENCE.md > Interaction Primitives (筛选/搜索)
- **WCAG SC:** 1.3.1 Info and Relationships (A)
- **Detail:** Admin table filters are described as "antd Form 行内筛选" but there is no mention of `<label>` associations for filter inputs (e.g., date range picker, user search input). antd Form may handle this via `Form.Item` with `label` prop, but it should be explicitly documented. **Recommendation:** Add a note that all filter form fields must have associated labels (using antd `Form.Item label` or `aria-label`) for screen reader compatibility.

---

## 7. Chinese-Specific Considerations

### OK-12: Noto Sans SC as primary CJK font
- **Section:** DESIGN.md > Typography, EXPERIENCE.md > Accessibility Floor
- **Detail:** `fontFamily: "'Noto Sans SC', -apple-system, BlinkMacSystemFont, ..."` — Noto Sans SC is a well-designed, open-source CJK font with good legibility. Covered.

### OK-13: Minimum font size 12px
- **Section:** EXPERIENCE.md > Accessibility Floor
- **Detail:** "最小字号不低于 12px". This meets WCAG SC 1.4.4 Resize Text (AA) baseline — 12px CJK is the commonly accepted minimum. However, note that some Chinese characters with complex strokes (e.g., 黉, 囊) may lose legibility below 14px. Covered at minimum level.

### OK-14: CJK line-height
- **Section:** DESIGN.md > Typography
- **Detail:** `display` uses `lineHeight: 1.25` and `display-sm` uses `lineHeight: 1.3`. For CJK text at display sizes (24-32px), 1.25-1.3 is adequate. Body text inherits antd defaults which typically use 1.5-1.6 for CJK readability. Covered.

### WARNING-06: No CJK-specific line-height for body text
- **Section:** DESIGN.md > Typography
- **WCAG SC:** 1.4.12 Text Spacing (AA)
- **Detail:** While display text line-heights are explicitly specified, body text is left to antd defaults. antd 6's default line-height of 1.571 is acceptable for Latin text but may be tight for CJK body text at small sizes (12-14px). WCAG SC 1.4.12 requires that text can be spaced to 1.5x line height, 2x letter spacing, and 2x word spacing without loss of content. **Recommendation:** Explicitly document that body text line-height should be no less than 1.5 (or 1.6 for CJK body text) to ensure CJK readability and to pass SC 1.4.12 at the default rendering. Also verify that antd's CSS does not hardcode line-height values that would prevent user-agent text spacing overrides.

---

## Consolidated Findings

### GAP (Must Fix Before Launch)

| ID | Priority | SC | Summary |
|----|----------|----|---------|
| GAP-01 | High | 2.4.7, 2.1.1 | Tool card missing visible focus indicator for keyboard users |
| GAP-02 | High | 2.1.1, 4.1.2 | Admin stat card has no keyboard interaction or ARIA semantics |
| GAP-03 | High | 4.1.2 | Admin stat card missing ARIA role and label |
| GAP-04 | High | 1.4.3 | Light-mode primary `#6C5CE7` on white fails AA contrast (3.88:1, needs 4.5:1) |
| GAP-05 | High | 1.4.3, 1.4.11 | Light-mode accent `#FF8C42` on white fails AA contrast (2.78:1, needs 3:1 for non-text) |
| GAP-06 | Medium | 4.1.2 | Per-row admin table controls (Switch, Dropdown) missing unique aria-label with user context |

### WARNING (Should Address)

| ID | Priority | SC | Summary |
|----|----------|----|---------|
| WARNING-01 | Medium | 4.1.2 | Sidebar active nav missing `aria-current="page"` |
| WARNING-02 | Medium | 1.4.3 | `accent-foreground-dark` naming ambiguity; verify usage context |
| WARNING-03 | Low | 4.1.3 | No explicit `aria-live` / `role="alert"` for dynamic form errors |
| WARNING-04 | Low | 2.3.1 | Abrupt dark/light theme switch could be disorienting |
| WARNING-05 | Low | 1.3.1 | Admin filter form labels not explicitly documented |
| WARNING-06 | Low | 1.4.12 | CJK body text line-height should be >=1.5 for readability |

### OK (Covered)

| ID | Summary |
|----|---------|
| OK-01 | General keyboard navigation (Tab order, Enter, Esc) |
| OK-02 | Admin table keyboard navigation via antd |
| OK-03 | Form submit via Enter key |
| OK-04 | Tool card ARIA semantics (role, tabindex, aria-label) |
| OK-05 | Dark mode brand color contrast passes AA |
| OK-06 | Form errors associated via aria-describedby |
| OK-07 | Actionable error message content |
| OK-08 | prefers-color-scheme as default with manual override |
| OK-09 | Smooth dark/light transition (no page refresh) |
| OK-10 | Admin table built-in a11y via antd |
| OK-11 | Confirmation dialogs for destructive actions |
| OK-12 | Noto Sans SC CJK font family specified |
| OK-13 | Minimum font size 12px |
| OK-14 | Display text CJK line-height coverage |