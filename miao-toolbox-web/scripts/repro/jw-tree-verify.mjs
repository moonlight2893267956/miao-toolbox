/**
 * JSON 工作台树形视图 —— 行布局不变量验收脚本
 *
 * 前置：前端 dev server 已在 5173；后端可不在线（登录走 mock 拦截）。
 * 用法：cd miao-toolbox-web && node scripts/repro/jw-tree-verify.mjs
 *
 * 校验的不变量（对应缺陷「展开多层后行错乱/重叠」）：
 *   IV1 行高恒定：每个已渲染行的真实高度 = 28px
 *   IV2 虚拟定位自洽：相邻下标行的 translateY 差 = 上一行高度（不超过 0.5px）
 *   IV3 无行重叠：任意两行矩形纵向不重叠
 *   IV4 类型徽标不跨行重叠
 *   IV5 行 DOM 顺序与 data-index 顺序一致
 * 覆盖场景：桥接进入 → 逐层展开 → 展开全部 → 折叠 → 滚动 → 切换视图 → 选中行（平滑滚动）→ 刷新恢复
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAYLOAD = fs.readFileSync(path.join(__dirname, 'payload-cashier.json'), 'utf8');
const UI = process.env.UI_BASE ?? 'http://localhost:5173';
const OUT = process.env.OUT_DIR ?? '/tmp/jw-repro';
const ROW_HEIGHT = 28;
const EPS = 0.5;
fs.mkdirSync(OUT, { recursive: true });

let passed = 0;
let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✅ ${name}`); passed++; } else { console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); failed++; }
};

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: '1', exp: Math.floor(Date.now() / 1000) + 7200 })}.sig`;
const USER = { id: 1, username: 'verify', email: 'v@example.com', emailVerified: true, roles: [{ id: 1, code: 'SUPER_ADMIN', name: '超级管理员' }], githubUsername: null, googleUsername: null, avatarUrl: null };

/** 采集所有已渲染行的几何信息（纯 DOM，不依赖任何调试钩子） */
const collect = () => {
  const wraps = [...document.querySelectorAll('.jw-tree-rows > div')];
  const rows = wraps.map((w) => {
    const rect = w.getBoundingClientRect();
    const row = w.querySelector('.jw-node-row');
    const key = row?.querySelector('.jw-node-row__key, .jw-node-row__root-title');
    const badge = row?.querySelector('.jw-badge');
    const br = badge?.getBoundingClientRect();
    const m = /translateY\(([-\d.]+)px\)/.exec(w.getAttribute('style') ?? '');
    return {
      index: Number(w.getAttribute('data-index')),
      top: Math.round(rect.top * 100) / 100,
      height: Math.round(rect.height * 100) / 100,
      translateY: m ? Number(m[1]) : null,
      label: (key?.textContent ?? '').trim().slice(0, 36),
      badge: badge?.textContent ?? null,
      badgeTop: br ? Math.round(br.top * 100) / 100 : null,
      badgeBottom: br ? Math.round(br.bottom * 100) / 100 : null,
      badgeLeft: br ? Math.round(br.left * 100) / 100 : null,
      badgeRight: br ? Math.round(br.right * 100) / 100 : null,
    };
  });
  return rows;
};

/** 对一次快照做全部不变量校验，返回失败明细 */
function checkInvariants(rows) {
  const bad = { height: [], step: [], overlap: [], badge: [], order: [] };
  const byIndex = [...rows].sort((a, b) => a.index - b.index);
  const byTop = [...rows].sort((a, b) => a.top - b.top || a.index - b.index);

  for (const r of byTop) {
    if (Math.abs(r.height - ROW_HEIGHT) > EPS) bad.height.push({ index: r.index, h: r.height, label: r.label });
  }
  for (let i = 0; i < byIndex.length - 1; i++) {
    const cur = byIndex[i];
    const next = byIndex[i + 1];
    if (next.index !== cur.index + 1) continue;
    if (cur.translateY === null || next.translateY === null) continue;
    const delta = Math.round((next.translateY - cur.translateY) * 100) / 100;
    if (Math.abs(delta - cur.height) > EPS) {
      bad.step.push({ index: cur.index, delta, height: cur.height, label: cur.label });
    }
  }
  for (let i = 0; i < byTop.length - 1; i++) {
    const cur = byTop[i];
    const next = byTop[i + 1];
    if (next.top < cur.top + cur.height - EPS) {
      bad.overlap.push({ a: cur.index, aLabel: cur.label, b: next.index, bLabel: next.label, px: Math.round((cur.top + cur.height - next.top) * 100) / 100 });
    }
  }
  const badges = byTop.filter((r) => r.badgeTop !== null);
  for (let i = 0; i < badges.length; i++) {
    for (let j = i + 1; j < badges.length; j++) {
      const a = badges[i];
      const b = badges[j];
      if (Math.abs(a.top - b.top) < EPS) continue;
      const v = Math.min(a.badgeBottom, b.badgeBottom) - Math.max(a.badgeTop, b.badgeTop);
      const h = Math.min(a.badgeRight, b.badgeRight) - Math.max(a.badgeLeft, b.badgeLeft);
      if (v > EPS && h > EPS) bad.badge.push({ a: a.index, aBadge: a.badge, b: b.index, bBadge: b.badge });
    }
  }
  for (let i = 0; i < byTop.length - 1; i++) {
    if (byTop[i].index > byTop[i + 1].index) bad.order.push({ a: byTop[i].index, b: byTop[i + 1].index });
  }
  return bad;
}

async function assertScene(page, scene, shot = true) {
  const rows = await page.evaluate(collect);
  const bad = checkInvariants(rows);
  const total = Object.values(bad).reduce((n, arr) => n + arr.length, 0);
  ok(`[${scene}] IV1 行高恒为 ${ROW_HEIGHT}px（${rows.length} 行）`, bad.height.length === 0, JSON.stringify(bad.height.slice(0, 3)));
  ok(`[${scene}] IV2 相邻行定位步长 = 行高`, bad.step.length === 0, JSON.stringify(bad.step.slice(0, 3)));
  ok(`[${scene}] IV3 无行重叠`, bad.overlap.length === 0, JSON.stringify(bad.overlap.slice(0, 3)));
  ok(`[${scene}] IV4 徽标不跨行重叠`, bad.badge.length === 0, JSON.stringify(bad.badge.slice(0, 3)));
  ok(`[${scene}] IV5 行序与下标一致`, bad.order.length === 0, JSON.stringify(bad.order.slice(0, 3)));
  if (total > 0 && shot) await page.screenshot({ path: path.join(OUT, `verify-fail-${scene}.png`) });
  return total;
}

async function toggleRow(page, key) {
  const row = page.locator('.jw-node-row', { has: page.locator(`.jw-node-row__key:text-is("${key}")`) }).first();
  try {
    await row.waitFor({ state: 'visible', timeout: 8000 });
  } catch {
    console.log(`  ⚠️ 未找到可点击行「${key}」，跳过该步`);
    return false;
  }
  await row.locator('.jw-node-row__arrow').click();
  await page.waitForTimeout(450);
  return true;
}

/** 确保某行处于「已展开」状态（其子行可见） */
async function ensureExpanded(page, key, childKey) {
  const child = page.locator('.jw-node-row', { has: page.locator(`.jw-node-row__key:text-is("${childKey}")`) }).first();
  if (await child.count()) return;
  await toggleRow(page, key);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1234, height: 776 } });
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

  console.log(`>>> 目标：${UI}  行高基准 ${ROW_HEIGHT}px`);
  await page.goto(`${UI}/tools/json-workbench`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await assertScene(page, '1-桥接进入');

  for (const key of ['content', 'market_info', 'one_key_bind_card_bank_list']) {
    await toggleRow(page, key);
    await assertScene(page, `2-展开-${key}`);
  }

  // 展开全部（大数组 40 项）
  const expandAll = page.locator('.jw-ellipsis-expand-btn').first();
  if (await expandAll.count()) {
    await expandAll.click();
    await page.waitForTimeout(600);
    await assertScene(page, '3-展开全部');
  } else {
    console.log('  ⚠️ 未找到「展开全部」按钮，跳过');
  }

  // 滚动到底部再回到中间
  await page.evaluate(() => { const el = document.querySelector('.jw-tree-panel'); if (el) el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(600);
  await assertScene(page, '4-滚动到底');
  await page.evaluate(() => { const el = document.querySelector('.jw-tree-panel'); if (el) el.scrollTop = Math.floor(el.scrollHeight / 2); });
  await page.waitForTimeout(600);
  await assertScene(page, '5-滚动到中间');

  // 折叠回去（数组行 + market_info）
  await page.evaluate(() => { const el = document.querySelector('.jw-tree-panel'); if (el) el.scrollTop = 0; });
  await page.waitForTimeout(400);
  await toggleRow(page, 'one_key_bind_card_bank_list');
  await assertScene(page, '6-折叠数组');
  await toggleRow(page, 'market_info');
  await assertScene(page, '7-折叠-market_info');

  // 切换视图：树形 → 分栏 → 文本 → 树形
  await page.locator('.jw-view-toggle__btn', { hasText: '树形' }).click();
  await page.waitForTimeout(700);
  await assertScene(page, '8-树形视图');
  await page.locator('.jw-view-toggle__btn', { hasText: '文本' }).click();
  await page.waitForTimeout(500);
  await page.locator('.jw-view-toggle__btn', { hasText: '树形' }).click();
  await page.waitForTimeout(700);
  await assertScene(page, '9-切回树形');

  // 选中节点会触发 smooth scrollToIndex（测量被跳过的经典场景）
  await ensureExpanded(page, 'content', 'market_info');
  await ensureExpanded(page, 'market_info', 'activities');
  const target = page.locator('.jw-node-row', { has: page.locator('.jw-node-row__key:text-is("one_key_bind_card_bank_list")') }).first();
  if (await target.count()) {
    await target.scrollIntoViewIfNeeded();
    await target.click();
    await page.waitForTimeout(900);
    await assertScene(page, '10-选中行平滑滚动后');
  }

  // 刷新后重新解析
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await assertScene(page, '11-刷新后');

  console.log(`\n===== 通过 ${passed} / 失败 ${failed} =====`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });