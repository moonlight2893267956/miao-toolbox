import { describe, it, expect } from 'vitest';
import { replacePlainText } from './replace';

describe('replacePlainText', () => {
  // AC：普通文本全局替换
  it('全局替换所有匹配', () => {
    const r = replacePlainText('foo bar foo', 'foo', 'baz');
    expect(r.resultText).toBe('baz bar baz');
    expect(r.count).toBe(2);
  });

  // AC：非全局仅替换首个
  it('非全局仅替换首个', () => {
    const r = replacePlainText('foo bar foo', 'foo', 'baz', { global: false });
    expect(r.resultText).toBe('baz bar foo');
    expect(r.count).toBe(1);
  });

  // AC：忽略大小写
  it('忽略大小写替换', () => {
    const r = replacePlainText('Foo bar FOO', 'foo', 'x', { ignoreCase: true });
    expect(r.resultText).toBe('x bar x');
    expect(r.count).toBe(2);
  });

  it('大小写敏感时仅精确匹配', () => {
    const r = replacePlainText('Foo bar foo', 'foo', 'x');
    expect(r.resultText).toBe('Foo bar x');
    expect(r.count).toBe(1);
  });

  // 边界：无匹配
  it('无匹配返回原文本 count 0', () => {
    const r = replacePlainText('abc', 'zzz', 'x');
    expect(r.resultText).toBe('abc');
    expect(r.count).toBe(0);
  });

  // 边界：空 find
  it('空查找串返回原文本', () => {
    const r = replacePlainText('abc', '', 'x');
    expect(r.resultText).toBe('abc');
    expect(r.count).toBe(0);
  });

  // 边界：空输入
  it('空输入返回空', () => {
    const r = replacePlainText('', 'a', 'b');
    expect(r.resultText).toBe('');
    expect(r.count).toBe(0);
  });

  // 边界：特殊字符按字面处理（普通模式不解析正则）
  it('普通模式特殊字符按字面处理', () => {
    const r = replacePlainText('a.b c', '.', '-');
    expect(r.resultText).toBe('a-b c');
    expect(r.count).toBe(1);
  });

  // 非字符串输入
  it('非字符串输入返回空', () => {
    // @ts-expect-error 测试非法输入
    expect(replacePlainText(null, 'a', 'b')).toEqual({ resultText: '', count: 0 });
  });
});
