/**
 * 编码解析纯函数单测
 */

import { describe, it, expect } from 'vitest';
import {
  parseChar,
  getSimplifiedCodes,
  checkKeyNameChar,
  checkSelfRadical,
  deriveIdentificationCode,
  stripNonCodeChars,
  buildCharMap,
  buildPhraseMap,
  mapKeyCodeToWubi,
  isCorrectKey,
  type CharMap,
} from './code';

// 测试用 CharMap：[字, 全码, 简码等级, 简码?]
const TEST_ENTRIES: [string, string, number, string?][] = [
  ['啊', 'kbsk', 0],
  ['一', 'ggll', 1, 'g'],
  ['的', 'rqyy', 1, 'r'],
  ['大', 'dddd', 2, 'dd'],
  ['到', 'gcfg', 2, 'gc'],
  ['会', 'wfcu', 3, 'wfc'],
  ['学', 'ipbf', 3, 'ipb'],
  ['王', 'gggg', 0],      // 键名字
  ['五', 'gghg', 2, 'gg'], // 成字字根
  ['中', 'khk', 1, 'k'],
  ['国', 'lgyi', 1, 'l'],
  ['人', 'wwww', 1, 'w'],
  ['标', 'sfiy', 0],      // 全码字
  ['你', 'wqiy', 2, 'wq'],
  ['好', 'vbg', 2, 'vb'],
  ['是', 'jghu', 1, 'j'],
];

const TEST_CHAR_MAP: CharMap = buildCharMap(TEST_ENTRIES);

const TEST_PHRASES: [string, string][] = [
  ['中国', 'khlg'],
  ['我们', 'trwh'],
  ['你好', 'wqvb'],
];

describe('parseChar', () => {
  it('返回已收录字的全码与简码等级', () => {
    const result = parseChar('啊', TEST_CHAR_MAP);
    expect(result).toEqual({ char: '啊', code: 'kbsk', simplifiedLevel: 0, simplifiedCode: null });
  });

  it('返回一级简码字的全码与简码', () => {
    const result = parseChar('的', TEST_CHAR_MAP);
    expect(result?.code).toBe('rqyy');       // 全码
    expect(result?.simplifiedCode).toBe('r'); // 一级简码
    expect(result?.simplifiedLevel).toBe(1);
  });

  it('未收录字返回 null', () => {
    expect(parseChar('龘', TEST_CHAR_MAP)).toBeNull();
  });

  it('空字符串返回 null', () => {
    expect(parseChar('', TEST_CHAR_MAP)).toBeNull();
  });

  it('全角字符正常处理', () => {
    // 全角空格不是汉字，不在码表中
    expect(parseChar('　', TEST_CHAR_MAP)).toBeNull();
  });
});

describe('getSimplifiedCodes', () => {
  it('一级简码字返回简码信息', () => {
    const result = getSimplifiedCodes('的', TEST_CHAR_MAP);
    expect(result).not.toBeNull();
    expect(result!.simplifiedLevel).toBe(1);
    expect(result!.simplifiedCode).toBe('r');
  });

  it('二级简码字返回简码信息', () => {
    const result = getSimplifiedCodes('大', TEST_CHAR_MAP);
    expect(result).not.toBeNull();
    expect(result!.simplifiedLevel).toBe(2);
    expect(result!.simplifiedCode).toBe('dd');
  });

  it('三级简码字返回简码信息', () => {
    const result = getSimplifiedCodes('学', TEST_CHAR_MAP);
    expect(result).not.toBeNull();
    expect(result!.simplifiedLevel).toBe(3);
    expect(result!.simplifiedCode).toBe('ipb');
  });

  it('全码字（无简码）返回 simplifiedLevel=0', () => {
    const result = getSimplifiedCodes('啊', TEST_CHAR_MAP);
    expect(result).not.toBeNull();
    expect(result!.simplifiedLevel).toBe(0);
    expect(result!.simplifiedCode).toBeNull();
  });

  it('未收录字返回 null', () => {
    expect(getSimplifiedCodes('龘', TEST_CHAR_MAP)).toBeNull();
  });
});

describe('checkKeyNameChar', () => {
  it('正确识别键名字', () => {
    expect(checkKeyNameChar('王')).toBe(true);
    expect(checkKeyNameChar('日')).toBe(true);
    expect(checkKeyNameChar('口')).toBe(true);
  });

  it('非键名字返回 false', () => {
    expect(checkKeyNameChar('啊')).toBe(false);
    expect(checkKeyNameChar('五')).toBe(false);
    expect(checkKeyNameChar('')).toBe(false);
  });
});

describe('checkSelfRadical', () => {
  it('正确识别成字字根', () => {
    expect(checkSelfRadical('五')).toBe(true); // G 键成字字根
    expect(checkSelfRadical('十')).toBe(true); // F 键成字字根
    expect(checkSelfRadical('犬')).toBe(true); // D 键成字字根
  });

  it('键名字不算成字字根', () => {
    expect(checkSelfRadical('王')).toBe(false);
    expect(checkSelfRadical('土')).toBe(false);
  });

  it('非字根返回 false', () => {
    expect(checkSelfRadical('啊')).toBe(false);
  });
});

describe('deriveIdentificationCode', () => {
  it('横 × 左右 → g', () => {
    const result = deriveIdentificationCode('heng', 'left-right');
    expect(result).toEqual({ lastStroke: 'heng', structure: 'left-right', key: 'g' });
  });

  it('竖 × 上下 → j', () => {
    const result = deriveIdentificationCode('shu', 'up-down');
    expect(result).toEqual({ lastStroke: 'shu', structure: 'up-down', key: 'j' });
  });

  it('撇 × 杂合 → e', () => {
    const result = deriveIdentificationCode('pie', 'misc');
    expect(result).toEqual({ lastStroke: 'pie', structure: 'misc', key: 'e' });
  });

  it('捺 × 左右 → y', () => {
    const result = deriveIdentificationCode('na', 'left-right');
    expect(result).toEqual({ lastStroke: 'na', structure: 'left-right', key: 'y' });
  });

  it('折 × 上下 → b', () => {
    const result = deriveIdentificationCode('zhe', 'up-down');
    expect(result).toEqual({ lastStroke: 'zhe', structure: 'up-down', key: 'b' });
  });

  it('折 × 杂合 → v', () => {
    const result = deriveIdentificationCode('zhe', 'misc');
    expect(result).toEqual({ lastStroke: 'zhe', structure: 'misc', key: 'v' });
  });

  it('末笔为 null 时返回 null', () => {
    expect(deriveIdentificationCode(null, 'left-right')).toBeNull();
  });

  it('字型为 null 时返回 null', () => {
    expect(deriveIdentificationCode('heng', null)).toBeNull();
  });
});

describe('stripNonCodeChars', () => {
  it('从混合文本中提取可打字符', () => {
    const result = stripNonCodeChars('中国，你好！', TEST_CHAR_MAP);
    expect(result.codeable).toEqual(['中', '国', '你', '好']);
    expect(result.skipped.map((s) => s.char)).toEqual(['，', '！']);
    expect(result.total).toBe(6);
  });

  it('全部可打时 skipped 为空', () => {
    const result = stripNonCodeChars('中国', TEST_CHAR_MAP);
    expect(result.codeable).toEqual(['中', '国']);
    expect(result.skipped).toHaveLength(0);
  });

  it('全部不可打时 codeable 为空', () => {
    const result = stripNonCodeChars('ABC123', TEST_CHAR_MAP);
    expect(result.codeable).toHaveLength(0);
    expect(result.skipped).toHaveLength(6);
  });

  it('空文本返回空结果', () => {
    const result = stripNonCodeChars('', TEST_CHAR_MAP);
    expect(result.codeable).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('正确处理全角标点', () => {
    const result = stripNonCodeChars('的。是', TEST_CHAR_MAP);
    expect(result.codeable).toEqual(['的', '是']);
    expect(result.skipped[0].char).toBe('。');
  });
});

describe('buildCharMap', () => {
  it('从三元组/四元组数组构建映射', () => {
    const map = buildCharMap([['啊', 'kbsk', 0], ['的', 'rqyy', 1, 'r']]);
    expect(map.get('啊')).toEqual({ char: '啊', code: 'kbsk', simplifiedLevel: 0, simplifiedCode: null });
    expect(map.get('的')).toEqual({ char: '的', code: 'rqyy', simplifiedLevel: 1, simplifiedCode: 'r' });
    expect(map.get('不存在')).toBeUndefined();
  });
});

describe('buildPhraseMap', () => {
  it('从二元组数组构建映射', () => {
    const map = buildPhraseMap(TEST_PHRASES);
    expect(map.get('中国')).toBe('khlg');
    expect(map.get('我们')).toBe('trwh');
    expect(map.get('不存在')).toBeUndefined();
  });
});

describe('mapKeyCodeToWubi', () => {
  it('KeyA → a', () => {
    expect(mapKeyCodeToWubi('KeyA')).toBe('a');
  });

  it('KeyG → g', () => {
    expect(mapKeyCodeToWubi('KeyG')).toBe('g');
  });

  it('KeyY → y', () => {
    expect(mapKeyCodeToWubi('KeyY')).toBe('y');
  });

  it('KeyZ → null（Z 键不用于编码）', () => {
    expect(mapKeyCodeToWubi('KeyZ')).toBeNull();
  });

  it('Space → 空格字符', () => {
    expect(mapKeyCodeToWubi('Space')).toBe(' ');
  });

  it('Digit1 → null', () => {
    expect(mapKeyCodeToWubi('Digit1')).toBeNull();
  });

  it('非键位值返回 null', () => {
    expect(mapKeyCodeToWubi('ShiftLeft')).toBeNull();
    expect(mapKeyCodeToWubi('ControlLeft')).toBeNull();
  });
});

describe('isCorrectKey', () => {
  it('正确键返回 true', () => {
    expect(isCorrectKey('g', 'g')).toBe(true);
  });

  it('错误键返回 false', () => {
    expect(isCorrectKey('g', 'f')).toBe(false);
  });

  it('空格确认场景下空格正确', () => {
    expect(isCorrectKey('k', ' ', true)).toBe(true);
  });

  it('空格确认场景下非空格错误', () => {
    expect(isCorrectKey('k', 'j', true)).toBe(false);
  });
});
