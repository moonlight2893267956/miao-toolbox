// 正则匹配 Web Worker（架构 Gap 补充 Decision：匹配超时中断，避免主线程冻结）
// 在独立线程执行 RegExp，主线程用 1s 竞速 + worker.terminate() 实现 ReDoS 防护。
// Story 1.2：额外用 d 标志（hasIndices）计算每组精确位置并返回分组详情。
// Story 1.3：用 new RegExp(pattern, flags)（用户原始 flags）计算 replacedText（String.replace 派生，支持 $1/${name}）。

interface MatchRequest {
  pattern: string;
  flags: string;
  testText: string;
  replaceText: string;
}

interface CaptureGroupWire {
  index: number;
  name: string | null;
  value: string;
  start: number | null;
  end: number | null;
}

interface MatchDetailWire {
  matchIndex: number;
  fullMatch: string;
  start: number;
  end: number;
  groups: CaptureGroupWire[];
}

interface RegexIndices {
  [k: number]: [number, number] | undefined;
  groups?: Record<string, [number, number] | undefined>;
}

interface MatchResponse {
  ok: boolean;
  matches?: { fullMatch: string; index: number; endIndex: number }[];
  details?: MatchDetailWire[];
  replacedText?: string;
  error?: string;
}

// 用最小接口避免依赖 webworker lib 带来的类型冲突
const ctx = self as unknown as {
  postMessage: (msg: MatchResponse) => void;
  onmessage: ((e: MessageEvent<MatchRequest>) => void) | null;
};

/**
 * 替换串归一化：将 FR-3 要求的 ${name} 命名引用写法转换为 JS 原生 $<name>。
 * JS 的 String.replace 仅识别 $<name>（角度括号），但需求明确支持 ${name}（常见于 PHP / 模板字符串写法）。
 * 原生 $<name> 不受影响；其余 $ 序列（$$ / $& / $1）保持原样。
 */
function normalizeReplacement(text: string): string {
  return text.replace(/\$\{([a-zA-Z_$][\w$]*)\}/g, '$<$1>');
}

ctx.onmessage = (e: MessageEvent<MatchRequest>) => {
  const { pattern, flags, testText, replaceText } = e.data;
  try {
    // 强制全局以扫描全部位置用于高亮；加 d 标志获取每组 indices（位置）
    let scanFlags = flags.includes('g') ? flags : flags + 'g';
    if (!scanFlags.includes('d')) scanFlags += 'd';
    const regex = new RegExp(pattern, scanFlags);

    // 替换预览（FR-3）：用用户原始 flags 计算，g 语义自然决定「全部/仅首个」；
    // 原生 String.replace 支持 $1 $2 与 $<name> 命名引用；归一化将需求的 ${name} 转为 $<name>。
    let replacedText = testText;
    try {
      replacedText = testText.replace(new RegExp(pattern, flags), normalizeReplacement(replaceText));
    } catch {
      // flags 在扫描阶段已校验合法，此处异常极罕见，回退原文本
      replacedText = testText;
    }
    const matches: { fullMatch: string; index: number; endIndex: number }[] = [];
    const details: MatchDetailWire[] = [];
    let m: RegExpExecArray | null;
    let guard = 0;

    while ((m = regex.exec(testText)) !== null) {
      const full = m[0];
      const start = m.index;
      const end = start + full.length;
      matches.push({ fullMatch: full, index: start, endIndex: end });

      // 命名组：序号 → 名字（通过位置对齐反查，边缘重叠命名组取首个）
      const indices = (m as unknown as { indices?: RegexIndices }).indices;
      const nameByIndex: Record<number, string> = {};
      const groupsObj = indices?.groups;
      if (groupsObj) {
        for (const [name, pair] of Object.entries(groupsObj)) {
          if (!pair) continue;
          for (let g = 1; g < m.length; g++) {
            const ig = indices?.[g];
            if (ig && ig[0] === pair[0] && ig[1] === pair[1]) {
              nameByIndex[g] = name;
              break;
            }
          }
        }
      }

      const groups: CaptureGroupWire[] = [];
      for (let g = 1; g < m.length; g++) {
        const value = m[g] ?? '';
        let gs: number | null = null;
        let ge: number | null = null;
        const ig = indices?.[g];
        if (ig) {
          gs = ig[0];
          ge = ig[1];
        }
        groups.push({ index: g, name: nameByIndex[g] ?? null, value, start: gs, end: ge });
      }

      details.push({ matchIndex: matches.length - 1, fullMatch: full, start, end, groups });
      if (m.index === regex.lastIndex) regex.lastIndex++; // 空匹配防死循环
      if (++guard > 100000) break; // 兜底防御
    }
    ctx.postMessage({ ok: true, matches, details, replacedText });
  } catch (err) {
    ctx.postMessage({ ok: false, error: (err as Error).message });
  }
};
