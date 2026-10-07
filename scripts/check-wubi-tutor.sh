#!/usr/bin/env bash
# Story 5.4: 五笔练习室 — 端到端验收
#
# 用法:
#   bash scripts/check-wubi-tutor.sh
#
# 可选集成（未设置则跳过对应项，脚本仍可独立跑通）:
#   API_BASE=http://localhost:8080 bash scripts/check-wubi-tutor.sh
#
# 任一项失败即以非 0 退出，可直接用于 CI。

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$ROOT/miao-toolbox-web"
MODULE="$WEB/src/modules/tools/wubi-tutor"
GEN="$MODULE/data/generated"

ok()   { echo "  ✅ $1"; }
warn() { echo "  ⚠️  $1"; }
fail() { echo "  ❌ $1" >&2; exit 1; }

# ─────────────────────────────────────────────────────────
echo ">>> 1/5 路由注册与访问控制"
# ─────────────────────────────────────────────────────────
# 静态断言：练习室作为「工具箱内的一个工具」注册，而非独立工具
grep -q 'TOOL_WUBI_TUTOR' "$WEB/src/App.tsx" \
  || fail "App.tsx 未注册 TOOL_WUBI_TUTOR"
grep -q 'tools/wubi-tutor' "$WEB/src/App.tsx" \
  || fail "App.tsx 缺少 /tools/wubi-tutor 路由"
ok "前端路由 /tools/wubi-tutor ↔ TOOL_WUBI_TUTOR 已注册（受 RequireRoute 保护）"

if [[ -n "${API_BASE:-}" ]]; then
  # 未授权场景必须被拒绝，而不是 200
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "$API_BASE/api/auth/routes" || echo "000")
  case "$CODE" in
    401|403) ok "未授权访问 /api/auth/routes 返回 $CODE" ;;
    000)     fail "无法连接 $API_BASE" ;;
    *)       fail "未授权访问返回 $CODE（期望 401/403）" ;;
  esac
else
  warn "跳过 HTTP 断言（未设置 API_BASE）"
fi

# ─────────────────────────────────────────────────────────
echo ""
echo ">>> 2/5 码表构建物完整性"
# ─────────────────────────────────────────────────────────
[[ -d "$GEN" ]] || fail "生成物目录不存在: $GEN"

GEN_DIR="$GEN" node --input-type=module -e '
import { readFileSync } from "node:fs";

const dir = process.env.GEN_DIR;
// bucket 为 null 表示该文件的条目是「字」而非「词」，无 bucket 字段
const EXPECTED = {
  "chars.json": null,
  "phrases-2.json": "2",
  "phrases-3.json": "3",
  "phrases-4plus.json": "4plus",
};

for (const [file, bucket] of Object.entries(EXPECTED)) {
  let data;
  try {
    data = JSON.parse(readFileSync(`${dir}/${file}`, "utf-8"));
  } catch (err) {
    console.error(`  ❌ ${file} 读取/解析失败: ${err.message}`);
    process.exit(1);
  }

  if (!data.v) throw new Error(`${file} 缺少版本字段 v`);
  if (!Array.isArray(data.entries)) throw new Error(`${file} entries 不是数组`);
  if (data.count !== data.entries.length) {
    throw new Error(`${file} count=${data.count} 与 entries=${data.entries.length} 不一致`);
  }
  if (bucket !== null && data.bucket !== bucket) {
    throw new Error(`${file} bucket 应为 "${bucket}"，实际 "${data.bucket}"`);
  }
  if (data.entries.length === 0) throw new Error(`${file} 条目为空`);

  const tag = bucket === null ? "字" : `词(${bucket})`;
  console.log(`  ✅ ${file}: v=${data.v} ${tag} ${data.count} 条`);
}
' || fail "构建物校验未通过"

# 旧的整体词组表必须已移除（否则体积预算口径会重复计算）
[[ -f "$GEN/phrases.json" ]] \
  && fail "残留 phrases.json —— 词组已拆分为按长度分块，请删除旧文件"

# ─────────────────────────────────────────────────────────
echo ""
echo ">>> 3/5 拆字覆盖率（由真实算法计算）"
# ─────────────────────────────────────────────────────────
# 注意：不要再自己算覆盖率。
# 旧版脚本只校验编码格式就一律记 resolved，恒报 100%，
# 而真实值只有 0.2% —— 详见 scripts/verify-wubi-split.mjs 顶部注释。
SPLIT_REPORT=$(node "$ROOT/scripts/verify-wubi-split.mjs" 2>&1) || {
  echo "$SPLIT_REPORT" | tail -25
  fail "拆字覆盖率验证未通过（vitest 退出码非 0）"
}

# 摘录真实数字
echo "$SPLIT_REPORT" | grep -E '\[coverage\]' | head -4 || true

echo "$SPLIT_REPORT" | grep -q '\[coverage\] total' \
  || fail "未能从输出中取到覆盖率报告"

# ── 验收口径（已重新表述，理由见 splitter.coverage.test.ts）──
#
# 新口径：**unsupported = 0** —— 每个字的每一位都能给出键位与候选字根。
# 这一条是可失败的：若字根表缺了某键、或编码出现非法键位，它就会红。
#
# 旧口径「resolved ≥ 95%」已废弃：
# 它由旧版 verify 脚本自己算，而那脚本只校验编码格式就一律记 resolved，
# 恒报 100% —— 是永真条件。真实 resolved 只有 1.0%，
# 因为「唯一拆分」需要字根分解表，而码表只有 `字\t编码\t词频` 三列。
UNSUPPORTED=$(echo "$SPLIT_REPORT" | grep -oE 'unsupported [0-9]+ \([0-9.]+%\)' | head -1)
[[ "$UNSUPPORTED" == "unsupported 0 (0.0%)" ]] \
  || fail "存在无法给出候选字根的字（${UNSUPPORTED:-未取到}）"
ok "覆盖率达标：unsupported = 0（每一位都能给出键位与候选字根）"

# ─────────────────────────────────────────────────────────
echo ""
echo ">>> 4/5 chunk 体积（与 Story 5.3 基线对照）"
# ─────────────────────────────────────────────────────────
# 预算（gzip KB）：工具主包 ≤ 60、chars ≤ 100、phrases 合计 ≤ 300
# 构建日志落临时文件，再用**引号 heredoc** 交给 node 解析。
#
# 不要改回 `node -e '...'` + 管道：那段 JS 由 bash 单引号包裹，
# 一旦代码里出现成对的单引号就会提前闭合引号，后面的 JS 被 bash 当
# 命令解析 —— 现象是正则一条都匹配不到，却没有任何语法报错。
# 引号 heredoc（<<'NODE'）不做任何变量/转义替换，从根上消除这类问题。
BUILD_LOG_FILE="$(mktemp)"
if ! (cd "$WEB" && npm run build) > "$BUILD_LOG_FILE" 2>&1; then
  tail -30 "$BUILD_LOG_FILE"
  rm -f "$BUILD_LOG_FILE"
  fail "npm run build 失败"
fi
# typecheck / lint 由 build 内的 tsc -b 覆盖，失败会在此中断

if ! BUILD_LOG_FILE="$BUILD_LOG_FILE" node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";

{
  const raw = readFileSync(process.env.BUILD_LOG_FILE, "utf-8");
  // Vite 体积表：dist/assets/<name>-<hash>.js   <size> kB │ gzip: <size> kB
  //
  // !! 不要按 '-' 切分来还原 chunk 名 !!
  // rollup 的 hash 是 base64url，字符集含 '-' 与 '_'，hash 本身就可能
  // 带短横线（实测出现过 `WubiTutorPage-Bfo1H2W-.js`）。
  // 「取最后一个 '-' 之前的部分」会得到 `WubiTutorPage-Bfo1H2W`；
  // 「取第一个 '-' 之前的部分」又会在 `phrases-2-mL8Krkms` 上得到
  // `phrases`。两种切法都会**间歇性**失败 —— 取决于当次 hash 长什么样。
  //
  // 因此保留完整文件名，改用「已知名字 + 8 位 hash」精确匹配。
  const HASH_LEN = 8;
  const re = new RegExp(
    String.raw`dist/assets/(\S+\.js)\s+[\d.]+ kB\s+│\s+gzip:\s+([\d.]+) kB`,
    "g",
  );

  const sizes = new Map();
  let m;
  while ((m = re.exec(raw)) !== null) {
    sizes.set(m[1].replace(/\.js$/, ""), Number(m[2]));
  }

  /** 按 `<name>-<8 位 base64url hash>` 精确查找，避免前缀误配 */
  const findChunk = (name) => {
    const pattern = new RegExp(`^${name}-[A-Za-z0-9_-]{${HASH_LEN}}$`);
    for (const [full, size] of sizes) {
      if (pattern.test(full)) return size;
    }
    return undefined;
  };

  const BUDGET = { main: 60, chars: 100, phrasesTotal: 300 };
  let failed = false;

  const report = (label, actual, budget) => {
    const pass = actual <= budget;
    if (!pass) failed = true;
    console.log(
      `  ${pass ? "✅" : "❌"} ${label}: ${actual.toFixed(2)} KB gzip（预算 ≤ ${budget} KB）`,
    );
  };

  const main = findChunk("WubiTutorPage");
  const chars = findChunk("chars");
  const phraseChunks = ["phrases-2", "phrases-3", "phrases-4plus"]
    .map(findChunk)
    .filter((v) => v !== undefined);

  if (main === undefined) {
    console.error("  ❌ 未找到 WubiTutorPage chunk，无法核对体积");
    if (sizes.size > 0) {
      console.error(`     已解析 ${sizes.size} 个 chunk：${[...sizes.keys()].slice(0, 8).join(", ")}…`);
    } else {
      console.error("     一个 chunk 都没解析到 —— 检查 Vite 是否改动了体积表输出格式");
    }
    process.exit(1);
  }
  // chars / phrases 必须是独立 chunk：缺失说明它们被并回了主包
  if (chars === undefined) {
    console.error("  ❌ 未找到独立的 chars chunk —— 码表可能已被打进主包");
    console.error("     检查是否有组件静态 import data/generated/*.json");
    process.exit(1);
  }
  if (phraseChunks.length !== 3) {
    console.error(`  ❌ 词组 chunk 应为 3 个，实际找到 ${phraseChunks.length} 个`);
    process.exit(1);
  }

  report("工具主包 WubiTutorPage", main, BUDGET.main);
  report("chars（独立 chunk）", chars, BUDGET.chars);

  const phrasesTotal = phraseChunks.reduce((a, b) => a + b, 0);
  report("phrases 三块合计", phrasesTotal, BUDGET.phrasesTotal);

  if (failed) process.exit(1);
}
NODE
then
  rm -f "$BUILD_LOG_FILE"
  fail "chunk 体积超预算"
fi
rm -f "$BUILD_LOG_FILE"

# ─────────────────────────────────────────────────────────
echo ""
echo ">>> 5/5 静态检查 / 单测 / 类型 / Lint"
# ─────────────────────────────────────────────────────────

# ── 字根展示完整性 ──
#
# 「对字根做 slice 截断」在本模块已发生 3 次：
#   RadicalChart 的 slice(0, 6)、VirtualKeyboard 的 slice(0, 5)，
#   以及两者各自叠加的 CSS `nowrap + text-overflow: ellipsis`。
# 每次都表现为「用户反馈看不到全部字根」——因为 JS 与 CSS 的容量
# 恰好都卡在同一个数，看起来像是设计如此，不像 bug。
#
# 数据层的 radicalsLabel 单测只能锁住那个 helper，挡不住有人在组件里
# 直接写回 slice；而本项目没有 DOM 测试环境，渲染级断言也做不到。
# 因此这里直接扫源码 —— 这是唯一能真正防住回归的层级。
if ! MODULE="$MODULE" node --input-type=module <<'NODE'
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const moduleDir = process.env.MODULE;
const errors = [];

// 1) 组件不得对 radicals 直接调用 slice
const componentsDir = join(moduleDir, "components");
for (const file of readdirSync(componentsDir)) {
  if (!file.endsWith(".tsx")) continue;
  const src = readFileSync(join(componentsDir, file), "utf-8");
  if (/radicals\s*\.\s*slice\s*\(/.test(src)) {
    errors.push(`${file}: 对 radicals 调用了 slice —— 字根会被截断`);
  }
}

// 2) 字根展示的 CSS 规则不得用 nowrap / ellipsis 截断
//
// 先剥掉注释再判断：规则内的注释会引用这些关键字作为「反面示例」，
// 不剥掉的话这条检查永远为真。
const stripCssComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const css = readFileSync(join(moduleDir, "wubi-tutor.css"), "utf-8");
for (const selector of ["wt-radical-chart__key-radicals", "wt-vkeyboard__key-radicals"]) {
  const start = css.indexOf(`.${selector} {`);
  if (start < 0) {
    errors.push(`wubi-tutor.css: 找不到 .${selector} 规则（选择器改了？）`);
    continue;
  }
  const body = stripCssComments(css.slice(start, css.indexOf("}", start)));
  if (/white-space:\s*nowrap/.test(body) || /text-overflow:\s*ellipsis/.test(body)) {
    errors.push(`.${selector}: 用 nowrap/ellipsis 截断了字根`);
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(`     ${e}`);
  process.exit(1);
}
console.log("  ✅ 字根展示完整：组件无 slice 截断，CSS 无 nowrap/ellipsis");
NODE
then
  fail "字根展示存在截断（见上方明细）"
fi

(cd "$WEB" && npx vitest run src/modules/tools/wubi-tutor --reporter=dot 2>&1 | tail -5) \
  || fail "单测未通过"
(cd "$WEB" && npm run typecheck) || fail "typecheck 未通过"
(cd "$WEB" && npm run lint) || fail "lint 未通过"
ok "单测 / 类型 / Lint 全部通过"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 五笔练习室验收全部通过"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
