/**
 * 教程编码核对。
 *
 * 教程里每一处 `[[码:字|编码]]` 断言都必须与**真实码表**一致。
 *
 * ── 为什么要专门做这个 ──
 *
 * 教程写错编码会直接教错，而且不会有人发现：它既不影响编译，
 * 也不影响练习，只是让学习者记住一个错的码。这个模块已经反复出现
 * 「文档 / 脚本与实现对不上」——验收脚本恒报 100% 覆盖率、
 * 界面漏出英文枚举值、教程把全码和简码写混 —— 因此这里用机器把守。
 *
 * ── 为什么用专门标记，而不是从散文里正则抓编码 ──
 *
 * 一句话里可能同时出现多个字和多个编码，抓出来无法可靠配对。
 * `[[码:五|gghg]]` 是显式、无歧义的断言，解析也不会误判。
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { buildCharMap, type CharCode, type CharMap } from './code';

/** 教程正文（构建期由 Vite 内联，避免依赖 fs 路径） */
const RAW_CHAPTERS = import.meta.glob('../../data/tutorial/ch*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const CODE_MARK_RE = /\[\[码:([^|\]]+)\|([^\]]+)\]\]/g;

interface CodeClaim {
  file: string;
  char: string;
  code: string;
}

/**
 * 该编码是否是该字的**全码**或某个**合法简码**。
 *
 * 三条任一成立即可：
 *
 * 1. 等于全码。
 * 2. 等于 `simplifiedCode`（chars.json 存的最短简码）。
 *    这一条**必须单列**，因为一级简码并不是全码的前缀 ——
 *    它按「键位 + 词频」分配：有 = `e`（全码 def）、我 = `q`（全码 trnt）。
 * 3. 是全码的**前缀**且长度落在 `[simplifiedLevel, 全码长度)` 内。
 *    这是为了容纳更长的简码：chars.json 只存最短的那个，
 *    而 会 → wf(二级) / wfc(三级) / wfcu(全码)，教程写「wfc 是三级简码」是对的。
 *
 * 反例：`w` 对「会」不成立（比它的最短简码还短，那是「人」的一级简码）。
 */
function isFullOrValidSimplified(entry: CharCode, code: string): boolean {
  if (code === entry.code) return true;
  if (entry.simplifiedCode !== null && code === entry.simplifiedCode) return true;
  if (entry.simplifiedLevel <= 0) return false;

  return entry.code.startsWith(code)
    && code.length >= entry.simplifiedLevel
    && code.length < entry.code.length;
}

let charMap: CharMap;
/** 词组 → 编码（三个分块合并；词组没有简码） */
let phraseMap: Map<string, string>;
let claims: CodeClaim[];

beforeAll(async () => {
  const chars = (await import('../../data/generated/chars.json')).default as unknown as {
    entries: [string, string, 0 | 1 | 2 | 3, string?][];
  };
  charMap = buildCharMap(chars.entries);

  phraseMap = new Map();
  for (const bucket of ['phrases-2', 'phrases-3', 'phrases-4plus']) {
    const mod = (await import(`../../data/generated/${bucket}.json`)).default as unknown as {
      entries: [string, string][];
    };
    for (const [phrase, code] of mod.entries) phraseMap.set(phrase, code);
  }

  claims = [];
  for (const [path, text] of Object.entries(RAW_CHAPTERS)) {
    const file = path.split('/').pop() ?? path;
    for (const m of text.matchAll(CODE_MARK_RE)) {
      // 表格里竖线写作 `\|`，统一剥掉反斜杠
      claims.push({
        file,
        char: m[1].replace(/\\/g, '').trim(),
        code: m[2].replace(/\\/g, '').trim(),
      });
    }
  }
});

describe('教程编码核对', () => {
  it('能解析到一批编码断言（防止标记写坏后静默失效）', () => {
    console.log(`  [tutorial] 共 ${claims.length} 条 [[码:…]] 断言`);
    expect(claims.length).toBeGreaterThanOrEqual(20);
  });

  it('每条断言的词条都在码表中（单字或词组）', () => {
    const missing = claims
      .filter((c) => !charMap.has(c.char) && !phraseMap.has(c.char))
      .map((c) => `${c.file}: ${c.char}`);

    expect(missing).toEqual([]);
  });

  it('每条断言的编码都正确', () => {
    const wrong: string[] = [];

    for (const { file, char, code } of claims) {
      const entry = charMap.get(char);
      if (entry) {
        // 单字：全码，或该字的一个合法简码
        if (!isFullOrValidSimplified(entry, code)) {
          wrong.push(
            `${file}: ${char} 标称 ${code}，实际全码 ${entry.code}`
            + (entry.simplifiedCode ? `／最短简码 ${entry.simplifiedCode}` : '／无简码'),
          );
        }
        continue;
      }

      // 词组：码表预定义，没有简码，必须完全一致
      const phraseCode = phraseMap.get(char);
      if (phraseCode !== undefined && phraseCode !== code) {
        wrong.push(`${file}: ${char} 标称 ${code}，实际 ${phraseCode}`);
      }
    }

    expect(wrong).toEqual([]);
  });

  it('标记格式合法（编码为 1~4 位小写字母）', () => {
    const malformed: string[] = [];

    for (const { file, char, code } of claims) {
      if (!char || !code) malformed.push(`${file}: 空值 [[码:${char}|${code}]]`);
      else if (!/^[a-y]{1,4}$/.test(code)) {
        malformed.push(`${file}: 编码不是 1~4 位小写字母：${code}`);
      }
      // 码表键位不含 z（学习键），因此 z 也不该出现在教程编码里
      if (code.includes('z')) malformed.push(`${file}: 编码含 Z 键：${code}`);
    }

    expect(malformed).toEqual([]);
  });
});
