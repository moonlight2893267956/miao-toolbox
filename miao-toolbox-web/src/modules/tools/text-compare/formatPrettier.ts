/**
 * 本地代码格式化：9 种语言全部客户端处理
 *
 * Prettier 3.x 内置 parsers（standalone bundle）：
 *   javascript → babel       (prettier/plugins/babel)
 *   typescript  → babel-ts   (prettier/plugins/babel + estree)
 *   json        → json       (prettier/plugins/babel)
 *   css         → css        (prettier/plugins/postcss)
 *   html        → html       (prettier/plugins/html)
 *   yaml        → yaml       (prettier/plugins/yaml)
 *   markdown    → markdown   (prettier/plugins/markdown)
 *
 * 非 Prettier 路径：
 *   sql         → sql-formatter npm 包（Prettier 3.8 尚未内置 sql parser）
 *   xml         → 浏览器 DOMParser + XMLSerializer + 手动缩进
 */

import * as prettier from 'prettier/standalone';
import { format as formatSql } from 'sql-formatter';

export type FormatLang =
  | 'javascript'
  | 'typescript'
  | 'json'
  | 'css'
  | 'html'
  | 'yaml'
  | 'markdown'
  | 'sql'
  | 'xml';

const PRETTIER_OPTIONS = {
  printWidth: 80,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  trailingComma: 'all' as const,
  bracketSpacing: true,
  arrowParens: 'always' as const,
};

export async function formatWithPrettier(text: string, lang: FormatLang): Promise<string> {
  if (!text) return text;

  if (lang === 'sql') {
    return formatSql(text, { language: 'sql', tabWidth: 2, keywordCase: 'upper' });
  }
  if (lang === 'xml') {
    return formatXmlWithDom(text);
  }

  const parserName = (() => {
    switch (lang) {
      case 'javascript': return 'babel';
      case 'typescript': return 'babel-ts';
      case 'json': return 'json';
      case 'css': return 'css';
      case 'html': return 'html';
      case 'yaml': return 'yaml';
      case 'markdown': return 'markdown';
      default: return 'babel';
    }
  })();

  const pluginMods: unknown[] = [await import('prettier/plugins/babel')];
  switch (lang) {
    case 'javascript':
    case 'typescript':
    case 'json':
      if (lang === 'typescript' || lang === 'json') {
        pluginMods.push(await import('prettier/plugins/estree'));
      }
      break;
    case 'css':
      pluginMods.push(await import('prettier/plugins/postcss'));
      break;
    case 'html':
      pluginMods.push(await import('prettier/plugins/html'));
      break;
    case 'yaml':
      pluginMods.push(await import('prettier/plugins/yaml'));
      break;
    case 'markdown':
      pluginMods.push(await import('prettier/plugins/markdown'));
      break;
  }

  return (prettier as unknown as { format: (text: string, opts: object) => Promise<string> }).format(
    text,
    {
      ...PRETTIER_OPTIONS,
      parser: parserName,
      plugins: pluginMods as never,
    },
  );
}

/**
 * XML 格式化：使用浏览器 DOMParser + XMLSerializer + 手动缩进换行
 * 仅处理语法合法的 XML，错误输入抛错由调用方捕获
 */
function formatXmlWithDom(text: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(parseError.textContent ?? 'XML 解析失败');
  }

  const raw = new XMLSerializer().serializeToString(doc);
  return indentXml(raw, 2);
}

function indentXml(xml: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  let depth = 0;
  const lines: string[] = [];

  const declMatch = xml.match(/^<\?xml[^?]*\?>\s*/);
  const decl = declMatch ? declMatch[0].trim() : '';
  const body = decl ? xml.slice(decl.length).trim() : xml.trim();

  const tokenRegex = /<\?[^?]*?>|<![^>]*>|<!--[\s\S]*?-->|<\/?[^!>][^>]*>|<[^>]*\/>/g;
  let m: RegExpExecArray | null;
  let lastIndex = 0;
  let pendingText = '';

  const flushText = () => {
    const trimmed = pendingText.trim();
    if (trimmed) {
      lines.push(pad.repeat(Math.max(depth, 0)) + trimmed);
    }
    pendingText = '';
  };

  while ((m = tokenRegex.exec(body)) !== null) {
    if (m.index > lastIndex) {
      pendingText += body.slice(lastIndex, m.index);
    }
    const tok = m[0];

    if (tok.startsWith('</')) {
      flushText();
      depth = Math.max(depth - 1, 0);
      lines.push(pad.repeat(depth) + tok);
    } else if (tok.endsWith('/>') || tok.startsWith('<?') || tok.startsWith('<!')) {
      flushText();
      lines.push(pad.repeat(depth) + tok);
    } else {
      flushText();
      lines.push(pad.repeat(depth) + tok);
      depth += 1;
    }
    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < body.length) {
    pendingText += body.slice(lastIndex);
  }
  flushText();

  return (decl ? decl + '\n' : '') + lines.join('\n');
}

export const FORMAT_LANGUAGES: ReadonlySet<FormatLang> = new Set([
  'javascript',
  'typescript',
  'json',
  'css',
  'html',
  'yaml',
  'markdown',
  'sql',
  'xml',
]);
