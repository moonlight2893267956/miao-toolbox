import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:5174/tools/text-batch-processor';
const out = process.argv[3] || '/tmp/tbp-shot.png';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
await page.goto(url, { waitUntil: 'networkidle' });
// 输入测试文本并点击排序 tab
try {
  const ta = page.locator('textarea').first();
  await ta.fill('banana\nApple\ncherry\napple\nZebra');
  await page.getByRole('tab', { name: /排序/ }).click();
  await page.waitForTimeout(600);
} catch (e) {
  console.log('interact err', e.message);
}
await page.screenshot({ path: out, fullPage: false });
console.log('shot saved', out);
await browser.close();
