#!/usr/bin/env node
/**
 * verify-wubi-split.mjs
 *
 * 拆字逆推覆盖率验证 —— **委托给真实算法**。
 *
 * ── 为什么本脚本不再自己算 ──
 *
 * 本脚本是 `.mjs`，无法 import TS 模块。它的旧实现因此只校验编码格式
 * （`/^[a-y]{1,4}$/`）就把每个字一律记成 `resolved`：
 *
 *     if (code.length === 1) resolved++;
 *     else { /* 多码字需要完整逆推——此处标记为待验证 *\/ resolved++; }
 *
 * 结果**恒为** 100% / 0 / 0，与真实覆盖率无关。
 * 于是「resolved ≥ 95%」这条验收口径成了永真条件：
 * 报告说 100%，实际只有 0.2%（12452 个字里 25 个能拆），
 * 界面上连「一」这种最基本的字根都显示「暂不支持」。
 *
 * 覆盖率只能由**真正调用 splitter.splitChar 的一方**来算。
 * 因此本脚本改为运行 Vitest 中的
 * `utils/wubi/splitter.coverage.test.ts`（那里 import 的是真实算法），
 * 并原样转发其退出码。
 *
 * 用法：
 *   node scripts/verify-wubi-split.mjs
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const WEB = join(ROOT, 'miao-toolbox-web');
const CHARS_JSON = join(
  WEB,
  'src/modules/tools/wubi-tutor/data/generated/chars.json',
);

if (!existsSync(CHARS_JSON)) {
  console.error(`✗ 码表不存在: ${CHARS_JSON}`);
  console.error('  请先运行: node scripts/build-wubi-tables.mjs');
  process.exit(1);
}

console.log('\n五笔拆字覆盖率 —— 由真实算法（splitter.ts）计算\n');

const result = spawnSync(
  'npx',
  [
    'vitest',
    'run',
    'src/modules/tools/wubi-tutor/utils/wubi/splitter.coverage.test.ts',
  ],
  { cwd: WEB, stdio: 'inherit', shell: true },
);

process.exit(result.status ?? 1);
