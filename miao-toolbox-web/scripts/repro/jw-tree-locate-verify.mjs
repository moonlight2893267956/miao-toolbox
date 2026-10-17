/**
 * JSON 工作台「点树节点 → 左侧原文定位」验收脚本
 *
 * 背景缺陷：点右侧树里「数组第 2 个元素」内的字段，左侧原文跳到第 1 个元素的同名字段
 *（旧实现用 rawJson.indexOf(`"key"`) 取第一次出现）。
 *
 * 前置：前端 dev server 已在 5173；后端可不在线（登录走 mock）。
 * 用法：cd miao-toolbox-web && node scripts/repro/jw-tree-locate-verify.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAYLOAD = fs.readFileSync(path.join(__dirname, 'payload-cashier.json'), 'utf8');
const UI = process.env.UI_BASE ?? 'http://localhost:5173';
const OUT = '/tmp/jw-repro';
fs.mkdirSync(OUT, { recursive: true });

let passed = 0;
let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✅ ${name}`); passed++; }
  else { console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); failed++; }
};

/** 期望行号：按原文第 1 次/最后 1 次出现计算（与页面无关的独立参照） */
const lineOf = (needle, { from = 0, last = false } = {}) => {
  const idx = last ? PAYLOAD.lastIndexOf(needle) : PAYLOAD.indexOf(needle, from);
  if (idx < 0) throw new Error(`payload 中找不到 ${needle}`);
  return PAYLOAD.slice(0, idx).split('\n').length;
};
const textOfLine = (n) => PAYLOAD.split('\n')[n - 1];

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = `${b64({ alg: 'HS256' })}.${b64({ sub: '1', exp: Math.floor(Date.now() / 1000) + 7200 })}.sig`;
const USER = { id: 1, username: 'verify', email: 'v@example.com', emailVerified: true, roles: [{ id: 1, code: 'SUPER_ADMIN', name: '超级管理员' }], githubUsername: null, googleUsername: null, avatarUrl: null };

/** 读取左侧编辑器的当前定位（活动行号 + 行文本） */
const readEditorTarget = (page) => page.evaluate(() => {
  const gutter = document.querySelector('.cm-activeLineGutter');
  const active = document.querySelector('.cm-activeLine');
  return {
    line: gutter ? Number(gutter.textContent.trim()) : null,
    text: active ? active.textContent : null,
  };
});

async function clickTreeRow(page, key) {
  const row = page.locator('.jw-node-row', { has: page.locator(`.jw-node-row__key:text-is("${key}")`) }).first();
  await row.waitFor({ state: 'visible', timeout: 15000 });
  await row.click();
  await page.waitForTimeout(450);
}

async function expandTreeRow(page, key) {
  const row = page.locator('.jw-node-row', { has: page.locator(`.jw-node-row__key:text-is("${key}")`) }).first();
  await row.waitFor({ state: 'visible', timeout: 15000 });
  await row.locator('.jw-node-row__arrow').click();
  await page.waitForTimeout(350);
}

/**
 * 点击「某个数组元素行」下面的子行。
 * 必须按 DOM 顺序、相对该元素行来取：数组元素的子行 key 完全相同，
 * 用全局 nth() 会取错父元素（正是本次要防的坑）。
 */
async function clickChildOf(page, parentKey, childKey) {
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('.jw-node-row')].map((r, i) => ({
      i,
      key: (r.querySelector('.jw-node-row__key, .jw-node-row__root-title')?.textContent ?? '').trim(),
    })),
  );
  const start = rows.findIndex((r) => r.key === parentKey);
  if (start < 0) throw new Error(`树上找不到父行 ${parentKey}`);
  let target = -1;
  for (let i = start + 1; i < rows.length; i++) {
    // 遇到下一个数组元素行（形如 [n]）说明已经跨出该元素
    if (/^\[\d+\]$/.test(rows[i].key)) break;
    if (rows[i].key === childKey) { target = rows[i].i; break; }
  }
  if (target < 0) throw new Error(`${parentKey} 下找不到子行 ${childKey}（可见：${rows.map((r) => r.key).join(',')}）`);
  const rowEl = page.locator('.jw-node-row').nth(target);
  await rowEl.scrollIntoViewIfNeeded();
  await rowEl.click();
  await page.waitForTimeout(500);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
  await page.route('**/api/**', (route) => {
    const u = route.request().url();
    const body = u.includes('/auth/refresh')
      ? { code: 'OK', data: { accessToken: JWT, signingKey: 'k', user: USER, mustChangePassword: false } }
      : { code: 'OK', data: { routes: [] } };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.addInitScript(({ pl, u }) => {
    localStorage.setItem('tool-bridge:json-workbench', pl);
    localStorage.setItem('user', JSON.stringify(u));
  }, { pl: PAYLOAD, u: USER });

  console.log(`>>> 目标：${UI}（分栏视图：右侧树 / 左侧原文）`);
  await page.goto(`${UI}/tools/json-workbench`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.locator('.jw-view-toggle__btn', { hasText: '分栏' }).click().catch(() => {});
  await page.waitForTimeout(500);

  // 展开到数组元素内部
  for (const key of ['content', 'market_info', 'one_key_bind_card_bank_list', '[1]', '[2]']) {
    await expandTreeRow(page, key).catch((e) => console.log(`  ⚠️ 展开 ${key} 失败：${String(e).slice(0, 80)}`));
  }

  const cases = [
    {
      name: '数组第 2 个元素（[1]）内的 bank_uniq_code',
      parent: '[1]',
      key: 'bank_uniq_code',
      expect: lineOf('"bank_uniq_code": "401"'),
      wrong: lineOf('"bank_uniq_code": "301"'),
    },
    {
      name: '数组第 3 个元素（[2]）内的 bank_name',
      parent: '[2]',
      key: 'bank_name',
      expect: lineOf('"bank_name": "中国工商银行"'),
      wrong: lineOf('"bank_name": "中国建设银行"'),
    },
  ];

  for (const c of cases) {
    try {
      await clickChildOf(page, c.parent, c.key);
    } catch (e) {
      ok(`${c.name} 可点击`, false, String(e).slice(0, 160));
      continue;
    }
    const got = await readEditorTarget(page);
    const expectText = textOfLine(c.expect).trim();
    ok(`${c.name} → 左侧定位到第 ${c.expect} 行`, got.line === c.expect, `实际第 ${got.line} 行：${JSON.stringify(got.text)}`);
    ok(`${c.name} → 左侧活动行文本正确`, (got.text ?? '').trim() === expectText, `实际 ${JSON.stringify(got.text)}，期望 ${JSON.stringify(expectText)}`);
    ok(`${c.name} → 没有跳到第 1 个元素（旧缺陷）`, got.line !== c.wrong, `落到了第 ${c.wrong} 行`);
  }

  // 深层对象字段
  await expandTreeRow(page, 'activities').catch(() => {});
  await expandTreeRow(page, 'bind_list').catch(() => {});
  await expandTreeRow(page, 'other_debit').catch(() => {});
  const deepRow = page.locator('.jw-node-row', { has: page.locator('.jw-node-row__key:text-is("market_words")') }).first();
  if (await deepRow.count()) {
    await deepRow.click();
    await page.waitForTimeout(500);
    const got = await readEditorTarget(page);
    const expect = lineOf('"market_words": "最高减5元"');
    ok('嵌套对象字段 market_words → 左侧定位正确', got.line === expect, `实际第 ${got.line} 行：${JSON.stringify(got.text)}`);
  } else {
    ok('嵌套对象字段 market_words 可点击', false, '未渲染该行');
  }

  // 折叠占位行（…36 more items）应跳到数组本行
  const ellipsis = page.locator('.jw-node-row', { has: page.locator('.jw-ellipsis-expand-btn') }).first();
  if (await ellipsis.count()) {
    await ellipsis.scrollIntoViewIfNeeded();
    // 点在行的左侧空白处：行中部/右侧是「展开全部」按钮，点它触发的是展开而非选中
    await ellipsis.click({ position: { x: 60, y: 14 } });
    await page.waitForTimeout(500);
    const got = await readEditorTarget(page);
    const expect = lineOf('"one_key_bind_card_bank_list"');
    ok('「…N more items」占位行 → 跳到数组所在行', got.line === expect, `实际第 ${got.line} 行：${JSON.stringify(got.text)}`);
  } else {
    ok('「…N more items」占位行存在', false, '未找到省略占位行');
  }

  // 数组元素行本身（旧实现完全不会跳）
  await clickTreeRow(page, '[2]');
  const gotElem = await readEditorTarget(page);
  ok('数组元素行 [2] → 跳到该元素起始行', gotElem.line === lineOf('"bank_uniq_code": "101"') - 1, `实际第 ${gotElem.line} 行：${JSON.stringify(gotElem.text)}`);

  await page.screenshot({ path: path.join(OUT, 'locate-verify.png') });

  // ── 第二阶段：特殊字符键（D1）─────────────────────────────
  // 键名含 . [ ] " ' 时，树的 id 形如 `$.["a.b"]`（点号 + 方括号），
  // 修复前 locateJsonPath 会返回 null → 点击完全不跳转。
  const SPECIAL = `{
  "a.b": 1,
  "arr[0]": 2,
  "it's": 3,
  "he said \\"hi\\"": 4,
  "normal": 5,
  "list": [10, 11]
}`;
  const specialLines = SPECIAL.split('\n');
  await page.evaluate((pl) => {
    localStorage.setItem('tool-bridge:json-workbench', pl);
    window.dispatchEvent(new CustomEvent('tool-bridge:json-workbench', { detail: pl }));
  }, SPECIAL);
  await page.waitForTimeout(1600);

  const depth1Rows = page.locator('.jw-node-row[style*="padding-left: 28px"]');
  const depth1Count = await depth1Rows.count();
  ok('特殊字符键载荷已加载（6 个顶层键）', depth1Count >= 6, `实际渲染 ${depth1Count} 行`);

  for (let i = 0; i < Math.min(6, depth1Count); i++) {
    await depth1Rows.nth(i).click();
    await page.waitForTimeout(400);
    const got = await readEditorTarget(page);
    const expectLine = i + 2; // 第 1 行是 `{`
    ok(
      `特殊字符键第 ${i + 1} 个（第 ${expectLine} 行）可定位`,
      got.line === expectLine,
      `实际第 ${got.line} 行：${JSON.stringify(got.text)}，期望 ${JSON.stringify(specialLines[expectLine - 1])}`,
    );
  }

  await page.screenshot({ path: path.join(OUT, 'locate-verify-special-keys.png') });

  console.log(`\n===== 通过 ${passed} / 失败 ${failed} =====`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });