#!/usr/bin/env node
/**
 * 查码（五笔练习室 · 查码 Tab）反查候选的浏览器验收脚本
 *
 * 覆盖两条容易回归的规则：
 *   1. 候选卡片不再溢出 —— 卡片是「候选字 + 简码/词组标注」两行内容，
 *      历史上写死 height:52px，标注被挤到卡片外压在边框上。
 *   2. 词组候选可点击 —— 反查命中的可能是**词组**（如 vvvv → 女 / 妇女），
 *      点它必须锚定到讲解台讲取码规则，而不是什么都不发生。
 *
 * 前置条件：
 *   - 前端 dev server 已启动：`cd miao-toolbox-web && npm run dev`
 *   - **不需要后端**：所有 /api/** 都被打桩（登录态直接注入 localStorage），
 *     码表是前端本地 JSON 分片，查码功能本身可离线运行。
 *
 * 运行：
 *   BASE=http://localhost:5173 node scripts/verify-wubi-lookup-candidate.mjs
 *   （默认 BASE=http://localhost:5199）
 *
 * 退出码：全部通过 0，否则 1。
 */

import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/*
 * playwright 装在前端工程里（根目录没有 node_modules），
 * 所以按前端工程的 package.json 去解析，脚本从任何目录运行都能用。
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(here, '../miao-toolbox-web');
const require = createRequire(path.join(webDir, 'package.json'));
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:5199';

/** 打桩用户：超管身份直接放行路由权限检查 */
const USER = {
  id: 1,
  username: 'admin',
  email: 'admin@example.com',
  emailVerified: true,
  roles: [{ id: 1, code: 'SUPER_ADMIN', name: '超级管理员' }],
  githubUsername: null,
  googleUsername: null,
  avatarUrl: null,
};

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// 没有后端：先把登录态写进 localStorage，再把 /api/** 全部打桩
await page.addInitScript((user) => {
  localStorage.setItem('user', JSON.stringify(user));
  localStorage.setItem('miao_routes', JSON.stringify(['TOOL_WUBI_TUTOR']));
  localStorage.removeItem('mustChangePassword');
}, USER);

await page.route('**/api/**', async (route) => {
  const url = route.request().url();
  const ok = (data) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'OK', message: '', requestId: 'stub', data }),
    });
  if (url.includes('/api/auth/refresh')) {
    return ok({ accessToken: 'stub-token', signingKey: 'stub-key', user: USER, mustChangePassword: false });
  }
  if (url.includes('/api/auth/me/routes')) return ok({ routes: ['TOOL_WUBI_TUTOR'] });
  if (url.includes('/api/wubi/ai/')) {
    // 不调真实模型：讲解台会显示降级提示，但锚点切换不受影响
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'AI_UNAVAILABLE', message: '验收打桩：不调模型', requestId: 'stub' }),
    });
  }
  return ok({});
});

try {
  await page.goto(`${BASE}/tools/wubi-tutor`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.wt-nav__tab', { timeout: 30000 });
} catch (err) {
  console.error(`❌ 打开 ${BASE}/tools/wubi-tutor 失败：${err.message}`);
  console.error('   请先启动 dev server（cd miao-toolbox-web && npm run dev），或用 BASE=... 指定地址');
  await browser.close();
  process.exit(1);
}

await page.click('.wt-nav__tab:has-text("查码")');
await page.waitForSelector('input[aria-label="查码输入框"]', { timeout: 20000 });
// 码表（本地 JSON 分片）就绪前整个查码界面不渲染
await page.waitForSelector('.wt-lookup__empty', { timeout: 30000 });

await page.fill('input[aria-label="查码输入框"]', 'vvvv');
await page.waitForSelector('.wt-lookup__candidate', { timeout: 10000 });

// ── AC1：结论行按字/词混合如实说「个结果」（vvvv → 女 + 妇女） ──
const summary = (await page.textContent('.wt-lookup__summary')).replace(/\s+/g, '');
check('结论行按字/词混合说「个结果」', summary.includes('2个结果'), summary);

// ── AC2：候选构成与词组标注 ──
const cards = await page.$$eval('.wt-lookup__candidate', (els) =>
  els.map((el) => ({
    text: el.querySelector('.wt-lookup__candidate-text')?.textContent,
    isPhrase: !!el.querySelector('.wt-lookup__badge--phrase'),
    title: el.getAttribute('title'),
    scrollH: el.scrollHeight,
    clientH: el.clientHeight,
  })),
);
check(
  '候选为 女(字) + 妇女(词组)',
  cards.length === 2 && cards[0].text === '女' && cards[1].text === '妇女' && cards[1].isPhrase,
  JSON.stringify(cards.map((c) => `${c.text}${c.isPhrase ? '(词组)' : ''}`)),
);
check('词组候选有「点击看取码讲解」提示', !!cards[1]?.title && cards[1].title.includes('词组'), String(cards[1]?.title));

// ── AC3：两行内容不溢出卡片 ──
const overflow = cards.map((c) => c.scrollH - c.clientH);
check('候选卡片内容不溢出', overflow.every((v) => v <= 0), `scrollH-clientH = ${JSON.stringify(overflow)}`);

// ── AC4：点词组候选真的锚定到讲解台 ──
const anchorText = () => page.textContent('.wt-chat__anchor-text').catch(() => '');
const before = (await anchorText()).trim();
await page.click('.wt-lookup__candidate:has-text("妇女")');
await page.waitForTimeout(400);
const afterPhrase = (await anchorText()).trim();
const rule = (await page.textContent('.wt-chat__rule').catch(() => '')).trim();
check(
  '点词组候选后讲解台锚定到该词',
  afterPhrase === '妇女',
  `点击前="${before || '(空态)'}" 点击后="${afterPhrase}" 规则="${rule}"`,
);

// ── AC5：点单字候选仍然可用 ──
await page.click('.wt-lookup__candidate:has-text("女")');
await page.waitForTimeout(300);
const afterChar = (await anchorText()).trim();
check('点单字候选锚定到该字', afterChar === '女', `锚点="${afterChar}"`);

await browser.close();

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} 通过`);
process.exit(failed === 0 ? 0 : 1);