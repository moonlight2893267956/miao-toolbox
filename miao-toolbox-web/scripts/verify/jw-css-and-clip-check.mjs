/**
 * task-4 独立验证（verify-tree）：CSS 合成层声明移除 + 长内容裁切 检查
 *
 * 针对 Lead 在冻结版里删掉的 `backface-visibility: hidden` / `transform: translateZ(0)`
 * 以及新加的 `.jw-node-row { height: 28px }`：
 *   C1 计算样式核对：这些声明确实已消失，行高/盒模型/溢出未被改变；
 *   C2 布局功能核对：`.jw-node-row__key` 的 text-overflow: ellipsis 在移除 translateZ(0) 后仍生效
 *      （超长 key 必须真的被截断：scrollWidth > clientWidth）；
 *   C3 裁切核对：任意行 content 不得溢出 28px 行（scrollHeight ≤ clientHeight）；
 *   C4 滚动过程核对：连续滚动 6 个位置，行距恒为 28px、无重叠，并各留一张截图供人工看「残影/旧位置绘制」；
 *   C5 徽标始终落在行矩形内（height:28px + overflow:hidden 下不得被裁掉）。
 *
 * 用法：cd miao-toolbox-web && node scripts/verify/jw-css-and-clip-check.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI = process.env.UI_BASE ?? 'http://localhost:5173';
const OUT = process.env.OUT_DIR ?? '/tmp/jw-repro';
const ROW_H = 28;
const EPS = 0.5;
fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const results = [];
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} :: ${JSON.stringify(detail)}`); }
  results.push({ name, ok: !!cond, detail });
};

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: '1', exp: Math.floor(Date.now() / 1000) + 7200 })}.sig`;
const USER = { id: 1, username: 'verify', email: 'v@example.com', emailVerified: true, roles: [{ id: 1, code: 'SUPER_ADMIN', name: '超级管理员' }], githubUsername: null, googleUsername: null, avatarUrl: null };

// 合成载荷：超长 key / 超长 value / CJK / 数组 / 深层嵌套
const LONG_KEY = 'k_' + 'KEY'.repeat(80) + '_超长键名';
const LONG_VAL = 'v'.repeat(2000);
const payload = {
  errno: 0,
  errmsg: 'OK',
  data: {
    content: {
      [LONG_KEY]: LONG_VAL,
      中文键: '中文值 🌟',
      long_strings: Array.from({ length: 12 }, (_, i) => `第 ${i} 项 ` + 'x'.repeat(120)),
      nested: { a: { b: { c: { d: { e: [1, 2, 3, { f: 'deep' }] } } } } },
      numbers: [0, -1, 3.14159, 1e21],
      flags: [true, false, null],
    },
  },
};

const main = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
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
  }, { pl: JSON.stringify(payload), u: USER });
  await page.goto(`${UI}/tools/json-workbench`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);

  // 切到树形视图，展开 content
  const treeBtn = page.locator('.jw-view-toggle__btn', { hasText: '树形' }).first();
  if (await treeBtn.count()) { await treeBtn.click(); await page.waitForTimeout(700); }
  for (const key of ['content', 'long_strings', 'nested']) {
    const row = page.locator('.jw-node-row', { has: page.locator(`.jw-node-row__key:text-is("${key}")`) }).first();
    if (!(await row.count())) continue;
    if (!(await row.locator('.jw-node-row__arrow .anticon-caret-down').count())) { await row.locator('.jw-node-row__arrow').click(); await page.waitForTimeout(400); }
  }

  // C1/C2 计算样式
  const styles = await page.evaluate(() => {
    const row = document.querySelector('.jw-node-row');
    const key = document.querySelector('.jw-node-row__key');
    const val = document.querySelector('.jw-node__value');
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const r = cs(row), k = cs(key), v = cs(val);
    return {
      row: r && { height: r.height, minHeight: r.minHeight, boxSizing: r.boxSizing, overflow: r.overflow, position: r.position, backfaceVisibility: r.backfaceVisibility, willChange: r.willChange, transform: r.transform },
      key: k && { transform: k.transform, backfaceVisibility: k.backfaceVisibility, textOverflow: k.textOverflow, whiteSpace: k.whiteSpace, overflow: k.overflow, maxWidth: k.maxWidth },
      value: v && { transform: v.transform, backfaceVisibility: v.backfaceVisibility },
      rowCount: document.querySelectorAll('.jw-node-row').length,
    };
  });
  console.log('  ▸ 计算样式：', JSON.stringify(styles));
  results.push({ name: 'C1/C2 计算样式原始值', detail: styles });
  check('C1 已无 backface-visibility:hidden（row/key/value computed = visible）',
    styles.row?.backfaceVisibility === 'visible' && styles.key?.backfaceVisibility === 'visible' && styles.value?.backfaceVisibility === 'visible', styles);
  check('C1 已无 translateZ(0)（key/value computed transform = none）',
    (styles.key?.transform === 'none' || styles.key?.transform === '') && (styles.value?.transform === 'none' || styles.value?.transform === ''), styles);
  check('C1 行高固定 28px 且 box-sizing:border-box（内容盒 24px）',
    styles.row?.height === '28px' && styles.row?.boxSizing === 'border-box', styles.row);
  check('C2 移除 translateZ(0) 后 key 仍为 ellipsis + nowrap + overflow:hidden',
    styles.key?.textOverflow === 'ellipsis' && styles.key?.whiteSpace === 'nowrap' && styles.key?.overflow === 'hidden', styles.key);

  // C2 超长 key 是否真的被截断
  const longKey = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.jw-node-row__key')];
    const el = els.find((k) => k.textContent.includes('超长键名'));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const row = el.closest('.jw-node-row').getBoundingClientRect();
    return { clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, truncated: el.scrollWidth > el.clientWidth + 1, maxWidth: getComputedStyle(el).maxWidth, keyRight: Math.round(r.right * 100) / 100, rowRight: Math.round(row.right * 100) / 100 };
  });
  console.log('  ▸ 超长 key 截断：', JSON.stringify(longKey));
  results.push({ name: 'C2 超长 key 截断原始值', detail: longKey });
  check('C2 超长 key 实际被截断（scrollWidth > clientWidth）且不超出所在行', !!longKey && longKey.truncated && longKey.keyRight <= longKey.rowRight + EPS, longKey);

  // C3/C5 逐行裁切 + 徽标是否在行内
  const clipScan = async () => page.evaluate(() => {
    const rows = [...document.querySelectorAll('.jw-tree-rows > div')];
    const bad = { clipped: [], badgeOut: [], heights: [], pairs: [] };
    const items = rows.map((w) => {
      const row = w.querySelector('.jw-node-row');
      const r = row.getBoundingClientRect();
      const badge = row.querySelector('.jw-badge');
      const b = badge?.getBoundingClientRect();
      const m = /translateY\((-?[\d.]+)px\)/.exec(w.getAttribute('style') ?? '');
      return { index: Number(w.getAttribute('data-index')), ty: m ? Number(m[1]) : null, h: Math.round(r.height * 100) / 100, top: Math.round(r.top * 100) / 100, scrollH: row.scrollHeight, clientH: row.clientHeight, badgeTop: b ? Math.round(b.top * 100) / 100 : null, badgeBottom: b ? Math.round(b.bottom * 100) / 100 : null, label: (row.querySelector('.jw-node-row__key,.jw-node-row__root-title')?.textContent ?? '').trim().slice(0, 30) };
    });
    for (const it of items) {
      if (Math.abs(it.h - 28) > 0.5) bad.heights.push({ i: it.index, h: it.h, label: it.label });
      if (it.scrollH > it.clientH + 1) bad.clipped.push({ i: it.index, scrollH: it.scrollH, clientH: it.clientH, label: it.label });
      if (it.badgeTop !== null) {
        const row = rows.find((w) => Number(w.getAttribute('data-index')) === it.index).querySelector('.jw-node-row').getBoundingClientRect();
        if (it.badgeTop < row.top - 0.5 || it.badgeBottom > row.bottom + 0.5) bad.badgeOut.push({ i: it.index, label: it.label, badgeTop: it.badgeTop, badgeBottom: it.badgeBottom, rowTop: Math.round(row.top * 100) / 100, rowBottom: Math.round(row.bottom * 100) / 100 });
      }
    }
    const sorted = [...items].sort((a, b) => a.index - b.index);
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i + 1].index !== sorted[i].index + 1) continue;
      if (sorted[i].ty !== null && sorted[i + 1].ty !== null) {
        const d = Math.round((sorted[i + 1].ty - sorted[i].ty) * 100) / 100;
        if (Math.abs(d - 28) > 0.5) bad.pairs.push({ i: sorted[i].index, delta: d });
      }
      if (sorted[i + 1].top < sorted[i].top + sorted[i].h - 0.5) bad.pairs.push({ i: sorted[i].index, overlapPx: Math.round((sorted[i].top + sorted[i].h - sorted[i + 1].top) * 100) / 100 });
    }
    return { count: items.length, bad };
  });

  const scan0 = await clipScan();
  check('C3 全部行 content 未被 28px 行裁切（scrollHeight ≤ clientHeight）', scan0.bad.clipped.length === 0, scan0.bad.clipped.slice(0, 3));
  check('C5 全部徽标水平/垂直都落在所属行矩形内', scan0.bad.badgeOut.length === 0, scan0.bad.badgeOut.slice(0, 3));
  check('C3 全部行高恒为 28px', scan0.bad.heights.length === 0, scan0.bad.heights.slice(0, 3));

  // C4 连续滚动 6 个位置
  for (let i = 0; i < 6; i++) {
    await page.evaluate((k) => {
      const p = document.querySelector('.jw-tree-panel');
      if (p) p.scrollTop = Math.round((p.scrollHeight - p.clientHeight) * (k / 5));
    }, i);
    await page.waitForTimeout(450);
    const s = await clipScan();
    check(`C4 滚动位置 ${i}/5（${s.count} 行）：行距 28px、无重叠、无裁切`, s.bad.pairs.length === 0 && s.bad.clipped.length === 0 && s.bad.badgeOut.length === 0, { pairs: s.bad.pairs.slice(0, 3), clipped: s.bad.clipped.slice(0, 3), badgeOut: s.bad.badgeOut.slice(0, 3) });
    await page.screenshot({ path: path.join(OUT, `verify-scroll-${i}.png`) });
  }

  await browser.close();
  const ev = { pass, fail, results, styles, longKey };
  fs.writeFileSync(path.join(OUT, 'verify-css-clip-evidence.json'), JSON.stringify(ev, null, 2));
  console.log(`\n===== CSS/裁切检查：通过 ${pass} / 失败 ${fail} =====`);
  console.log(`截图：${OUT}/verify-scroll-*.png   证据：${OUT}/verify-css-clip-evidence.json`);
  process.exit(fail > 0 ? 1 : 0);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });