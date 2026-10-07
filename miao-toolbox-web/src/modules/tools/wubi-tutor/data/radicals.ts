/**
 * 王码五笔 86 版 — 键位字根表
 *
 * 数据来源：王码五笔字型输入法 86 版（公开字根表）
 * 维护方式：人工录入 + review（G-1 关键数据资产）
 *
 * 25 个编码键（不含 Z），顺序 = 键盘物理排列：
 *   第一行：GFDSA（横区）
 *   第二行：HJKLM（竖区）
 *   第三行：TREWQ（撇区）
 *   第四行：YUIOP（捺区）
 *   第五行：NBVCX（折区）
 *
 * 每键含：键名字、助记口诀、标准指法、该键全部字根
 *
 * !! 禁止从码表推导本表 — 本表是拆字逆推算法的「字典」!!
 * !! 本表正确性与否直接决定全部拆分演示的正确性 !!
 */

// ─── 类型定义 ────────────────────────────────────────────

export type WubiKey =
  | 'g' | 'f' | 'd' | 's' | 'a'
  | 'h' | 'j' | 'k' | 'l' | 'm'
  | 't' | 'r' | 'e' | 'w' | 'q'
  | 'y' | 'u' | 'i' | 'o' | 'p'
  | 'n' | 'b' | 'v' | 'c' | 'x';

export type WubiZone = 'heng' | 'shu' | 'pie' | 'na' | 'zhe';

export type WubiFinger =
  | 'l-pinky' | 'l-ring' | 'l-middle' | 'l-index'
  | 'r-index' | 'r-middle' | 'r-ring' | 'r-pinky';

/**
 * 指法中文名 —— **界面必须用这个，不要直接展示枚举值**。
 *
 * `WubiFinger` 是内部标识（`'r-index'`），直接渲染会变成
 * 「按错了，正确是 H（r-index）」这种给用户看的英文标识。
 */
export const FINGER_LABELS: Record<WubiFinger, string> = {
  'l-pinky': '左小指',
  'l-ring': '左无名指',
  'l-middle': '左中指',
  'l-index': '左食指',
  'r-index': '右食指',
  'r-middle': '右中指',
  'r-ring': '右无名指',
  'r-pinky': '右小指',
};

export interface Radical {
  /** 字根字形（单个或多个汉字，如 '亻' '王' '灬'） */
  glyph: string;
  /** 字根名称或说明（如 '单人旁' '王字旁'） */
  name: string;
  /** 是否为键名字（该键的四次连击整字） */
  keyName?: boolean;
}

export interface WubiKeyMeta {
  /** 键位字母（小写） */
  key: WubiKey;
  /** 五区归属 */
  zone: WubiZone;
  /** 键名字（该键连击 4 次所得的整字，如 g → '王'） */
  keyNameChar: string;
  /** 助记口诀 */
  mnemonic: string;
  /** 标准指法 */
  finger: WubiFinger;
  /** 该键全部字根 */
  radicals: Radical[];
}

// ─── 区映射 ──────────────────────────────────────────────

export const ZONE_LABELS: Record<WubiZone, string> = {
  heng: '横区（1 区）',
  shu: '竖区（2 区）',
  pie: '撇区（3 区）',
  na: '捺区（4 区）',
  zhe: '折区（5 区）',
};

// ─── 25 键字根表 ─────────────────────────────────────────

export const WUBI_KEYS: WubiKeyMeta[] = [
  // ═══════════ 横区（GFDSA）═══════════
  {
    key: 'g', zone: 'heng', keyNameChar: '王', finger: 'l-index',
    mnemonic: '王旁青头戋五一',
    radicals: [
      { glyph: '王', name: '王字旁', keyName: true },
      { glyph: '青', name: '青头（上半部）' },
      { glyph: '戋', name: '戋字' },
      { glyph: '五', name: '数字五' },
      { glyph: '一', name: '横笔（一画）' },
    ],
  },
  {
    key: 'f', zone: 'heng', keyNameChar: '土', finger: 'l-middle',
    mnemonic: '土士二干十寸雨',
    radicals: [
      { glyph: '土', name: '土字', keyName: true },
      { glyph: '士', name: '士字' },
      { glyph: '二', name: '数字二' },
      { glyph: '干', name: '干字' },
      { glyph: '十', name: '十字' },
      { glyph: '寸', name: '寸字' },
      { glyph: '雨', name: '雨字' },
    ],
  },
  {
    key: 'd', zone: 'heng', keyNameChar: '大', finger: 'l-middle',
    mnemonic: '大犬三羊古石厂',
    radicals: [
      { glyph: '大', name: '大字', keyName: true },
      { glyph: '犬', name: '犬字' },
      { glyph: '三', name: '数字三' },
      { glyph: '羊', name: '羊字底（⺷）' },
      { glyph: '古', name: '古字' },
      { glyph: '石', name: '石字' },
      { glyph: '厂', name: '厂字头' },
    ],
  },
  {
    key: 's', zone: 'heng', keyNameChar: '木', finger: 'l-ring',
    mnemonic: '木丁西',
    radicals: [
      { glyph: '木', name: '木字旁', keyName: true },
      { glyph: '丁', name: '丁字' },
      { glyph: '西', name: '西字' },
    ],
  },
  {
    key: 'a', zone: 'heng', keyNameChar: '工', finger: 'l-pinky',
    mnemonic: '工戈草头右框七',
    radicals: [
      { glyph: '工', name: '工字', keyName: true },
      { glyph: '戈', name: '戈字' },
      { glyph: '弋', name: '弋字' },
      { glyph: '艹', name: '草字头' },
      { glyph: '匚', name: '右框（匚）' },
      { glyph: '七', name: '七字' },
      { glyph: '廿', name: '甘字头' },
    ],
  },

  // ═══════════ 竖区（HJKLM）═══════════
  {
    key: 'h', zone: 'shu', keyNameChar: '目', finger: 'r-index',
    mnemonic: '目具上止卜虎皮',
    radicals: [
      { glyph: '目', name: '目字', keyName: true },
      { glyph: '具', name: '具字头' },
      { glyph: '上', name: '上字' },
      { glyph: '止', name: '止字' },
      { glyph: '卜', name: '卜字' },
      { glyph: '虎', name: '虎字头（虍）' },
      { glyph: '皮', name: '皮字' },
    ],
  },
  {
    key: 'j', zone: 'shu', keyNameChar: '日', finger: 'r-index',
    mnemonic: '日早两竖与虫依',
    radicals: [
      { glyph: '日', name: '日字', keyName: true },
      { glyph: '早', name: '早字' },
      { glyph: '刂', name: '两竖（立刀旁）' },
      { glyph: '虫', name: '虫字' },
    ],
  },
  {
    key: 'k', zone: 'shu', keyNameChar: '口', finger: 'r-middle',
    mnemonic: '口与川，码元稀',
    radicals: [
      { glyph: '口', name: '口字', keyName: true },
      { glyph: '川', name: '川字' },
    ],
  },
  {
    key: 'l', zone: 'shu', keyNameChar: '田', finger: 'r-ring',
    mnemonic: '田甲方框四车力',
    radicals: [
      { glyph: '田', name: '田字', keyName: true },
      { glyph: '甲', name: '甲字' },
      { glyph: '囗', name: '方框（囗）' },
      { glyph: '四', name: '数字四' },
      { glyph: '车', name: '车字' },
      { glyph: '力', name: '力字' },
    ],
  },
  {
    key: 'm', zone: 'shu', keyNameChar: '山', finger: 'r-pinky',
    mnemonic: '山由贝，下框骨',
    radicals: [
      { glyph: '山', name: '山字', keyName: true },
      { glyph: '由', name: '由字' },
      { glyph: '贝', name: '贝字' },
      { glyph: '冂', name: '下框（冂）' },
      { glyph: '几', name: '几字' },
      { glyph: '骨', name: '骨字头' },
    ],
  },

  // ═══════════ 撇区（TREWQ）═══════════
  {
    key: 't', zone: 'pie', keyNameChar: '禾', finger: 'l-index',
    mnemonic: '禾竹反文双人立',
    radicals: [
      { glyph: '禾', name: '禾字旁', keyName: true },
      { glyph: '竹', name: '竹字头（⺮）' },
      { glyph: '丿', name: '撇笔（丿）' },
      { glyph: '彳', name: '双人旁' },
      /*
       * 反文是「攵」，此前被写成「夂」—— 二者字形不同（攵 4 画，夂 3 画），
       * 且 攵 是本键口诀明写的字根（收/教/放/政 都要用）。
       */
      { glyph: '攵', name: '反文旁（攵）' },
      { glyph: '夂', name: '折文（夂）' },
    ],
  },
  {
    key: 'r', zone: 'pie', keyNameChar: '白', finger: 'l-index',
    mnemonic: '白手看头斤字提',
    radicals: [
      { glyph: '白', name: '白字', keyName: true },
      { glyph: '手', name: '手字旁（扌）' },
      { glyph: '看', name: '看头（上半部）' },
      { glyph: '斤', name: '斤字' },
    ],
  },
  {
    key: 'e', zone: 'pie', keyNameChar: '月', finger: 'l-middle',
    mnemonic: '月彡乃用家衣底',
    radicals: [
      { glyph: '月', name: '月字旁', keyName: true },
      { glyph: '彡', name: '三撇（彡）' },
      { glyph: '乃', name: '乃字' },
      { glyph: '用', name: '用字' },
      { glyph: '豕', name: '家衣底（豕）' },
    ],
  },
  {
    key: 'w', zone: 'pie', keyNameChar: '人', finger: 'l-ring',
    mnemonic: '人八登头祭字头',
    radicals: [
      { glyph: '人', name: '单人旁（亻）', keyName: true },
      { glyph: '八', name: '八字' },
      { glyph: '癶', name: '登头（癶）' },
      { glyph: '祭', name: '祭字头（⺬）' },
    ],
  },
  {
    key: 'q', zone: 'pie', keyNameChar: '金', finger: 'l-pinky',
    mnemonic: '金勺缺点无尾鱼，犬旁留叉儿一点夕',
    radicals: [
      { glyph: '金', name: '金字旁（钅）', keyName: true },
      { glyph: '勺', name: '勺字（缺一点）' },
      { glyph: '鱼', name: '鱼字（无尾）' },
      { glyph: '犭', name: '反犬旁' },
      { glyph: '乂', name: '叉字' },
      { glyph: '儿', name: '儿字' },
      { glyph: '夕', name: '夕字' },
    ],
  },

  // ═══════════ 捺区（YUIOP）═══════════
  {
    key: 'y', zone: 'na', keyNameChar: '言', finger: 'r-index',
    mnemonic: '言文方广在四一，高头一捺谁人去',
    radicals: [
      { glyph: '言', name: '言字旁', keyName: true },
      { glyph: '文', name: '文字' },
      { glyph: '方', name: '方字' },
      { glyph: '广', name: '广字头' },
      { glyph: '亠', name: '高头（亠）' },
      { glyph: '丶', name: '点（一捺）' },
    ],
  },
  {
    key: 'u', zone: 'na', keyNameChar: '立', finger: 'r-index',
    mnemonic: '立辛两点六门疒',
    radicals: [
      { glyph: '立', name: '立字', keyName: true },
      { glyph: '辛', name: '辛字' },
      { glyph: '丬', name: '状字旁（丬）' },
      { glyph: '丷', name: '两点（丷）' },
      { glyph: '六', name: '数字六' },
      { glyph: '门', name: '门字框' },
      { glyph: '疒', name: '病字头' },
    ],
  },
  {
    key: 'i', zone: 'na', keyNameChar: '水', finger: 'r-middle',
    mnemonic: '水旁兴头小倒置',
    radicals: [
      { glyph: '水', name: '水字旁（氵）', keyName: true },
      { glyph: '兴', name: '兴头（⺍）' },
      { glyph: '小', name: '小字（⺌）' },
    ],
  },
  {
    key: 'o', zone: 'na', keyNameChar: '火', finger: 'r-ring',
    mnemonic: '火业头，四点米',
    radicals: [
      { glyph: '火', name: '火字旁', keyName: true },
      { glyph: '业', name: '业字头部' },
      { glyph: '灬', name: '四点底' },
      { glyph: '米', name: '米字' },
    ],
  },
  {
    key: 'p', zone: 'na', keyNameChar: '之', finger: 'r-pinky',
    mnemonic: '之宝盖，摘礻衣',
    radicals: [
      { glyph: '之', name: '之字', keyName: true },
      /*
       * 辶 是最常用的偏旁之一（这/边/过/还/送），缺失时拆字演示会在
       * P 段只给出「之/宀/礻/衤」—— 正确字根根本不在候选里。
       */
      { glyph: '辶', name: '走之底（辶）' },
      { glyph: '廴', name: '建之底（廴）' },
      { glyph: '宀', name: '宝盖头' },
      { glyph: '冖', name: '秃宝盖（冖）' },
      { glyph: '礻', name: '示字旁' },
      { glyph: '衤', name: '衣字旁' },
    ],
  },

  // ═══════════ 折区（NBVCX）═══════════
  {
    key: 'n', zone: 'zhe', keyNameChar: '已', finger: 'r-index',
    mnemonic: '已半巳满不出己，左框折尸心和羽',
    radicals: [
      { glyph: '已', name: '已字', keyName: true },
      { glyph: '巳', name: '巳字' },
      { glyph: '己', name: '己字' },
      { glyph: '匚', name: '左框（已类变形）' },
      { glyph: '乙', name: '折笔（乙）' },
      { glyph: '尸', name: '尸字头' },
      { glyph: '心', name: '心字旁（忄）' },
      { glyph: '羽', name: '羽字' },
    ],
  },
  {
    key: 'b', zone: 'zhe', keyNameChar: '子', finger: 'r-index',
    mnemonic: '子耳了也乃框双',
    radicals: [
      { glyph: '子', name: '子字', keyName: true },
      { glyph: '耳', name: '耳字' },
      /*
       * 阝 与 卩 是两个不同字形，都属 B 键（阝＝邑/阜旁，卩＝单耳旁）。
       * 此前只有 卩，导致 队/那/都/邮 等字的 B 段候选里找不到耳朵旁。
       */
      { glyph: '阝', name: '耳朵旁（阝）' },
      { glyph: '了', name: '了字' },
      { glyph: '也', name: '也字' },
      { glyph: '乃', name: '乃字' },
      { glyph: '卩', name: '单耳旁（右框卩）' },
    ],
  },
  {
    key: 'v', zone: 'zhe', keyNameChar: '女', finger: 'l-index',
    mnemonic: '女刀九臼山反转',
    radicals: [
      { glyph: '女', name: '女字旁', keyName: true },
      { glyph: '刀', name: '刀字' },
      { glyph: '九', name: '九字' },
      { glyph: '臼', name: '臼字' },
      { glyph: '彐', name: '山反转（彐）' },
    ],
  },
  {
    key: 'c', zone: 'zhe', keyNameChar: '又', finger: 'l-middle',
    mnemonic: '又巴马，私字头',
    radicals: [
      { glyph: '又', name: '又字', keyName: true },
      { glyph: '巴', name: '巴字' },
      { glyph: '马', name: '马字' },
      { glyph: '厶', name: '私字头（厶）' },
    ],
  },
  {
    key: 'x', zone: 'zhe', keyNameChar: '纟', finger: 'l-ring',
    mnemonic: '慈母无心弓和匕，幼无力',
    radicals: [
      /*
       * 键名字是「纟」(xxxx)，不是「丝」(xxgf)。
       *
       * 这里曾写作 glyph: '丝'，导致 isKeyNameChar('丝') 为真 ——
       * 拆字规则会把「丝」当成连击型键名字，而它的真实编码 xxgf
       * 用到了 g/f 两个别的键；字根表也把字根显示成了「丝」。
       */
      { glyph: '纟', name: '绞丝旁（纟）', keyName: true },
      /*
       * 「慈母无心」对应的是「母」，不是「幺」。
       * 此前把两个口诀混成了一处：幺 其实来自「幼无力」（幼去掉力），
       * 结果口诀点名的 母 从未收录，每/毒/海 等字的 X 段候选里看不到母。
       */
      { glyph: '母', name: '慈母无心（母）' },
      { glyph: '弓', name: '弓字' },
      { glyph: '匕', name: '匕字' },
      { glyph: '幺', name: '幺字（幼无力）' },
      { glyph: '幼', name: '幼字' },
    ],
  },
];

// ─── 反查索引：字根字形 → 键位 ──────────────────────────

/**
 * 字形 → 键位的 O(1) 反查映射。
 * 供拆字逆推算法使用。
 *
 * 注意：本索引在模块加载时一次性构建。
 */
export const RADICAL_INDEX: Map<string, WubiKey> = (() => {
  const map = new Map<string, WubiKey>();
  for (const meta of WUBI_KEYS) {
    for (const radical of meta.radicals) {
      // 不覆盖已存在的映射（重复字形应在完整性单测中被发现）
      if (!map.has(radical.glyph)) {
        map.set(radical.glyph, meta.key);
      }
    }
  }
  return map;
})();

// ─── 便捷查询 ────────────────────────────────────────────

/** 按键位字母获取该键元数据 */
export function getKeyMeta(key: WubiKey): WubiKeyMeta | undefined {
  return WUBI_KEYS.find((m) => m.key === key);
}

/** 按区获取该区全部键元数据 */
export function getKeysByZone(zone: WubiZone): WubiKeyMeta[] {
  return WUBI_KEYS.filter((m) => m.zone === zone);
}

/** 判断某字是否为某键的键名字 */
export function isKeyNameChar(char: string): boolean {
  return WUBI_KEYS.some((m) => m.keyNameChar === char);
}

/** 判断某字是否为成字字根（在字根表中但非键名字） */
export function isSelfRadical(char: string): boolean {
  for (const meta of WUBI_KEYS) {
    if (meta.keyNameChar === char) return false; // 键名字不算成字字根
    if (meta.radicals.some((r) => r.glyph === char)) return true;
  }
  return false;
}

/** 查找某字所在的键（若它是字根） */
export function findRadicalKey(char: string): WubiKey | undefined {
  return RADICAL_INDEX.get(char);
}

/**
 * 键盘格子里显示的字根串。
 *
 * !! 必须包含**全部**字根，不得 slice / 省略 !!
 *
 * 抽成函数是为了让「不许截断」这条不变量可被测试锁住 ——
 * 曾出现 `radicals.slice(0, 6)` 的硬截断，F 键第 7 个字根「雨」
 * 在键盘图上根本显示不出来，用户以为字根表本身不全。
 *
 * 格子放不下时应当**换行**（见 `.wt-radical-chart__key-radicals`），
 * 或者改用「字根总表」视图阅读。
 */
export function radicalsLabel(radicals: Radical[]): string {
  return radicals.map((r) => r.glyph).join(' ');
}
