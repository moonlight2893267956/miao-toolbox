/**
 * task-4 独立验证（verify-tree）：对抗性检验「0 高测量兜底」
 *
 * 设计目标：区分「修复前失败 / 修复后通过」。
 *
 * A) 端到端（真实应用 + 真实布局）：
 *    通过 addInitScript 注入两种「量到 0」的 sabotaa：
 *      A1: 劫持 HTMLElement.prototype.offsetHeight，让 `.jw-tree-rows > div` 返回 0
 *          （这是修复后 measureElement 的取值路径，也是隐藏/未布局时真实会返回 0 的路径）；
 *      A2: 劫持 Element.prototype.getBoundingClientRect，让同一批元素返回高 0
 *          （这是修复前 measureElement 的取值路径）；
 *    两者同时把 ResizeObserver 回调里这些元素的 borderBoxSize.blockSize/contentRect.height 改成 0
 *    （模拟「隐藏页 → RO 也量到 0」）。
 *    然后按用户路径展开，用**未被劫持的** getBoundingClientRect 采集真实几何，核对行不重叠。
 *    修复前：0 会被写入尺寸缓存 → 相邻行 start 相同 → 真实几何出现整行重叠。
 *    修复后：normalizeRowHeight 把 0 钳到 28 → 行距恒为 28。
 *
 * B) 差分（真实库 + 真实源码模块，页内动态 import）：
 *    B1: 直接调用 @tanstack/virtual-core 导出的默认 measureElement（修复前组件没有任何自定义
 *        measureElement，走的就是它）在 0 高元素上的返回值，与修复后 normalizeRowHeight 对比；
 *    B2: 用上述两种策略各自推出 15 行的累计 translateY，统计「完全重叠的相邻行对」数量。
 *
 * 用法：cd miao-toolbox-web && node scripts/verify/jw-adversarial-zeroheight.mjs
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

let pass = 0, fail = 0;
const results = [];
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} :: ${JSON.stringify(detail)}`); }
  results.push({ name, ok: !!cond, detail });
};

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: '1', exp: Math.floor(Date.now() / 1000) + 7200 })}.sig`;
const USER = {
  id: 1, username: 'verify', email: 'v@example.com', emailVerified: true,
  roles: [{ id: 1, code: 'SUPER_ADMIN', name: '超级管理员' }],
  githubUsername: null, googleUsername: null, avatarUrl: null,
};

/** 注入脚本：保存原函数 + 按 variant 改写树行的测量值（0 / 任意 fakeH） */
const SABOTAGE = ({ variant, fakeH }) => {
  const SEL = '.jw-tree-rows > div';
  const isTarget = (el) => !!(el && el.matches && el.matches(SEL));
  const OrigRO = window.ResizeObserver;
  const FAKE = variant === 'fake' ? fakeH : 0;
  window.__sab = { variant, fakeH: FAKE, offsetHeightZeroed: 0, rectZeroed: 0, roZeroed: 0, rectProbeCalls: 0, probeActive: false };
  window.__origRect = Element.prototype.getBoundingClientRect;
  window.__origOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')?.get;

  if (variant === 'offsetHeight' || variant === 'fake') {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() {
        if (isTarget(this)) { window.__sab.offsetHeightZeroed++; return FAKE; }
        return window.__origOffsetHeight.call(this);
      },
    });
  }
  if (variant === 'rect') {
    Element.prototype.getBoundingClientRect = function () {
      if (isTarget(this)) {
        if (window.__sab.probeActive) window.__sab.rectProbeCalls++;
        else window.__sab.rectZeroed++;
        const r = window.__origRect.call(this);
        return new DOMRect(r.x, r.y, r.width, 0);
      }
      return window.__origRect.call(this);
    };
  }
  window.ResizeObserver = class extends OrigRO {
    constructor(cb) {
      super((entries, obs) => cb(entries.map((e) => {
        if (isTarget(e.target)) {
          window.__sab.roZeroed++;
          return {
            target: e.target,
            borderBoxSize: [{ blockSize: FAKE, inlineSize: e.borderBoxSize?.[0]?.inlineSize ?? 0 }],
            contentRect: { x: 0, y: 0, width: e.contentRect?.width ?? 0, height: FAKE, top: 0, left: 0, bottom: 0, right: 0 },
          };
        }
        return e;
      }), obs));
    }
  };
};

/** 用未被劫持的 getBoundingClientRect 采集真实几何 */
const COLLECT_TRUE = () => {
  const rr = (n) => Math.round(n * 100) / 100;
  const rect = (el) => window.__origRect.call(el);
  const out = { groups: [], sab: window.__sab, sabotagedRows: 0 };
  for (const box of document.querySelectorAll('.jw-tree-rows')) {
    const panel = box.closest('.jw-tree-panel');
    if (!(panel && rect(panel).height > 0)) continue;
    const boxRect = rect(box);
    const rows = [...box.children].map((w) => {
      const r = rect(w);
      const row = w.querySelector('.jw-node-row');
      const badge = row?.querySelector('.jw-badge');
      const b = badge ? rect(badge) : null;
      const keyEl = row?.querySelector('.jw-node-row__key, .jw-node-row__root-title');
      const m = /translateY\((-?[\d.]+)px\)/.exec(w.getAttribute('style') ?? '');
      const liveOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight').get.call(w);
      return {
        index: Number(w.getAttribute('data-index')),
        ty: m ? Number(m[1]) : null,
        top: rr(r.top), height: rr(r.height),
        currentOffsetHeight: liveOffsetHeight,
        trueOffsetHeight: window.__origOffsetHeight.call(w),
        label: (keyEl?.textContent ?? '').trim().slice(0, 36),
        badge: badge?.textContent ?? null,
        badgeTop: b ? rr(b.top) : null, badgeBottom: b ? rr(b.bottom) : null,
        badgeLeft: b ? rr(b.left) : null, badgeRight: b ? rr(b.right) : null,
      };
    });
    out.groups.push({
      boxTop: rr(boxRect.top), boxHeight: rr(boxRect.height), boxStyleHeight: box.style.height,
      scrollTop: rr(panel.scrollTop), rows,
    });
  }
  return out;
};

function judgeTrue(snap) {
  const out = { overlaps: [], steps: [], gaps: [], heights: [], sabotaged: 0, hijacked: 0, hijackValues: [], rows: 0 };
  for (const g of snap.groups) {
    const byIdx = [...g.rows].sort((a, b) => a.index - b.index);
    out.rows += g.rows.length;
    out.sabotaged += g.rows.filter((r) => r.currentOffsetHeight === 0).length;
    out.hijacked += g.rows.filter((r) => r.currentOffsetHeight !== r.trueOffsetHeight).length;
    for (const r of g.rows) if (!out.hijackValues.includes(r.currentOffsetHeight)) out.hijackValues.push(r.currentOffsetHeight);
    for (const r of g.rows) if (Math.abs(r.height - ROW_H) > EPS) out.heights.push({ i: r.index, h: r.height, label: r.label });
    for (let i = 0; i < byIdx.length - 1; i++) {
      const a = byIdx[i], b = byIdx[i + 1];
      if (a.ty !== null && b.ty !== null) {
        const d = Math.round((b.ty - a.ty) * 100) / 100;
        if (Math.abs(d - ROW_H) > EPS) out.steps.push({ i: a.index, delta: d, aLabel: a.label, bLabel: b.label });
      }
      if (b.top < a.top + a.height - EPS) out.overlaps.push({ a: a.index, b: b.index, px: Math.round((a.top + a.height - b.top) * 100) / 100, aLabel: a.label, bLabel: b.label });
      const gap = Math.round((b.top - (a.top + a.height)) * 100) / 100;
      if (gap > EPS) out.gaps.push({ a: a.index, b: b.index, px: gap, aLabel: a.label, bLabel: b.label });
    }
  }
  return out;
}

async function runVariant(browser, variant) {
  console.log(`\n──── A) 真实应用 + 0 高注入（variant=${variant}）────`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.route('**/api/**', (route) => {
    const u = route.request().url();
    const body = u.includes('/auth/refresh')
      ? { code: 'OK', data: { accessToken: JWT, signingKey: 'k', user: USER, mustChangePassword: false } }
      : { code: 'OK', data: { routes: [] } };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.addInitScript(SABOTAGE, { variant });
  await page.addInitScript(({ pl, u }) => {
    localStorage.setItem('tool-bridge:json-workbench', pl);
    localStorage.setItem('user', JSON.stringify(u));
  }, { pl: PAYLOAD, u: USER });

  await page.goto(`${UI}/tools/json-workbench`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);

  // 按用户路径展开 + 展开全部
  for (const key of ['content', 'market_info', 'one_key_bind_card_bank_list']) {
    const row = page.locator('.jw-node-row', { has: page.locator(`.jw-node-row__key:text-is("${key}")`) }).first();
    if (!(await row.count())) { check(`[${variant}] 展开 ${key}`, false, 'row not found'); continue; }
    const expanded = await row.locator('.jw-node-row__arrow .anticon-caret-down').count();
    if (!expanded) { await row.locator('.jw-node-row__arrow').click(); await page.waitForTimeout(400); }
  }
  const btn = page.locator('.jw-ellipsis-expand-btn').first();
  if (await btn.count()) { await btn.click(); await page.waitForTimeout(800); }

  // 父行/子行特写（滚动前采集，保证两行都在视口内）
  const geom = await page.evaluate(() => {
    const rect = (el) => window.__origRect.call(el);
    const out = {};
    for (const box of document.querySelectorAll('.jw-tree-rows')) {
      for (const w of box.children) {
        const row = w.querySelector('.jw-node-row');
        const label = (row?.querySelector('.jw-node-row__key')?.textContent ?? '').trim();
        if (label !== 'one_key_bind_card_bank_list' && label !== '[0]') continue;
        const r = rect(w);
        out[label] = { index: Number(w.getAttribute('data-index')), top: Math.round(r.top * 100) / 100, height: Math.round(r.height * 100) / 100, transform: w.style.transform };
      }
    }
    return out;
  });
  results.push({ name: `[${variant}] 父/子行几何`, detail: geom });
  await page.screenshot({ path: path.join(OUT, `verify-adversarial-${variant}.png`) });
  const clipTop = geom['one_key_bind_card_bank_list'] ? Math.max(0, geom['one_key_bind_card_bank_list'].top - 10) : 0;
  await page.screenshot({ path: path.join(OUT, `verify-adversarial-${variant}-parent-child.png`), clip: { x: 0, y: clipTop, width: 1280, height: 96 } });

  // 滚动到中间，让测量在滚动中发生
  await page.evaluate(() => { const p = document.querySelector('.jw-tree-panel'); if (p) p.scrollTop = Math.floor(p.scrollHeight / 2); });
  await page.waitForTimeout(700);

  const snap = await page.evaluate(COLLECT_TRUE);
  const verdict = judgeTrue(snap);
  console.log(`  ▸ sabotage 计数: ${JSON.stringify(snap.sab)}`);
  console.log(`  ▸ 已渲染行数=${verdict.rows}；其中「当前 offsetHeight 被劫持为 0」的行=${verdict.sabotaged}`);
  const g0 = snap.groups[0];
  if (g0) {
    const sample = g0.rows.slice(0, 8).map((r) => ({ i: r.index, ty: r.ty, trueH: r.height, currentOffsetHeight: r.currentOffsetHeight, label: r.label }));
    console.log(`  ▸ 样例行（前 8）: ${JSON.stringify(sample)}`);
    results.push({ name: `[${variant}] 样例行几何`, detail: sample });
  }
  if (variant === 'offsetHeight') {
    check(`[${variant}] 注入确实生效（应有树行经劫持路径量到 0）`, snap.sab.offsetHeightZeroed > 0 && verdict.sabotaged > 0, { sab: snap.sab, sabotaged: verdict.sabotaged });
  } else {
    const probe = await page.evaluate(() => {
      window.__sab.probeActive = true;
      const el = document.querySelector('.jw-tree-rows > div');
      const h = el ? el.getBoundingClientRect().height : null;
      window.__sab.probeActive = false;
      return h;
    });
    check(`[${variant}] 注入确实生效（探针经劫持路径量到 0）`, probe === 0, { probe });
    console.log(`  ▸ 说明：应用自身从未对树行调用 getBoundingClientRect（rectZeroed=${snap.sab.rectZeroed}），故该路径为「假设性回归」防线`);
  }
  check(`[${variant}] RO 路径也确实被喂了 0`, snap.sab.roZeroed > 0, snap.sab);
  check(`[${variant}] 真实几何：所有行高恒为 ${ROW_H}px`, verdict.heights.length === 0, verdict.heights.slice(0, 3));
  check(`[${variant}] 真实几何：相邻行步长恒为 ${ROW_H}px（无 0 高塌陷）`, verdict.steps.length === 0, verdict.steps.slice(0, 3));
  check(`[${variant}] 真实几何：任意两行不重叠`, verdict.overlaps.length === 0, verdict.overlaps.slice(0, 3));
  check(`[${variant}] 反例判据（若兜底失效：0 高行的相邻 start 会相同 → 重叠对 > 0；实测 ${verdict.overlaps.length}）`, verdict.overlaps.length === 0, verdict.overlaps.slice(0, 3));
  if (geom['one_key_bind_card_bank_list'] && geom['[0]']) {
    const d = Math.round((geom['[0]'].top - geom['one_key_bind_card_bank_list'].top) * 100) / 100;
    check(`[${variant}] 父行与子行 [0] 仍相距 ${ROW_H}px（实测 ${d}px）`, Math.abs(d - ROW_H) <= EPS, { d, geom });
  } else {
    check(`[${variant}] 父行与子行 [0] 同时可见`, false, geom);
  }
  await ctx.close();
}

/**
 * A3) 反空跑对照 + F1 复验（注入值可指定）：
 *  - fakeH=25：新契约下 25 < 28 → 必须被钳到 28 → 真实几何应「零异常」（这是 F1 修复的端到端证据）；
 *  - fakeH=33：33 > 28 → 按设计原样保留 → 缓存 33 vs 真实渲染 28 →
 *    相邻行会出现 5px **间隙**（不是重叠！overlap 只在缓存 < 渲染高时发生）→
 *    证明我的检查器仍能抓到「缓存与真实行高不一致」这一类缺陷（非空跑）。
 */
async function runCounterfactual(browser, fakeH, mode) {
  const label = mode === 'clamped' ? `A3a 反空跑/F1 复验：注入 ${fakeH}px（< 28 → 应被钳到 28）` : `A3b 反空跑对照：注入 ${fakeH}px（> 28 → 应原样保留，出现间隙）`;
  console.log(`\n──── ${label} ────`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.route('**/api/**', (route) => {
    const u = route.request().url();
    const body = u.includes('/auth/refresh')
      ? { code: 'OK', data: { accessToken: JWT, signingKey: 'k', user: USER, mustChangePassword: false } }
      : { code: 'OK', data: { routes: [] } };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.addInitScript(SABOTAGE, { variant: 'fake', fakeH });
  await page.addInitScript(({ pl, u }) => {
    localStorage.setItem('tool-bridge:json-workbench', pl);
    localStorage.setItem('user', JSON.stringify(u));
  }, { pl: PAYLOAD, u: USER });
  await page.goto(`${UI}/tools/json-workbench`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);
  for (const key of ['content', 'market_info', 'one_key_bind_card_bank_list']) {
    const row = page.locator('.jw-node-row', { has: page.locator(`.jw-node-row__key:text-is("${key}")`) }).first();
    if (!(await row.count())) continue;
    if (!(await row.locator('.jw-node-row__arrow .anticon-caret-down').count())) { await row.locator('.jw-node-row__arrow').click(); await page.waitForTimeout(400); }
  }
  const btn = page.locator('.jw-ellipsis-expand-btn').first();
  if (await btn.count()) { await btn.click(); await page.waitForTimeout(800); }
  await page.evaluate(() => { const p = document.querySelector('.jw-tree-panel'); if (p) p.scrollTop = 200; });
  await page.waitForTimeout(700);

  const snap = await page.evaluate(COLLECT_TRUE);
  const v = judgeTrue(snap);
  console.log(`  ▸ 劫持计数: ${JSON.stringify(snap.sab)}`);
  console.log(`  ▸ 被劫持行=${v.hijacked}（劫持后的取值集合=${JSON.stringify(v.hijackValues)}，真实 CSS 行高=28）`);
  const g0 = snap.groups[0];
  const sample = (g0?.rows ?? []).slice(0, 10).map((r) => ({ i: r.index, ty: r.ty, trueH: r.height, sabotageH: r.currentOffsetHeight, label: r.label }));
  console.log(`  ▸ 样例行: ${JSON.stringify(sample)}`);
  console.log(`  ▸ 检查器结论：步长异常 ${v.steps.length} 处、重叠 ${v.overlaps.length} 处、间隙 ${v.gaps.length} 处`);
  const shot = path.join(OUT, `verify-counterfactual-rowh${fakeH}-${mode}.png`);
  await page.screenshot({ path: shot });
  results.push({ name: `A3 ${mode}（${fakeH}px）`, detail: { sab: snap.sab, hijacked: v.hijacked, hijackValues: v.hijackValues, steps: v.steps.slice(0, 5), overlaps: v.overlaps.slice(0, 5), gaps: v.gaps.slice(0, 5), sample, shot } });

  check(`A3 注入生效：树行 offsetHeight 被劫持为 ${fakeH}`, v.hijacked > 0 && v.hijackValues.includes(fakeH), { hijacked: v.hijacked, values: v.hijackValues });
  if (mode === 'clamped') {
    check(`A3a F1 复验：${fakeH}px（< 行高 28）被钳制 → 真实几何零异常（步长/重叠/间隙全为 0）`,
      v.steps.length === 0 && v.overlaps.length === 0 && v.gaps.length === 0,
      { steps: v.steps.slice(0, 3), overlaps: v.overlaps.slice(0, 3), gaps: v.gaps.slice(0, 3) });
    check('A3a F1 复验：行高仍恒为 28px', v.heights.length === 0, v.heights.slice(0, 3));
  } else {
    check(`A3b 反空跑：我的检查器仍能抓到该类缺陷（步长异常 > 0，实测 ${v.steps.length}）`, v.steps.length > 0, v.steps.slice(0, 3));
    check(`A3b 反空跑：真实几何出现间隙 ≈ ${fakeH - ROW_H}px（缓存 ${fakeH} > 渲染 28）`, v.gaps.length > 0 && v.gaps.every((o) => Math.abs(o.px - (fakeH - ROW_H)) <= 1), v.gaps.slice(0, 3));
    check('A3b 机制核对：缓存 > 渲染高时产生的是「间隙」而非「重叠」（重叠对=0）', v.overlaps.length === 0, v.overlaps.slice(0, 3));
  }
  await ctx.close();
}

/** B) 差分：真实库默认测量（= 修复前路径） vs 修复后 normalizeRowHeight */
async function runDifferential(browser) {
  console.log('\n──── B) 差分：真实 @tanstack/virtual-core 默认测量 vs 修复后纯函数 ────');
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const page = await ctx.newPage();
  await page.route('**/api/**', (route) => {
    const u = route.request().url();
    const body = u.includes('/auth/refresh')
      ? { code: 'OK', data: { accessToken: JWT, signingKey: 'k', user: USER, mustChangePassword: false } }
      : { code: 'OK', data: { routes: [] } };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.addInitScript(({ u }) => localStorage.setItem('user', JSON.stringify(u)), { u: USER });
  await page.goto(`${UI}/tools/json-workbench`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const diff = await page.evaluate(async () => {
    // 真实库（Vite dev 直接按路径提供 node_modules 文件）
    const core = await import('/node_modules/@tanstack/virtual-core/dist/esm/index.js');
    // 真实修复产物（源码模块，Vite 现场编译）
    const metrics = await import('/src/modules/tools/json-workbench/utils/virtualRowMetrics.ts');

    const fakeInstance = (estimate) => ({
      options: { useCachedMeasurements: false, horizontal: false, getItemKey: (i) => i, estimateSize: () => estimate },
      indexFromElement: () => 0,
      itemSizeCache: new Map(),
    });
    // 隐藏/未布局元素：offsetHeight=0、rect 高=0、RO entry blockSize=0
    const zeroEl = { offsetHeight: 0, offsetWidth: 800, getBoundingClientRect: () => ({ height: 0, width: 800 }) };
    const zeroEntry = { target: zeroEl, borderBoxSize: [{ blockSize: 0, inlineSize: 800 }], contentRect: { height: 0, width: 800 } };
    const normalEl = { offsetHeight: 28, offsetWidth: 800, getBoundingClientRect: () => ({ height: 28, width: 800 }) };

    const inst = fakeInstance(30);
    const oldRef = core.measureElement(zeroEl, undefined, inst);            // 修复前：ref 路径（offsetHeight）
    const oldRo = core.measureElement(zeroEl, zeroEntry, inst);            // 修复前：ResizeObserver 路径
    const oldMissing = core.measureElement({ ...zeroEl, offsetHeight: undefined }, undefined, inst); // 旧代码在 detached 场景
    const newRef = metrics.normalizeRowHeight(oldRef);
    const newRo = metrics.normalizeRowHeight(oldRo);
    const newMissing = metrics.normalizeRowHeight(oldMissing);
    const normal = core.measureElement(normalEl, undefined, inst);
    const newNormal = metrics.normalizeRowHeight(normal);

    // 纯函数契约（对真实产物做独立取值核对）—— 新契约：取整后 < 28 一律回落 28；≥28 原样保留
    const inputs = [0, -5, 0.4, 23.9, 24, 25, 27.4, 27.5, 28, 28.4, 28.6, 31.5, 32, NaN, Infinity, -Infinity, null, undefined];
    const contract = inputs.map((v) => ({ in: String(v), out: metrics.normalizeRowHeight(v) }));

    // 累计 start 差分：15 行，其中 index 4..8 量到 0，其余 28
    const sizes = Array.from({ length: 15 }, (_, i) => (i >= 4 && i <= 8 ? 0 : 28));
    const starts = (s) => { const a = [0]; for (let i = 1; i < s.length; i++) a.push(a[i - 1] + s[i - 1]); return a; };
    const oldSizes = sizes.map((s) => core.measureElement({ offsetHeight: s, getBoundingClientRect: () => ({ height: s }) }, undefined, inst));
    const newSizes = oldSizes.map((s) => metrics.normalizeRowHeight(s));
    const oldStarts = starts(oldSizes), newStarts = starts(newSizes);
    // 追加场景（F1 对应）：index 4..8 量到 25（旧守卫带 [24,28) 内），其余 28
    const sizes25 = Array.from({ length: 15 }, (_, i) => (i >= 4 && i <= 8 ? 25 : 28));
    const oldSizes25 = sizes25.map((s) => core.measureElement({ offsetHeight: s, getBoundingClientRect: () => ({ height: s }) }, undefined, inst));
    const newSizes25 = oldSizes25.map((s) => metrics.normalizeRowHeight(s));
    const oldStarts25 = starts(oldSizes25), newStarts25 = starts(newSizes25);
    // 行 DOM 的真实渲染高度恒为 28（CSS height:28px）；start 由缓存决定。
    // 只要缓存写进 0，两行就会拿到相同 start → 视觉上 28px 完全重叠（用户症状）。
    const RENDERED = 28;
    const overlapPairs = (st) => st.reduce((n, v, i) => (i > 0 && v < st[i - 1] + RENDERED - 0.5 ? n + 1 : n), 0);
    const exactSame = (st) => st.reduce((n, v, i) => (i > 0 && Math.abs(v - st[i - 1]) < 0.01 ? n + 1 : n), 0);
    const maxCoLocated = (st) => {
      let best = 1, cur = 1;
      for (let i = 1; i < st.length; i++) { cur = Math.abs(st[i] - st[i - 1]) < 0.01 ? cur + 1 : 1; best = Math.max(best, cur); }
      return best;
    };

    return {
      constants: { JW_ROW_HEIGHT: metrics.JW_ROW_HEIGHT, JW_MIN_ROW_HEIGHT: metrics.JW_MIN_ROW_HEIGHT },
      oldRef, oldRo, oldMissing, newRef, newRo, newMissing, normal, newNormal,
      contract,
      oldSizes, newSizes, oldStarts, newStarts,
      oldOverlapPairs: overlapPairs(oldStarts), newOverlapPairs: overlapPairs(newStarts),
      oldExactSameStarts: exactSame(oldStarts), newExactSameStarts: exactSame(newStarts),
      oldMaxCoLocated: maxCoLocated(oldStarts), newMaxCoLocated: maxCoLocated(newStarts),
      oldSizes25, newSizes25, oldStarts25, newStarts25,
      oldOverlapPairs25: overlapPairs(oldStarts25), newOverlapPairs25: overlapPairs(newStarts25),
    };
  }).catch(async (e) => ({ error: String(e).slice(0, 400) }));

  if (diff.error) {
    check('B) 页内动态 import 真实库/真实源码模块', false, diff.error);
  } else {
    console.log('  ▸ 常量:', JSON.stringify(diff.constants));
    console.log('  ▸ 旧路径（库默认 measureElement）: ref=', diff.oldRef, ' RO=', diff.oldRo, ' detached=', String(diff.oldMissing));
    console.log('  ▸ 新路径（normalizeRowHeight）: ref=', diff.newRef, ' RO=', diff.newRo, ' detached=', diff.newMissing, ' 正常 28 →', diff.newNormal);
    console.log('  ▸ 纯函数契约:', JSON.stringify(diff.contract));
    console.log('  ▸ 15 行（4..8 量到 0）旧策略 starts:', JSON.stringify(diff.oldStarts), '→ 同址相邻对=' + diff.oldExactSameStarts, '视觉重叠对=' + diff.oldOverlapPairs, '最长同址行数=' + diff.oldMaxCoLocated);
    console.log('  ▸ 15 行（4..8 量到 0）新策略 starts:', JSON.stringify(diff.newStarts), '→ 同址相邻对=' + diff.newExactSameStarts, '视觉重叠对=' + diff.newOverlapPairs, '最长同址行数=' + diff.newMaxCoLocated);
    results.push({ name: 'B) 差分原始数据', detail: diff });
    check('B1 修复前路径在 0 高元素上返回 0（ref 路径）', diff.oldRef === 0, { oldRef: diff.oldRef });
    check('B1 修复前路径在 0 高元素上返回 0（RO 路径）', diff.oldRo === 0, { oldRo: diff.oldRo });
    check('B1 修复后把 0 钳到 28（ref 路径）', diff.newRef === 28, { newRef: diff.newRef });
    check('B1 修复后把 0 钳到 28（RO 路径）', diff.newRo === 28, { newRo: diff.newRo });
    check('B1 修复后正常 28 高行仍为 28（不误伤）', diff.newNormal === 28 && diff.normal === 28, { normal: diff.normal, newNormal: diff.newNormal });
    check('B2 旧策略：存在 start 完全相同的相邻行（≥2 行同址 → 「父行与子行完全重叠」）', diff.oldExactSameStarts > 0 && diff.oldMaxCoLocated > 1, { same: diff.oldExactSameStarts, maxCoLocated: diff.oldMaxCoLocated });
    check('B2 旧策略：按真实渲染高度 28px 计算存在视觉重叠对（>0）', diff.oldOverlapPairs > 0, { overlap: diff.oldOverlapPairs });
    check('B2 新策略：0 个同址行、0 个视觉重叠', diff.newExactSameStarts === 0 && diff.newOverlapPairs === 0 && diff.newMaxCoLocated === 1, { same: diff.newExactSameStarts, overlap: diff.newOverlapPairs, maxCoLocated: diff.newMaxCoLocated });
    check('B2 新策略：全 15 行 start 严格按 28 递增', diff.newStarts.every((v, i) => i === 0 || v - diff.newStarts[i - 1] === 28), diff.newStarts);
    check('B3 常量：JW_ROW_HEIGHT=28 且下限 = 行高本身（28，F1 修复）', diff.constants.JW_ROW_HEIGHT === 28 && diff.constants.JW_MIN_ROW_HEIGHT === 28, diff.constants);
    const expect = { 0: 28, '-5': 28, '0.4': 28, '23.9': 28, '24': 28, '25': 28, '27.4': 28, '27.5': 28, '28': 28, '28.4': 28, '28.6': 29, '31.5': 32, '32': 32, NaN: 28, Infinity: 28, '-Infinity': 28, null: 28, undefined: 28 };
    const bad = diff.contract.filter((c) => expect[c.in] !== c.out);
    check('B3 纯函数契约逐值核对通过（新契约：取整后 <28 → 28；≥28 原样保留）', bad.length === 0, bad);
    check('B3 F1 复验：25 / 24 / 27.4 / 27.5 均回落到 28（旧守卫带已封闭）',
      diff.contract.filter((c) => ['24', '25', '27.4', '27.5'].includes(c.in)).every((c) => c.out === 28), diff.contract.filter((c) => ['24', '25', '27.4', '27.5'].includes(c.in)));
    console.log('  ▸ 15 行（4..8 量到 25）旧策略 starts:', JSON.stringify(diff.oldStarts25), '→ 视觉重叠对=' + diff.oldOverlapPairs25);
    console.log('  ▸ 15 行（4..8 量到 25）新策略 starts:', JSON.stringify(diff.newStarts25), '→ 视觉重叠对=' + diff.newOverlapPairs25);
    check('B4 F1 机制复验（量到 25 的场景）：旧策略产生 5 对 3px 视觉重叠，新策略 0 重叠且严格 28 递增',
      diff.oldOverlapPairs25 === 5 && diff.newOverlapPairs25 === 0 && diff.newStarts25.every((v, i) => i === 0 || v - diff.newStarts25[i - 1] === 28),
      { oldOverlap: diff.oldOverlapPairs25, newOverlap: diff.newOverlapPairs25, newStarts25: diff.newStarts25 });
  }
  await ctx.close();
}

const main = async () => {
  const browser = await chromium.launch();
  await runVariant(browser, 'offsetHeight');
  await runVariant(browser, 'rect');
  await runCounterfactual(browser, 25, 'clamped');
  await runCounterfactual(browser, 33, 'detect');
  await runDifferential(browser);
  await browser.close();
  const ev = { pass, fail, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), results };
  fs.writeFileSync(path.join(OUT, 'verify-adversarial-evidence.json'), JSON.stringify(ev, null, 2));
  console.log(`\n===== 对抗性检验：通过 ${pass} / 失败 ${fail} =====`);
  console.log(`证据：${path.join(OUT, 'verify-adversarial-evidence.json')}`);
  process.exit(fail > 0 ? 1 : 0);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });