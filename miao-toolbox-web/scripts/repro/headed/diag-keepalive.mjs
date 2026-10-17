/**
 * 诊断：在 KeepAlive（display:none）标签切换下，JSON 工作台树行是否仍挂载、测量缓存是否被写成 0。
 * 用法：cd miao-toolbox-web && HEADLESS=1 node scripts/repro/headed/diag-keepalive.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAYLOAD_TEXT = fs.readFileSync(path.join(__dirname, '..', 'payload-cashier.json'), 'utf8');
const HEADLESS = process.env.HEADLESS !== '0';
const UI = 'http://localhost:5173';
const OUT = '/tmp/jw-repro/headed/diag-keepalive';
fs.mkdirSync(OUT, { recursive: true });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = `${b64({ alg: 'HS256' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 7200 })}.sig`;
const USER = { id: 1, username: 'repro', email: 'a@b.c', emailVerified: true, roles: [{ id: 1, code: 'SUPER_ADMIN', name: '超级管理员' }], githubUsername: null, googleUsername: null, avatarUrl: null };

async function snap(page, tag) {
  const d = await page.evaluate(() => {
    const panel = document.querySelector('.jw-tree-panel');
    const v = window.__jwVirtualizer;
    const tabs = [...document.querySelectorAll('.miao-tab')].map((t) => t.textContent.trim().slice(0, 12));
    return {
      tabs,
      panels: document.querySelectorAll('.jw-tree-panel').length,
      panelRect: panel ? { w: Math.round(panel.getBoundingClientRect().width), h: Math.round(panel.getBoundingClientRect().height) } : null,
      panelOffsetParent: panel ? !!panel.offsetParent : null,
      rowWrappers: document.querySelectorAll('.jw-tree-rows > div').length,
      count: v ? v.options.count : null,
      total: v ? Math.round(v.getTotalSize()) : null,
      sizes: v ? [...v.itemSizeCache.entries()] : null,
      zeroSizes: v ? [...v.itemSizeCache.entries()].filter(([, s]) => s < 1).map(([k]) => k) : null,
      location: location.pathname,
    };
  });
  console.log(`\n[${tag}]`, JSON.stringify(d));
  return d;
}

async function main() {
  const browser = await chromium.launch({ headless: HEADLESS });
  const ctx = await browser.newContext({ viewport: { width: 1234, height: 776 } });
  const page = await ctx.newPage();
  await page.addInitScript(({ p, u }) => {
    localStorage.setItem('tool-bridge:json-workbench', p);
    localStorage.setItem('user', JSON.stringify(u));
  }, { p: PAYLOAD_TEXT, u: USER });
  await page.route('**/api/**', (route) => {
    const url = route.request().url();
    const body = url.includes('/auth/refresh')
      ? { code: 'OK', data: { accessToken: JWT, signingKey: 'k', user: USER, mustChangePassword: false } }
      : { code: 'OK', data: { routes: [] } };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.goto(`${UI}/tools/json-workbench`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await snap(page, '1-初始工作台');
  // 展开三层
  for (const key of ['content', 'market_info', 'one_key_bind_card_bank_list']) {
    const row = page.locator('.jw-node-row', { has: page.locator(`.jw-node-row__key:text-is("${key}")`) }).first();
    if (await row.count()) { await row.locator('.jw-node-row__arrow').click().catch(() => {}); await page.waitForTimeout(400); }
  }
  await snap(page, '2-已展开');

  // 侧栏切到提取器
  await page.locator('.miao-sidebar').getByText('收银台日志提取器', { exact: true }).first().click();
  await page.waitForTimeout(1500);
  await snap(page, '3-侧栏切走-隐藏中');

  // 点 tab 切回
  const wbTab = page.locator('.miao-tab', { hasText: 'JSON 工作台' }).first();
  if (await wbTab.count()) { await wbTab.click(); } else { console.log('!! 找不到 JSON 工作台 tab'); }
  await page.waitForTimeout(120);
  await snap(page, '4-tab切回-120ms');
  await page.waitForTimeout(1000);
  await snap(page, '5-tab切回-1.1s');
  await page.screenshot({ path: path.join(OUT, 'after-return.png') });
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });