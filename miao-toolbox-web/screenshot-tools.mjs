import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:5173';
const OUT = '/tmp/shots';
mkdirSync(OUT, { recursive: true });

const tools = [
  ['workbench', '/tools'],
  ['text-compare', '/tools/text-compare'],
  ['crypto', '/tools/crypto'],
  ['json-workbench', '/tools/json-workbench'],
  ['translate', '/tools/translate'],
];

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  // 若已登录会重定向走；未登录则填表
  const onLogin = await page.locator('input#username, input[placeholder*="用户名"], input[placeholder*="账号"]').first().count();
  if (onLogin > 0) {
    await page.fill('input#username, input[placeholder*="用户名"], input[placeholder*="账号"]', 'admin').catch(() => {});
    await page.fill('input#password, input[type="password"]', 'Admin123').catch(() => {});
    await page.click('button[type="submit"]').catch(() => {});
    await page.waitForURL('**/tools**', { timeout: 15000 }).catch(() => {});
  }
  // 等待主体渲染
  await page.waitForSelector('body', { timeout: 10000 });
  await page.waitForTimeout(1200);
}

const browser = await chromium.launch();

for (const [name, path] of tools) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  await login(page);
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${name}-light.png` });

  // 暗色模式
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${name}-dark.png` });
  await page.close();
  console.log('captured', name);
}

await browser.close();
console.log('DONE');
