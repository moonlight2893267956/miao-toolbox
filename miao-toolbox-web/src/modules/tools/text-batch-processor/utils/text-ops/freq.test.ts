import { describe, it, expect } from 'vitest';
import { basicStats, wordFrequency } from './freq';

describe('basicStats', () => {
  // AC：基础统计
  it('AC: hello world\\nhello → chars 17 / charsNoSpace 15 / lines 2 / paragraphs 1 / words 3', () => {
    const r = basicStats('hello world\nhello');
    expect(r).toEqual({ chars: 17, charsNoSpace: 15, lines: 2, paragraphs: 1, words: 3 });
  });

  it('AC: 多段文本段落数正确', () => {
    const r = basicStats('hello world\n\nfoo');
    expect(r.lines).toBe(3);
    expect(r.paragraphs).toBe(2);
    expect(r.words).toBe(3);
  });

  it('中文字符计数正确（不含空白）', () => {
    const r = basicStats('你好 世界');
    expect(r.chars).toBe(5);
    expect(r.charsNoSpace).toBe(4);
    expect(r.words).toBe(0);
  });

  // AC：空输入
  it('AC: 空字符串返回全零', () => {
    expect(basicStats('')).toEqual({ chars: 0, charsNoSpace: 0, lines: 0, paragraphs: 0, words: 0 });
  });

  it('非字符串输入返回全零', () => {
    // @ts-expect-error 测试非法输入
    expect(basicStats(null)).toEqual({ chars: 0, charsNoSpace: 0, lines: 0, paragraphs: 0, words: 0 });
  });
});

describe('wordFrequency', () => {
  // AC：按空格切分 + 占比
  it('AC: apple banana apple → apple 2 / banana 1', () => {
    const r = wordFrequency('apple banana apple', { splitMode: 'space' });
    expect(r[0]).toMatchObject({ word: 'apple', count: 2 });
    expect(r[1]).toMatchObject({ word: 'banana', count: 1 });
    expect(r[0].percentage).toBeCloseTo(0.667, 2);
    expect(r[1].percentage).toBeCloseTo(0.333, 2);
  });

  // AC：Top N
  it('AC: topN=2 截断返回前 2 个', () => {
    const r = wordFrequency('a b c d e', { splitMode: 'space', topN: 2 });
    expect(r).toHaveLength(2);
    expect(r[0].word).toBe('a');
  });

  // AC：停用词过滤
  it('AC: stopWords 过滤不计入', () => {
    const r = wordFrequency('the apple a banana is the', {
      splitMode: 'space',
      stopWords: ['the', 'a', 'is'],
    });
    const words = r.map((e) => e.word);
    expect(words).toContain('apple');
    expect(words).toContain('banana');
    expect(words).not.toContain('the');
    expect(words).not.toContain('a');
    expect(words).not.toContain('is');
  });

  // AC：按字切分（中文逐字）
  it('AC: char 模式中文「你好世界」返回 4 个字', () => {
    const r = wordFrequency('你好世界', { splitMode: 'char' });
    expect(r).toHaveLength(4);
    expect(r.map((e) => e.word)).toEqual(['你', '好', '世', '界']);
  });

  // AC：按词切分（注入分词函数）
  it('AC: word 模式调用注入的分词函数', () => {
    const segment = (text: string) => {
      if (text === '我喜欢编程') return ['我', '喜欢', '编程'];
      return text.split('');
    };
    const r = wordFrequency('我喜欢编程', { splitMode: 'word', segment });
    expect(r.map((e) => e.word)).toEqual(['我', '喜欢', '编程']);
    expect(r).toHaveLength(3);
  });

  it('word 模式分词不可用时降级为按字', () => {
    const r = wordFrequency('你好', { splitMode: 'word' }); // 无 segment
    expect(r.map((e) => e.word)).toEqual(['你', '好']);
  });

  // 防御：分词函数抛异常时降级为按字（WASM 未就绪场景），不崩溃
  it('分词函数抛异常时降级为按字', () => {
    const badSegment = () => {
      throw new TypeError('Cannot read properties of null');
    };
    const r = wordFrequency('你好世界', { splitMode: 'word', segment: badSegment });
    expect(r.map((e) => e.word)).toEqual(['你', '好', '世', '界']);
  });

  // 计数降序排序
  it('按次数降序排列', () => {
    const r = wordFrequency('a b b c c c', { splitMode: 'space' });
    expect(r.map((e) => e.count)).toEqual([3, 2, 1]);
  });

  // AC：空输入
  it('AC: 空字符串返回空数组', () => {
    expect(wordFrequency('')).toEqual([]);
  });

  // 边界：非字符串输入
  it('非字符串输入返回空数组', () => {
    // @ts-expect-error 测试非法输入
    expect(wordFrequency(null)).toEqual([]);
  });

  // 中英文混排按空格切分
  it('按空格切分过滤标点', () => {
    const r = wordFrequency('hello, world. hello!', { splitMode: 'space' });
    expect(r[0].word).toBe('hello');
    expect(r[1].word).toBe('world');
  });
});
