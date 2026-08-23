import { describe, it, expect } from 'vitest';
import { extractLinesContaining, splitLines, formatExtractMatches, countUniqueMatches } from './extract';
import type { ExtractMatch } from './extract';

describe('extractLinesContaining', () => {
  // AC：行包含提取
  it('提取包含关键词的整行', () => {
    const r = extractLinesContaining('hello world\nfoo bar\nhello again', { keyword: 'hello' });
    expect(r.resultText).toBe('hello world\nhello again');
    expect(r.lines).toEqual(['hello world', 'hello again']);
    expect(r.stats).toEqual({ remaining: 2, removed: 1 });
  });

  it('关键词为空时返回全部行', () => {
    const r = extractLinesContaining('a\nb', { keyword: '' });
    expect(r.resultText).toBe('a\nb');
    expect(r.stats).toEqual({ remaining: 2, removed: 0 });
  });

  it('忽略大小写', () => {
    const r = extractLinesContaining('Apple\nbanana', { keyword: 'apple', ignoreCase: true });
    expect(r.resultText).toBe('Apple');
  });

  it('不忽略大小写时大小写敏感', () => {
    const r = extractLinesContaining('Apple\napple', { keyword: 'Apple' });
    expect(r.resultText).toBe('Apple');
  });

  it('removeEmpty 去除空行', () => {
    const r = extractLinesContaining('a\n\nb', { keyword: '', removeEmpty: true });
    expect(r.resultText).toBe('a\nb');
  });

  // 边界
  it('空字符串返回空结果', () => {
    const r = extractLinesContaining('', { keyword: 'x' });
    expect(r.resultText).toBe('');
    expect(r.stats).toEqual({ remaining: 0, removed: 0 });
  });

  it('无匹配返回空文本', () => {
    const r = extractLinesContaining('a\nb', { keyword: 'zzz' });
    expect(r.resultText).toBe('');
    expect(r.stats).toEqual({ remaining: 0, removed: 2 });
  });

  it('非字符串输入返回全零', () => {
    // @ts-expect-error 测试非法输入
    expect(extractLinesContaining(null, { keyword: 'x' })).toEqual({
      resultText: '',
      lines: [],
      stats: { remaining: 0, removed: 0 },
    });
  });
});

describe('splitLines', () => {
  it('按换行切分并兼容 \\r\\n', () => {
    expect(splitLines('a\nb\r\nc')).toEqual(['a', 'b', 'c']);
  });

  it('空输入返回单个空串', () => {
    expect(splitLines('')).toEqual(['']);
  });
});

describe('formatExtractMatches', () => {
  const matches: ExtractMatch[] = [
    { fullMatch: 'a@b.com', index: 0, endIndex: 7 },
    { fullMatch: 'c@d.com', index: 10, endIndex: 17 },
    { fullMatch: 'a@b.com', index: 20, endIndex: 27 },
  ];

  // AC：每行一个（默认）
  it('all 格式：完整匹配每行一个', () => {
    expect(formatExtractMatches(matches, 'all')).toBe('a@b.com\nc@d.com\na@b.com');
  });

  // AC：去重
  it('dedup 格式：去重后保留首次出现', () => {
    expect(formatExtractMatches(matches, 'dedup')).toBe('a@b.com\nc@d.com');
  });

  it('dedup 格式计数去重', () => {
    expect(countUniqueMatches(matches)).toBe(2);
  });

  // AC：仅捕获组
  it('groups 格式：每行一个捕获组值', () => {
    const g: ExtractMatch[] = [
      { fullMatch: '<a>1</a>', index: 0, endIndex: 8, groups: ['1'] },
      { fullMatch: '<b>2</b>', index: 9, endIndex: 17, groups: ['2'] },
    ];
    expect(formatExtractMatches(g, 'groups')).toBe('1\n2');
  });

  it('groups 格式：无捕获组时退回完整匹配', () => {
    expect(formatExtractMatches(matches, 'groups')).toBe('a@b.com\nc@d.com\na@b.com');
  });

  it('groups 格式：优先第一个非空组', () => {
    const g: ExtractMatch[] = [
      { fullMatch: 'x', index: 0, endIndex: 1, groups: ['', 'inner'] },
    ];
    expect(formatExtractMatches(g, 'groups')).toBe('inner');
  });

  it('空匹配数组返回空串', () => {
    expect(formatExtractMatches([], 'all')).toBe('');
  });
});
