/**
 * 词级差异对比算法
 * 将文本拆分为 token（单词/符号），通过 LCS 找出变更的 token 并映射回字符位置
 */

export interface DiffSegment {
  text: string;
  changed: boolean;
  start: number;
  end: number;
}

export interface InlineDiffResult {
  oldSegments: DiffSegment[];
  newSegments: DiffSegment[];
}

/** 将文本拆分为 token，保留分隔符以保持位置映射 */
function tokenize(str: string): string[] {
  return str.split(/(\s+|[^\w\s])/).filter(Boolean);
}

/** 计算 LCS 矩阵 */
function lcsMatrix(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

/** 从 LCS 矩阵回溯，标记每个 token 是否 changed */
function markChanges(a: string[], b: string[]): { aChanged: boolean[]; bChanged: boolean[] } {
  const dp = lcsMatrix(a, b);
  const aChanged = new Array(a.length).fill(true);
  const bChanged = new Array(b.length).fill(true);
  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      aChanged[i - 1] = false;
      bChanged[j - 1] = false;
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return { aChanged, bChanged };
}

/** 从 token 序列和 changed 标记重建带位置的 Segment 列表 */
function segmentsFromTokens(tokens: string[], changed: boolean[], str: string): DiffSegment[] {
  const segments: DiffSegment[] = [];
  let pos = 0;
  for (let t = 0; t < tokens.length; t++) {
    // 在原始字符串中定位当前 token（处理重复 token 的情况）
    const idx = str.indexOf(tokens[t], pos);
    if (idx === -1) {
      // fallback: 用累计长度定位
      segments.push({
        text: tokens[t],
        changed: changed[t],
        start: pos,
        end: pos + tokens[t].length,
      });
      pos += tokens[t].length;
    } else {
      // 跳过未匹配的字符（如连续空格被合并）
      if (idx > pos) {
        segments.push({
          text: str.slice(pos, idx),
          changed: false,
          start: pos,
          end: idx,
        });
      }
      segments.push({
        text: tokens[t],
        changed: changed[t],
        start: idx,
        end: idx + tokens[t].length,
      });
      pos = idx + tokens[t].length;
    }
  }
  // 尾部未匹配字符
  if (pos < str.length) {
    segments.push({
      text: str.slice(pos),
      changed: false,
      start: pos,
      end: str.length,
    });
  }
  return segments;
}

/**
 * 计算两段文本的词级差异，返回各自的分段（带 changed 标记和字符位置）
 */
export function computeInlineDiff(oldStr: string, newStr: string): InlineDiffResult {
  const oldTokens = tokenize(oldStr);
  const newTokens = tokenize(newStr);
  const { aChanged, bChanged } = markChanges(oldTokens, newTokens);
  return {
    oldSegments: segmentsFromTokens(oldTokens, aChanged, oldStr),
    newSegments: segmentsFromTokens(newTokens, bChanged, newStr),
  };
}