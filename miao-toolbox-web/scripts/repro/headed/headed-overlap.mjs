/**
 * JSON 工作台树形视图「父行/子行完全重叠 + 右侧类型徽标重叠」真实浏览器复现脚本
 *
 * 前置：
 *   - 前端 Vite dev server 已在 http://localhost:5173（仅监听 IPv6 localhost）
 *   - 后端不需要在线：**​/api/** 全部 route mock（/auth/refresh 返回伪造 JWT + SUPER_ADMIN 用户）
 *   - Playwright 只装在 miao-toolbox-web/node_modules，必须在 miao-toolbox-web 下运行：
 *       cd miao-toolbox-web && node scripts/repro/headed/headed-overlap.mjs
 *
 * 环境变量（都有默认值）：
 *   HEADLESS=0|1      默认 0（headless:false，真实 GPU 合成）
 *   FLOW=cashier|direct  默认 cashier（收银台日志提取器 → 在 JSON 工作台打开出参）
 *   VIEW=tree|split   默认 tree（点「树形」/「分栏」按钮切换）
 *   W/H=1234/776      视口尺寸
 *   DPR=              设备像素比（不设 = 用真实屏幕 DPR；例如 DPR=1 / DPR=2 强制覆盖）
 *   WHEEL=8           滚轮步数（正反向往返）
 *   TAG=              产物前缀
 *
 * 产物：/tmp/jw-repro/headed/<TAG>/step-*.json + step-*.png
 * 判定：任一两行 rect 纵向重叠 > 3px、或某行渲染高度 < 1px、或测量缓存与真实行高不一致 > 3px → 复现
 *
 * 只写 miao-toolbox-web/scripts/repro/headed/ 与 /tmp，不改 src/。
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAYLOAD_TEXT = fs.readFileSync(path.join(__dirname, '..', 'payload-cashier.json'), 'utf8');

const HEADLESS = process.env.HEADLESS === '1';
const FLOW = process.env.FLOW ?? 'cashier';
const VIEW = process.env.VIEW ?? 'tree';
const W = Number(process.env.W ?? 1234);
const H = Number(process.env.H ?? 776);
const DPR = process.env.DPR ? Number(process.env.DPR) : undefined;
const WHEEL = Number(process.env.WHEEL ?? 8);
/** REALVP=1：不做 device metrics override（viewport:null），DPR 用真实屏幕值 */
const REALVP = process.env.REALVP === '1';
const TAG = process.env.TAG ?? `${FLOW}-${VIEW}-${W}x${H}${DPR ? `-dpr${DPR}` : ''}${REALVP ? '-realvp' : ''}`;
const UI = process.env.UI_BASE ?? 'http://localhost:5173';
const OUT = path.join('/tmp/jw-repro/headed', TAG);
fs.mkdirSync(OUT, { recursive: true });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: '1', exp: Math.floor(Date.now() / 1000) + 7200 })}.sig`;
const USER = {
  id: 1, username: 'repro', email: 'repro@example.com', emailVerified: true,
  roles: [{ id: 1, code: 'SUPER_ADMIN', name: '超级管理员' }],
  githubUsername: null, googleUsername: null, avatarUrl: null,
};

/* ─────────── JSON → PHP serialize（构造真实日志文本，走真实提取器流程） ─────────── */
function phpSerialize(v) {
  if (v === null) return 'N;';
  if (typeof v === 'boolean') return `b:${v ? 1 : 0};`;
  if (typeof v === 'number') return Number.isInteger(v) ? `i:${v};` : `d:${v};`;
  if (typeof v === 'string') {
    const bytes = Buffer.byteLength(v, 'utf8');
    const escaped = v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `s:${bytes}:"${escaped}";`;
  }
  if (Array.isArray(v)) return `a:${v.length}:{${v.map((x, i) => `i:${i};${phpSerialize(x)}`).join('')}}`;
  const keys = Object.keys(v);
  return `a:${keys.length}:{${keys.map((k) => `${phpSerialize(k)}${phpSerialize(v[k])}`).join('')}}`;
}
const LOG_TEXT = `2026-10-17 15:20:31 [INFO] cashier response: s:10:"outputdata";${phpSerialize(JSON.parse(PAYLOAD_TEXT))}\n`;

/* ─────────── 页面探测 ─────────── */
async function probe(page, step) {
  const data = await page.evaluate(() => {
    const panel = document.querySelector('.jw-tree-panel');
    const wraps = [...document.querySelectorAll('.jw-tree-rows > div')];
    const rows = wraps.map((w) => {
      const rect = w.getBoundingClientRect();
      const row = w.querySelector('.jw-node-row');
      const keyEl = row?.querySelector('.jw-node-row__key, .jw-node-row__root-title');
      const badge = row?.querySelector('.jw-badge');
      const br = badge?.getBoundingClientRect();
      const style = w.getAttribute('style') ?? '';
      const m = /translateY\(([-\d.]+)px\)/.exec(style);
      const rowRect = row?.getBoundingClientRect();
      return {
        index: Number(w.getAttribute('data-index')),
        rectTop: Math.round(rect.top * 100) / 100,
        rectH: Math.round(rect.height * 100) / 100,
        rowTop: rowRect ? Math.round(rowRect.top * 100) / 100 : null,
        rowH: rowRect ? Math.round(rowRect.height * 100) / 100 : null,
        translateY: m ? Number(m[1]) : null,
        label: (keyEl?.textContent ?? '').trim().slice(0, 40),
        badge: badge?.textContent ?? null,
        badgeTop: br ? Math.round(br.top * 100) / 100 : null,
        badgeBottom: br ? Math.round(br.bottom * 100) / 100 : null,
        badgeLeft: br ? Math.round(br.left * 100) / 100 : null,
        badgeRight: br ? Math.round(br.right * 100) / 100 : null,
      };
    });
    rows.sort((a, b) => a.rectTop - b.rectTop || a.index - b.index);

    // ① 纵向重叠 > 1px（最终判定用 >3px）
    const overlaps = [];
    for (let i = 0; i < rows.length - 1; i++) {
      const overlap = rows[i].rectTop + rows[i].rectH - rows[i + 1].rectTop;
      if (overlap > 1) {
        overlaps.push({
          a: rows[i].index, aLabel: rows[i].label, aH: rows[i].rectH,
          b: rows[i + 1].index, bLabel: rows[i + 1].label,
          overlap: Math.round(overlap * 100) / 100,
        });
      }
    }
    // ② translateY 完全相同（虚拟化 start 冲突）
    const byT = new Map();
    for (const r of rows) {
      const k = String(r.translateY);
      if (!byT.has(k)) byT.set(k, []);
      byT.get(k).push(r.index);
    }
    const sameStart = [...byT.entries()].filter(([, v]) => v.length > 1).map(([t, v]) => ({ translateY: Number(t), indexes: v }));
    // ③ 零高
    const zeroH = rows.filter((r) => r.rectH < 1).map((r) => r.index);
    // ④ 徽标两两重叠
    const badges = rows.filter((r) => r.badgeTop !== null);
    const badgeOverlaps = [];
    for (let i = 0; i < badges.length; i++) {
      for (let j = i + 1; j < badges.length; j++) {
        const a = badges[i], b = badges[j];
        const vx = Math.min(a.badgeRight, b.badgeRight) - Math.max(a.badgeLeft, b.badgeLeft);
        const vy = Math.min(a.badgeBottom, b.badgeBottom) - Math.max(a.badgeTop, b.badgeTop);
        if (vx > 1 && vy > 1) badgeOverlaps.push({ a: a.index, b: b.index, vx: Math.round(vx), vy: Math.round(vy) });
      }
    }

    // ⑤ 虚拟化缓存
    const v = window.__jwVirtualizer;
    const panelEl = document.querySelector('.jw-tree-panel');
    let cache = null;
    if (v) {
      const sizes = [...v.itemSizeCache.entries()].map(([k, s]) => [k, s]);
      const meas = [];
      const mc = v.measurementsCache;
      for (let i = 0; i < mc.length; i++) {
        meas.push([i, Math.round(mc[i].start * 100) / 100, Math.round(mc[i].size * 100) / 100, mc[i].key]);
      }
      cache = {
        // 注意：AppLayout 在某些入口会双挂载，window.__jwVirtualizer 可能指向已卸载实例
        live: !!(v.scrollElement && v.scrollElement === panelEl),
        count: v.options.count,
        total: Math.round(v.getTotalSize() * 100) / 100,
        scrollOffset: v.scrollOffset,
        isScrolling: v.isScrolling,
        sizes,
        meas,
      };
    }
    // ⑥ 缓存 start/size 与真实 rect 的偏差（按 data-index 关联）
    const drift = [];
    if (v) {
      for (const r of rows) {
        const mm = v.measurementsCache[r.index];
        if (!mm) continue;
        const sz = Math.round(mm.size * 100) / 100;
        if (Math.abs(sz - r.rectH) > 3) drift.push({ index: r.index, label: r.label, cacheSize: sz, realH: r.rectH, cacheStart: Math.round(mm.start * 100) / 100, realTopOffset: Math.round((r.rectTop - rows[0].rectTop) * 100) / 100 });
      }
    }

    return {
      dpr: window.devicePixelRatio,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      panel: panel ? { scrollTop: Math.round(panel.scrollTop * 100) / 100, clientH: panel.clientHeight, scrollH: panel.scrollHeight } : null,
      rowCount: rows.length,
      rows,
      overlaps,
      sameStart,
      zeroH,
      badgeOverlaps,
      drift,
      cache,
    };
  });
  data.step = step;
  fs.writeFileSync(path.join(OUT, `step-${step}.json`), JSON.stringify(data, null, 2));
  await page.screenshot({ path: path.join(OUT, `step-${step}.png`) });

  const rep = data.overlaps.filter((o) => o.overlap > 3);
  console.log(`\n[${step}] dpr=${data.dpr} vp=${data.viewport.w}x${data.viewport.h} rows=${data.rowCount} scrollTop=${data.panel?.scrollTop} total=${data.cache?.total}`);
  console.log(`   重叠>1px=${data.overlaps.length} 其中>3px=${rep.length} 同translateY=${data.sameStart.length} 零高=${data.zeroH.length} 徽标重叠=${data.badgeOverlaps.length} 缓存偏差=${data.drift.length}`);
  if (rep.length) console.log('   ❌ 重叠>3px:', JSON.stringify(rep));
  if (data.sameStart.length) console.log('   ❌ 同 translateY:', JSON.stringify(data.sameStart));
  if (data.zeroH.length) console.log('   ❌ 零高行:', JSON.stringify(data.zeroH));
  if (data.drift.length) console.log('   ⚠ 缓存与真实高度不一致:', JSON.stringify(data.drift.slice(0, 8)));
  if (data.cache) console.log(`   sizes=${JSON.stringify(data.cache.sizes)}`);
  return data;
}

async function expand(page, key) {
  const row = page.locator('.jw-node-row', { has: page.locator(`.jw-node-row__key:text-is("${key}")`) }).first();
  try {
    await row.waitFor({ state: 'visible', timeout: 8000 });
    await row.locator('.jw-node-row__arrow').click({ timeout: 5000 });
    await page.waitForTimeout(450);
    console.log(`   >>> 展开 ${key}`);
    return true;
  } catch (e) {
    console.log(`   >>> 展开 ${key} 失败: ${String(e).slice(0, 100)}`);
    return false;
  }
}

async function probeCache(page, step) {
  const data = await page.evaluate(() => {
    const v = window.__jwVirtualizer;
    const panel = document.querySelector('.jw-tree-panel');
    const wraps = [...document.querySelectorAll('.jw-tree-rows > div')];
    const hidden = !!(panel && panel.getBoundingClientRect().height === 0);
    const rects = wraps.map((w) => {
      const r = w.getBoundingClientRect();
      return { i: Number(w.getAttribute('data-index')), top: Math.round(r.top * 100) / 100, h: Math.round(r.height * 100) / 100 };
    });
    if (!v) return { hidden, rows: rects, cache: null };
    const meas = [];
    const mc = v.measurementsCache;
    for (let i = 0; i < mc.length; i++) meas.push([i, Math.round(mc[i].start * 100) / 100, Math.round(mc[i].size * 100) / 100]);
    return {
      hidden,
      rows: rects,
      cache: {
        count: v.options.count,
        total: Math.round(v.getTotalSize() * 100) / 100,
        scrollOffset: v.scrollOffset,
        sizes: [...v.itemSizeCache.entries()],
        meas,
        scrollRect: v.scrollRect ? { w: v.scrollRect.width, h: v.scrollRect.height } : null,
        range: v.range ? { start: v.range.startIndex, end: v.range.endIndex } : null,
      },
    };
  });
  data.step = step;
  fs.writeFileSync(path.join(OUT, `step-${step}.json`), JSON.stringify(data, null, 2));
  const z = data.cache ? data.cache.sizes.filter(([, s]) => s < 1).map(([k]) => k) : [];
  console.log(`\n[${step}] hidden=${data.hidden} 渲染行=${data.rows.length} scrollRect=${JSON.stringify(data.cache?.scrollRect)} range=${JSON.stringify(data.cache?.range)}`);
  if (data.cache) {
    console.log(`   count=${data.cache.count} total=${data.cache.total} scrollOffset=${data.cache.scrollOffset}`);
    console.log(`   itemSizeCache=${JSON.stringify(data.cache.sizes)}`);
    if (z.length) console.log(`   ❌ 缓存中存在 0 尺寸 index: ${JSON.stringify(z)}`);
  }
  return data;
}

async function main() {
  const guard = setTimeout(() => { console.error('!! 90s 超时保护，强制退出'); process.exit(4); }, 90_000);
  guard.unref?.();

  const args = [`--window-size=${W},${H + 90}`];
  if (DPR) args.push(`--force-device-scale-factor=${DPR}`);
  const browser = await chromium.launch({ headless: HEADLESS, args });
  const ctx = await browser.newContext({
    ...(REALVP ? { viewport: null } : { viewport: { width: W, height: H } }),
    ...(DPR ? { deviceScaleFactor: DPR } : {}),
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));

  await page.addInitScript((u) => { window.localStorage.setItem('user', JSON.stringify(u)); }, USER);
  await page.route('**/api/**', (route) => {
    const url = route.request().url();
    const body = url.includes('/auth/refresh')
      ? { code: 'OK', data: { accessToken: JWT, signingKey: 'k', user: USER, mustChangePassword: false } }
      : { code: 'OK', data: { routes: [] } };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  console.log(`>>> TAG=${TAG} headless=${HEADLESS} flow=${FLOW} view=${VIEW} ${W}x${H} dpr=${DPR ?? '(real)'}`);

  // ─── FLOW=keepalive：真实 Tab/KeepAlive（display:none）路径 ───
  // 必须先落在 /tools 首页再点侧栏，否则首屏「无 Tab」分支会导致组件重挂载、绕过 KeepAlive。
  if (FLOW === 'keepalive') {
    const results = [];
    // 侧栏在窄窗口下会折叠（label 不可见），故先试 Playwright 点击，失败则用 JS 点击最近的导航项
    const sidebar = async (t) => {
      const loc = page.locator('.miao-sidebar').getByText(t, { exact: true }).first();
      try { await loc.click({ timeout: 4000 }); return; } catch { /* 回退 */ }
      await page.evaluate((label) => {
        const all = [...document.querySelectorAll('.miao-sidebar *')];
        const el = all.find((e) => e.textContent.trim() === label && e.children.length === 0);
        const target = el?.closest('a') ?? el?.closest('[class*="nav-item"]') ?? el;
        target?.click();
      }, t);
    };
    const wbTab = () => page.locator('.miao-tab', { hasText: 'JSON 工作台' }).first();
    const PRELOAD = process.env.PRELOAD === '1';
    const OPEN_FROM_EXTRACTOR = process.env.OPEN_FROM_EXTRACTOR === '1';
    const KEYS = (process.env.KEYS ?? 'content,market_info,one_key_bind_card_bank_list').split(',').filter(Boolean);
    const before = [];

    await page.goto(`${UI}/tools`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await sidebar('JSON 工作台');
    await page.waitForTimeout(1500);

    if (PRELOAD) {
      await page.evaluate((p) => {
        window.localStorage.setItem('tool-bridge:json-workbench', p);
        window.dispatchEvent(new CustomEvent('tool-bridge:json-workbench', { detail: p }));
      }, PAYLOAD_TEXT);
      await page.waitForTimeout(1200);
      const mode = VIEW === 'tree' ? '树形' : '分栏';
      const vb = page.locator('button', { hasText: mode }).first();
      if (await vb.count()) { await vb.click(); await page.waitForTimeout(600); }
      for (const k of KEYS) await expand(page, k);
      before.push(await probe(page, '01-visible-expanded'));
    }

    // 切走：工作台容器 display:none，但组件保持挂载（KeepAlive）
    await sidebar('收银台日志提取器');
    await page.waitForTimeout(1200);
    await probeCache(page, '02-hidden');

    if (OPEN_FROM_EXTRACTOR) {
      await page.locator('.ple-textarea').fill(LOG_TEXT);
      await page.locator('button.ple-action-btn--primary', { hasText: '解析' }).click();
      await page.waitForTimeout(1500);
      const btn = page.locator('button[title="在 JSON 工作台打开出参"]').first();
      if (await btn.count()) { await btn.click(); console.log('   >>> 隐藏状态下点「在 JSON 工作台打开出参」'); }
      await page.waitForTimeout(1200);
      await probeCache(page, '03-hidden-with-data');
    }

    // 点 Tab 切回
    if (await wbTab().count()) await wbTab().click();
    else await sidebar('JSON 工作台');
    await page.waitForTimeout(60);
    await probeCache(page, '04-return-60ms');
    await page.waitForTimeout(180);
    results.push(await probe(page, '05-return-240ms'));

    for (const k of KEYS) { await expand(page, k); results.push(await probe(page, `06-expand-${k}`)); }

    const pb = await page.locator('.jw-tree-panel').first().boundingBox();
    if (pb) {
      await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2);
      for (let i = 0; i < WHEEL; i++) {
        await page.mouse.wheel(0, 300);
        await page.waitForTimeout(200);
        results.push(await probe(page, `07-wheel-${i}`));
      }
    }

    const all = [...before, ...results];
    const bad = all.filter((r) => r.overlaps.some((o) => o.overlap > 3) || r.zeroH.length || r.sameStart.length);
    console.log(`\n================ 汇总 TAG=${TAG} ================`);
    console.log(`步骤=${all.length} 异常步骤=${bad.length} 最大重叠=${Math.max(0, ...all.flatMap((r) => r.overlaps.map((o) => o.overlap)))}px`);
    for (const b of bad) console.log(`  ❌ ${b.step}: 重叠=${JSON.stringify(b.overlaps.filter((o) => o.overlap > 3))} 同translateY=${JSON.stringify(b.sameStart)} 零高=${JSON.stringify(b.zeroH)}`);
    console.log(`产物目录: ${OUT}`);
    await browser.close();
    process.exit(bad.length ? 0 : 2);
  }

  if (FLOW === 'cashier') {
    // 1) 先挂载空的 JSON 工作台（模拟用户已打开该标签页，之后被 KeepAlive 隐藏）
    await page.goto(`${UI}/tools/json-workbench`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    // 2) 侧边栏切到「收银台日志提取器」
    await page.locator('.miao-sidebar').getByText('收银台日志提取器', { exact: true }).first().click();
    await page.waitForTimeout(1200);
    // 3) 粘贴真实日志（由 payload-cashier.json 反序列化为 PHP serialize）并解析
    await page.locator('.ple-textarea').fill(LOG_TEXT);
    await page.locator('button.ple-action-btn--primary', { hasText: '解析' }).click();
    await page.waitForTimeout(1500);
    // 4) 点「在 JSON 工作台打开出参」
    const openBtn = page.locator('button[title="在 JSON 工作台打开出参"]').first();
    if (await openBtn.count()) { await openBtn.click(); console.log('   >>> 点击「在 JSON 工作台打开出参」'); }
    else console.log('   >>> 未找到打开出参按钮');
    await page.waitForTimeout(800);
    // 5) 切回 JSON 工作台标签
    await page.locator('.miao-tab', { hasText: 'JSON 工作台' }).first().click();
    await page.waitForTimeout(1500);
  } else if (FLOW === 'direct') {
    await page.addInitScript((p) => { window.localStorage.setItem('tool-bridge:json-workbench', p); }, PAYLOAD_TEXT);
    await page.goto(`${UI}/tools/json-workbench`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
  }

  // GPU / 渲染后端信息
  const gpu = await page.evaluate(() => {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null, vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : null };
    } catch { return null; }
  });
  console.log('   GPU:', JSON.stringify(gpu));

  // 视图模式
  const modeLabel = VIEW === 'tree' ? '树形' : '分栏';
  const vmBtn = page.locator('button', { hasText: modeLabel }).first();
  if (await vmBtn.count()) { await vmBtn.click(); await page.waitForTimeout(800); console.log(`   >>> 切换视图: ${modeLabel}`); }

  const results = [];
  const toWorkbenchTab = async () => {
    await page.locator('.miao-tab', { hasText: 'JSON 工作台' }).first().click();
  };
  const toExtractorTab = async () => {
    await page.locator('.miao-sidebar').getByText('收银台日志提取器', { exact: true }).first().click();
  };

  // ─── FLOW=hide-show：树行已挂载且可见 → 切走（display:none）→ 切回，观察测量缓存是否被写成 0 / start 冲突 ───
  if (FLOW === 'hide-show' || FLOW === 'hide-show-scroll') {
    await page.addInitScript((p) => { window.localStorage.setItem('tool-bridge:json-workbench', p); }, PAYLOAD_TEXT);
    await page.goto(`${UI}/tools/json-workbench`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await expand(page, 'content');
    await expand(page, 'market_info');
    await expand(page, 'one_key_bind_card_bank_list');
    results.push(await probe(page, '01-visible-expanded'));

    // 切到提取器页 → JSON 工作台被 KeepAlive 隐藏（树行仍挂载）
    await toExtractorTab();
    await page.waitForTimeout(1500);
    await probeCache(page, '02-hidden-cache');

    // 切回工作台：立刻 + 分阶段探测（捕捉纠正前后状态）
    await toWorkbenchTab();
    await page.waitForTimeout(60);
    await probeCache(page, '03-return-60ms');
    await page.waitForTimeout(200);
    results.push(await probe(page, '04-return-260ms'));
    await page.waitForTimeout(1000);
    results.push(await probe(page, '05-return-1.2s'));

    if (FLOW === 'hide-show-scroll') {
      const panelBox = await page.locator('.jw-tree-panel').first().boundingBox();
      if (panelBox) {
        await page.mouse.move(panelBox.x + panelBox.width / 2, panelBox.y + panelBox.height / 2);
        for (let i = 0; i < WHEEL; i++) {
          await page.mouse.wheel(0, 300);
          await page.waitForTimeout(200);
          results.push(await probe(page, `06-wheel-${i}`));
        }
      }
    }
    const bad0 = results.filter((r) => r.overlaps.some((o) => o.overlap > 3) || r.zeroH.length || r.sameStart.length);
    console.log(`\n================ 汇总 TAG=${TAG} ================`);
    console.log(`步骤=${results.length} 异常步骤=${bad0.length} 最大重叠=${Math.max(0, ...results.flatMap((r) => r.overlaps.map((o) => o.overlap)))}px`);
    for (const b of bad0) console.log(`  ❌ ${b.step}: 重叠=${JSON.stringify(b.overlaps.filter((o) => o.overlap > 3))} 同translateY=${JSON.stringify(b.sameStart)} 零高=${JSON.stringify(b.zeroH)}`);
    console.log(`产物目录: ${OUT}`);
    await browser.close();
    process.exit(bad0.length ? 0 : 2);
  }

  results.push(await probe(page, '01-opened'));

  await expand(page, 'content');
  results.push(await probe(page, '02-content'));

  await expand(page, 'market_info');
  results.push(await probe(page, '03-market_info'));

  await expand(page, 'one_key_bind_card_bank_list');
  results.push(await probe(page, '04-bank_list'));

  // 再展开数组第一个元素 + 滚动
  await expand(page, '[0]');
  results.push(await probe(page, '05-item0'));

  const panel = page.locator('.jw-tree-panel').first();
  const box = await panel.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < WHEEL; i++) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(220);
      results.push(await probe(page, `06-wheel-down-${i}`));
    }
    for (let i = 0; i < Math.ceil(WHEEL / 2); i++) {
      await page.mouse.wheel(0, -600);
      await page.waitForTimeout(220);
      results.push(await probe(page, `07-wheel-up-${i}`));
    }
  }

  const bad = results.filter((r) => r.overlaps.some((o) => o.overlap > 3) || r.zeroH.length || r.sameStart.length);
  console.log(`\n================ 汇总 TAG=${TAG} ================`);
  console.log(`步骤数=${results.length} 异常步骤=${bad.length}`);
  console.log(`最大重叠=${Math.max(0, ...results.flatMap((r) => r.overlaps.map((o) => o.overlap)))}px`);
  console.log(`产物目录: ${OUT}`);
  for (const b of bad) console.log(`  ❌ ${b.step}: 重叠>3px=${JSON.stringify(b.overlaps.filter((o) => o.overlap > 3))} 同translateY=${JSON.stringify(b.sameStart)} 零高=${JSON.stringify(b.zeroH)}`);

  await browser.close();
  process.exit(bad.length ? 0 : 2);
}

main().catch((e) => { console.error(e); process.exit(1); });