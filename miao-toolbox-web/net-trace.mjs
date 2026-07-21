import { chromium } from 'playwright';

const url = process.argv[2] || 'https://tools.yunmiao.site/tools/json-workbench';
const browser = await chromium.launch();
const page = await browser.newPage();

const getStatus = (r) => { if (!r) return 0; try { return typeof r.status === 'function' ? r.status() : r.status; } catch { return 0; } };
const getHeader = (r, h) => { try { return r?.headers?.()?.[h]; } catch { return undefined; } };

const reqs = [];
page.on('requestfinished', (req) => {
  const r = req.response();
  const t = req.timing();
  reqs.push({
    url: req.url(), type: req.resourceType(), status: getStatus(r),
    size: getHeader(r, 'content-length') || 0,
    ttfb: Math.round(t.responseStart || 0),
    download: Math.round((t.receive || 0)),
  });
});
page.on('requestfailed', (req) => {
  reqs.push({ url: req.url(), type: req.resourceType(), status: 'FAIL', err: req.failure()?.errorText });
});

try {
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  const tLoad = Date.now() - t0;
  await page.waitForTimeout(3000);
  const tEnd = Date.now() - t0;

  reqs.sort((a, b) => ((b.ttfb||0)+(b.download||0)) - ((a.ttfb||0)+(a.download||0)));
  console.log(`\n=== load事件: ${tLoad}ms, 末次请求后: ${tEnd}ms, 共 ${reqs.length} 个请求 ===\n`);
  for (const r of reqs.slice(0, 25)) {
    const dur = (r.ttfb||0) + (r.download||0);
    const extra = r.err ? `  ERR=${r.err}` : '';
    console.log(`${String(dur).padStart(6)}ms  ${(r.type||'').padEnd(8)} ${(r.status||'').toString().padEnd(5)} ${r.url.slice(0, 88)}${extra}`);
  }
} catch (e) {
  console.log('goto error:', e.message);
} finally {
  await browser.close();
}
