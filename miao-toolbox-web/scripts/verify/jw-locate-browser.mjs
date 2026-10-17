/**
 * task-6 独立验证（verify-tree）：浏览器端验收「树节点点击 → 左侧原文行定位」
 *
 * 与 Lead 的 scripts/repro/jw-tree-locate-verify.mjs 完全独立：
 *  - 期望行号由 scripts/verify/lib/jsonScanOracle.mjs（我自己的扫描器）在 Node 侧算出，
 *    不调用被测实现来生成期望值；
 *  - 并通过右键菜单「复制路径」读取组件真实使用的 node id（剪贴板），证明测的就是树真实 id；
 *  - 断言左侧 CodeMirror 的 .cm-activeLineGutter / .cm-activeLine 行号与文本；
 *  - 额外做「旧实现判据」：活动行不得等于该 key 首次出现所在行；
 *  - 额外做「树 id 形态」探针：键含 . / [ ] / ' 时树 id 形如 $.["a.b"]，验证是否仍能定位。
 *
 * 前置：dev server 在 http://localhost:5173（IPv6 localhost），后端可不在线（mock）。
 * 用法：cd miao-toolbox-web && node scripts/verify/jw-locate-browser.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { myScan, lineColBySplit } from './lib/jsonScanOracle.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAYLOAD = fs.readFileSync(path.join(__dirname, '..', 'repro', 'payload-cashier.json'), 'utf8');
const UI = process.env.UI_BASE ?? 'http://localhost:5173';
const OUT = process.env.OUT_DIR ?? '/tmp/jw-repro';
fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const results = [];
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} :: ${JSON.stringify(detail)?.slice(0, 700)}`); }
  results.push({ name, ok: !!cond, detail });
};

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: '1', exp: Math.floor(Date.now() / 1000) + 7200 })}.sig`;
const USER = { id: 1, username: 'verify', email: 'v@example.com', emailVerified: true, roles: [{ id: 1, code: 'SUPER_ADMIN', name: '超级管理员' }], githubUsername: null, googleUsername: null, avatarUrl: null };

const attach = async (page) => {
  await page.route('**/api/**', (route) => {
    const u = route.request().url();
    const body = u.includes('/auth/refresh')
      ? { code: 'OK', data: { accessToken: JWT, signingKey: 'k', user: USER, mustChangePassword: false } }
      : { code: 'OK', data: { routes: [] } };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
};

/** 读取 CodeMirror 当前活动行 */
const readActive = (page) => page.evaluate(() => {
  const g = document.querySelector('.cm-activeLineGutter');
  const l = document.querySelector('.cm-activeLine');
  return {
    gutter: g ? String(g.textContent).trim() : null,
    text: l ? String(l.textContent) : null,
    scrollTop: document.querySelector('.cm-scroller')?.scrollTop ?? null,
  };
});

/** 校验编辑器渲染的行与注入文本逐行对齐（证明「Node 侧算的行号」对编辑器有效） */
const checkAlignment = async (page, text) => page.evaluate((lines) => {
  const gutters = [...document.querySelectorAll('.cm-gutterElement')]
    .filter((g) => g.offsetHeight > 0 && getComputedStyle(g).visibility !== 'hidden')
    .map((g) => String(g.textContent).trim())
    .filter((s) => /^\d+$/.test(s));
  const cmLines = [...document.querySelectorAll('.cm-line')].map((l) => l.textContent);
  const pairs = [];
  const n = Math.min(gutters.length, cmLines.length);
  for (let i = 0; i < n; i++) {
    const lineNo = Number(gutters[i]);
    pairs.push({ lineNo, rendered: cmLines[i], expected: lines[lineNo - 1] });
  }
  const mismatched = pairs.filter((p) => p.expected !== undefined && p.rendered !== p.expected);
  return { checked: pairs.length, mismatched: mismatched.slice(0, 3), pairs: pairs.slice(0, 4) };
}, text.split('\n'));

/** 通过右键菜单「复制路径」读取组件真实 node id（尽力而为，不因菜单问题中断验收） */
async function readNodeIdViaCopyPath(page, rowLocator) {
  try {
    await page.keyboard.press('Escape');
    await rowLocator.click({ button: 'right', timeout: 4000 });
    await page.waitForTimeout(300);
    const item = page.locator('.ant-dropdown-menu-item', { hasText: '复制路径' }).first();
    await item.waitFor({ state: 'visible', timeout: 4000 });
    await item.click({ timeout: 4000 });
    await page.waitForTimeout(300);
    return await page.evaluate(() => navigator.clipboard.readText());
  } catch (e) {
    return `__unavailable__:${String(e).slice(0, 60)}`;
  } finally {
    await page.keyboard.press('Escape').catch(() => {});
  }
}

/** 在 [a] 与 [b] 两个下标行之间找 key 行（避免落到 [0] 的子孙上） */
async function rowWithin(page, startIdx, endIdx, key) {
  const rows = page.locator('.jw-tree-rows > div');
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const r = rows.nth(i);
    const idx = Number(await r.getAttribute('data-index'));
    if (idx <= startIdx || (endIdx !== null && idx >= endIdx)) continue;
    const k = await r.locator('.jw-node-row__key').first().textContent().catch(() => null);
    if ((k ?? '').trim() === key) return r;
  }
  return null;
}

const main = async () => {
  const browser = await chromium.launch();

  // ══ 场景 A：真实载荷（数组元素同名字段 —— 用户报告的缺陷） ══
  console.log('>>> 场景 A：真实载荷（收银台日志）分栏视图');
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, permissions: ['clipboard-read', 'clipboard-write'] });
  const pageA = await ctxA.newPage();
  await attach(pageA);
  await pageA.addInitScript(({ pl, u }) => {
    localStorage.setItem('tool-bridge:json-workbench', pl);
    localStorage.setItem('user', JSON.stringify(u));
  }, { pl: PAYLOAD, u: USER });
  await pageA.goto(`${UI}/tools/json-workbench`, { waitUntil: 'domcontentloaded' });
  await pageA.waitForTimeout(2600);

  const align = await checkAlignment(pageA, PAYLOAD);
  console.log(`  ▸ 编辑器行对齐抽样：${JSON.stringify(align.pairs)}`);
  check('编辑器渲染文本与注入的原文逐行对齐（Node 侧算出的行号可直接对比）', align.checked > 0 && align.mismatched.length === 0, align);

  const scan = myScan(PAYLOAD);
  const expectLine = (p) => {
    const occ = scan.entries.get(p);
    if (!occ) return null;
    return lineColBySplit(PAYLOAD, occ[0].kind === 'key' ? occ[0].keyStart : occ[0].valueStart).line;
  };
  const BASE = '$.data.content.one_key_bind_card_bank_list';

  // 按 data-index 稳定操作树行（虚拟列表滚动/展开会让下标漂移，必须每次重新查询）
  const rowsDump = () => pageA.evaluate(() => [...document.querySelectorAll('.jw-tree-rows > div')].map((w) => ({
    i: Number(w.getAttribute('data-index')),
    k: (w.querySelector('.jw-node-row__key, .jw-node-row__root-title')?.textContent ?? '').trim(),
  })));
  const rowByIdx = (i) => pageA.locator(`.jw-tree-rows > div[data-index="${i}"]`);
  const findKeyRow = async (key, after = -1) => {
    const list = await rowsDump();
    const hit = list.find((r) => r.k === key && r.i > after);
    return hit ? { i: hit.i, k: hit.k, row: rowByIdx(hit.i) } : null;
  };
  const expandKey = async (key, after = -1) => {
    let f = await findKeyRow(key, after);
    if (!f) return null;
    if (!(await f.row.locator('.anticon-caret-down').count())) {
      await f.row.locator('.jw-node-row__arrow').click();
      await pageA.waitForTimeout(450);
      f = await findKeyRow(key, after);
    }
    return f;
  };
  const clickKey = async (f) => {
    if (!f) return null;
    await f.row.locator('.jw-node-row__key').first().click();
    await pageA.waitForTimeout(750);
    return f;
  };

  await expandKey('content');
  const bank = await expandKey('one_key_bind_card_bank_list');
  if (!bank) { check('[场景A] 数组行 one_key_bind_card_bank_list 可展开', false, {}); }
  const e1 = await findKeyRow('[1]', bank ? bank.i : -1);
  const e2 = await findKeyRow('[2]', bank ? bank.i : -1);
  console.log(`  ▸ 数组行 index=${bank?.i}，元素 [1] index=${e1?.i}，元素 [2] index=${e2?.i}`);

  const bugOffset = PAYLOAD.indexOf('"bank_uniq_code"');
  const bugLine = lineColBySplit(PAYLOAD, bugOffset).line;
  console.log(`  ▸ 旧实现 indexOf("bank_uniq_code") → offset ${bugOffset}（第 ${bugLine} 行）`);

  const caseData = [];
  const runCase = async (name, path, clickTarget, opts = {}) => {
    const expected = expectLine(path);
    const f = clickTarget();
    const target = await f;
    if (!target) { check(`[场景A] ${name}：可定位树行`, false, { path }); return; }
    const realId = opts.captureId ? await readNodeIdViaCopyPath(pageA, target.row) : undefined;
    await clickKey(target);
    const active = await readActive(pageA);
    const activeLine = active.gutter ? Number(active.gutter) : null;
    const rec = { name, path, realId, expectedLine: expected, activeLine, activeText: active.text, bugLine };
    caseData.push(rec);
    console.log(`  ▸ ${name}: ${realId !== undefined ? '真实 id=' + JSON.stringify(realId) + ' ' : ''}期望行=${expected} 活动行=${activeLine} 文本=${JSON.stringify((active.text ?? '').slice(0, 48))}`);
    if (realId !== undefined && !String(realId).startsWith('__unavailable__')) {
      check(`[场景A] ${name}：组件使用的 id 与期望 JSONPath 一致`, realId === path, { realId, path });
    }
    check(`[场景A] ${name}：活动行号 = 独立 oracle 期望行（${expected}）`, activeLine === expected, rec);
    if (opts.expectKey) {
      check(`[场景A] ${name}：活动行不是该 key 首次出现行（${bugLine}）—— 旧 indexOf 缺陷判据`, activeLine !== bugLine, rec);
      check(`[场景A] ${name}：活动行文本包含目标 key「${opts.expectKey}」`, (active.text ?? '').includes(opts.expectKey), rec);
    }
  };

  // 1) 数组元素行本身
  await runCase('数组元素行 [1]（元素起始行）', `${BASE}[1]`, () => findKeyRow('[1]', bank ? bank.i : -1));
  // 2) 元素 [1] 内的字段（用户报告的缺陷场景）
  await expandKey('[1]', bank ? bank.i : -1);
  await runCase('[1] 内字段 bank_uniq_code（用户报告场景）', `${BASE}[1].bank_uniq_code`,
    () => findKeyRow('bank_uniq_code', e1 ? e1.i : -1), { captureId: true, expectKey: 'bank_uniq_code' });
  // 3) 元素 [2] 内的字段（必须用「展开后」重新查到的 [2] 行下标，否则会落到 [1] 的 bank_name 上）
  const e2b = await expandKey('[2]', bank ? bank.i : -1);
  await runCase('[2] 内字段 bank_name', `${BASE}[2].bank_name`,
    () => findKeyRow('bank_name', e2b ? e2b.i : -1), { expectKey: 'bank_name' });
  // 4) 嵌套数组内的字段
  await expandKey('card_type', e1 ? e1.i : -1);
  await expandKey('[0]', e1 ? e1.i : -1);
  await runCase('[1].card_type[0].type（嵌套数组字段）', `${BASE}[1].card_type[0].type`,
    () => findKeyRow('type', e1 ? e1.i : -1), { expectKey: 'type' });

  const firstLine = caseData.find((c) => c.name.includes('bank_uniq_code'));
  check('[场景A] 缺陷的直接复现判据：[1].bank_uniq_code 的活动行 ≠ 首次出现行',
    !!firstLine && firstLine.activeLine !== bugLine, { firstLine, bugLine });
  await pageA.screenshot({ path: path.join(OUT, 'verify-locate-A.png') });

  // 折叠占位行
  const ell = pageA.locator('.jw-node-row', { has: pageA.locator('.jw-node__value--ellipsis') }).first();
  if (await ell.count()) {
    const expected = expectLine(BASE);
    const rowsBefore = await rowsDump();
    // 点「…N more items」文本本身（不要点右侧「展开全部」按钮，否则触发的是展开而非选中）
    await ell.locator('.jw-node__value--ellipsis').click();
    await pageA.waitForTimeout(800);
    const rowsAfter = await rowsDump();
    const active = await readActive(pageA);
    console.log(`  ▸ 折叠占位行：期望行=${expected}（父数组行）活动行=${active.gutter}；行数 ${rowsBefore.length}→${rowsAfter.length}`);
    check('[场景A] 折叠占位行回退到父数组所在行', Number(active.gutter) === expected, { expected, active, rowsBefore: rowsBefore.length, rowsAfter: rowsAfter.length });
    check('[场景A] 点击省略行触发的是「选中」而非「展开全部」（行数不应暴增）', rowsAfter.length <= rowsBefore.length + 5, { before: rowsBefore.length, after: rowsAfter.length });
    await pageA.screenshot({ path: path.join(OUT, 'verify-locate-ellipsis.png') });
  } else {
    check('[场景A] 折叠占位行存在', false, '未找到 .jw-node__value--ellipsis 行');
  }
  await ctxA.close();

  // ══ 场景 B：键含 . / [ ] / ' —— 树真实 id 形态探针 ══
  console.log('\n>>> 场景 B：键含特殊字符（树 id 形如 $.["a.b"]）');
  const filler = Array.from({ length: 40 }, (_, i) => `  "pad${i}": ${i},`).join('\n');
  // 特殊键放在文档最前面、对照组 normal 放在最后 → 目标行与控制行相距很远，「是否跳转」的观测无歧义
  const probeText = `{\n  "a.b": 1,\n  "arr[0]": 2,\n  "it's": 3,\n${filler}\n  "normal": 99\n}\n`;
  const probeScan = myScan(probeText);
  const probeLine = (p) => { const o = probeScan.entries.get(p); return o ? lineColBySplit(probeText, o[0].kind === 'key' ? o[0].keyStart : o[0].valueStart).line : null; };
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, permissions: ['clipboard-read', 'clipboard-write'] });
  const pageB = await ctxB.newPage();
  await attach(pageB);
  await pageB.addInitScript(({ pl, u }) => {
    localStorage.setItem('tool-bridge:json-workbench', pl);
    localStorage.setItem('user', JSON.stringify(u));
  }, { pl: probeText, u: USER });
  await pageB.goto(`${UI}/tools/json-workbench`, { waitUntil: 'domcontentloaded' });
  await pageB.waitForTimeout(2600);

  const probeCases = [
    // 行序：root=0, a.b=1, arr[0]=2, it's=3, pad0..pad39=4..43, normal=44
    { idx: 44, key: 'normal', treeId: '$.normal', expectLine: probeLine('$.normal'), control: true },
    // 注意：扫描器与 parseAndFlatten 同规则，特殊字符键的 path 形如 $.["a.b"]（点 + 方括号）
    { idx: 1, key: 'a.b', treeId: '$.["a.b"]', expectLine: probeLine('$.["a.b"]') },
    { idx: 2, key: 'arr[0]', treeId: '$.["arr[0]"]', expectLine: probeLine('$.["arr[0]"]') },
    { idx: 3, key: "it's", treeId: '$.["it\'s"]', expectLine: probeLine('$.["it\'s"]') },
  ];
  // 行按文档顺序排列：root=0，pad0..pad39=1..40，随后是 a.b / arr[0] / normal
  // 44 行超出视口 → 先把树面板滚到底，虚拟列表才会渲染末尾的对照组行；特殊键行在顶部
  await pageB.evaluate(() => { const p = document.querySelector('.jw-tree-panel'); if (p) p.scrollTop = p.scrollHeight; });
  await pageB.waitForTimeout(600);
  const dumpBottom = await pageB.evaluate(() => [...document.querySelectorAll('.jw-tree-rows > div')].map((w) => ({
    i: Number(w.getAttribute('data-index')),
    k: (w.querySelector('.jw-node-row__key')?.textContent ?? '').trim(),
  })));
  await pageB.evaluate(() => { const p = document.querySelector('.jw-tree-panel'); if (p) p.scrollTop = 0; });
  await pageB.waitForTimeout(500);
  const dumpTop = await pageB.evaluate(() => [...document.querySelectorAll('.jw-tree-rows > div')].map((w) => ({
    i: Number(w.getAttribute('data-index')),
    k: (w.querySelector('.jw-node-row__key')?.textContent ?? '').trim(),
  })));
  const dumpRows = [...dumpTop, ...dumpBottom];
  const tail = dumpRows.filter((r) => r.i <= 3 || r.i >= 44).sort((a, b) => a.i - b.i);
  console.log(`  ▸ 探针文档末尾行（data-index / 显示的 key）：${JSON.stringify(tail)}`);
  results.push({ name: '[场景B] 末尾行 key 显示', detail: tail });
  const probeData = [];
  for (let n = 0; n < probeCases.length; n++) {
    const pc = probeCases[n];
    const idx = pc.idx;
    // 虚拟列表：先把树面板滚到能渲染该行的位置，再取行
    await pageB.evaluate((i) => { const p = document.querySelector('.jw-tree-panel'); if (p) p.scrollTop = i >= 20 ? p.scrollHeight : 0; }, idx);
    await pageB.waitForTimeout(500);
    const row = pageB.locator(`.jw-tree-rows > div[data-index="${idx}"]`);
    if (!(await row.count())) { check(`[场景B] 键 ${pc.key} 的树行存在（data-index=${idx}）`, false, { pc, tail }); continue; }
    const realId = await readNodeIdViaCopyPath(pageB, row);
    // 每次都先把编辑器滚回顶部，保证「是否跳转」可观测
    await pageB.evaluate(() => { const s = document.querySelector('.cm-scroller'); if (s) s.scrollTop = 0; });
    await pageB.waitForTimeout(250);
    const before = await readActive(pageB);
    await row.locator('.jw-node-row__key').first().click();
    await pageB.waitForTimeout(800);
    const after = await readActive(pageB);
    const rec = { key: pc.key, displayedKey: tail.find((t) => t.i === idx)?.k, treeIndex: idx, realId, treeIdExpected: pc.treeId, expectLine: pc.expectLine, beforeLine: before.gutter, afterLine: after.gutter, afterText: after.text, scrollBefore: before.scrollTop, scrollAfter: after.scrollTop };
    probeData.push(rec);
    console.log(`  ▸ 键 ${JSON.stringify(pc.key)}（显示为 ${JSON.stringify(rec.displayedKey)}）：真实 id=${JSON.stringify(realId)} 期望行=${pc.expectLine} 点击后活动行=${after.gutter} 文本=${JSON.stringify((after.text ?? '').slice(0, 40))} scrollTop ${before.scrollTop}→${after.scrollTop}`);
    if (!String(realId).startsWith('__unavailable__')) {
      check(`[场景B] 键 ${pc.key}：树真实 id 与 safeKey 规则一致（${pc.treeId}）`, realId === pc.treeId, { realId, treeId: pc.treeId });
    } else {
      results.push({ name: `[场景B] 键 ${pc.key}：剪贴板 id 不可用（跳过 id 断言）`, detail: realId });
    }
  }
  const normalOk = probeData.find((p) => p.key === 'normal');
  check('[场景B] 对照组：普通键 normal 点击后能正确跳转（证明该场景下跳转链路本身可用）', normalOk && normalOk.afterLine === String(normalOk.expectLine), normalOk);
  for (const p of probeData.filter((x) => x.key !== 'normal')) {
    check(`[场景B] 键 ${JSON.stringify(p.key)}（树 id ${p.treeIdExpected}）点击后应跳转到第 ${p.expectLine} 行`,
      p.afterLine === String(p.expectLine), p);
  }
  await pageB.screenshot({ path: path.join(OUT, 'verify-locate-B-special-keys.png') });
  await ctxB.close();

  // ══ 场景 C（task-8）：D4 真实键名 __ellipsis__ 不得回退到父级；占位节点回退行为不变 ══
  console.log('\n>>> 场景 C：真实键名 __ellipsis__（D4 反例）与折叠占位共存');
  const CPAD = Array.from({ length: 3 }, (_, i) => `  "pad${i}": ${i},`).join('\n');
  const cText = '{\n  "__ellipsis__": 1,\n' + CPAD + '\n  "list": [\n'
    + Array.from({ length: 12 }, (_, i) => `    { "__ellipsis__": ${100 + i}, "id": ${i} }`).join(',\n')
    + '\n  ]\n}\n';
  const cScan = myScan(cText);
  const cLine = (p) => { const o = cScan.entries.get(p); return o ? lineColBySplit(cText, o[0].kind === 'key' ? o[0].keyStart : o[0].valueStart).line : null; };
  const ctxC = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, permissions: ['clipboard-read', 'clipboard-write'] });
  const pageC = await ctxC.newPage();
  await attach(pageC);
  await pageC.addInitScript(({ pl, u }) => {
    localStorage.setItem('tool-bridge:json-workbench', pl);
    localStorage.setItem('user', JSON.stringify(u));
  }, { pl: cText, u: USER });
  await pageC.goto(`${UI}/tools/json-workbench`, { waitUntil: 'domcontentloaded' });
  await pageC.waitForTimeout(2600);

  const cData = [];
  const clickIdx = async (i) => {
    const row = pageC.locator(`.jw-tree-rows > div[data-index="${i}"]`);
    if (!(await row.count())) return null;
    await row.locator('.jw-node-row__key').first().click();
    await pageC.waitForTimeout(800);
    return readActive(pageC);
  };
  const cDump = async () => pageC.evaluate(() => [...document.querySelectorAll('.jw-tree-rows > div')].map((w) => ({
    i: Number(w.getAttribute('data-index')),
    k: (w.querySelector('.jw-node-row__key')?.textContent ?? '').trim(),
    ellipsis: !!w.querySelector('.jw-node__value--ellipsis'),
  })));

  // C1 根上的真实 __ellipsis__ 键 → 必须落在该键所在行（不能是第 1 行/根）
  const expC1 = cLine('$.__ellipsis__');
  const a1 = await clickIdx(1);
  cData.push({ name: 'C1 根上的真实 __ellipsis__ 键', expect: expC1, active: a1?.gutter, text: a1?.text });
  console.log(`  ▸ C1 真实 __ellipsis__ 键：期望行 ${expC1}（不得为 1）活动行=${a1?.gutter} 文本=${JSON.stringify((a1?.text ?? '').slice(0, 40))}`);
  check('C1 真实键名 __ellipsis__ 点击后定位到该键所在行（D4 反例）', Number(a1?.gutter) === expC1 && Number(a1?.gutter) !== 1, cData[cData.length - 1]);

  // C2 展开 list → 点折叠占位行 → 必须回退到父数组行
  const dumpBefore = await cDump();
  const listIdx = dumpBefore.find((r) => r.k === 'list')?.i;
  let dumpC = dumpBefore;
  if (listIdx !== undefined) {
    const arrow = () => pageC.locator(`.jw-tree-rows > div[data-index="${listIdx}"] .jw-node-row__arrow`);
    await arrow().click();
    await pageC.waitForTimeout(800);
    dumpC = await cDump();
    if (dumpC.length <= dumpBefore.length) { // 未展开则再点一次（并记录箭头状态用于诊断）
      await arrow().click();
      await pageC.waitForTimeout(800);
      dumpC = await cDump();
    }
    const arrowHtml = await arrow().innerHTML().catch(() => 'n/a');
    console.log(`  ▸ 展开 list（data-index=${listIdx}）：行数 ${dumpBefore.length} → ${dumpC.length}，箭头=${JSON.stringify(String(arrowHtml).slice(0, 70))}`);
  } else {
    console.log(`  ▸ 未找到 list 行：${JSON.stringify(dumpBefore)}`);
  }
  const ph = dumpC.find((r) => r.ellipsis);
  const expC2 = cLine('$.list');
  if (ph) {
    await pageC.locator(`.jw-tree-rows > div[data-index="${ph.i}"] .jw-node__value--ellipsis`).click();
    await pageC.waitForTimeout(800);
    const a2 = await readActive(pageC);
    cData.push({ name: 'C2 折叠占位行（父级为数组）', expect: expC2, active: a2?.gutter, text: a2?.text });
    console.log(`  ▸ C2 折叠占位行（data-index=${ph.i}）：期望行 ${expC2}（父数组 list）活动行=${a2?.gutter}`);
    check('C2 占位节点回退行为不变：仍落到父数组行', Number(a2?.gutter) === expC2, cData[cData.length - 1]);
  } else {
    check('C2 折叠占位行存在（list 12 项 > 阈值 10）', false, { dumpC });
  }

  // C3 展开 list[0] → 点其中的真实 __ellipsis__ 键 → 必须落到该键自身所在行
  const dumpC2 = await cDump();
  const e0 = dumpC2.find((r) => r.k === '[0]');
  const expC3 = cLine('$.list[0].__ellipsis__');
  if (e0) {
    await pageC.locator(`.jw-tree-rows > div[data-index="${e0.i}"] .jw-node-row__arrow`).click();
    await pageC.waitForTimeout(600);
    const dumpC3 = await cDump();
    const child = dumpC3.find((r) => r.i > e0.i && r.k === '__ellipsis__');
    if (child) {
      const a3 = await clickIdx(child.i);
      cData.push({ name: 'C3 数组元素内的真实 __ellipsis__ 键', expect: expC3, active: a3?.gutter, text: a3?.text });
      console.log(`  ▸ C3 数组元素内真实 __ellipsis__ 键（data-index=${child.i}）：期望行 ${expC3} 活动行=${a3?.gutter} 文本=${JSON.stringify((a3?.text ?? '').slice(0, 40))}`);
      check('C3 数组元素内的真实 __ellipsis__ 键定位到自身所在行', Number(a3?.gutter) === expC3, cData[cData.length - 1]);
    } else {
      check('C3 找到 list[0] 内的 __ellipsis__ 子行', false, { dumpC3 });
    }
  } else {
    check('C3 找到 list[0] 行', false, { dumpC2 });
  }
  await pageC.screenshot({ path: path.join(OUT, 'verify-locate-C-ellipsis-key.png') });
  await ctxC.close();

  await browser.close();
  const ev = { pass, fail, alignment: align, caseData, probeData, cData, payloadBugLine: bugLine, results };
  fs.writeFileSync(path.join(OUT, 'verify-locate-browser-evidence.json'), JSON.stringify(ev, null, 2));
  console.log(`\n===== 浏览器验收：通过 ${pass} / 失败 ${fail} =====`);
  console.log(`证据：${path.join(OUT, 'verify-locate-browser-evidence.json')}`);
  process.exit(fail > 0 ? 1 : 0);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });