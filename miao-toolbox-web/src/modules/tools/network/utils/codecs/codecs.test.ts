import { describe, it, expect } from 'vitest';
import {
  base64Encode,
  base64Decode,
  Base64DecodeError,
  urlEncode,
  urlDecode,
  htmlEncode,
  htmlDecode,
  hexEncode,
  hexDecode,
  runCodec,
} from './index';

describe('Base64 (AC1/AC2/AC3)', () => {
  it('AC1: hello world → aGVsbG8gd29ybGQ=', () => {
    expect(base64Encode('hello world')).toBe('aGVsbG8gd29ybGQ=');
  });

  it('AC2: 中文 UTF-8 编解码往返', () => {
    const src = '你好，世界';
    const encoded = base64Encode(src);
    expect(encoded.length).toBeGreaterThan(0);
    expect(base64Decode(encoded)).toBe(src);
  });

  it('AC3: 截断 Base64 给出位置提示', () => {
    // 长度模 4 余 1 的截断串（如 aGVsb = 5）永远非法
    expect(() => base64Decode('aGVsb')).toThrow(Base64DecodeError);
    try {
      base64Decode('aGVsb');
    } catch (e) {
      expect(e).toBeInstanceOf(Base64DecodeError);
      const err = e as Base64DecodeError;
      expect(err.message).toMatch(/截断|长度无效|第 \d+ 位/);
      expect(err.position).toBeDefined();
    }
  });

  it('AC3: 非法字符报位置', () => {
    try {
      base64Decode('aGVs@bG8=');
      expect.fail('should throw');
    } catch (e) {
      const err = e as Base64DecodeError;
      expect(err.message).toContain('第 5 位');
      expect(err.position).toBe(4);
    }
  });

  it('解码标准 hello world', () => {
    expect(base64Decode('aGVsbG8gd29ybGQ=')).toBe('hello world');
  });
});

describe('URL / HTML / Hex', () => {
  it('URL 编解码', () => {
    const s = 'a=1&b=你好';
    expect(urlDecode(urlEncode(s))).toBe(s);
  });

  it('HTML 实体', () => {
    expect(htmlEncode('<div>&"\'')).toBe('&lt;div&gt;&amp;&quot;&#39;');
    expect(htmlDecode('&lt;div&gt;&amp;')).toBe('<div>&');
  });

  it('Hex 往返', () => {
    expect(hexEncode('Hi')).toBe('4869');
    expect(hexDecode('4869')).toBe('Hi');
    expect(hexDecode('48 69')).toBe('Hi');
  });
});

describe('runCodec', () => {
  it('统一入口 Base64 编码', () => {
    const r = runCodec('base64', 'encode', 'hello world');
    expect(r.error).toBeUndefined();
    expect(r.output).toBe('aGVsbG8gd29ybGQ=');
  });

  it('错误路径返回 error 字段', () => {
    const r = runCodec('base64', 'decode', '!!!');
    expect(r.output).toBe('');
    expect(r.error).toBeTruthy();
  });
});
