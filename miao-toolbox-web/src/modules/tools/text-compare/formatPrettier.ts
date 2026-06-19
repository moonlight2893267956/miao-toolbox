/**
 * 本地 Prettier 格式化：JavaScript / TypeScript / Markdown 三种语言
 * 其他 7 种语言（java / json / yaml / sql / xml / html / css）走后端 /api/diff/format
 */
export type PrettierLang = 'javascript' | 'typescript' | 'markdown';

export async function formatWithPrettier(text: string, lang: PrettierLang): Promise<string> {
  const [{ format }, parserMod, estreeMod] = await Promise.all([
    import('prettier/standalone'),
    import('prettier/plugins/babel'),
    lang === 'typescript' ? import('prettier/plugins/estree') : Promise.resolve(null),
  ]);

  // babel 兼容 JS/TS；markdown 用专属 plugin
  const parserName = lang === 'markdown' ? 'markdown' : 'babel-ts';
  const plugins: unknown[] = [parserMod.default ?? parserMod];
  if (estreeMod) {
    const estreePlugin = estreeMod.default ?? estreeMod;
    plugins.push(estreePlugin);
  }
  if (lang === 'markdown') {
    const mdMod = await import('prettier/plugins/markdown');
    plugins.push(mdMod.default ?? mdMod);
  }

  return format(text, {
    parser: parserName,
    plugins: plugins as never,
    printWidth: 80,
    tabWidth: 2,
  });
}

export const PRETTIER_LANGUAGES: ReadonlySet<PrettierLang> = new Set([
  'javascript',
  'typescript',
  'markdown',
]);

export const BACKEND_FORMAT_LANGUAGES: ReadonlySet<string> = new Set([
  'java',
  'json',
  'yaml',
  'sql',
  'xml',
  'html',
  'css',
]);
