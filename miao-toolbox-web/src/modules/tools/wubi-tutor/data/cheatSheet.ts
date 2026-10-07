/**
 * 规则速查卡数据
 *
 * 进入主包（体积小且被高频使用）。
 * 供 CheatSheetDrawer 组件渲染。
 *
 * 内容：
 * 1. 拆字五原则速记
 * 2. 一级简码全表（25 个键 ↔ 字）
 * 3. 识别码交叉表（末笔 × 字型）
 * 4. 常用偏旁部首与键位对照
 * 5. 难拆字 50 例
 */

import { WUBI_KEYS, type WubiKey } from './radicals';

// ─── 类型定义 ────────────────────────────────────────────

export interface CheatSheetSection {
  id: string;
  title: string;
  items: CheatSheetItem[];
}

export interface CheatSheetItem {
  /** 关键字（供搜索匹配） */
  keyword: string;
  /** 可点击的汉字/字根（如有） */
  clickable?: string;
  /** 说明文字 */
  description: string;
  /** 键位（如有） */
  key?: WubiKey;
}

// ─── 1. 拆字五原则 ──────────────────────────────────────

const SPLIT_PRINCIPLES: CheatSheetItem[] = [
  {
    keyword: '书写顺序',
    description: '按正确的书写顺序拆字，不能跳步、不能倒序',
  },
  {
    keyword: '取大优先',
    description: '在多种拆法中，取字根最大的那种',
  },
  {
    keyword: '兼顾直观',
    description: '拆出的字根要符合人们对汉字结构的直观认识',
  },
  {
    keyword: '能连不交',
    description: '字根可以「相连」也可以「相交」时，优先选「相连」',
  },
  {
    keyword: '能散不连',
    description: '可以拆成「散开」也可以「相连」时，优先选「散开」',
  },
];

// ─── 2. 一级简码全表 ────────────────────────────────────

const LEVEL1_CODES: CheatSheetItem[] = WUBI_KEYS.map((meta) => ({
  keyword: `${meta.key.toUpperCase()} ${meta.keyNameChar}`,
  clickable: meta.keyNameChar,
  description: `${meta.key.toUpperCase()} 键的一级简码字`,
  key: meta.key,
}));

// ─── 3. 识别码交叉表 ────────────────────────────────────

const IDENTIFICATION_TABLE: CheatSheetItem[] = [
  // 横
  { keyword: '横左右', clickable: '吧', description: '横 × 左右 → G（如：吧 kcg）', key: 'g' },
  { keyword: '横上下', clickable: '邑', description: '横 × 上下 → F（如：邑 kcf）', key: 'f' },
  { keyword: '横杂合', clickable: '中', description: '横 × 杂合 → D', key: 'd' },
  // 竖
  { keyword: '竖左右', clickable: '什', description: '竖 × 左右 → H', key: 'h' },
  { keyword: '竖上下', clickable: '字', description: '竖 × 上下 → J', key: 'j' },
  { keyword: '竖杂合', clickable: '申', description: '竖 × 杂合 → K', key: 'k' },
  // 撇
  { keyword: '撇左右', clickable: '代', description: '撇 × 左右 → T', key: 't' },
  { keyword: '撇上下', clickable: '看', description: '撇 × 上下 → R', key: 'r' },
  { keyword: '撇杂合', clickable: '必', description: '撇 × 杂合 → E', key: 'e' },
  // 捺
  { keyword: '捺左右', clickable: '认', description: '捺 × 左右 → Y', key: 'y' },
  { keyword: '捺上下', clickable: '定', description: '捺 × 上下 → U', key: 'u' },
  { keyword: '捺杂合', clickable: '这', description: '捺 × 杂合 → I', key: 'i' },
  // 折
  { keyword: '折左右', clickable: '忆', description: '折 × 左右 → N', key: 'n' },
  { keyword: '折上下', clickable: '改', description: '折 × 上下 → B', key: 'b' },
  { keyword: '折杂合', clickable: '巨', description: '折 × 杂合 → V', key: 'v' },
];

// ─── 4. 常用偏旁部首与键位对照 ──────────────────────────

const RADICAL_LOOKUP: CheatSheetItem[] = [
  { keyword: '氵', clickable: '氵', description: '三点水 → I 键（同「水」）', key: 'i' },
  { keyword: '扌', clickable: '扌', description: '提手旁 → R 键（同「手」）', key: 'r' },
  { keyword: '亻', clickable: '亻', description: '单人旁 → W 键（同「人」）', key: 'w' },
  { keyword: '钅', clickable: '钅', description: '金字旁 → Q 键（同「金」）', key: 'q' },
  { keyword: '忄', clickable: '忄', description: '竖心旁 → N 键（同「心」）', key: 'n' },
  { keyword: '艹', clickable: '艹', description: '草字头 → A 键', key: 'a' },
  { keyword: '宀', clickable: '宀', description: '宝盖头 → P 键', key: 'p' },
  { keyword: '辶', clickable: '辶', description: '走之底 → P 键', key: 'p' },
  { keyword: '阝', clickable: '阝', description: '双耳旁 → B 键（同「耳」）', key: 'b' },
  { keyword: '纟', clickable: '纟', description: '绞丝旁 → X 键', key: 'x' },
  { keyword: '灬', clickable: '灬', description: '四点底 → O 键（同「火」）', key: 'o' },
  { keyword: '刂', clickable: '刂', description: '立刀旁 → J 键（同「刀」变体）', key: 'j' },
  { keyword: '衤', clickable: '衤', description: '衣字旁 → P 键', key: 'p' },
  { keyword: '礻', clickable: '礻', description: '示字旁 → P 键', key: 'p' },
  { keyword: '犭', clickable: '犭', description: '反犬旁 → Q 键（同「犬」）', key: 'q' },
  { keyword: '疒', clickable: '疒', description: '病字头 → U 键', key: 'u' },
  { keyword: '竹', clickable: '竹', description: '竹字头 → T 键', key: 't' },
  { keyword: '广', clickable: '广', description: '广字头 → Y 键', key: 'y' },
  { keyword: '门', clickable: '门', description: '门字框 → U 键', key: 'u' },
  { keyword: '彳', clickable: '彳', description: '双人旁 → T 键', key: 't' },
];

// ─── 5. 难拆字 50 例 ────────────────────────────────────

const DIFFICULT_CHARS: CheatSheetItem[] = [
  { keyword: '啊', clickable: '啊', description: '口+艹+可 → kbsk（注意「可」拆法）' },
  { keyword: '鼠', clickable: '鼠', description: '臼+竖提+斜+竖提 → vnu... 难拆' },
  { keyword: '凹', clickable: '凹', description: '几+横+竖 → mmgd' },
  { keyword: '凸', clickable: '凸', description: '竖+横+竖+横 → hghg' },
  { keyword: '鼎', clickable: '鼎', description: '目+爿+大 → hnd... 复杂' },
  { keyword: '乖', clickable: '乖', description: '千+北... → tfux' },
  { keyword: '兜', clickable: '兜', description: '白+撇+兜... → qr... 难拆' },
  { keyword: '鸟', clickable: '鸟', description: '撇+横折钩+点 → qyg' },
  { keyword: '乌', clickable: '乌', description: '撇+横折钩+横 → qng' },
  { keyword: '毋', clickable: '毋', description: '撇+横+竖折 → xn... 难' },
  { keyword: '卵', clickable: '卵', description: '撇+竖提+点+撇... → qyt' },
  { keyword: '博', clickable: '博', description: '十+寸+甫 → fgey... 需注意' },
  { keyword: '舞', clickable: '舞', description: '撇+横+横+夕... → rl... 复杂' },
  { keyword: '鼎', clickable: '鼎', description: '目+爿+大 → hnd... 难拆' },
  { keyword: '幽', clickable: '幽', description: '山+幺+幺 → xxm' },
  { keyword: '及', clickable: '及', description: '撇+折+捺 → eyi' },
  { keyword: '乃', clickable: '乃', description: '撇+折 → et' },
  { keyword: '万', clickable: '万', description: '一+折+撇 → dnv' },
  { keyword: '丈', clickable: '丈', description: '一+大 → dyi' },
  { keyword: '与', clickable: '与', description: '一+折+一 → gng' },
  { keyword: '义', clickable: '义', description: '点+乂 → yqi' },
  { keyword: '农', clickable: '农', description: '冖+辰 → pei' },
  { keyword: '长', clickable: '长', description: '撇+横+竖提+捺 → tayi' },
  { keyword: '长', clickable: '长', description: '（同上）一级简码 t' },
  { keyword: '身', clickable: '身', description: '撇+竖+横折钩+横+撇 → tmdt' },
  { keyword: '车', clickable: '车', description: '横+撇折+横+竖 → lgnh（成字字根）' },
  { keyword: '东', clickable: '东', description: '横+撇折+小 → aii' },
  { keyword: '为', clickable: '为', description: '点+撇+折+点 → o... 一级简码 o' },
  { keyword: '发', clickable: '发', description: '撇折+撇+横撇+捺 → v... 一级简码 v' },
  { keyword: '成', clickable: '成', description: '横+撇+横折钩+斜钩+撇 → d... 复杂' },
  { keyword: '事', clickable: '事', description: '一+口+彐+丨 → gk... 难' },
  { keyword: '书', clickable: '书', description: '横折钩+竖+点 → nnhy' },
  { keyword: '出', clickable: '出', description: '折+山 → bm... 二级简码 bm' },
  { keyword: '面', clickable: '面', description: '横+撇+竖+横折+竖+横+横 → dm... 复杂' },
  { keyword: '自', clickable: '自', description: '撇+目 → thd' },
  { keyword: '百', clickable: '百', description: '横+撇+日 → dj... 需注意拆法' },
  { keyword: '段', clickable: '段', description: '撇+竖+横折+横+横+撇+横+捺 → wd... 难' },
  { keyword: '武', clickable: '武', description: '横+横+止+斜钩+撇 → gah... 需注意' },
  { keyword: '或', clickable: '或', description: '横+口+一+戈 → akg... 需注意' },
  { keyword: '载', clickable: '载', description: '十+车+戈 → fal... 需注意' },
  { keyword: '截', clickable: '截', description: '十+戈+佳+... → fa... 难' },
  { keyword: '戴', clickable: '戴', description: '十+戈+田+共 → fal... 复杂' },
  { keyword: '戊', clickable: '戊', description: '横+撇+竖提+斜钩+撇 → dny... 难' },
  { keyword: '戌', clickable: '戌', description: '横+撇+横+斜钩+撇 → dg... 难' },
  { keyword: '戎', clickable: '戎', description: '横+戈+十 → ade... 需注意' },
  { keyword: '戒', clickable: '戒', description: '横+戈+廾 → aak... 需注意' },
  { keyword: '咸', clickable: '咸', description: '戊+口 → dg... 需注意' },
  { keyword: '藏', clickable: '藏', description: '艹+厂+... → ad... 复杂' },
  { keyword: '蔑', clickable: '蔑', description: '艹+罒+戌... → al... 复杂' },
];

// ─── 汇总 ────────────────────────────────────────────────

export const CHEAT_SHEET_SECTIONS: CheatSheetSection[] = [
  { id: 'principles', title: '拆字五原则', items: SPLIT_PRINCIPLES },
  { id: 'level1', title: '一级简码全表', items: LEVEL1_CODES },
  { id: 'identification', title: '识别码交叉表', items: IDENTIFICATION_TABLE },
  { id: 'radicals', title: '常用偏旁部首与键位对照', items: RADICAL_LOOKUP },
  { id: 'difficult', title: '难拆字 50 例', items: DIFFICULT_CHARS },
];

/** 搜索速查卡 */
export function searchCheatSheet(query: string): CheatSheetItem[] {
  if (!query || query.trim().length === 0) return [];

  const q = query.trim().toLowerCase();
  const results: CheatSheetItem[] = [];

  for (const section of CHEAT_SHEET_SECTIONS) {
    for (const item of section.items) {
      if (
        item.keyword.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        (item.clickable && item.clickable.includes(q))
      ) {
        results.push(item);
      }
    }
  }

  return results;
}
