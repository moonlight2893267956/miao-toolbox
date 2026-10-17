/**
 * JSON 工作台树形视图行几何模糊测试
 * 目的：随机做展开/折叠/展开全部/视图切换/滚动，抓出「行重叠 / 零高 / 尺寸缓存异常」
 * 用法：node scripts/repro/jw-tree-fuzz.mjs [ops] [seed]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAYLOAD = fs.readFileSync(path.join(__dirname, 'payload-cashier.json'), 'utf8');
const UI = process.env.UI_BASE ?? 'http://localhost:5173';
const OPS = Number(process.argv[2] ?? 120);
const SEED = Number(process.argv[3] ?? 1);
const OUT = '/tmp/jw-repro';
fs.mkdirSync(OUT, { recursive: true });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = `${b64({ alg: 'HS256' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 7200 })}.sig`;
const USER = { id: 1, username: 'repro', email: 'a@b.c', emailVerified: true, roles: [{ id: 1, code: 'SUPER_ADMIN', name: '超级管理员' }], githubUsername: null, googleUsername: null, avatarUrl: null };

let rngState = SEED;
const rand = (n) => { rngState = (rngState * 1103515245 + 12345) % 2147483648; return rngState % n; };

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1234, height: 776 } });
  const warnings = [];
  page.on('console', (m) => {
    const t = m.text();
    if (/same key|Warning|error/i.test(t)) warnings.push(`${m.type()}: ${t.slice(0, 200)}`);
  });
  page.on('pageerror', (e) => warnings.push(`pageerror: ${String(e).slice(0, 200)}`));
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
  await page.goto(`${UI}/tools/json-workbench`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  const probe = async () => page.evaluate(() => {
    const wraps = [...document.querySelectorAll('.jw-tree-rows > div')];
    const rows = wraps.map((w) => {
      const r = w.getBoundingClientRect();
      const row = w.querySelector('.jw-node-row');
      const k = row?.querySelector('.jw-node-row__key,.jw-node-row__root-title');
      const badge = row?.querySelector('.jw-badge');
      const br = badge?.getBoundingClientRect();
      return { i: +w.getAttribute('data-index'), top: Math.round(r.top * 100) / 100, h: Math.round(r.height * 100) / 100, label: (k?.textContent ?? '').trim().slice(0, 28), badgeTop: br ? Math.round(br.top * 100) / 100 : null, badgeLeft: br ? Math.round(br.left * 100) / 100 : null, badgeRight: br ? Math.round(br.right * 100) / 100 : null };
    });
    rows.sort((a, b) => a.top - b.top || a.i - b.i);
    const overlaps = [];
    for (let i = 0; i < rows.length - 1; i++) {
      if (rows[i + 1].top < rows[i].top + rows[i].h - 3) {
        overlaps.push({ a: rows[i].i, aLabel: rows[i].label, aH: rows[i].h, b: rows[i + 1].i, bLabel: rows[i + 1].label, overlap: Math.round((rows[i].top + rows[i].h - rows[i + 1].top) * 100) / 100 });
      }
    }
    const zero = rows.filter((r) => r.h < 1).map((r) => r.i);
    const v = window.__jwVirtualizer;
    const sizeArr = v ? [...v.itemSizeCache.values()] : [];
    const meas = v ? (() => { const a = []; const mc = v.measurementsCache; for (let i = 0; i < mc.length; i++) a.push([i, Math.round(mc[i].start), Math.round(mc[i].size)]); return a; })() : [];
    // 行间距与真实高度不一致（说明测量缓存与渲染不一致）
    const drift = [];
    const byIndex = [...rows].sort((a, b) => a.i - b.i);
    void byIndex;
    return { overlaps, zero, sizeArr, meas, count: v ? v.options.count : -1, total: v ? Math.round(v.getTotalSize()) : -1, rows: rows.length };
  });

  const anomalies = [];
  for (let step = 0; step < OPS; step++) {
    const action = rand(6);
    try {
      if (action <= 2) {
        const arrows = await page.locator('.jw-node-row__arrow').all();
        if (arrows.length) await arrows[rand(arrows.length)].click({ timeout: 3000 }).catch(() => {});
      } else if (action === 3) {
        const btn = page.locator('.jw-ellipsis-expand-btn').first();
        if (await btn.count()) await btn.click({ timeout: 3000 }).catch(() => {});
      } else if (action === 4) {
        // 右键 → 展开全部 / 折叠全部
        const rows = await page.locator('.jw-node-row').all();
        if (rows.length) {
          await rows[rand(rows.length)].click({ button: 'right', timeout: 3000 }).catch(() => {});
          await page.waitForTimeout(150);
          const item = page.locator('.ant-dropdown-menu-item', { hasText: rand(2) ? '展开全部' : '折叠全部' }).first();
          if (await item.count()) await item.click({ timeout: 3000 }).catch(() => {});
          await page.keyboard.press('Escape');
        }
      } else {
        await page.evaluate(() => {
          const el = document.querySelector('.jw-tree-panel');
          if (el) el.scrollTop = Math.max(0, el.scrollTop + (Math.random() * 2 - 0.5) * 200);
        });
      }
    } catch { /* 忽略单步失败 */ }
    await page.waitForTimeout(220);

    const r = await probe();
    if (r.overlaps.length || r.zero.length) {
      anomalies.push({ step, action, ...r, warnings: warnings.slice(-5) });
      console.log(`\n❌ step=${step} action=${action} count=${r.count} total=${r.total} rows=${r.rows}`);
      console.log('   重叠:', JSON.stringify(r.overlaps));
      console.log('   零高:', JSON.stringify(r.zero));
      console.log('   sizes:', JSON.stringify(r.sizeArr));
      console.log('   meas :', JSON.stringify(r.meas));
      await page.screenshot({ path: path.join(OUT, `fuzz-anomaly-${SEED}-${step}.png`) });
      if (anomalies.length >= 3) break;
    }
  }
  console.log(`\n>>> 共 ${OPS} 步，异常 ${anomalies.length} 次`);
  if (warnings.length) console.log('>>> 控制台警告:', JSON.stringify([...new Set(warnings)].slice(0, 8), null, 1));
  await browser.close();
  process.exit(anomalies.length ? 0 : 2);
}

main().catch((e) => { console.error(e); process.exit(1); });