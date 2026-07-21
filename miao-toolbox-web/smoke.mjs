import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:4173/login';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  const rootHtml = await page.evaluate(() => document.getElementById('root')?.innerHTML.length || 0);
  const chunks = await page.evaluate(() =>
    [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src'))
  );
  console.log('root innerHTML length =', rootHtml);
  console.log('loaded script chunks:');
  chunks.forEach(c => console.log('  ', c));
  console.log('console errors:', errors.length);
  errors.slice(0, 10).forEach(e => console.log('  ERR:', e));
} catch (e) {
  console.log('goto error:', e.message);
} finally {
  await browser.close();
}
