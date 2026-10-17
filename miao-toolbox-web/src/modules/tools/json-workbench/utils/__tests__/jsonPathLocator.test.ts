import { describe, it, expect } from 'vitest';
import { locateJsonPath, parseJsonPathSegments, resolveLocatorPath } from '../jsonPathLocator';
import { parseAndFlatten } from '../parseAndFlatten';

/**
 * 回归：树节点点击 → 原文行号定位
 *
 * 缺陷背景：旧实现用 `rawJson.indexOf('"key"')` 取「第一次出现」，数组元素共用
 * 同一批 key，点第 2 个元素里的字段会跳到第 1 个元素的同名字段上。
 */
const CASHLIKE = `{
  "errno": 0,
  "one_key_bind_card_bank_list": [
    {
      "bank_uniq_code": "301",
      "bank_name": "中国建设银行"
    },
    {
      "bank_uniq_code": "401",
      "bank_name": "中国农业银行"
    },
    {
      "bank_uniq_code": "101",
      "bank_name": "中国工商银行"
    }
  ]
}`;

const lineOfText = (text: string, needle: string, from = 0) => {
  const idx = text.indexOf(needle, from);
  expect(idx).toBeGreaterThanOrEqual(0);
  return text.slice(0, idx).split('\n').length;
};

describe('parseJsonPathSegments', () => {
  it('解析根 / 对象成员 / 数组下标 / 带特殊字符的键', () => {
    expect(parseJsonPathSegments('$')).toEqual([]);
    expect(parseJsonPathSegments('$.a.b[0]')).toEqual([
      { kind: 'key', key: 'a' },
      { kind: 'key', key: 'b' },
      { kind: 'index', index: 0 },
    ]);
    expect(parseJsonPathSegments('$["a.b"][2]')).toEqual([
      { kind: 'key', key: 'a.b' },
      { kind: 'index', index: 2 },
    ]);
    expect(parseJsonPathSegments('a.b')).toBeNull();
    expect(parseJsonPathSegments('$.a[')).toBeNull();
  });

  it('兼容树里真实产出的「点号 + 方括号」形态（$.["a.b"]）', () => {
    // parseAndFlatten 用 `${path}.${safeKey(key)}` 拼接，特殊键就是这样
    expect(parseJsonPathSegments('$.["a.b"]')).toEqual([{ kind: 'key', key: 'a.b' }]);
    expect(parseJsonPathSegments('$.["a.b"].c')).toEqual([
      { kind: 'key', key: 'a.b' },
      { kind: 'key', key: 'c' },
    ]);
    expect(parseJsonPathSegments('$.["arr[0]"][1]')).toEqual([
      { kind: 'key', key: 'arr[0]' },
      { kind: 'index', index: 1 },
    ]);
    expect(parseJsonPathSegments('$.["it\'s"]')).toEqual([{ kind: 'key', key: "it's" }]);
    expect(parseJsonPathSegments('$.["he said \\"hi\\""]')).toEqual([{ kind: 'key', key: 'he said "hi"' }]);
  });
});

describe('resolveLocatorPath', () => {
  it('折叠占位节点回退到父数组', () => {
    expect(resolveLocatorPath('$.list.__ellipsis__')).toBe('$.list');
    expect(resolveLocatorPath('$.list[1].name')).toBe('$.list[1].name');
  });
});

describe('locateJsonPath：数组元素不能串号（本次缺陷）', () => {
  it('第 2 个元素里的字段定位到第 2 个元素的行，而不是第 1 个', () => {
    const target = locateJsonPath(CASHLIKE, '$.one_key_bind_card_bank_list[1].bank_uniq_code');
    const secondLine = lineOfText(CASHLIKE, '"bank_uniq_code": "401"');
    const firstIdx = CASHLIKE.indexOf('"bank_uniq_code"');
    const firstLine = lineOfText(CASHLIKE, '"bank_uniq_code"');

    expect(target).not.toBeNull();
    expect(target!.line).toBe(secondLine);
    // 旧实现会落到第 1 个元素的行上
    expect(target!.line).not.toBe(firstLine);
    expect(target!.offset).toBeGreaterThan(firstIdx);
  });

  it('最后一个元素同样精确', () => {
    const target = locateJsonPath(CASHLIKE, '$.one_key_bind_card_bank_list[2].bank_name');
    expect(target!.line).toBe(lineOfText(CASHLIKE, '"bank_name": "中国工商银行"'));
  });

  it('数组元素本体定位到元素起始行（{ 所在行）', () => {
    const target = locateJsonPath(CASHLIKE, '$.one_key_bind_card_bank_list[1]');
    const idx = CASHLIKE.indexOf('"bank_uniq_code": "401"');
    const elementStart = CASHLIKE.lastIndexOf('{', idx);
    expect(target!.offset).toBe(elementStart);
  });

  it('折叠占位节点回退到父数组所在行', () => {
    const target = locateJsonPath(CASHLIKE, '$.one_key_bind_card_bank_list.__ellipsis__');
    expect(target!.line).toBe(lineOfText(CASHLIKE, '"one_key_bind_card_bank_list"'));
  });
});

describe('locateJsonPath：其他形态', () => {
  it('键与值不同行时定位到键所在行', () => {
    const text = '{\n  "a":\n    "x",\n  "b": 1\n}';
    expect(locateJsonPath(text, '$.a')!.line).toBe(2);
  });

  it('紧凑 JSON 全部落在第 1 行', () => {
    const text = '{"a":[{"b":1},{"b":2}]}';
    expect(locateJsonPath(text, '$.a[1].b')!.line).toBe(1);
    expect(locateJsonPath(text, '$.a[1].b')!.offset).toBe(text.lastIndexOf('"b"'));
  });

  it('带特殊字符的键（. 与引号）', () => {
    const text = '{\n  "a.b": 1,\n  "he said \\"hi\\"": 2\n}';
    expect(locateJsonPath(text, '$["a.b"]')!.line).toBe(2);
    expect(locateJsonPath(text, '$["he said \\"hi\\""]')!.line).toBe(3);
  });

  it('字符串值里含花括号/中括号不影响扫描', () => {
    const text = '{\n  "a": "}{][",\n  "b": [1, 2]\n}';
    expect(locateJsonPath(text, '$.b')!.line).toBe(3);
  });

  it('根节点定位到全文第一个字符', () => {
    expect(locateJsonPath('{\n  "a": 1\n}', '$')!.offset).toBe(0);
  });

  it('空对象 / 空数组', () => {
    expect(locateJsonPath('{\n  "e": {},\n  "f": []\n}', '$.e')!.line).toBe(2);
    expect(locateJsonPath('{\n  "e": {},\n  "f": []\n}', '$.f')!.line).toBe(3);
  });

  it('unicode 转义键名可匹配', () => {
    const text = '{\n  "\\u4e2d\\u6587": 1\n}';
    expect(locateJsonPath(text, '$.中文')!.line).toBe(2);
  });
});

describe('locateJsonPath：非法输入要安全返回 null', () => {
  it('路径不存在 / 类型不符 / 空输入', () => {
    expect(locateJsonPath(CASHLIKE, '$.not_exist')).toBeNull();
    expect(locateJsonPath(CASHLIKE, '$.errno[0]')).toBeNull();
    expect(locateJsonPath(CASHLIKE, '$.one_key_bind_card_bank_list[99]')).toBeNull();
    expect(locateJsonPath('', '$')).toBeNull();
    expect(locateJsonPath('not json at all', '$.a')).toBeNull();
    expect(locateJsonPath(CASHLIKE, 'a.b')).toBeNull();
  });

  it('文本被截断：键已存在时定位到该键（跳行仍然有效），键不存在则为 null', () => {
    // 键存在但值缺失：定位到键所在行，对「跳转」这个用途是安全的
    expect(locateJsonPath('{ "a": ', '$.a')).toMatchObject({ offset: 2, line: 1 });
    // 键都不存在 —— 必须返回 null，不能瞎跳
    expect(locateJsonPath('{ "b": 1', '$.a')).toBeNull();
    // 结构明显损坏（不是对象起始）
    expect(locateJsonPath('[1, 2', '$.a')).toBeNull();
  });
});

describe('locateJsonPath：边角形态（D3/D4）', () => {
  it('D3：空字符串键（树的 id 形如 `$.`、`$.a.`、`$.a..b`）可定位到对应键行', () => {
    const text = '{\n  "": 1,\n  "a": {\n    "": {\n      "b": 2\n    }\n  }\n}';
    expect(locateJsonPath(text, '$.')!.line).toBe(2);
    expect(locateJsonPath(text, '$.a')!.line).toBe(3);
    expect(locateJsonPath(text, '$.a.')!.line).toBe(4);
    expect(locateJsonPath(text, '$.a..b')!.line).toBe(5);
  });

  it('D4：真实键名恰好叫 __ellipsis__ 时必须按字面定位，不能回退到父级', () => {
    // 12 个元素的数组超过折叠阈值，会同时产出「…2 more items」占位节点
    const arr = JSON.stringify(Array.from({ length: 12 }, (_, i) => i + 1));
    const text = `{\n  "__ellipsis__": 1,\n  "arr": ${arr}\n}`;
    const located = locateJsonPath(text, '$.__ellipsis__');
    expect(located, '真实键 __ellipsis__ 应按字面定位').not.toBeNull();
    expect(located!.line).toBe(2);
    expect(text.split('\n')[located!.line - 1]).toContain('"__ellipsis__"');
  });

  it('占位节点（…N more items）仍然回退到父数组所在行', () => {
    const arr = JSON.stringify(Array.from({ length: 12 }, (_, i) => i + 1));
    const text = `{\n  "arr": ${arr}\n}`;
    const located = locateJsonPath(text, '$.arr.__ellipsis__');
    expect(located!.line).toBe(2);
    expect(text.split('\n')[located!.line - 1]).toContain('"arr"');
  });
});

describe('locateJsonPath：与旧实现（indexOf 首次出现）的差异取证', () => {
  it('旧策略在同一份文本上会指向第 1 个元素，新策略指向第 2 个', () => {
    const key = 'bank_uniq_code';
    const oldOffset = CASHLIKE.indexOf(`"${key}"`);
    const newOffset = locateJsonPath(CASHLIKE, '$.one_key_bind_card_bank_list[1].bank_uniq_code')!.offset;
    expect(newOffset).not.toBe(oldOffset);
    expect(CASHLIKE.slice(newOffset, newOffset + key.length + 2)).toBe(`"${key}"`);
    expect(CASHLIKE.slice(newOffset).indexOf('"401"')).toBeGreaterThan(0);
  });
});

/**
 * 集成回归：用「真实的 parseAndFlatten」产出树 id（而不是我手写的路径形态），
 * 再交给真实的 locateJsonPath —— 覆盖 D1：特殊字符键的真实 id 是
 * `$.["a.b"]`（点号 + 方括号），曾因要求在点号后读到非空 key 而静默无法定位。
 */
describe('集成：真实树 id → 原文定位', () => {
  const SPECIAL = `{
  "a.b": 1,
  "arr[0]": 2,
  "it's": 3,
  "he said \\"hi\\"": 4,
  "normal": 5,
  "list": [
    { "x.y": 1 },
    { "x.y": 2 }
  ]
}`;

  const result = parseAndFlatten(SPECIAL, 99);
  const nodes = 'flatNodes' in result ? result.flatNodes : [];
  const lines = SPECIAL.split('\n');

  it('真实 tree id（含特殊字符键）全部可定位，且落到对应的键所在行', () => {
    // 特殊字符键的真实 id 形如 `$.["a.b"]`；D1 修复前这里会静默返回 null
    const leaves = nodes.filter((n) => n.type === 'number');
    expect(leaves.length).toBeGreaterThanOrEqual(5);

    for (const node of leaves) {
      const located = locateJsonPath(SPECIAL, node.id);
      expect(located, `${node.id} 应能定位`).not.toBeNull();
      // 独立判断：该行文本必须确实是这些键之一（不依赖被测实现的路径解析）
      expect(lines[located!.line - 1], `${node.id} → 第 ${located!.line} 行`).toMatch(
        /"(a\.b|arr\[0\]|it's|he said \\"hi\\"|normal|x\.y)":/,
      );
    }
  });

  it('数组内同名键的两个元素各自定位到自己的那一行（互不串号）', () => {
    const firstEl = nodes.find((n) => n.id.startsWith('$.list[0]'));
    const secondEl = nodes.find((n) => n.id.startsWith('$.list[1]'));
    expect(firstEl, '树里应存在 $.list[0] 节点').toBeTruthy();
    expect(secondEl, '树里应存在 $.list[1] 节点').toBeTruthy();

    const first = locateJsonPath(SPECIAL, firstEl!.id)!;
    const second = locateJsonPath(SPECIAL, secondEl!.id)!;
    expect(first.line).toBe(8);
    expect(second.line).toBe(9);
    expect(second.offset).toBeGreaterThan(first.offset);
    expect(lines[first.line - 1]).toContain('"x.y": 1');
    expect(lines[second.line - 1]).toContain('"x.y": 2');
  });
});