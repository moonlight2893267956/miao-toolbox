import { chromium } from 'playwright';

const url = process.argv[2] || 'https://tools.yunmiao.site/tools/json-workbench';
const browser = await chromium.launch();
const page = await browser.newPage();

const reqs = [];
page.on('requestfinished', async (req) => {
  const r = req.response();
  const timing = req.timing();
  reqs.push({
    url: req.url(),
    type: req.resourceType(),
    status: r ? r.status() : 0,
    size: r ? (r.headers()['content-length'] || 0) : 0,
    // 关键耗时(ms): 到首字节 + 传输
    wait: Math.round(timing.wait || 0),
    dns: Math.round(timing.dns || 0),
    connect: Math.round(timing.connect || 0),
    ttfb: Math.round(timing.responseStart || 0),
    download: Math.round((timing.receive || 0)),
  });
});
page.on('requestfailed', (req) => {
  reqs.push({ url: req.url(), type: req.resourceType(), status: 'FAILED', err: req.failure()?.errorText });
});

try {
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  const tLoad = Date.now() - t0;
  // 再等一会看有无长尾请求
  await page.waitForTimeout(3000);
  const tEnd = Date.now() - t0;

  reqs.sort((a, b) => (b.ttfb + b.download) - (a.ttfb + a.download));
  console.log(`\n=== load事件: ${tLoad}ms, 末次请求后: ${tEnd}ms, 共 ${reqs.length} 个请求 ===\n`);
  for (const r of reqs.slice(0, 25)) {
    const dur = (r.ttfb || 0) + (r.download || 0);
    console.log(`${String(dur).padStart(6)}ms  ${(r.type||'').padEnd(8)} ${(r.status||'').toString().padEnd(5)} ${r.url.slice(0, 90)}`);
  }
} catch (e) {
  console.log('goto error:', e.message);
} finally {
  await browser.close();
}
