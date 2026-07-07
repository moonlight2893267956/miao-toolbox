/**
 * 自动识别文本语言：启发式 + Prettier parse 验证
 *
 * 启发式按优先级匹配（强特征优先），得到候选后用对应 parser 实际解析验证：
 *   1. <?xml ... ?> / <!DOCTYPE html> / <html ...>  → xml/html 硬匹配
 *   2. JSON.parse 成功                              → json
 *   3. markdown 标题 / 代码围栏 / sql 关键字 / TS 类型注解
 *   4. JS function/const/let/class / YAML 文档头 / CSS 选择器
 */

import { format as formatSql } from 'sql-formatter';
import { formatWithPrettier, type FormatLang } from './formatPrettier';

export type DetectionResult = {
  language: FormatLang;
  confidence: 'high' | 'medium' | 'low';
};

const SAMPLE_SIZE = 2048;

type HeuristicHit = {
  language: FormatLang;
  confidence: 'high' | 'medium' | 'low';
  verify: (text: string) => Promise<boolean>;
};

/**
 * 启发式候选列表（按优先级）
 */
function getCandidates(text: string): HeuristicHit[] {
  const sample = text.slice(0, SAMPLE_SIZE);
  const candidates: HeuristicHit[] = [];

  // 1. XML 声明 → xml
  if (/^\s*<\?xml/.test(sample)) {
    candidates.push({ language: 'xml', confidence: 'high', verify: verifyXml });
  }
  // 2. HTML 文档类型 → html
  else if (/^\s*<!DOCTYPE\s+html/i.test(sample) || /^\s*<html[\s>]/i.test(sample)) {
    candidates.push({ language: 'html', confidence: 'high', verify: verifyPrettier('html') });
  }
  // 3. < 开头 + 含 HTML 标签 → html
  else if (/^\s*</.test(sample) && /<\/(div|p|span|h[1-6]|body|head|html|table|tr|td|li|ul|ol|a)\s*>/i.test(sample)) {
    candidates.push({ language: 'html', confidence: 'high', verify: verifyPrettier('html') });
  }
  // 4. < 开头但非 HTML 标签 → xml
  else if (/^\s*</.test(sample)) {
    candidates.push({ language: 'xml', confidence: 'medium', verify: verifyXml });
  }

  // 5. JSON 解析
  if (looksLikeJson(text)) {
    candidates.push({ language: 'json', confidence: 'high', verify: verifyPrettier('json') });
  }

  // 6. Markdown（标题、代码围栏、列表、引用、链接）
  if (/^\s{0,3}#{1,6}\s+\S/m.test(sample) || /```\w*\n/.test(sample) || /^\s*[-*+]\s+\S/m.test(sample)) {
    candidates.push({ language: 'markdown', confidence: 'medium', verify: verifyPrettier('markdown') });
  }

  // 7. SQL（DML + 查询子句）
  if (
    /^\s*(SELECT|INSERT\s+INTO|UPDATE\s+\w+|DELETE\s+FROM|CREATE\s+(TABLE|INDEX|VIEW))\b/im.test(sample) &&
    /\b(FROM|WHERE|JOIN|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT)\b/i.test(sample)
  ) {
    candidates.push({ language: 'sql', confidence: 'medium', verify: verifySql });
  }

  // 8. TypeScript 类型注解特征
  if (
    /^\s*(interface\s+\w+\s*\{|type\s+\w+\s*=\s*\{|: \w+(\[\])?\s*[;,)\n]|\): \w+(\[\])?\s*\{)/m.test(sample) ||
    /\b(readonly|private|public|protected)\s+\w+:\s*\w+/m.test(sample)
  ) {
    candidates.push({ language: 'typescript', confidence: 'medium', verify: verifyPrettier('typescript') });
  }

  // 9. JavaScript（function/const/let/class/=> 箭头）
  if (
    /^\s*(function\s+\w+|const\s+\w+\s*=\s*(function|\(|`|new|\[)|let\s+\w+\s*=|class\s+\w+\s*(extends|\{))/m.test(sample) ||
    /=>\s*[{(]?/m.test(sample)
  ) {
    candidates.push({ language: 'javascript', confidence: 'medium', verify: verifyPrettier('javascript') });
  }

  // 10. YAML（文档头 + 缩进 key: value）
  if (
    /^---\s*$/m.test(sample) ||
    /^\s*\w[\w-]*:\s*(\S|$)/m.test(sample) && /^\s+[\w-]+:\s/m.test(sample)
  ) {
    candidates.push({ language: 'yaml', confidence: 'medium', verify: verifyYaml });
  }

  // 11. CSS（{ ... : ...; } 模式 + 选择器）
  if (
    /[^{}]*\{[^{}]*:[^{}]*;[^{}]*\}/m.test(sample) ||
    /^\s*[.#]?[\w-]+\s*\{/m.test(sample)
  ) {
    candidates.push({ language: 'css', confidence: 'low' as never, verify: verifyPrettier('css') });
  }

  return candidates;
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed[0] !== '{' && trimmed[0] !== '[') return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function verifyPrettier(lang: FormatLang) {
  return async (text: string): Promise<boolean> => {
    try {
      await formatWithPrettier(text, lang);
      return true;
    } catch {
      return false;
    }
  };
}

async function verifySql(text: string): Promise<boolean> {
  try {
    formatSql(text, { language: 'sql' });
    return true;
  } catch {
    return false;
  }
}

async function verifyYaml(text: string): Promise<boolean> {
  // Prettier yaml parser 对含特殊字符的字符串敏感，用 try-catch 验证
  try {
    await formatWithPrettier(text, 'yaml');
    return true;
  } catch {
    return false;
  }
}

async function verifyXml(text: string): Promise<boolean> {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'application/xml');
    return !doc.querySelector('parsererror');
  } catch {
    return false;
  }
}

/**
 * 主入口：识别文本语言
 * @returns 识别结果（高/中置信度），无法识别返回 null
 */
export async function detectLanguage(text: string): Promise<DetectionResult | null> {
  const trimmed = text.trim();
  if (trimmed.length < 2) return null;

  const candidates = getCandidates(text);
  if (candidates.length === 0) return null;

  // 高置信度硬匹配（xml/html/json）直接返回，不验证
  const hardMatch = candidates.find((c) => c.confidence === 'high');
  if (hardMatch) {
    return { language: hardMatch.language, confidence: 'high' };
  }

  // 中/低置信度：用 parser 实际验证，第一个通过验证的胜出
  for (const c of candidates) {
    if (c.confidence === 'medium' || c.confidence === 'low') {
      const ok = await c.verify(text);
      if (ok) {
        return { language: c.language, confidence: c.confidence };
      }
    }
  }

  return null;
}
