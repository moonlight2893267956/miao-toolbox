import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(600);
await page.locator('#username').fill('test');
await page.locator('#password').fill('Admin123');
await page.getByRole('button', { name: /登\s*录/ }).first().click();
await page.waitForTimeout(1500);

async function probe(label, path) {
  await page.goto('http://localhost:5173' + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const r = await page.evaluate(() => {
    const shell = document.querySelector('.miao-shell');
    const content = document.querySelector('.miao-content');
    return {
      attr: shell?.getAttribute('data-active-page'),
      maxW: getComputedStyle(content).maxWidth,
      width: getComputedStyle(content).width,
      height: getComputedStyle(content).height,
      overflow: getComputedStyle(content).overflow,
    };
  });
  console.log(label, JSON.stringify(r));
}

await probe('1.首页', '/tools');
await probe('2.工具页(翻译)', '/tools/translate');
await probe('3.Admin仪表盘', '/admin');

// 验证从工具页切到 Admin 后仍半屏（KeepAlive 污染场景）
await page.goto('http://localhost:5173/tools/text-compare', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1800);
const before = await page.evaluate(() => document.querySelector('.miao-content').getAttribute('max-width'));
await page.goto('http://localhost:5173/admin', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1800);
const after = await page.evaluate(() => ({
  attr: document.querySelector('.miao-shell').getAttribute('data-active-page'),
  maxW: getComputedStyle(document.querySelector('.miao-content')).maxWidth,
}));
console.log('4.工具页->Admin (attr=' + after.attr + ', maxW=' + after.maxW + ')  beforeMaxW=' + before);

await browser.close();
