# task-4 独立验证报告：JSON 工作台树形视图「行重叠/错乱」修复

- 验证方：verify-tree（独立验证，不采信 Lead 的脚本与结论，自建证据链）
- 被验版本（sha256 前 20 位，验证期间复核一致、未漂移）：
  - `miao-toolbox-web/src/modules/tools/json-workbench/components/JsonTreeView.tsx` → `3d2ea349863b1e3426e8`
  - `miao-toolbox-web/src/modules/tools/json-workbench/json-workbench.css` → `bea715af701742a9e9f3`
  - `miao-toolbox-web/src/modules/tools/json-workbench/utils/virtualRowMetrics.ts` → `244fdb08ff3e0939f54f`
  - `.../utils/__tests__/virtualRowMetrics.test.ts` → `97af32d774968d63e6ce`
- 环境：前端 dev server http://localhost:5173（IPv6 localhost）；Playwright 3.x（miao-toolbox-web/node_modules）；后端离线，`page.route('**/api/**')` mock 登录；数据经 `localStorage['tool-bridge:json-workbench']` 注入（收银台日志出参 `scripts/repro/payload-cashier.json`）。
- 未修改 `src/` 任何文件，未 git commit/push。新增文件全部位于 `miao-toolbox-web/scripts/verify/`。

## 结论

**接受该修复。** 五条行几何不变量在 19 个场景（232 项断言）全部通过；0 高测量的兜底在端到端注入下确实生效（35/35 行被喂 0 后真实几何仍 28px、零重叠）；回归全绿。
同时给出 **1 项残余风险**（钳制守卫带 `[24, 28)` 未覆盖，见 F1）、**2 项未验证/无法黑盒验证项**（L1/L2），以及对我方 v1 脚本两处缺陷的更正记录。

## 逐项结果

| # | 要求 | 结果 | 关键原始证据 |
|---|---|---|---|
| 1 | 自建不变量核对（行高恒 28 / 步长=真实行高 / 不重叠 / 徽标不跨行 / DOM 顺序=data-index） | ✅ 232/232 | 19 场景 × 9 不变量（IV1/IV1b/IV2/IV3a/IV3b/IV4/IV5/IV6/IV7/IV8，按 `.jw-tree-rows` 容器分组）；`/tmp/jw-repro/verify-invariants-evidence.json` |
| 2 | 对抗性 0 高兜底（区分修复前失败 / 修复后通过） | ✅ 29/29 | 见下「对抗性」段；`/tmp/jw-repro/verify-adversarial-evidence.json` |
| 3 | 视觉证据：父行与子行 [0] 不同 y、徽标不重叠 | ✅ | `verify-parent-child.png`、`verify-parent-child-zoom.png`（父行 arr[39] 与子行 obj 分处两行，已目视确认） |
| 4 | 回归：typecheck / vitest / eslint | ✅ | 见「回归」段 |
| 5 | 反向确认反例 | ✅ 已给出 1 项（F1） | `verify-counterfactual-rowh25-overlap.png` |

## 关键几何（收银台日志，树形/分栏视图）

```
父行 one_key_bind_card_bank_list : index=10 top=548.78 height=28 transform=translateY(280px) badge=arr[39]@551.78
子行 [0]                          : index=11 top=576.78 height=28 transform=translateY(308px) badge=obj@579.78
→ y 差 28px、徽标 y 差 28px（修复前症状为两行同 y、徽标叠在一起）
省略行（index=14）                : rowHeight=28 rowScrollH=28 rowClientH=28，按钮 height=22 bottom=685.78 ≤ rowBottom=688.78
                                    （旧代码此处按钮把行撑到 32px）
```
虚拟总高在每个场景都是 28 的整数倍（5/9/11/15/50/520…），即缓存中**没有任何非 28 的尺寸**；`520×28=14560px` 对应「菜单展开全部」后的全量节点。

## 对抗性（要求 2）

A) 真实应用 + 注入（用未被劫持的原函数采集真实几何）：
- A1 劫持 `HTMLElement.prototype.offsetHeight` → **35/35** 个已渲染行返回 0（该路径被调用 144 次），且 ResizeObserver 回调被喂 0 共 51 次；真实几何：行高全 28px、步长全 28px、**0 重叠**、父/子行仍相距 28px（实测 28px）。
- A2 劫持 `Element.prototype.getBoundingClientRect` → 探针确认树行 rect 高=0；真实几何同样全部通过。附带事实：修复后应用自身**从不**读取树行的 rect（`rectZeroed=0`，measureElement 走 offsetHeight），故该路径属「假设性回归」防线。
- A3 反空跑对照：把行高劫持成 **25px**（≥ `JW_MIN_ROW_HEIGHT=24`，按设计不被钳制）→ 38 行被劫持、37 处步长异常、**37 处真实几何重叠 3px**。这既证明我的检查器非空跑，也暴露残余风险 F1。

B) 差分（页内 `import` 真实库与真实源码模块，非复刻）：
- 修复前路径 = `@tanstack/virtual-core` 导出的默认 `measureElement`（修复前组件没有自定义 measureElement，走的就是它）在 0 高元素上：ref 路径 `0`、RO 路径 `0`、detached 场景 `undefined`；经 `normalizeRowHeight` 后分别 `28/28/28`，正常 28 高行仍为 28（不误伤）。
- 15 行中 4..8 量到 0：旧策略 starts `[0,28,56,84,112,112,112,112,112,112,140,…]` → **6 行同址、5 对按真实渲染高 28px 计完全重叠**（正是用户症状）；新策略 starts `[0,28,…,392]` 严格 28 递增 → 0 重叠。
- 纯函数契约逐值核对：`0/-5/0.4/23.9/NaN/±Infinity/null/undefined → 28`，`24 → 24`，`27.6 → 28`，`28.4 → 28`，`31.5 → 32`。

## 回归（要求 4）

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | exit 0 |
| `npx vitest run src/modules/tools/json-workbench` | **105 passed (8 files)** |
| `npx eslint src/modules/tools/json-workbench/components/JsonTreeView.tsx` | **0 error / 3 warning** |
| 基线 `npx eslint`（`git show HEAD:…JsonTreeView.tsx` 副本） | **0 error / 3 warning**（同一批：2×no-explicit-any + 1×react-hooks/incompatible-library）→ 修复未新增 lint 问题 |
| eslint `virtualRowMetrics.ts` + 其测试 | 0 error |

## CSS 变更评估（Lead 主动请我评估的超范围改动）

- 删除 `backface-visibility` / `translateZ(0)`：计算样式核对 `row/key/value` 的 `backface-visibility = visible`、`key/value` 的 `transform = none`（确已移除）；全仓库仅 json-workbench 曾使用这些声明，删除后无其它规则/组件依赖（grep 全 `src/` 无残留，除注释）。
- 无布局/功能回归证据：`.jw-node-row__key` 仍 `text-overflow: ellipsis + nowrap + overflow:hidden`，用 1947px 超长 key 实测被截断到 240px 且不越出所在行；`height:28px + box-sizing:border-box` 未裁切内容（`scrollHeight ≤ clientHeight` 全场景成立，含内联编辑态 input 高 24.42px 落在行内、CJK/深层嵌套/超长 value 载荷）；6 个滚动位置截图无可见错位。
- 判定：**行为中性、风险低**，但「删除合成层声明能修复线上错位」这一点我**无法证实**（没有可复现的 GPU 合成反例），属防御性/卫生性改动，建议保留但在提交信息里如实标注为「降低图层错位可能性」而非「已证实的修复」。

## 残余风险

- **F1（中低）**：`normalizeRowHeight` 的下限是 24，而真实行高是 28 → 任何落在 `[24, 28)` 的测量会被原样接受（如 `25`），缓存 25 而 DOM 渲染 28 → **每对相邻行重叠 1–4px**。A3 已给出现实反例（37 处 3px 重叠、截图 `verify-counterfactual-rowh25-overlap.png`）。当前 CSS 用 `height:28px` 锁死，真实布局不可能给出 25，故线上触发概率低；但「行高恒定」不变量在代码层面并未被强制，若后续 CSS 调整（如改为 `min-height` 或引入缩放/父子像素）就会静默失守。建议把兜底改为「与 JW_ROW_HEIGHT 不一致即回落」或把下限提到 28。
- **F2（低）**：`getItemKey` 按 `node.id` 键控这一改动，在**当前全行等高（28px）**的前提下无法用黑盒反例区分于按下标键控（尺寸一致 → 串号不可观测）。它属于正确的防御性加固（修复前按下标键控 + DOM 按 id 复用确实会串号），但「该改动本身修好了线上问题」这一点**未被我的证据独立证实**。
- **F3（低）**：`measureElement` 忽略 ResizeObserver 的 entry 快照、始终读 `offsetHeight`。副作用是永不使用 `borderBoxSize`，在「元素已挂载但尚未布局完成」的瞬间会读到 0 → 被钳到 28（正确）；但若将来行高不再固定，这条路径会丢精度。

## 未验证 / 无法验证项

- **L1**：我**没有**独立跑通「还原旧代码后本检验会失败」的端到端复现。原因：`git stash`/工作区还原会修改 `src/`（我的纪律禁止），而把旧组件搬到 `scripts/verify/` 自建 Vite harness 需要连旧 CSS 一起复刻、成本高。替代证据是 B 段（真实库默认测量函数 + 累积 start 差分）与 A3（反空跑对照）。Lead 自称「git stash 还原旧代码稳定报 3 处失败（index 14 行高 32px、index 10 步长 30px≠28px）」，此项我**未独立复核**。
- **L2**：headless Chromium 的截图无法证明「GPU 合成下不会出现行绘制在旧位置」；真正的合成层残影需要真实 GPU 合成环境（task-1 的 headed 环境）长时间滚动才能观察。本报告只证明**布局/几何不变量**成立与**无可见错位截图**。

## 我方 v1 脚本缺陷的更正（对应 Lead 转述的 8 项 ❌）

1. 展开态判定类名写错：antd 实际为 `.anticon-caret-down` / `.anticon-caret-right`，v1 写成 `.anticon-down` / `.anticon-right` → 把「已展开」的 `data` 行误判为折叠并点击，**反而折叠了父行**，导致 content/market_info/one_key_bind_card_bank_list 定位失败与「展开全部」按钮不出现（5 项 ❌）。
2. IV7 公式错误：v1 写成 `boxTop + translateY - scrollTop`，在视口坐标下**重复扣减了 scrollTop**（误差恰等于 scrollTop）→ S15~S17 的 3 项 ❌。
- **反证 Lead 的「双挂载/多容器混算」判断**：每个场景的容器普查均为 `panels=1 boxes=1`（含分栏视图、刷新后、视口缩放），且 v1 采集器本就只取单个 `.jw-tree-rows` 的 children，不存在跨容器混算。v2 已改为同容器内自洽式 `rect.top == boxTop + translateY`，并按容器分组校验（若真有多个容器会分别判定）。

## 复现命令

```bash
cd miao-toolbox-web
node scripts/verify/jw-invariants.mjs             # 232/232（19 场景 × 不变量）
node scripts/verify/jw-adversarial-zeroheight.mjs # 29/29（含 A1/A2/A3 + 真实库差分）
node scripts/verify/jw-css-and-clip-check.mjs     # 14/14（计算样式 + 长 key 截断 + 滚动）
node scripts/verify/jw-probe-state.mjs            # 侦察：初始 5 行 / 箭头类名 / 容器计数
```

证据与截图：`/tmp/jw-repro/verify-invariants-evidence.json`、`verify-adversarial-evidence.json`、`verify-css-clip-evidence.json`、`verify-parent-child*.png`、`verify-adversarial-*.png`、`verify-counterfactual-rowh25-overlap.png`、`verify-scroll-0..5.png`。

---

# F1 差异复验（task-5：测量下限 24 → 行高本身 28）

## 变更与指纹

| 文件 | 旧 → 新（sha256 前 20 位） | 状态 |
|---|---|---|
| `utils/virtualRowMetrics.ts` | `244fdb08ff3e0939f54f` → `230ec29933d616742e76` | 变 |
| `utils/__tests__/virtualRowMetrics.test.ts` | `97af32d774968d63e6ce` → `75ccf5eacba6d986eba1` | 变 |
| `components/JsonTreeView.tsx` | `3d2ea349863b1e3426e8` | 未变 |
| `json-workbench.css` | `bea715af701742a9e9f3` | 未变 |

新语义（我直接从源码读出，非按转述采信）：`JW_MIN_ROW_HEIGHT = JW_ROW_HEIGHT = 28`；
`normalizeRowHeight`：非 number / 非有限值 → 28；`Math.round(measured) < 28` → 28；否则返回取整值。

## 结果

| 项 | 结果 | 关键原始数据 |
|---|---|---|
| 不变量验收（19 场景 × 9 条） | ✅ 232/232 | 与前版一致：父行 `top=548.78 translateY(280px)`、子行 `[0] top=576.78 translateY(308px)`；省略行 index=14 高 28px；无新重叠/裁切 |
| CSS/裁切检查 | ✅ 14/14 | 行高 28px、超长 key 仍截断（1947→240）、6 个滚动位置零异常 |
| 对抗性验收（含新增 F1 复验） | ✅ 34/34 | 见下 |
| `npm run typecheck` | ✅ exit 0 | |
| `npx vitest run src/modules/tools/json-workbench` | ✅ 105 passed (8 files) | 含更新后的 `virtualRowMetrics.test.ts` |
| `npx eslint`（JsonTreeView + virtualRowMetrics + 其测试） | ✅ 0 error / 3 warning | 与 HEAD 基线同 3 条，无新增 |

### F1 端到端复验（A 组，真实应用 + 注入）

- **A3a（新契约下应被钳制）**：把树行 `offsetHeight` 注入为 **25px** → 35 行被劫持（取值集合 `[25]`），修复版渲染真实几何 **步长异常 0、重叠 0、间隙 0**，`translateY` 严格 `0,28,56,84,112,…`。task-4 报告中的 F1 守卫带已被封闭。
- **A3b（反空跑对照，注入值改为大于行高）**：注入 **33px** → 32 行被劫持 → **步长异常 31 处、间隙 31 处（每处 5px）、重叠 0 处**。
  - ⚠️ 更正 task-5 描述中的表述：「33px vs 真实 28px」产生的是**间隙（行被撑开）**，不是重叠；重叠只在缓存 < 渲染高时发生。断言已按此编写，既证明检查器仍能工作（非空跑），也说明「缓存必须等于渲染高」才是根不变量。
- **A1/A2（0 高注入）**：与前版相同，全部通过（35/35 行被喂 0 后真实几何仍 28px、零重叠）。

### F1 机制复验（B 组，真实库 + 真实源码模块）

- 逐值契约核对（新契约）：`0/-5/0.4/23.9/24/25/27.4/27.5 → 28`；`28 → 28`；`28.4 → 28`；`28.6 → 29`；`31.5 → 32`；`NaN/±Infinity/null/undefined → 28`。
- 新增 25px 场景差分：15 行中 index 4..8 量到 25 →
  - 旧策略（无钳制）starts `[0,28,56,84,112,137,162,187,212,237,265,…]` → **5 对 3px 视觉重叠**；
  - 新策略 starts `[0,28,56,84,112,140,168,196,224,252,280,…]` → **0 重叠**、严格 28 递增。
- 0 高场景差分保持通过（旧策略 6 行同址 / 5 对完全重叠；新策略 0）。

## 最终结论（task-5 后）

**仍然接受该修复，并且 F1 已关闭。** 新契约把「测量值不得小于真实行高」变成了代码层不变量：`<28` 一律回落 28（25px 注入端到端零异常可证），`≥28` 保留以支持将来更高的行。三套脚本 232 / 14 / 34 全绿，回归全绿，**未发现该变更引入任何新重叠、裁切或几何异常**。

残余风险（更新后）：
- **L1（未验证，不变）**：仍未独立复现「还原旧代码 → 本检验失败」的端到端场景（受「不得修改 src/」限制）；替代证据为 B 组真实库差分 + A3b 反空跑。
- **L2（未验证，不变）**：headless 截图无法证明 GPU 合成下的「行绘制在旧位置」类残影；只证明布局/几何不变量成立。
- **F2（不变，低）**：`getItemKey` 按 id 键控在全行等高时无法黑盒区分于按下标键控，属防御性加固。
- **F3（仅剩理论观察）**：`≥28` 保留取整意味着测量值落在 `[28.5, 29)` 时会得到 29（相对真实 28 产生 1px 间隙）。由于固定 `height:28px` 的 `offsetHeight` 恒为整数 28，实际不可触发；仅作为「将来行高改为非整数值」时的提醒。
- **F1：已修复并验证**（原「24 ≤ h < 28 未被钳制」的守卫带缺口不再存在）。
- 附加：A3b 表明若将来 `measureElement` 返回大于真实行高的值，症状会是**行间空隙**而非重叠 —— 我的 IV2 同时覆盖两个方向，后续回归可直接复用。

## 复验命令

```bash
cd miao-toolbox-web
node scripts/verify/jw-invariants.mjs             # 232/232
node scripts/verify/jw-adversarial-zeroheight.mjs # 34/34（A1/A2/A3a/A3b + B1~B4）
node scripts/verify/jw-css-and-clip-check.mjs     # 14/14
```
新增证据：`verify-counterfactual-rowh25-clamped.png`、`verify-counterfactual-rowh33-detect.png`、`/tmp/jw-repro/verify-adversarial-evidence.json`（含 `oldStarts25/newStarts25` 等原始数组）。