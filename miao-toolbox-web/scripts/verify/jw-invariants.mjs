/**
 * task-4 独立验证（verify-tree）：JSON 工作台树形视图「行布局不变量」验收  v2
 *
 * 完全独立于 Lead 的 scripts/repro/jw-tree-verify.mjs：采集器 / 判定 / 场景编排 / 证据结构均自写。
 * v1 → v2 修正（均为我方脚本缺陷，非产品缺陷，v1 已删除）：
 *   - 展开态判定误用 .anticon-right/.anticon-down；antd 实际类名为 .anticon-caret-right/.anticon-caret-down
 *     → v1 把「已展开」的行误判为折叠并点击，反而折叠了父行，导致后续目标行定位失败（8 项 ❌ 中的 5 项）；
 *   - IV7 误写成 boxTop + ty - scrollTop（重复扣减 scrollTop，误差恰好 = scrollTop）
 *     → v2 改为同容器内的视口自洽式 top == boxTop + ty，并按「每个 .jw-tree-rows 容器分组」校验。
 *
 * 前置：前端 dev server 已在 http://localhost:5173；后端可不在线（登录走 mock）。
 * 用法：cd miao-toolbox-web && node scripts/verify/jw-invariants.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAYLOAD = fs.readFileSync(path.join(__dirname, '..', 'repro', 'payload-cashier.json'), 'utf8');
const UI = process.env.UI_BASE ?? 'http://localhost:5173';
const OUT = process.env.OUT_DIR ?? '/tmp/jw-repro';
const ROW_H = 28;
const EPS = 0.5;
fs.mkdirSync(OUT, { recursive: true });

const evidence = { startedAt: new Date().toISOString(), ui: UI, scenes: [], failures: [], containers: [] };
let pass = 0;
let fail = 0;
const check = (scene, name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✅ [${scene}] ${name}`); }
  else {
    fail++;
    console.log(`  ❌ [${scene}] ${name} :: ${JSON.stringify(detail)}`);
    evidence.failures.push({ scene, name, detail });
  }
};
const r2 = (n) => Math.round(n * 100) / 100;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: '1', exp: Math.floor(Date.now() / 1000) + 7200 })}.sig`;
const USER = {
  id: 1, username: 'verify', email: 'v@example.com', emailVerified: true,
  roles: [{ id: 1, code: 'SUPER_ADMIN', name: '超级管理员' }],
  githubUsername: null, googleUsername: null, avatarUrl: null,
};

/** 采集器（页面内执行）：按 .jw-tree-rows 容器分组，绝不跨容器混算 */
const COLLECT = () => {
  const rr = (n) => Math.round(n * 100) / 100;
  const re = /translateY\((-?[\d.]+)px\)/;
  const boxes = [...document.querySelectorAll('.jw-tree-rows')];
  const panels = [...document.querySelectorAll('.jw-tree-panel')];
  const groups = boxes.map((box, gi) => {
    const panel = box.closest('.jw-tree-panel');
    const panelRect = panel?.getBoundingClientRect();
    const rows = [...box.children].map((w) => {
      const rect = w.getBoundingClientRect();
      const row = w.querySelector('.jw-node-row');
      const rowRect = row?.getBoundingClientRect();
      const badge = row?.querySelector('.jw-badge');
      const bRect = badge?.getBoundingClientRect();
      const keyEl = row?.querySelector('.jw-node-row__key, .jw-node-row__root-title');
      const m = re.exec(w.getAttribute('style') ?? '');
      return {
        index: Number(w.getAttribute('data-index')),
        ty: m ? Number(m[1]) : null,
        top: rr(rect.top), left: rr(rect.left), width: rr(rect.width), boxH: rr(rect.height),
        rowH: rowRect ? rr(rowRect.height) : null,
        label: (keyEl?.textContent ?? '').trim().slice(0, 40),
        isEllipsis: !!row?.querySelector('.jw-node__value--ellipsis'),
        arrowState: row?.querySelector('.anticon-caret-down') ? 'down' : row?.querySelector('.anticon-caret-right') ? 'right' : 'none',
        badge: badge?.textContent ?? null,
        badgeTop: bRect ? rr(bRect.top) : null, badgeBottom: bRect ? rr(bRect.bottom) : null,
        badgeLeft: bRect ? rr(bRect.left) : null, badgeRight: bRect ? rr(bRect.right) : null,
        rowScrollH: row ? row.scrollHeight : null, rowClientH: row ? row.clientHeight : null,
      };
    });
    const boxRect = box.getBoundingClientRect();
    return {
      group: gi,
      panelVisible: !!panelRect && panelRect.height > 0,
      panelHeight: panelRect ? rr(panelRect.height) : null,
      scrollTop: panel ? rr(panel.scrollTop) : null,
      boxTop: rr(boxRect.top),
      boxHeight: rr(boxRect.height),
      boxStyleHeight: box.style.height,
      domOrder: [...box.children].map((w) => Number(w.getAttribute('data-index'))),
      rows,
    };
  });
  return { groups, panelCount: panels.length, boxCount: boxes.length };
};

/** 独立判定（对单个容器分组）：返回各类违规明细 */
function judge(g) {
  const bad = { height: [], rowHeight: [], step: [], overlap: [], overlapScreen: [], badge: [], order: [], total: [], screen: [], clip: [] };
  const rows = g.rows;
  const byIdx = [...rows].sort((a, b) => a.index - b.index);

  // IV1 外层定位行与内层 .jw-node-row 高度都必须恒为 28
  for (const r of rows) {
    if (Math.abs(r.boxH - ROW_H) > EPS) bad.height.push({ i: r.index, h: r.boxH, label: r.label });
    if (r.rowH !== null && Math.abs(r.rowH - ROW_H) > EPS) bad.rowHeight.push({ i: r.index, h: r.rowH, label: r.label });
  }
  // IV2 相邻下标的 translateY 差 = 上一行的真实高度
  for (let i = 0; i < byIdx.length - 1; i++) {
    const a = byIdx[i], b = byIdx[i + 1];
    if (b.index !== a.index + 1 || a.ty === null || b.ty === null) continue;
    const d = r2(b.ty - a.ty);
    if (Math.abs(d - a.boxH) > EPS) bad.step.push({ i: a.index, delta: d, upperH: a.boxH, label: a.label });
  }
  // IV3 相邻下标行不重叠：模型空间（translateY）与屏幕空间（rect.top）双检
  for (let i = 0; i < byIdx.length - 1; i++) {
    const a = byIdx[i], b = byIdx[i + 1];
    if (a.ty !== null && b.ty !== null && b.ty < a.ty + a.boxH - EPS) {
      bad.overlap.push({ a: a.index, b: b.index, px: r2(a.ty + a.boxH - b.ty), aLabel: a.label, bLabel: b.label });
    }
    if (b.top < a.top + a.boxH - EPS) {
      bad.overlapScreen.push({ a: a.index, b: b.index, px: r2(a.top + a.boxH - b.top), aLabel: a.label, bLabel: b.label });
    }
  }
  // IV4 类型徽标不跨行重叠
  const badges = rows.filter((r) => r.badgeTop !== null);
  for (let i = 0; i < badges.length; i++) {
    for (let j = i + 1; j < badges.length; j++) {
      const a = badges[i], b = badges[j];
      if (Math.abs(a.badgeTop - b.badgeTop) < 0.01) continue;
      const v = Math.min(a.badgeBottom, b.badgeBottom) - Math.max(a.badgeTop, b.badgeTop);
      const h = Math.min(a.badgeRight, b.badgeRight) - Math.max(a.badgeLeft, b.badgeLeft);
      if (v > EPS && h > EPS) bad.badge.push({ a: a.index, b: b.index, aBadge: a.badge, bBadge: b.badge, vPx: r2(v) });
    }
  }
  // IV5 DOM 顺序与 data-index 严格递增（唯一且单调）
  for (let i = 0; i < g.domOrder.length - 1; i++) {
    if (!(g.domOrder[i] < g.domOrder[i + 1])) bad.order.push({ pos: i, cur: g.domOrder[i], next: g.domOrder[i + 1] });
  }
  // IV6 虚拟总高度必须是 28 的整数倍（任何一行缓存了非 28 的尺寸都会破坏它），且不小于已渲染最大下标所需高度
  const totalH = Number(String(g.boxStyleHeight).replace('px', ''));
  const rem = Math.abs(totalH % ROW_H);
  if (!(rem < 0.01 || Math.abs(rem - ROW_H) < 0.01)) bad.total.push({ totalH, rem: r2(rem), rows: rows.length });
  const maxIdx = rows.length ? Math.max(...rows.map((r) => r.index)) : -1;
  if (totalH < (maxIdx + 1) * ROW_H - EPS) bad.total.push({ totalH, need: r2((maxIdx + 1) * ROW_H), note: 'totalSize < 已渲染最大下标所需高度' });
  // IV7 视口自洽：rect.top == 同一容器 top + translateY（不重复扣 scrollTop）
  for (const r of rows) {
    if (r.ty === null) continue;
    const expected = g.boxTop + r.ty;
    if (Math.abs(r.top - expected) > 1.0) bad.screen.push({ i: r.index, top: r.top, expected: r2(expected), label: r.label });
  }
  // IV8 行内容不得被 height:28px + overflow:hidden 裁切（scrollHeight 不得超过 clientHeight）
  for (const r of rows) {
    if (r.rowScrollH === null || r.rowClientH === null) continue;
    if (r.rowScrollH > r.rowClientH + 1) {
      bad.clip.push({ i: r.index, scrollH: r.rowScrollH, clientH: r.rowClientH, label: r.label });
    }
  }
  return bad;
}

const IV_NAMES = {
  height: `IV1 定位行高恒为 ${ROW_H}px`, rowHeight: `IV1b 内层 .jw-node-row 高恒为 ${ROW_H}px`,
  step: 'IV2 相邻行定位步长 = 上行真实高度', overlap: 'IV3a 模型空间无重叠',
  overlapScreen: 'IV3b 屏幕空间无重叠', badge: 'IV4 类型徽标不跨行重叠',
  order: 'IV5 DOM 顺序与 data-index 一致', total: 'IV6 虚拟总高为 28 整数倍',
  screen: 'IV7 视口位置 = 容器顶 + translateY',
  clip: 'IV8 行内容未被 height:28px+overflow:hidden 裁切',
};

async function assertScene(page, scene, { shot = true, extra = null } = {}) {
  await page.waitForTimeout(120);
  const snap = await page.evaluate(COLLECT);
  evidence.containers.push({
    scene, panelCount: snap.panelCount, boxCount: snap.boxCount,
    groups: snap.groups.map((g) => ({ group: g.group, panelVisible: g.panelVisible, scrollTop: g.scrollTop, rows: g.rows.length })),
  });
  const visible = snap.groups.filter((g) => g.panelVisible && g.rows.length > 0);
  if (!visible.length) {
    check(scene, '存在可见的树行容器', false, { panelCount: snap.panelCount, boxCount: snap.boxCount });
    evidence.scenes.push({ scene, groups: snap.groups.length, note: 'no visible rows' });
    return { snap };
  }
  for (const g of visible) {
    const bad = judge(g);
    const record = { scene, group: g.group, rows: g.rows.length, scrollTop: g.scrollTop, boxHeight: g.boxHeight, boxStyleHeight: g.boxStyleHeight, bad: {} };
    for (const k of Object.keys(IV_NAMES)) {
      record.bad[k] = bad[k].slice(0, 5);
      check(scene, `[容器${g.group}] ${IV_NAMES[k]}（${g.rows.length} 行）`, bad[k].length === 0, bad[k].slice(0, 3));
    }
    evidence.scenes.push(record);
  }
  if (extra) evidence.scenes.push({ scene, extra: extra(snap) });
  if (shot) await page.screenshot({ path: path.join(OUT, `verify-inv-${scene}.png`) });
  return { snap };
}

// ─── 操作辅助 ────────────────────────────────────────

const keySel = (key) => `.jw-node-row__key:text-is("${key}")`;
const rowByKey = (page, key) => page.locator('.jw-node-row', { has: page.locator(keySel(key)) }).first();

/** 在可见树面板内查找某 key 的行（先回顶再向下步进，有界） */
async function findRow(page, key) {
  const r = rowByKey(page, key);
  if (await r.count()) return r;
  await page.evaluate(() => {
    [...document.querySelectorAll('.jw-tree-panel')].filter((p) => p.getBoundingClientRect().height > 0).forEach((p) => { p.scrollTop = 0; });
  });
  await page.waitForTimeout(150);
  for (let i = 0; i < 80; i++) {
    if (await r.count()) return r;
    await page.evaluate(() => {
      [...document.querySelectorAll('.jw-tree-panel')].filter((p) => p.getBoundingClientRect().height > 0).forEach((p) => { p.scrollTop += 28 * 8; });
    });
    await page.waitForTimeout(80);
  }
  return r;
}

const isExpanded = async (row) => (await row.locator('.jw-node-row__arrow .anticon-caret-down').count()) > 0;

async function ensureExpanded(page, key) {
  const r = await findRow(page, key);
  if (!(await r.count())) return false;
  if (await isExpanded(r)) return true;
  await r.locator('.jw-node-row__arrow').click();
  await page.waitForTimeout(400);
  return isExpanded(r);
}

async function collapse(page, key) {
  const r = await findRow(page, key);
  if (!(await r.count())) return false;
  if (!(await isExpanded(r))) return true;
  await r.locator('.jw-node-row__arrow').click();
  await page.waitForTimeout(400);
  return !(await isExpanded(r));
}

async function setView(page, label) {
  const btn = page.locator('.jw-view-toggle__btn', { hasText: label }).first();
  if (!(await btn.count())) return false;
  await btn.click();
  await page.waitForTimeout(800);
  return true;
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
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

  console.log(`>>> 独立不变量验收 v2  目标=${UI}  行高基准=${ROW_H}px  视口=1280x800@2x`);
  await page.goto(`${UI}/tools/json-workbench`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);

  await assertScene(page, 'S01-桥接进入');

  // S02 逐层展开（用户报告的路径：展开后才出现子行）
  for (const key of ['content', 'market_info', 'one_key_bind_card_bank_list']) {
    const okExp = await ensureExpanded(page, key);
    check(`S02-展开-${key}`, `目标行「${key}」可定位且展开成功`, okExp, { key });
    await assertScene(page, `S02-展开-${key}`);
  }

  // 省略行（「…N more items」+「展开全部」按钮）—— 旧代码这里被按钮撑到 32px
  const ellRow = await page.evaluate(() => {
    for (const box of document.querySelectorAll('.jw-tree-rows')) {
      if (!(box.closest('.jw-tree-panel')?.getBoundingClientRect().height > 0)) continue;
      for (const w of box.children) {
        const row = w.querySelector('.jw-node-row');
        if (!row?.querySelector('.jw-node__value--ellipsis')) continue;
        const r = w.getBoundingClientRect();
        const rr2 = row.getBoundingClientRect();
        const btn = row.querySelector('.jw-ellipsis-expand-btn');
        const b = btn?.getBoundingClientRect();
        return {
          index: Number(w.getAttribute('data-index')),
          wrapperHeight: Math.round(r.height * 100) / 100,
          rowHeight: Math.round(rr2.height * 100) / 100,
          rowScrollH: row.scrollHeight, rowClientH: row.clientHeight,
          text: (row.textContent ?? '').trim().slice(0, 40),
          btnHeight: b ? Math.round(b.height * 100) / 100 : null,
          btnBottom: b ? Math.round(b.bottom * 100) / 100 : null, rowBottom: Math.round(rr2.bottom * 100) / 100,
        };
      }
    }
    return null;
  });
  console.log('  ▸ 省略行几何：', JSON.stringify(ellRow));
  evidence.ellipsisRow = ellRow;
  check('S02c-省略行', '省略行（…N more items + 展开全部按钮）行高 = 28px', !!ellRow && Math.abs(ellRow.rowHeight - ROW_H) <= EPS, ellRow);
  check('S02c-省略行', '省略行按钮不溢出该行（按钮底 ≤ 行底）', !!ellRow && ellRow.btnBottom !== null && ellRow.btnBottom <= ellRow.rowBottom + EPS, ellRow);

  // 关键几何 + 截图：父行 one_key_bind_card_bank_list 与子行 [0]
  const geomSnap = await page.evaluate(() => {
    const out = {};
    for (const box of document.querySelectorAll('.jw-tree-rows')) {
      if (!(box.closest('.jw-tree-panel')?.getBoundingClientRect().height > 0)) continue;
      for (const w of box.children) {
        const row = w.querySelector('.jw-node-row');
        const label = (row?.querySelector('.jw-node-row__key')?.textContent ?? '').trim();
        if (label !== 'one_key_bind_card_bank_list' && label !== '[0]') continue;
        const r = w.getBoundingClientRect();
        const b = row.querySelector('.jw-badge')?.getBoundingClientRect();
        out[label] = {
          index: Number(w.getAttribute('data-index')),
          top: Math.round(r.top * 100) / 100, height: Math.round(r.height * 100) / 100,
          transform: w.style.transform,
          badge: row.querySelector('.jw-badge')?.textContent ?? null,
          badgeTop: b ? Math.round(b.top * 100) / 100 : null, badgeBottom: b ? Math.round(b.bottom * 100) / 100 : null,
        };
      }
    }
    return out;
  });
  console.log('  ▸ 关键行几何：', JSON.stringify(geomSnap));
  evidence.keyGeom = geomSnap;
  const P = geomSnap['one_key_bind_card_bank_list'];
  const C = geomSnap['[0]'];
  if (P && C) {
    const d = Math.round((C.top - P.top) * 100) / 100;
    check('S03-关键几何', `父行与子行 [0] 的 y 差 = ${ROW_H}px（实测 ${d}px；父行 index=${P.index} top=${P.top}，子行 index=${C.index} top=${C.top}）`, Math.abs(d - ROW_H) <= EPS, { d, P, C });
    const badgeSameY = !(P.badgeTop === null || C.badgeTop === null) && Math.abs(P.badgeTop - C.badgeTop) < 0.01;
    check('S03-关键几何', `父行与子行类型徽标 y 不重合（父 ${P.badge}@${P.badgeTop}，子 ${C.badge}@${C.badgeTop}）`, !badgeSameY, { P, C });
    const clipTop = Math.max(0, Math.min(P.top, C.top) - 10);
    await page.screenshot({ path: path.join(OUT, 'verify-parent-child.png'), clip: { x: 0, y: clipTop, width: 1280, height: 96 } });
    await page.screenshot({ path: path.join(OUT, 'verify-parent-child-zoom.png'), clip: { x: 600, y: clipTop, width: 680, height: 96 } });
  } else {
    check('S03-关键几何', '父行 one_key_bind_card_bank_list 与子行 [0] 同时可见', false, geomSnap);
  }

  // S04 展开全部（ellipsis 按钮）
  const expandAllBtn = page.locator('.jw-ellipsis-expand-btn').first();
  if (await expandAllBtn.count()) {
    await expandAllBtn.click();
    await page.waitForTimeout(800);
    await assertScene(page, 'S04-展开全部');
  } else {
    check('S04-展开全部', '找到「展开全部」按钮', false, '未找到 .jw-ellipsis-expand-btn');
  }

  // S05-S07 滚动
  await page.evaluate(() => { const p = document.querySelector('.jw-tree-panel'); p.scrollTop = p.scrollHeight; });
  await assertScene(page, 'S05-滚动到底');
  await page.evaluate(() => { const p = document.querySelector('.jw-tree-panel'); p.scrollTop = Math.floor(p.scrollHeight / 2); });
  await assertScene(page, 'S06-滚动到中间');
  await page.evaluate(() => { const p = document.querySelector('.jw-tree-panel'); p.scrollTop = 0; });
  await assertScene(page, 'S07-滚动到顶');

  // S08-S09 折叠
  const okCol1 = await collapse(page, 'one_key_bind_card_bank_list');
  check('S08-折叠数组', '数组行折叠成功', okCol1, {});
  await assertScene(page, 'S08-折叠数组');
  const okCol2 = await collapse(page, 'market_info');
  check('S09-折叠-market_info', 'market_info 折叠成功', okCol2, {});
  await assertScene(page, 'S09-折叠-market_info');

  // S10-S11 右键菜单：折叠全部 → 展开全部
  await page.locator('.jw-node-row').first().click({ button: 'right' });
  await page.waitForTimeout(400);
  const collapseAllItem = page.locator('.ant-dropdown-menu-item', { hasText: '折叠全部' }).first();
  if (await collapseAllItem.count()) {
    await collapseAllItem.click();
    await page.waitForTimeout(700);
    await assertScene(page, 'S10-菜单折叠全部');
    await page.locator('.jw-node-row').first().click({ button: 'right' });
    await page.waitForTimeout(400);
    await page.locator('.ant-dropdown-menu-item', { hasText: '展开全部' }).first().click();
    await page.waitForTimeout(1000);
    await assertScene(page, 'S11-菜单展开全部');
  } else {
    check('S10-菜单折叠全部', '右键菜单可打开并含「折叠全部」', false, '未找到菜单项');
  }

  // S12 分栏视图（该视图下可能同时存在两个树容器 → 分组校验的意义所在）
  await page.keyboard.press('Escape');
  const okSplit = await setView(page, '分栏');
  check('S12-分栏视图', '存在「分栏」视图按钮', okSplit, {});
  await assertScene(page, 'S12-分栏视图');
  await setView(page, '文本');
  await page.waitForTimeout(400);
  await setView(page, '树形');
  await page.waitForTimeout(500);
  await assertScene(page, 'S13-切回树形');

  // S14 快速连续切换（不等测量完成的应力）
  await page.evaluate(() => { const p = document.querySelector('.jw-tree-panel'); if (p) p.scrollTop = 0; });
  await page.waitForTimeout(200);
  for (let i = 0; i < 8; i++) {
    const arrows = page.locator('.jw-node-row__arrow');
    const n = await arrows.count();
    if (n === 0) break;
    await arrows.nth(i % n).click({ force: true }).catch(() => {});
    await page.waitForTimeout(45);
  }
  await page.waitForTimeout(1300);
  await assertScene(page, 'S14-快速连续切换后');

  // S15 选中行（触发 smooth scrollToIndex）
  await page.evaluate(() => { const p = document.querySelector('.jw-tree-panel'); if (p) p.scrollTop = 0; });
  const targetRow = await findRow(page, 'one_key_bind_card_bank_list');
  if (await targetRow.count()) {
    await targetRow.click();
    await page.waitForTimeout(1100);
    await assertScene(page, 'S15-选中行平滑滚动后');
  } else {
    check('S15-选中行平滑滚动后', '可定位 one_key_bind_card_bank_list 行', false, {});
  }

  // S16-S17 视口尺寸变化（触发 ResizeObserver 重新测量）
  await page.setViewportSize({ width: 900, height: 620 });
  await page.waitForTimeout(800);
  await assertScene(page, 'S16-视口缩小');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(800);
  await assertScene(page, 'S17-视口放大');

  // S20-S21 内联编辑中的裁切风险（height:28px + overflow:hidden 的副作用）
  await page.evaluate(() => { const p = document.querySelector('.jw-tree-panel'); if (p) p.scrollTop = 0; });
  await page.waitForTimeout(500);
  const editRow = page.locator('.jw-node-row', { has: page.locator('.jw-node-row__key:text-is("errmsg")') }).first();
  await editRow.waitFor({ state: 'attached', timeout: 6000 }).catch(() => {});
  if (await editRow.count()) {
    await editRow.locator('.jw-node-row__value-editable').first().dblclick();
    await page.waitForTimeout(500);
    const editGeom = await page.evaluate(() => {
      const w = [...document.querySelectorAll('.jw-tree-rows > div')].find((x) => x.querySelector('.jw-node-row__key')?.textContent?.trim() === 'errmsg');
      if (!w) return null;
      const row = w.querySelector('.jw-node-row');
      const inp = row.querySelector('.jw-node-row__edit-input');
      if (!inp) return { noInput: true };
      const r = row.getBoundingClientRect();
      const i = inp.getBoundingClientRect();
      return {
        rowTop: Math.round(r.top * 100) / 100, rowBottom: Math.round(r.bottom * 100) / 100, rowHeight: Math.round(r.height * 100) / 100,
        inputTop: Math.round(i.top * 100) / 100, inputBottom: Math.round(i.bottom * 100) / 100, inputHeight: Math.round(i.height * 100) / 100,
        rowScrollH: row.scrollHeight, rowClientH: row.clientHeight,
      };
    });
    console.log('  ▸ 值编辑态几何：', JSON.stringify(editGeom));
    evidence.editGeom = editGeom;
    check('S20-值内联编辑', '编辑输入框存在且完全落在 28px 行内（未被裁切）',
      !!editGeom && !editGeom.noInput && editGeom.inputTop >= editGeom.rowTop - EPS && editGeom.inputBottom <= editGeom.rowBottom + EPS,
      editGeom);
    await assertScene(page, 'S20-值内联编辑中');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } else {
    check('S20-值内联编辑', '可定位 errmsg 行', false, {});
  }
  const keyRow = page.locator('.jw-node-row', { has: page.locator('.jw-node-row__key:text-is("errno")') }).first();
  await keyRow.waitFor({ state: 'attached', timeout: 6000 }).catch(() => {});
  if (await keyRow.count()) {
    await keyRow.locator('.jw-node-row__key--editable').first().dblclick();
    await page.waitForTimeout(500);
    const keyGeom = await page.evaluate(() => {
      const w = [...document.querySelectorAll('.jw-tree-rows > div')].find((x) => x.querySelector('.jw-node-row__key')?.textContent?.trim() === 'errno' || x.querySelector('.jw-node-row__edit-input--key'));
      if (!w) return null;
      const row = w.querySelector('.jw-node-row');
      const inp = row.querySelector('.jw-node-row__edit-input--key');
      if (!inp) return { noInput: true };
      const r = row.getBoundingClientRect();
      const i = inp.getBoundingClientRect();
      return {
        rowTop: Math.round(r.top * 100) / 100, rowBottom: Math.round(r.bottom * 100) / 100,
        inputTop: Math.round(i.top * 100) / 100, inputBottom: Math.round(i.bottom * 100) / 100, inputHeight: Math.round(i.height * 100) / 100,
      };
    });
    console.log('  ▸ 键编辑态几何：', JSON.stringify(keyGeom));
    evidence.keyEditGeom = keyGeom;
    check('S21-键名内联编辑', '键名编辑框完全落在 28px 行内（未被裁切）',
      !!keyGeom && !keyGeom.noInput && keyGeom.inputTop >= keyGeom.rowTop - EPS && keyGeom.inputBottom <= keyGeom.rowBottom + EPS,
      keyGeom);
    await assertScene(page, 'S21-键名内联编辑中');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } else {
    check('S21-键名内联编辑', '可定位 errno 行', false, {});
  }

  // S18-S19 刷新后（内存态清空 → 重新解析）
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);
  await assertScene(page, 'S18-刷新后');
  for (const key of ['content', 'market_info', 'one_key_bind_card_bank_list']) await ensureExpanded(page, key);
  await assertScene(page, 'S19-刷新后再展开');

  await browser.close();
  evidence.pass = pass;
  evidence.fail = fail;
  evidence.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, 'verify-invariants-evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(`\n===== 独立不变量验收：通过 ${pass} / 失败 ${fail} =====`);
  console.log(`证据：${path.join(OUT, 'verify-invariants-evidence.json')}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });