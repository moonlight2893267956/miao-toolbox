import { describe, it, expect } from 'vitest';
import { CRON_CHEAT_SHEET } from './cheatSheetData';

describe('CRON_CHEAT_SHEET — 语法速查数据', () => {
  it('AC2/AC4: 包含全部 8 个特殊字符条目', () => {
    const symbols = CRON_CHEAT_SHEET.map((e) => e.symbol);
    expect(symbols).toEqual(['*', ',', '-', '/', '?', 'L', 'W', '#']);
  });

  it('每条目字段完整（symbol/meaning/example/exampleDesc/applicableFields）', () => {
    for (const e of CRON_CHEAT_SHEET) {
      expect(e.symbol).toBeTruthy();
      expect(e.meaning).toBeTruthy();
      expect(e.example).toBeTruthy();
      expect(e.exampleDesc).toBeTruthy();
      expect(Array.isArray(e.applicableFields)).toBe(true);
      expect(e.applicableFields.length).toBeGreaterThan(0);
    }
  });

  it('L/W/# 的适用字段为受限字段', () => {
    const bySymbol = Object.fromEntries(CRON_CHEAT_SHEET.map((e) => [e.symbol, e]));
    expect(bySymbol['?'].applicableFields).toEqual(['日', '星期']);
    expect(bySymbol['L'].applicableFields).toEqual(['日', '星期']);
    expect(bySymbol['W'].applicableFields).toEqual(['日']);
    expect(bySymbol['#'].applicableFields).toEqual(['星期']);
  });

  it('通配类字符（* , - /）适用于全部 6 个字段', () => {
    const all = ['秒', '分', '时', '日', '月', '星期'];
    for (const sym of ['*', ',', '-', '/']) {
      const entry = CRON_CHEAT_SHEET.find((e) => e.symbol === sym)!;
      expect(entry.applicableFields).toEqual(all);
    }
  });
});
