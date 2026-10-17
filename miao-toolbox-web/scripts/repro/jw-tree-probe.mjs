/**
 * JSON 工作台树形视图「行错乱/重叠」复现脚本
 *
 * 前置：前端 dev server 已在 5173；后端不需要在线（登录走 mock 拦截）。
 * 用法：node scripts/repro/jw-tree-probe.mjs [mode]
 *   mode: fresh-expand | spa-hide-show | hidden-bridge | cashier-flow
 * 产物：/tmp/jw-repro/<tag>.png 截图 + 控制台行几何 / 虚拟化测量缓存明细
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAYLOAD = fs.readFileSync(path.join(__dirname, 'payload-cashier.json'), 'utf8');
const UI = process.env.UI_BASE ?? 'http://localhost:5173';
const MODE = process.argv[2] ?? 'fresh-expand';
const OUT = process.env.OUT_DIR ?? '/tmp/jw-repro';
fs.mkdirSync(OUT, { recursive: true });

function fakeJwt() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: '1', exp: Math.floor(Date.now() / 1000) + 7200 })}.sig`;
}

const USER = {
  id: 1,
  username: 'repro',
  email: 'repro@example.com',
  emailVerified: true,
  roles: [{ id: 1, code: 'SUPER_ADMIN', name: '超级管理员' }],
  githubUsername: null,
  googleUsername: null,
  avatarUrl: null,
};

async function mockBackend(page) {
  await page.route('**/api/**', (route) => {
    const url = route.request().url();
    const body = url.includes('/auth/refresh')
      ? { code: 'OK', data: { accessToken: fakeJwt(), signingKey: 'k', user: USER, mustChangePassword: false } }
      : { code: 'OK', data: { routes: [] } };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function dumpRows(page, tag) {
  const data = await page.evaluate(() => {
    const wraps = [...document.querySelectorAll('.jw-tree-rows > div')];
    const rows = wraps.map((wrap) => {
      const rect = wrap.getBoundingClientRect();
      const row = wrap.querySelector('.jw-node-row');
      const style = wrap.getAttribute('style') ?? '';
      const keyEl = row?.querySelector('.jw-node-row__key, .jw-node-row__root-title');
      const badge = row?.querySelector('.jw-badge');
      const badgeRect = badge?.getBoundingClientRect();
      const m = /translateY\(([-\d.]+)px\)/.exec(style);
      return {
        index: Number(wrap.getAttribute('data-index')),
        top: Math.round(rect.top * 100) / 100,
        height: Math.round(rect.height * 100) / 100,
        translateY: m ? Number(m[1]) : null,
        label: (keyEl?.textContent ?? '').trim().slice(0, 40),
        badge: badge?.textContent ?? null,
        badgeTop: badgeRect ? Math.round(badgeRect.top * 100) / 100 : null,
        badgeLeft: badgeRect ? Math.round(badgeRect.left * 100) / 100 : null,
        badgeRight: badgeRect ? Math.round(badgeRect.right * 100) / 100 : null,
      };
    });
    rows.sort((a, b) => a.top - b.top || a.index - b.index);
    const overlaps = [];
    for (let i = 0; i < rows.length - 1; i++) {
      if (rows[i + 1].top < rows[i].top + rows[i].height - 0.5) {
        overlaps.push({ a: rows[i].index, aLabel: rows[i].label, b: rows[i + 1].index, bLabel: rows[i + 1].label });
      }
    }
    const badges = rows.filter((r) => r.badgeTop !== null);
    const badgeOverlaps = [];
    for (let i = 0; i < badges.length; i++) {
      for (let j = i + 1; j < badges.length; j++) {
        const a = badges[i];
        const b = badges[j];
        if (Math.abs(a.top - b.top) < 1) continue;
        if (Math.min(a.badgeTop + 20, b.badgeTop + 20) - Math.max(a.badgeTop, b.badgeTop) > 1
          && Math.min(a.badgeRight, b.badgeRight) - Math.max(a.badgeLeft, b.badgeLeft) > 1) {
          badgeOverlaps.push({ a: a.index, aBadge: a.badge, b: b.index, bBadge: b.badge });
        }
      }
    }
    return { rows, overlaps, badgeOverlaps, total: document.querySelector('.jw-tree-rows')?.getBoundingClientRect().height ?? null };
  });

  console.log(`\n===== [${tag}] 渲染 ${data.rows.length} 行，容器总高 ${data.total} =====`);
  for (const r of data.rows) {
    const flags = [];
    if (r.height < 1) flags.push('❌零高');
    const ov = data.overlaps.find((o) => o.a === r.index || o.b === r.index);
    if (ov) flags.push(`❌与#${ov.a === r.index ? ov.b : ov.a}重叠`);
    console.log(`  #${String(r.index).padStart(3)} translateY=${String(r.translateY).padStart(7)} top=${String(r.top).padStart(8)} h=${String(r.height).padStart(5)} ${(r.badge ?? '-').padEnd(8)} ${r.label} ${flags.join(' ')}`);
  }
  console.log(`  → 重叠对数=${data.overlaps.length} 徽标重叠=${data.badgeOverlaps.length}`);
  if (data.overlaps.length) console.log('  细节:', JSON.stringify(data.overlaps));
  await page.screenshot({ path: path.join(OUT, `${tag}.png`) });
  return data;
}

async function dumpCache(page, tag) {
  const s = await page.evaluate(() => {
    const v = window.__jwVirtualizer;
    if (!v) return null;
    const sizes = [...v.itemSizeCache.entries()];
    const meas = [];
    try {
      const mc = v.measurementsCache;
      for (let i = 0; i < mc.length; i++) {
        const m = mc[i];
        meas.push([i, Math.round(m.start * 100) / 100, Math.round(m.size * 100) / 100, m.key]);
      }
    } catch { /* ignore */ }
    return {
      count: v.options.count,
      total: Math.round(v.getTotalSize() * 100) / 100,
      pendingMin: v.pendingMin,
      scrollOffset: v.scrollOffset,
      sizes,
      meas,
    };
  });
  if (!s) { console.log(`\n----- [${tag}] 无可读虚拟化实例 -----`); return; }
  console.log(`\n----- [${tag}] count=${s.count} total=${s.total} pendingMin=${s.pendingMin} scrollOffset=${s.scrollOffset}`);
  console.log('  itemSizeCache =', JSON.stringify(s.sizes));
  console.log('  measurements  =', JSON.stringify(s.meas));
}

async function toggleRow(page, key) {
  const row = page.locator('.jw-node-row', { has: page.locator(`.jw-node-row__key:text-is("${key}")`) }).first();
  await row.waitFor({ state: 'visible', timeout: 15000 });
  await row.locator('.jw-node-row__arrow').click();
  await page.waitForTimeout(500);
}

async function expandChain(page, keys) {
  for (const key of keys) {
    try {
      await toggleRow(page, key);
      console.log(`>>> 已展开 ${key}`);
    } catch (e) {
      console.log(`>>> 展开 ${key} 失败: ${String(e).slice(0, 120)}`);
    }
  }
}

async function openWorkbench(page, payload) {
  if (payload) {
    await page.addInitScript((p) => {
      window.localStorage.setItem('tool-bridge:json-workbench', p);
    }, payload);
  }
  await page.goto(`${UI}/tools/json-workbench`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
}

/** SPA 内切到「收银台日志提取器」（JSON 工作台被 KeepAlive 置为 display:none） */
async function spaLeaveWorkbench(page) {
  await page.locator('.miao-sidebar').getByText('收银台日志提取器', { exact: true }).first().click();
  await page.waitForTimeout(1200);
}

async function spaReturnWorkbench(page) {
  await page.locator('.miao-tab', { hasText: 'JSON 工作台' }).first().click();
  await page.waitForTimeout(1200);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1234, height: 776 } });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
  await page.addInitScript((user) => {
    window.localStorage.setItem('user', JSON.stringify(user));
  }, USER);
  await mockBackend(page);

  console.log(`>>> mode=${MODE}  url=${UI}`);

  if (MODE === 'hidden-bridge' || MODE === 'cashier-flow') {
    await openWorkbench(page, null);           // 空工作台挂载
    await spaLeaveWorkbench(page);             // 工作台被隐藏
    await page.evaluate((p) => {
      window.localStorage.setItem('tool-bridge:json-workbench', p);
      window.dispatchEvent(new CustomEvent('tool-bridge:json-workbench', { detail: p }));
    }, PAYLOAD);

    // 执行器页面交互：
    if (MODE === 'cashier-flow') {
      const openBtn = page.locator('button[title="在 JSON 工作台打开出参"]').first();
      if (await openBtn.count()) {
        console.log('  → 点击「在 JSON 工作台打开出参」');
        await openBtn.click();
      } else {
        console.log('  → 未找到提取器按钮（无解析结果），使用事件桥接');
      }
      await page.waitForTimeout(1500);
      await spaReturnWorkbench(page);
      await dumpCache(page, `${MODE}-1-returned`);
      await dumpRows(page, `${MODE}-1-returned`);
      await expandChain(page, ['content', 'market_info', 'one_key_bind_card_bank_list']);
      await dumpCache(page, `${MODE}-2-expanded`);
      await dumpRows(page, `${MODE}-2-expanded`);
    } else {
      await page.waitForTimeout(1500);
      await dumpCache(page, `${MODE}-1-hidden-with-data`);
      await spaReturnWorkbench(page);
      await dumpCache(page, `${MODE}-2-returned`);
      await dumpRows(page, `${MODE}-2-returned`);
    }
  } else if (MODE === 'spa-hide-show') {
    await openWorkbench(page, PAYLOAD);
    await expandChain(page, ['content', 'market_info', 'one_key_bind_card_bank_list']);
    await dumpCache(page, `${MODE}-1-visible-expanded`);
    await dumpRows(page, `${MODE}-1-visible-expanded`);
    await spaLeaveWorkbench(page);
    await dumpCache(page, `${MODE}-2-hidden`);
    await spaReturnWorkbench(page);
    await dumpCache(page, `${MODE}-3-returned`);
    await dumpRows(page, `${MODE}-3-returned`);
    // 再展开一层（activities / bind_list），观察是否错乱
    await expandChain(page, ['activities', 'bind_list']);
    await dumpCache(page, `${MODE}-4-expanded-more`);
    await dumpRows(page, `${MODE}-4-expanded-more`);
  } else {
    await openWorkbench(page, PAYLOAD);
    await dumpCache(page, `${MODE}-0-initial`);
    await dumpRows(page, `${MODE}-0-initial`);
    await expandChain(page, ['content', 'market_info', 'one_key_bind_card_bank_list']);
    await dumpCache(page, `${MODE}-1-expanded`);
    await dumpRows(page, `${MODE}-1-expanded`);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});