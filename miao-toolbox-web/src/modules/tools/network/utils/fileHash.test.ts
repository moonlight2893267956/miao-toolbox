import { describe, expect, it } from 'vitest';
import {
  compareHash,
  formatFileHashText,
  hashUtf8String,
  normalizeHash,
} from './fileHash';

describe('fileHash', () => {
  const hello = hashUtf8String('hello');

  it('hello 的 MD5/SHA 与公开值一致', () => {
    expect(hello.MD5).toBe('5d41402abc4b2a76b9719d911017c592');
    expect(hello['SHA-1']).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d');
    expect(hello['SHA-256']).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
    expect(hello['SHA-512']).toBe(
      '9b71d224bd62f3785d96d46ad3ea3d73319bfbc2890caadae2dff72519673ca72323c3d99ba5c11d7c7acc6e14b8c5da0c4663475c2e5c3adef46f73bcdec043',
    );
  });

  it('normalizeHash 去空白并小写', () => {
    expect(normalizeHash('  Ab Cd  ')).toBe('abcd');
  });

  it('compareHash 忽略大小写与空白', () => {
    const c = compareHash(hello, '  5D41402ABC4B2A76B9719D911017C592  ');
    expect(c.anyMatch).toBe(true);
    expect(c.matched).toContain('MD5');
    expect(c.mismatch).toBe(false);
  });

  it('compareHash 不匹配时 mismatch', () => {
    const c = compareHash(hello, 'deadbeef');
    expect(c.anyMatch).toBe(false);
    expect(c.mismatch).toBe(true);
  });

  it('空预期不判定 mismatch', () => {
    const c = compareHash(hello, '   ');
    expect(c.mismatch).toBe(false);
    expect(c.anyMatch).toBe(false);
  });

  it('formatFileHashText 含算法名', () => {
    const t = formatFileHashText(hello, { name: 'a.txt', size: 5 });
    expect(t).toContain('MD5:');
    expect(t).toContain('a.txt');
    expect(t).toContain(hello['SHA-256']);
  });
});
