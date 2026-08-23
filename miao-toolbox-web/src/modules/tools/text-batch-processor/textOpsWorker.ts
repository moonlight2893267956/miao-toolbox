// 文本批量处理 — 正则引擎 Web Worker（Story 3.1）
// 在独立线程执行 RegExp，主线程用 1s 竞速 + worker.terminate() 实现 ReDoS 防护。
// 模式：
//   - extract：扫描所有匹配（强制 g + d），返回每条的完整文本与位置
//   - replace：String.replace 派生替换结果（支持 $1 / ${name} 引用），并返回匹配位置供预览高亮

import { normalizeReplacement } from './utils/regex';

export interface TextOpsRequest {
  pattern: string;
  flags: string;
  testText: string;
  replaceText: string;
  mode: 'extract' | 'replace';
}

export interface TextOpsMatch {
  fullMatch: string;
  index: number;
  endIndex: number;
  /** 捕获组（g1, g2...），无捕获组时为空数组（仅 extract 模式返回） */
  groups?: string[];
}

export interface TextOpsResponse {
  ok: boolean;
  matches?: TextOpsMatch[];
  replacedText?: string;
  error?: string;
}

// 用最小接口避免依赖 webworker lib 带来的类型冲突
const ctx = self as unknown as {
  postMessage: (msg: TextOpsResponse) => void;
  onmessage: ((e: MessageEvent<TextOpsRequest>) => void) | null;
};

ctx.onmessage = (e: MessageEvent<TextOpsRequest>) => {
  const { pattern, flags, testText, replaceText, mode } = e.data;
  try {
    const regex = new RegExp(pattern, flags);

    // 替换模式：用 String.replace 派生替换结果（g 语义决定全部/仅首个）
    if (mode === 'replace') {
      let replacedText = testText;
      try {
        replacedText = testText.replace(regex, normalizeReplacement(replaceText));
      } catch {
        replacedText = testText;
      }

      // 匹配位置（预览高亮用）：重新扫描
      const scanFlags = flags.includes('g') ? flags : flags + 'g';
      const scanRegex = new RegExp(pattern, scanFlags);
      const matches: TextOpsMatch[] = [];
      let m: RegExpExecArray | null;
      let guard = 0;
      while ((m = scanRegex.exec(testText)) !== null) {
        const full = m[0];
        const start = m.index;
        const end = start + full.length;
        matches.push({ fullMatch: full, index: start, endIndex: end });
        if (m.index === scanRegex.lastIndex) scanRegex.lastIndex++;
        if (++guard > 100000) break;
      }
      ctx.postMessage({ ok: true, matches, replacedText });
      return;
    }

    // extract 模式：强制 g + d 扫描全部（d 提供捕获组位置，供「仅捕获组」格式）
    let scanFlags = flags.includes('g') ? flags : flags + 'g';
    if (!scanFlags.includes('d')) scanFlags += 'd';
    const scanRegex = new RegExp(pattern, scanFlags);
    const matches: TextOpsMatch[] = [];
    let m: RegExpExecArray | null;
    let guard = 0;
    while ((m = scanRegex.exec(testText)) !== null) {
      const full = m[0];
      const start = m.index;
      const end = start + full.length;
      // 捕获组值（用 d 标志时 m 仍是 RegExpExecArray，groups 直接取值）
      const groups: string[] = [];
      for (let g = 1; g < m.length; g++) {
        groups.push(m[g] ?? '');
      }
      matches.push({ fullMatch: full, index: start, endIndex: end, groups });
      if (m.index === scanRegex.lastIndex) scanRegex.lastIndex++; // 空匹配防死循环
      if (++guard > 100000) break; // 兜底防御
    }
    ctx.postMessage({ ok: true, matches });
  } catch (err) {
    ctx.postMessage({ ok: false, error: (err as Error).message });
  }
};
