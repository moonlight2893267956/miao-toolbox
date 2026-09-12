// 临时：详情页通知面板截图（用完即删）
import { chromium } from 'playwright';
const BASE = 'http://localhost:5173';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('input#username', 'test');
await page.fill('input[type="password"]', 'Admin123');
await page.locator('button[type="submit"]').click();
await page.waitForTimeout(2000);
await page.goto(`${BASE}/tools/task-scheduler`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.locator('.ts-name-link').first().click();
await page.waitForTimeout(1500);
await page.locator('.ts-page').evaluate((el) => { const p = [...el.querySelectorAll('.ts-panel-label')].find((x) => x.textContent.includes('通知')); if (p) p.scrollIntoView({ block: 'center' }); });
await page.waitForTimeout(400);
await page.screenshot({ path: 'ts-shots/12-detail-notify.png' });
await browser.close();
