/**
 * 字根变体映射
 *
 * 五笔 86 版中，部分字根存在「正体」与「变体」两种字形，
 * 在不同汉字中以变体形态出现，但归入同一键位。
 *
 * 本表供拆字逆推算法在「字形包含」判定不命中时做二次匹配。
 *
 * 格式：正体字形 → [变体字形列表]
 * 每条含义：当汉字中不包含正体字形、但包含某个变体字形时，
 * 该位仍可判定为该正体字根所在键。
 */

export const VARIANT_OF: Record<string, string[]> = {
  // 水偏旁
  '水': ['氵', '氺'],
  // 手偏旁
  '手': ['扌', '龵'],
  // 人偏旁
  '人': ['亻'],
  // 心偏旁
  '心': ['忄', '⺗'],
  // 犬偏旁
  '犬': ['犭'],
  // 示/衣偏旁
  '礻': ['示'],
  '衤': ['衣'],
  // 走之底
  '辶': ['辵', '⻎'],
  // 月变体（肉月旁）
  '月': ['⺼'],
  // 竹字头变体
  '竹': ['⺮'],
  // 草字头变体
  '艹': ['⺾', '⺿'],
  // 足变体
  '足': ['⻊'],
  // 耳旁（左耳/右耳在五笔中均归 B 键）
  '耳': ['阝'],
  '邑': ['阝'],
  // 金字旁变体
  '金': ['钅'],
  // 食字旁变体
  '食': ['饣'],
  // 丝/绞丝旁变体
  '丝': ['纟', '糹', '糸'],
  // 火变体
  '火': ['灬'],
  // 刀变体
  '刀': ['刂'],
  // 言字旁变体
  '言': ['讠'],
  // 日变体（曰字，与日同键）
  '日': ['曰'],
  // 走字旁
  '走': ['赱'],
  // 老字头
  '老': ['耂'],
  // 虎字头
  '虎': ['虍'],
};

/**
 * 反向索引：变体字形 → 正体字形
 * 供逆推算法快速查找「这个变体属于哪个正体」。
 */
export const VARIANT_REVERSE: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [canonical, variants] of Object.entries(VARIANT_OF)) {
    for (const variant of variants) {
      if (!map.has(variant)) {
        map.set(variant, canonical);
      }
    }
  }
  return map;
})();

/**
 * 查询某字根的全部变体（含正体本身）。
 * 返回的数组包含正体字形 + 所有变体字形，供逆推做 `includes` 匹配。
 */
export function getAllGlyphForms(canonical: string): string[] {
  const variants = VARIANT_OF[canonical];
  return variants ? [canonical, ...variants] : [canonical];
}
