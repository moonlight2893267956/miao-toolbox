# task-6 独立验证报告：树节点点击 → 左侧原文行定位（JSONPath 精确下降）

- 验证方：verify-tree（独立证据链，未采信 Lead 的脚本与结论）
- 被验版本（sha256 前 20 位）：
  - `utils/jsonPathLocator.ts` = `d71f9ee5cc6557168d0a`（新增）
  - `utils/__tests__/jsonPathLocator.test.ts` = `15fb165f4a7fd717c4f4`（新增 16 例）
  - `JsonWorkbenchPage.tsx` = `644b32311ab97b4484a6`（`handleSelect` 改用 `locateJsonPath`）
- 环境：dev server http://localhost:5173（IPv6 localhost）；Playwright（miao-toolbox-web/node_modules）；`page.route('**/api/**')` mock 登录；真实模块通过 TypeScript `transpileModule` 现场转译后在 Node 侧直接调用（不改 src/）。
- 未改 `src/` 任何文件、未 commit/push；新增文件仅 `miao-toolbox-web/scripts/verify/`。

## 结论

1. **用户报告的缺陷（数组第 2 个元素里的字段定位到第 1 个元素）已修复，证据充分 → 接受该修复。**
2. **但发现 1 个同类残余缺陷 D1（❌ 建议同批修掉）**：键名含 `.` `[` `]` `"` `'` 时，`parseAndFlatten` 生成的树 id 形如 `$.["a.b"]`（`.` + `safeKey` 的方括号），而 `parseJsonPathSegments` 在 `.` 后读到空 key 即 `return null` → `locateJsonPath` 返回 null → `handleSelect` 不设 `scrollTarget` → **点击这类节点完全不跳转（静默无操作）**。
   - 最小修法：`parseJsonPathSegments` 中 `.` 分支若下一个字符已是 `[`，不要要求非空 key（直接继续解析方括号段）。当前代码里那段 `["key"]` 解析分支因此是**不可达**的——树永远产出 `$.["key"]`。
3. **D2（既有显示缺陷，非本次引入，供参考）**：这类键在树里显示为乱码 `b"]` / `["arr[0]"]` / `["it's"]`，原因是 `parseAndFlatten.extractKeyFromPath` 用 `lastIndexOf('.')` 且不识别方括号形态（对 `$.["a.b"]` 取到 `b"]`）。它会让用户更难察觉 D1。
4. 其余方面（数组下标精确性、嵌套、CRLF/Tab/紧凑/unicode/重复键/空容器、边界与耗时、回归）全部通过。

## 逐项结果

### 1) 独立浏览器验收 ✅ 18/21 项通过（失败 3 项全部是 D1）

期望行号由 `scripts/verify/lib/jsonScanOracle.mjs`（我自己的扫描器）在 Node 侧对**注入的原文**算出，不使用被测实现生成期望值；组件真实使用的 node id 通过右键菜单「复制路径」读剪贴板取得。

场景 A（真实载荷 payload-cashier.json，分栏视图；旧实现 `indexOf("bank_uniq_code")` 会落在第 80 行）：

| 目标 | 组件真实 id | oracle 期望行 | CodeMirror 活动行 | 活动行文本 |
|---|---|---|---|---|
| 数组元素行 `[1]` | （未取） | 96 | **96** ✅ | `{` |
| `[1].bank_uniq_code`（用户报告场景） | `$.data.content.one_key_bind_card_bank_list[1].bank_uniq_code` | 97 | **97** ✅ | `"bank_uniq_code": "401",` |
| `[2].bank_name` | （未取） | 111 | **111** ✅ | `"bank_name": "中国工商银行",` |
| `[1].card_type[0].type`（嵌套数组） | （未取） | 104 | **104** ✅ | `"type": 2,` |
| 折叠占位行 `.__ellipsis__` | （未取） | 78（父数组行） | **78** ✅ | —（并确认是「选中」而非「展开全部」：行数 28→28） |

- 用户缺陷的直接判据：`[1].bank_uniq_code` 活动行 97 ≠ 首次出现行 80 ✅；活动行文本包含目标 key 且值为 `"401"`（第 2 个元素）✅。
- 编辑器行对齐自检：`.cm-gutterElement` / `.cm-line` 与注入原文逐行一致（34 行抽样，0 处不符）→ 证明 Node 侧算出的行号对编辑器有效。

场景 B（键含特殊字符；特殊键在文档顶部第 2/3/4 行，对照组 `normal` 在第 45 行）：

| 键 | 树里显示 | 树真实 id | oracle 期望行 | 点击后活动行 | scrollTop |
|---|---|---|---|---|---|
| `normal`（对照） | `normal` | `$.normal` | 45 | **45** ✅ | 0 → 226 |
| `a.b` | `b"]` | `$.["a.b"]`（剪贴板实测） | 2 | 45 ❌ | 0 → 0 |
| `arr[0]` | `["arr[0]"]` | `$.["arr[0]"]`（oracle 由真实 parseAndFlatten 取得） | 3 | 45 ❌ | 0 → 0 |
| `it's` | `["it's"]` | `$.["it's"]`（同上） | 4 | 45 ❌ | 0 → 0 |

对照组点击后正确跳转（活动行 45、scrollTop 0→226），说明跳转链路本身可用；三个特殊字符键点击后活动行与 scrollTop **完全不变** → **D1 端到端复现**。

### 2) 独立 oracle 校验 ✅ 63 / ❌ 2（共比对 **598 次** `locateJsonPath` 调用）

三层互相独立的参照，全部不依赖被测实现：
- **L1 自研扫描器**（`scripts/verify/lib/jsonScanOracle.mjs`）：手写递归下降，记录每条 path 的「键字面量起止 / 值起止 / 解析值」，并保留重复键的每一次出现。
- **L2 JSON.parse 交叉校验**：用 `JSON.parse` 建 path→值 映射，与 L1 扫描值深比较 → 证明扫描器本身正确（重复键场景按 JSON.parse 语义跳过值比较并单独记录）。
- **L3 独立行列计算**：把原文 `split('\n')` + 前缀长度累加算出 1 起始行列号，与实现的 `line/column` 逐值比较。

覆盖 12 份文档（每份遍历**全部** path）：真实载荷 519 路径/677 行、数组同名 key、深层嵌套（数组套对象套数组）、键含点与引号、紧凑单行、CRLF、Tab 缩进、unicode 转义、字面反斜杠键、重复 key、空对象/空数组、字符串里含括号与逗号。

- 每份文档均通过：① L1↔L2 值一致；② 实现 offset = L1 期望偏移；③ **偏移处文本确实属于该 path**（键段：读出的字符串字面量解码后 === 期望键；下标段：偏移落在该元素 `[start,end)` 内且等于 start）；④ line/column = L3 独立计算。
- 数组同名 key 专项：真实载荷 39 个下标 → 行号 `[80,97,110,127,144,157,…]`，偏移严格递增、互不相同、均落在各自元素区间；3 元素文档 → `[3,4,5]`；深层嵌套 → 2 个下标偏移不同（同一行内），旧实现首现偏移 29 之后 ✅。
- **❌ 2 项即 D1**（未做任何“放宽”处理，如实失败）：`[键含点与引号] 真实产物 offset 与 L1 期望偏移一致`（`$.["a.b"]`、`$.["a.b"].x`、`$.["a.b"].["say \"hi\""]` 全部 `got:null`）与集成项 `树真实 id（含 . / [ ] / 单引号）可被 locateJsonPath 定位`（4 个真实 id → null，期望行 2/3/2/2）。

### 3) 边界与耗时 ✅

| 场景 | 结果 |
|---|---|
| 5000 元素数组 `$.big[4999].name` | ✅ 1.33ms，行 5001；`$.big[0].name` 0.002ms，行 2 → 未回退到首个元素 |
| 600 层深嵌套浅路径 `$.a.a.a.a.a` | ✅ 0.003ms，offset 21 |
| 600 段深路径（> `MAX_LOCATE_DEPTH=512`） | ✅ 返回 null，4.52ms（不卡死、不抛栈溢出） |
| 真实载荷 `[38].bank_uniq_code` | ✅ 0.14ms |
| 非法/缺失输入（16 例） | ✅ 一律不抛异常：键不存在/越界/类型不符/空文本/空路径/不以 `$` 开头/以 `.` 结尾/方括号未闭合/`undefined` 路径 → null；`$` → offset 0；截断文本中「键已存在」→ 定位到该键（与实现单测约定的降级语义一致，属「跳行仍有效」的有意设计） |
| 折叠占位 `.__ellipsis__` | ✅ 与父数组 offset/line 完全一致（2168 / 78） |
| 重复 key | ✅ 返回**首个**文本出现位置（`$.dup`→offset 4；`.other.dup`→39）；注意 JSON.parse 语义保留的是最后一个值，树也只渲染一个节点（`siblingDuplicateCount`），故不可区分 —— 记为观察项 |

### 4) 回归 ✅

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | exit 0 |
| `npx vitest run src/modules/tools/json-workbench` | **121 passed (9 files)** |
| `npx eslint JsonWorkbenchPage.tsx jsonPathLocator.ts` | **0 error / 5 warning** |
| `npx eslint`（HEAD 版 `JsonWorkbenchPage.tsx` 基线） | **0 error / 5 warning** → 无新增 warning（新增的 `jsonPathLocator.ts` 贡献 0 warning） |

## 残余风险与未验证

- **D1（中，建议修）**：见上。影响面：键名含 `.`/`[`/`]`/`"`/`'` 的节点点击后不跳转；这类键在真实日志里不常见但确实存在（D2 还会让它显示为乱码）。
- **D2（低，既有）**：`extractKeyFromPath` 对 `$.["k"]` 取键错误，树里显示 `b"]` 之类。
- **观察（低）**：重复键只能定位到首次出现（路径本身无法区分）。
- **未验证 L1**：headless 无法验证「GPU 合成/滚动画布」层面的视觉体验；本报告只覆盖行为与文本定位正确性。
- 我未复跑 Lead 的 `scripts/repro/jw-tree-locate-verify.mjs`（按要求不以其为依据）。

## 工具链事故披露（我方失误，已修）

`jw-locate-oracle.mjs` 最初的临时目录清理写成 `fs.rmSync(path.dirname(tmpFile), …)`，而 `tmpFile` 直接建在 `os.tmpdir()` 下 → 该调用试图**递归删除整个用户临时目录**（macOS `/var/folders/.../T`），在遇到 `com.docker.install/…` 的 `EBUSY` 后抛错中止。
影响：`/tmp/jw-repro`（所有证据与截图）**未受影响**，项目文件未受影响；被删的仅是 OS 临时目录中的瞬态文件。已改为只清理脚本自己 `mkdtemp` 出来的目录。特此披露。

## 复现命令

```bash
cd miao-toolbox-web
node scripts/verify/jw-locate-oracle.mjs    # 63/2（598 次 path 比对；2 项失败=D1）
node scripts/verify/jw-locate-browser.mjs   # 18/3（场景 A 全绿；3 项失败=D1）
```

证据：`/tmp/jw-repro/verify-locate-oracle-evidence.json`（含 12 份文档的逐 path 明细、耗时、idRows）、`/tmp/jw-repro/verify-locate-browser-evidence.json`（含 alignment/caseData/probeData）、截图 `verify-locate-A.png`、`verify-locate-ellipsis.png`、`verify-locate-B-special-keys.png`。

---

# task-7 差异复验：D1 已修复并复验 ✅（另发现 2 个新边角形态 D3/D4）

## 指纹（开跑/收尾各核对一次，一致）

| 文件 | 指纹（前 20 位） | 状态 |
|---|---|---|
| `utils/jsonPathLocator.ts` | `d71f9ee5cc6557168d0a` → **`d635b7320e289cef7c23`** | 变（D1 修复） |
| `utils/__tests__/jsonPathLocator.test.ts` | `15fb165f4a7fd717c4f4` → **`6b724eada8b21152b6fe`** | 变 |
| `JsonWorkbenchPage.tsx` | `644b32311ab97b4484a6` | 未变 |

修复内容核对（源码）：`parseJsonPathSegments` 的 `.` 分支新增 `if (jsonPath[i] === '[') continue;` —— 点号后紧跟方括号时不再要求非空 key，交由方括号分支解析。

## D1 状态：**已修复、已复验**（原先失败的 2 项全部转绿）

| 真实树 id（由真实 `parseAndFlatten` 生成） | 期望行 | 修复前 | 修复后 |
|---|---|---|---|
| `$.["a.b"]` | 2 | null | **offset 4 / 行 2** ✅ |
| `$.["he said \"hi\""]` | 2 | null | **offset 4 / 行 2** ✅ |
| `$.["arr[0]"]` | 2 | null | **offset 4 / 行 2** ✅ |
| `$.["it's"]` | 2 | null | **offset 4 / 行 2** ✅ |
| `$.["a.b"][0]` / `[1]`（含数组下标） | 3 / 4 | — | ✅ / ✅ |
| `$.list[0].["a.b"]`（数组元素内的方括号键） | 4 | — | ✅ |
| `$.["a.b"].["c.d"]`（多层方括号键） | 3 | — | ✅ |

- oracle：原先因 D1 失败的 2 项 `集成：树真实 id（含 . / [ ] / 单引号…）` 与 `[键含点与引号] 真实产物 offset 与 L1 期望偏移一致` 均 **✅**；总成绩 63/2 → **66/2**，且新的 2 项失败是下面 D3/D4（与 D1 无关）。
- 浏览器场景 B（特殊键在第 2/3/4 行、对照组在第 45 行）：`normal` → 活动行 **45**（scrollTop 0→226）✅；`a.b`（剪贴板实测 id `$.["a.b"]`）→ 活动行 **2**、文本 `"a.b": 1,` ✅；`arr[0]` → **3**、`"arr[0]": 2,` ✅；`it's` → **4**、`"it's": 3,` ✅（修复前这三个都停在 45）。浏览器验收 **18/3 → 21/0**。

## 新发现（穷举 `parseAndFlatten` 可产出 id 形态时发现；均为边角，不阻塞本次修复）

- **D3（低）空字符串键**：`{"": 1}` 生成 id `$.`、`{"a":{"":1}}` → `$.a.`、`{"a":{"":{"b":1}}}` → `$.a..b`；`locateJsonPath` 对这 4 个 id 均返回 **null → 点击不跳转**。空键是合法 JSON（真实日志里罕见）。最小修法方向：`.` 分支读到空 key 时，若后一个字符是 `.` 或已到串尾，则按「空字符串键」段处理（`$.["k"]` 的形态已在上一条修复中排除）。
- **D4（低）真实键名恰为 `__ellipsis__`**：id `$.__ellipsis__`（`type=number`，是真实节点）被 `resolveLocatorPath` 无条件剥掉后缀 → 回退到父级，`locateJsonPath` 返回 **offset 0 / 第 1 行（根）**，即**跳到错误位置**（比不跳更糟）。最小修法方向：占位回退改为「类型感知」（`handleSelect` 已知节点类型）或「先按字面路径查，查不到再回退父级」。
- 这两项的原始明细见证据 JSON 的 `results[task-7：id 形态探测明细]`。

## 回归（task-7 复跑）✅

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | exit 0 |
| `npx vitest run src/modules/tools/json-workbench` | **124 passed (9 files)** |
| `npx eslint JsonWorkbenchPage.tsx jsonPathLocator.ts` | **0 error / 5 warning** |
| `npx eslint`（HEAD 基线） | **0 error / 5 warning** → 无新增 warning |
| `node scripts/verify/jw-locate-oracle.mjs` | **66 / 2**（2 项 = D3/D4 探测） |
| `node scripts/verify/jw-locate-browser.mjs` | **21 / 0** |

## 工具链事故复查：隐患**已消除** ✅

- 代码核对：脚本只在第 49/468 行 `mkdtempSync(path.join(os.tmpdir(), 'jw-locator-'|'jw-tsmod-'))`，第 523 行仅 `for (const d of tempDirs) fs.rmSync(d, …)` —— 只清理自身创建的目录，不再触碰 `os.tmpdir()` 本体。
- 运行时核对：跑完 oracle 后 `os.tmpdir()` 条目数 135（跑前 135，未被删除），证据 JSON 正常写出（58 KB）。
- 另：我手工清掉了上一次**崩溃run** 遗留的 5 个 `jw-tsmod-*` 目录（逐个 `realpath` 校验前缀后删除，`/tmp/jw-repro` 与项目文件全程未受影响）。

## 结论（task-7）

**D1 修复接受**：故障形态（点号 + 方括号的树 id）已全部可定位，端到端（点击 → CodeMirror 活动行）与 oracle（598 次 path 比对）双重证实，回归无新增问题。
新增 **D3（空字符串键不跳转）/ D4（真实 `__ellipsis__` 键跳到根）** 两个低severity 边角项，均已给出可复现反例与最小修法方向，建议进 backlog，不作为本次修复的阻塞项。

---

# task-8 差异复验：D3 / D4 已修复并复验 ✅ —— **最终结论：无阻塞项**

## 指纹（开跑/收尾各核对一次，一致）

| 文件 | 指纹（前 20 位） | 状态 |
|---|---|---|
| `utils/jsonPathLocator.ts` | `d635b7320e289cef7c23` → **`4a05c4aa312aceea7973`** | 变（D3+D4） |
| `utils/__tests__/jsonPathLocator.test.ts` | `6b724eada8b21152b6fe` → **`e2c419c71cbacd0088e1`** | 变 |
| `JsonWorkbenchPage.tsx` | `644b32311ab97b4484a6` | 未变 |

实现核对：`locateJsonPath` 改为 `locate(字面路径)` → 失败才 `locate(resolveLocatorPath(...))`；`parseJsonPathSegments` 的 `.` 分支不再把空 key 判非法（`$.["k"]` 形态仍由 `if (jsonPath[i] === '[') continue` 交给方括号分支）。

## D3 状态：**已修复并复验** ✅

真实 `parseAndFlatten` 生成的 4 个空键 id 全部转绿（期望行号来自我的扫描器）：

| 文档 | 真实树 id | 期望行 | 修复前 | 修复后 |
|---|---|---|---|---|
| `{"":1,"x":2}` | `$.` | 2 | null | **offset 4 / 行 2** ✅ |
| `{"a":{"":1}}` | `$.a.` | 3 | null | **offset 15 / 行 3** ✅ |
| `{"a":{"":{"b":1}}}` | `$.a.` | 3 | null | **offset 15 / 行 3** ✅ |
| `{"a":{"":{"b":1}}}` | `$.a..b` | 4 | null | **offset 27 / 行 4** ✅ |

边界对照（防「解析放宽后瞎跳」）：文档里不存在空键时 `locateJsonPath('{"a":1}', '$.')` 仍返回 **null** ✅。

## D4 状态：**已修复并复验** ✅（含「字面命中 vs 占位回退」判别力专项）

同一文档内同时存在**真实键名 `__ellipsis__`** 与**折叠占位节点**，四路对照（oracle，真实 `parseAndFlatten` + 我的扫描器）：

| 目标 id | 语义 | 期望行 | 修复前 | 修复后 |
|---|---|---|---|---|
| `$.__ellipsis__` | 根上的真实键 | 2 | **1（错跳到根）** | **行 2** ✅ |
| `$.list[0].__ellipsis__` | 数组元素内的真实键 | 7 | 未测 | **行 7** ✅ |
| `$.list.__ellipsis__` | 折叠占位（父级是数组，字面查不到） | 6（父数组行） | 6 | **行 6** ✅（回退行为不变） |
| `$.list` | 父数组自身（对照） | 6 | 6 | 行 6 ✅ |

浏览器端（新增场景 C，真实点击 → CodeMirror 活动行）：
- **C1** 根上的真实 `__ellipsis__` 键 → 活动行 **2**、文本 `"__ellipsis__": 1,` ✅（**不是第 1 行/根**，D4 反例已闭合）
- **C2** 折叠占位行（data-index=9）→ 活动行 **6**（父数组 `list`）✅ 占位回退未受影响
- **C3** `list[0]` 内的真实 `__ellipsis__` 键（data-index=7）→ 活动行 **7**、文本 `{ "__ellipsis__": 100, "id": 0 },` ✅

## 复验总表

| 项 | 结果 |
|---|---|
| `node scripts/verify/jw-locate-oracle.mjs` | **71 / 0**（598 次 path 比对，12 份文档 + D1/D3/D4 形态专项全绿；task-6 的 63/2 → 66/2 → **71/0**） |
| `node scripts/verify/jw-locate-browser.mjs` | **24 / 0**（场景 A 用户原缺陷、场景 B 特殊键、场景 C `__ellipsis__` 三组全绿；18/3 → 21/0 → **24/0**） |
| `npm run typecheck` | exit 0 |
| `npx vitest run src/modules/tools/json-workbench` | **127 passed (9 files)** |
| `npx eslint JsonWorkbenchPage.tsx jsonPathLocator.ts` | **0 error / 5 warning** |
| `npx eslint`（HEAD 基线） | **0 error / 5 warning** → 无新增 warning |

## 复验过程中的一处 harness 说明（非产品问题）

场景 C 首跑时 C2/C3 失败，原因是我的脚本用「点击 `list` 行的箭头」来展开数组，而该 12 元素数组在进入页面时**已被默认展开**（10 行），我的点击反而把它折叠成 6 行。改为按 `data-index` 定位 + 「未展开则再点一次」后稳定通过；该文档的默认展开深度是既有行为，与本次修复无关。

## 最终结论（task-8）

**D3、D4 均已修复并复验通过；D1 保持已修复状态；无阻塞项。** 本主题（树节点点击 → 原文行定位）在我方独立证据链下的完整状态：
- oracle 71/0（598 次 path 比对，覆盖数组同名键、深层嵌套、方括号/含引号键、空字符串键、CRLF/Tab/紧凑/unicode 转义/字面反斜杠、重复键、空容器、`__ellipsis__` 字面 vs 占位、非法/超深/超大输入与耗时）；
- 浏览器 24/0（4 组真实点击场景，活动行号 = 我独立算出的期望行）；
- 回归全绿且无新增 lint 告警。

**残余（非阻塞、供 backlog 参考）**：
1. **重复键**只能定位到首次出现（路径本身无法区分；JSON.parse 语义保留最后一个值，树也只渲染一个节点并标注 `重复 ×N`）；
2. **D2 显示问题仍在**（既有）：`extractKeyFromPath` 对 `$.["a.b"]` 取键错误，树里显示 `b"]`；不影响跳转，但用户不易辨认；
3. headless 无法覆盖真实合成层视觉体验（与定位行为无关）。