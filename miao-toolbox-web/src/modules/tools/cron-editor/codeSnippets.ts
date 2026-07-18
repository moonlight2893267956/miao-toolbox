// Cron 表达式 → 多框架代码片段（FR-16 / Story 2.1）
// 纯函数：根据当前表达式与方言生成 4 个框架「完整可参考 demo」，零外部依赖。
import type { CronDialect } from './types';
import { transformDialect } from './utils/cronDialect';

export type FrameworkKey = 'spring' | 'quartz' | 'linux' | 'node';

export interface FrameworkTab {
  key: FrameworkKey;
  label: string;
  desc: string;
}

/** 4 个目标框架 Tab */
export const FRAMEWORK_TABS: FrameworkTab[] = [
  { key: 'spring', label: 'Spring @Scheduled', desc: 'Spring / Spring Boot 定时任务（6 位，含秒）' },
  { key: 'quartz', label: 'Quartz', desc: 'Quartz Scheduler（6 位，日/星期其一为 ?）' },
  { key: 'linux', label: 'Linux crontab', desc: '系统 crontab（5 位，无秒）' },
  { key: 'node', label: 'Node node-cron', desc: 'node-cron（6 位，含秒）' },
];

export interface CodeSnippet {
  /** 完整可复制 demo 代码 */
  code: string;
  /** 片段释注（如方言补齐说明） */
  note?: string;
}

export interface CodeSnippetsResult {
  valid: boolean;
  snippets: Partial<Record<FrameworkKey, CodeSnippet>>;
}

/** 将日字段的 `*` 替换为 `?`（Quartz 要求日与星期互斥） */
function quartzDayToQuestion(expr6: string): string {
  const tokens = expr6.trim().split(/\s+/);
  // 6 位：秒 分 时 日 月 星期
  if (tokens.length === 6 && tokens[3].trim() === '*') {
    tokens[3] = '?';
  }
  return tokens.join(' ');
}

/** Spring：完整 @Component + @Scheduled 定时任务 demo */
function buildSpringDemo(expr6: string): string {
  return [
    'package com.example.task;',
    '',
    'import org.springframework.scheduling.annotation.EnableScheduling;',
    'import org.springframework.scheduling.annotation.Scheduled;',
    'import org.springframework.stereotype.Component;',
    '',
    '@Component',
    '@EnableScheduling',
    'public class DemoTask {',
    '',
    `    // 定时执行（cron = "${expr6}"）`,
    `    @Scheduled(cron = "${expr6}")`,
    '    public void run() {',
    '        System.out.println("定时任务执行：" + java.time.LocalDateTime.now());',
    '        // TODO: 在此编写你的业务逻辑',
    '    }',
    '}',
  ].join('\n');
}

/** Quartz：Job 实现 + 调度器启动 demo */
function buildQuartzDemo(expr6: string): string {
  return [
    'import org.quartz.*;',
    'import org.quartz.impl.StdSchedulerFactory;',
    '',
    'public class DemoJob implements Job {',
    '    @Override',
    '    public void execute(JobExecutionContext ctx) {',
    '        System.out.println("任务执行：" + java.time.LocalDateTime.now());',
    '        // TODO: 在此编写你的业务逻辑',
    '    }',
    '',
    '    public static void main(String[] args) throws Exception {',
    '        JobDetail job = JobBuilder.newJob(DemoJob.class)',
    '                .withIdentity("demoJob", "default")',
    '                .build();',
    '',
    '        Trigger trigger = TriggerBuilder.newTrigger()',
    '                .withIdentity("demoTrigger", "default")',
    `                .withSchedule(CronScheduleBuilder.cronSchedule("${expr6}"))`,
    '                .build();',
    '',
    '        Scheduler scheduler = StdSchedulerFactory.getDefaultScheduler();',
    '        scheduler.start();',
    '        scheduler.scheduleJob(job, trigger);',
    '    }',
    '}',
  ].join('\n');
}

/** Linux crontab：完整一行（含示例命令与日志重定向） */
function buildLinuxDemo(expr5: string): string {
  return [
    `# 定时执行（cron = "${expr5}"）`,
    `${expr5}  /usr/bin/php /path/to/artisan demo:run >> /var/log/demo.log 2>&1`,
  ].join('\n');
}

/** Node node-cron：完整调度脚本 demo */
function buildNodeDemo(expr6: string): string {
  return [
    "const cron = require('node-cron');",
    '',
    `// 定时执行（cron = "${expr6}"）`,
    `cron.schedule('${expr6}', () => {`,
    '    console.log("定时任务执行：", new Date().toLocaleString());',
    '    // TODO: 在此编写你的业务逻辑',
    '});',
  ].join('\n');
}

/**
 * 生成 4 个框架「完整 demo」。
 * @param expr 当前表达式字符串
 * @param dialect 当前方言
 * @returns valid=false 时仅用于提示「表达式无效」，snippets 为空
 */
export function buildSnippets(expr: string, dialect: CronDialect): CodeSnippetsResult {
  const trimmed = expr.trim();
  if (trimmed === '') {
    return { valid: false, snippets: {} };
  }

  const linux5 = transformDialect(trimmed, dialect, 'linux5'); // 5 位（去秒）
  const spring6 = transformDialect(trimmed, dialect, 'spring6'); // 6 位（补秒 0）
  const quartz6 = quartzDayToQuestion(spring6);

  const snippets: Record<FrameworkKey, CodeSnippet> = {
    spring: { code: buildSpringDemo(spring6) },
    node: { code: buildNodeDemo(spring6) },
    quartz: { code: buildQuartzDemo(quartz6) },
    linux: { code: buildLinuxDemo(linux5) },
  };

  // 方言补齐说明（仅当确实发生了补秒时提示）
  if (dialect === 'linux5') {
    (Object.keys(snippets) as FrameworkKey[]).forEach((k) => {
      if (k !== 'linux') {
        snippets[k].note = '已按 6 位方言前补秒字段 0';
      }
    });
  }

  return { valid: true, snippets };
}
