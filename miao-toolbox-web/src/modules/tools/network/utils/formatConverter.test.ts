import { describe, it, expect } from 'vitest';
import {
  convertDataFormat,
  parseCsv,
  stringifyCsv,
  offsetToLineCol,
  FormatConvertError,
} from './formatConverter';

describe('JSON → YAML (AC1)', () => {
  it('合法 JSON 转为 YAML', () => {
    const input = '{\n  "name": "miao",\n  "enabled": true\n}';
    const r = convertDataFormat(input, 'json', 'yaml');
    expect(r.error).toBeUndefined();
    expect(r.output).toMatch(/name:\s*miao/);
    expect(r.output).toMatch(/enabled:\s*true/);
  });
});

describe('非法 JSON 行号 (AC2)', () => {
  it('坏 JSON 提示行号', () => {
    const input = '{\n  "a": 1,\n  bad\n}';
    const r = convertDataFormat(input, 'json', 'yaml');
    expect(r.output).toBe('');
    expect(r.error).toBeTruthy();
    expect(r.error).toMatch(/第 \d+ 行/);
  });
});

describe('CSV → JSON (AC3)', () => {
  it('保留表头与引号转义', () => {
    const csv = 'name,note\nAlice,"hello, world"\nBob,"say ""hi"""\n';
    const r = convertDataFormat(csv, 'csv', 'json');
    expect(r.error).toBeUndefined();
    const data = JSON.parse(r.output) as { name: string; note: string }[];
    expect(data).toHaveLength(2);
    expect(data[0]).toEqual({ name: 'Alice', note: 'hello, world' });
    expect(data[1]).toEqual({ name: 'Bob', note: 'say "hi"' });
  });

  it('parseCsv / stringifyCsv 往返表头', () => {
    const rows = parseCsv('id,name\n1,a\n');
    expect(rows[0]).toEqual({ id: '1', name: 'a' });
    const out = stringifyCsv(rows);
    expect(out.split('\n')[0]).toBe('id,name');
  });
});

describe('YAML / TOML 往返', () => {
  it('YAML → JSON', () => {
    const r = convertDataFormat('foo: bar\nn: 1\n', 'yaml', 'json');
    expect(r.error).toBeUndefined();
    expect(JSON.parse(r.output)).toEqual({ foo: 'bar', n: 1 });
  });

  it('JSON → TOML → JSON', () => {
    const src = { title: 'demo', count: 3 };
    const toToml = convertDataFormat(JSON.stringify(src), 'json', 'toml');
    expect(toToml.error).toBeUndefined();
    const back = convertDataFormat(toToml.output, 'toml', 'json');
    expect(back.error).toBeUndefined();
    expect(JSON.parse(back.output)).toEqual(src);
  });
});

describe('offsetToLineCol', () => {
  it('计算行号', () => {
    const text = 'ab\ncd\nef';
    expect(offsetToLineCol(text, 0)).toEqual({ line: 1, column: 1 });
    expect(offsetToLineCol(text, 3)).toEqual({ line: 2, column: 1 });
  });
});

describe('FormatConvertError', () => {
  it('可携带行号', () => {
    const e = new FormatConvertError('x', 2, 5);
    expect(e.line).toBe(2);
    expect(e.column).toBe(5);
  });
});
