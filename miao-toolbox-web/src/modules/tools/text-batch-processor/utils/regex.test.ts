import { describe, it, expect } from 'vitest';
import { validateRegex, normalizeReplacement, JS_FLAGS } from './regex';

describe('validateRegex', () => {
  // AC：非法正则（如未闭合分组）返回 valid: false + 错误原因
  it('非法正则返回 valid:false 且包含错误原因', () => {
    const r = validateRegex('(');
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('非法正则（未闭合字符类）返回错误', () => {
    const r = validateRegex('[a-z');
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
  });

  // AC：合法正则返回 valid: true
  it('合法正则返回 valid:true', () => {
    const r = validateRegex('\\d+', 'g');
    expect(r.valid).toBe(true);
    expect(r.error).toBeNull();
  });

  it('空 pattern 视为合法（不校验）', () => {
    const r = validateRegex('');
    expect(r.valid).toBe(true);
    expect(r.error).toBeNull();
  });

  it('非法 flags 被过滤，不影响判定', () => {
    const r = validateRegex('a', 'xz');
    expect(r.valid).toBe(true);
    expect(r.error).toBeNull();
  });

  it('支持组合 flags', () => {
    const r = validateRegex('\\b\\w+\\b', 'gim');
    expect(r.valid).toBe(true);
  });
});

describe('normalizeReplacement', () => {
  // AC：${name} → $<name>
  it('${name} 被归一化为 $<name>', () => {
    expect(normalizeReplacement('${year}')).toBe('$<year>');
    expect(normalizeReplacement('${foo}_${bar}')).toBe('$<foo>_$<bar>');
  });

  // AC：原生 $<name> 和 $1 / $2 不受影响
  it('原生 $<name> 与 $1/$2 不受影响', () => {
    expect(normalizeReplacement('$<year>')).toBe('$<year>');
    expect(normalizeReplacement('$1-$2')).toBe('$1-$2');
  });

  it('混合写法同时保留', () => {
    expect(normalizeReplacement('${a}-$<b>-$1')).toBe('$<a>-$<b>-$1');
  });

  // 边界：$$ 与 $& 保持原样
  it('$$ 与 $& 保持原样', () => {
    expect(normalizeReplacement('$$$&')).toBe('$$$&');
  });
});

describe('JS_FLAGS', () => {
  it('包含常用标志位', () => {
    expect(JS_FLAGS).toContain('g');
    expect(JS_FLAGS).toContain('i');
    expect(JS_FLAGS).toContain('m');
    expect(JS_FLAGS).toContain('s');
  });
});
