import { describe, it, expect } from 'vitest';
import { buildSnippets, FRAMEWORK_TABS } from './codeSnippets';

describe('buildSnippets — 多框架代码生成', () => {
  it('AC1: 返回 4 个框架 Tab 定义', () => {
    expect(FRAMEWORK_TABS.map((t) => t.key)).toEqual(['spring', 'quartz', 'linux', 'node']);
  });

  it('AC2: 6 位表达式 → Spring @Scheduled 含原 6 位且为完整 demo', () => {
    const r = buildSnippets('0 */5 9 * * 1-5', 'spring6');
    expect(r.valid).toBe(true);
    expect(r.snippets.spring?.code).toContain('@Scheduled(cron = "0 */5 9 * * 1-5")');
    // 完整 demo：含类声明与业务占位
    expect(r.snippets.spring?.code).toContain('public class DemoTask');
    expect(r.snippets.spring?.code).toContain('// TODO: 在此编写你的业务逻辑');
  });

  it('AC3: 同一表达式 → Linux crontab 移除秒字段且为完整一行', () => {
    const r = buildSnippets('0 */5 9 * * 1-5', 'spring6');
    expect(r.snippets.linux?.code).toContain('*/5 9 * * 1-5');
    // 完整 demo：含命令与日志重定向
    expect(r.snippets.linux?.code).toContain('>> /var/log/demo.log 2>&1');
  });

  it('AC4: 同一表达式 → Quartz 日字段 * 替换为 ?', () => {
    const r = buildSnippets('0 */5 9 * * 1-5', 'spring6');
    expect(r.snippets.quartz?.code).toContain('0 */5 9 ? * 1-5');
  });

  it('AC5: 同一表达式 → Node node-cron 为 6 位', () => {
    const r = buildSnippets('0 */5 9 * * 1-5', 'spring6');
    expect(r.snippets.node?.code).toContain('0 */5 9 * * 1-5');
  });

  it('AC6: 5 位表达式 → spring/quartz/node 自动前补秒 0，linux 保持 5 位', () => {
    const r = buildSnippets('*/5 9 * * 1-5', 'linux5');
    expect(r.snippets.spring?.code).toContain('@Scheduled(cron = "0 */5 9 * * 1-5")');
    expect(r.snippets.quartz?.code).toContain('0 */5 9 ? * 1-5');
    expect(r.snippets.node?.code).toContain('0 */5 9 * * 1-5');
    expect(r.snippets.linux?.code).toContain('*/5 9 * * 1-5');
  });

  it('AC6: 5 位方言下非 linux Tab 带补秒说明', () => {
    const r = buildSnippets('*/5 9 * * 1-5', 'linux5');
    expect(r.snippets.spring?.note).toBeTruthy();
    expect(r.snippets.linux?.note).toBeUndefined();
  });

  it('AC8: 空表达式 → valid=false 且无片段', () => {
    const r = buildSnippets('   ', 'linux5');
    expect(r.valid).toBe(false);
    expect(Object.keys(r.snippets).length).toBe(0);
  });

  it('Quartz 日字段非 * 时保持原值（不强行改写 L）', () => {
    const r = buildSnippets('0 0 0 L * ?', 'spring6');
    expect(r.snippets.quartz?.code).toContain('0 0 0 L * ?');
  });

  it('demo 完整性：Quartz/Node 均为可参考完整示例', () => {
    const r = buildSnippets('0 */5 9 * * 1-5', 'spring6');
    // Quartz：Job 实现 + 调度器启动
    expect(r.snippets.quartz?.code).toContain('public class DemoJob implements Job');
    expect(r.snippets.quartz?.code).toContain('scheduler.scheduleJob(job, trigger);');
    // Node：导入 + 调度调用
    expect(r.snippets.node?.code).toContain("require('node-cron')");
    expect(r.snippets.node?.code).toContain('cron.schedule(');
  });
});
