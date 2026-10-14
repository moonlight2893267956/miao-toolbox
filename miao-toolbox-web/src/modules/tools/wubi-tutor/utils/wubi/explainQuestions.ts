/**
 * 快捷追问的生成。
 *
 * ── 为什么要有它 ──
 *
 * 「可以连续追问」这件事本身不会自己被发现：一个空白输入框摆在右边，用户多半
 * 还是只在输入框里查字。快捷追问把**这一轮真正值得问的问题**直接摆在眼前 ——
 * 而且它只从首轮的候选集里生成，问题问的必然是这个字、这位键上的真实可选项，
 * 不会把用户引到「模型也不知道」的空地上。
 *
 * 纯函数，可单测（前端没有 jsdom，组件渲染测不了）。
 */

import type { WubiExplainParams } from './aiExplain';
import type { WubiPhraseExplainParams } from './phraseExplain';

/** 最多展示几条：多了会变成一堵墙，反而没人点 */
export const MAX_QUICK_ASKS = 3;

export interface QuickAsk {
  id: string;
  /** 按钮上的短标签 */
  label: string;
  /** 点击后**填入输入框**的完整问题（不自动发送，保留编辑权） */
  question: string;
  kind: 'why' | 'revise';
}

/**
 * 首轮参数的**结构约束**：只用到 `positions[].candidates`。
 *
 * 不用「单字参数 | 词组参数」的联合是有意的 —— 这里唯一依赖的是
 * 「每一位有一组候选字根」，而这个形状两种任务都有；写成联合反而会让人以为
 * 快捷追问在词级下另有语义（其实「第 N 位为什么取 A 不取 B」对词组同样成立）。
 */
type QuickAskParams = Pick<WubiExplainParams, 'positions'> | Pick<WubiPhraseExplainParams, 'positions'>;

export interface QuickAskInput {
  /** 首轮上下文（逐位候选）；没有就不生成 */
  params: QuickAskParams | null;
  /** 迄今逐位选中的字根（未通过核对的位置为 null） */
  positions: (string | null)[];
  /** 已经问过的问题（不再重复推荐） */
  asked: string[];
}

/**
 * 生成快捷追问。
 *
 * 规则：
 * 1. 只保留**候选 ≥ 2** 的位 —— 只有真的存在取舍，才有「为什么取 A 不取 B」可问；
 * 2. 给出该位选中的字根（`positions`）与第一个别的候选，组成 why 问题；
 * 3. 再补一条 revise 问题（「不对，第 N 位应该是 X」），用来验证「纠正」这条路。
 *    **它占一个固定名额**：纠正能力是最不容易被发现的一条路，不能被 why 挤掉；
 * 4. 全部去重、去掉已问过的，最多 {@link MAX_QUICK_ASKS} 条（why 在前，纠正压尾）。
 */
export function buildQuickAsks({ params, positions, asked }: QuickAskInput): QuickAsk[] {
  if (!params) return [];

  const seen = new Set(asked.map((q) => q.trim()));
  const ambiguous: { index: number; pick: string; alt: string }[] = [];
  params.positions.forEach((pos, index) => {
    if (pos.candidates.length < 2) return;
    const pick = positions[index];
    if (!pick) return;
    const alt = pos.candidates.find((c) => c.glyph !== pick)?.glyph;
    if (!alt) return;
    ambiguous.push({ index, pick, alt });
  });

  const first = ambiguous[0];
  const reviseAsk: QuickAsk | null =
    first && !seen.has(reviseQuestion(first.index, first.alt))
      ? {
          id: `revise-${first.index}`,
          label: `第 ${first.index + 1} 位应该是「${first.alt}」`,
          question: reviseQuestion(first.index, first.alt),
          kind: 'revise',
        }
      : null;

  const whyBudget = reviseAsk ? MAX_QUICK_ASKS - 1 : MAX_QUICK_ASKS;
  const reasons: QuickAsk[] = [];

  for (const { index, pick, alt } of ambiguous) {
    if (reasons.length >= whyBudget) break;
    const question = `第 ${index + 1} 位为什么取「${pick}」不取「${alt}」？`;
    if (seen.has(question)) continue;
    seen.add(question);
    reasons.push({
      id: `why-${index}`,
      label: `第 ${index + 1} 位为何取「${pick}」`,
      question,
      kind: 'why',
    });
  }

  return reviseAsk ? [...reasons, reviseAsk] : reasons;
}

function reviseQuestion(index: number, glyph: string): string {
  return `不对，第 ${index + 1} 位应该是「${glyph}」`;
}
