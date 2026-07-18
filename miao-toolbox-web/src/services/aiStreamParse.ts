/**
 * AI 流式 output 解析工具：JSON 优先，失败时正则兜底抽取字段。
 * 供正则 / Cron 等工具 AI hook 共用。
 */

/** 清洗 token 拼接文本（去掉末尾省略号等残留） */
export function cleanStreamText(full: string): string {
  let clean = full.trim();
  if (clean.endsWith('...')) clean = clean.slice(0, -3).trim();
  return clean;
}

/** 从可能不完整的 JSON 文本中抽取字符串字段 */
export function extractStringField(text: string, key: string): string | null {
  const m = text.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  if (!m) return null;
  return m[1]
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\\t/g, '\t');
}

/** 抽取 suggestions 字符串数组 */
export function extractSuggestions(text: string): string[] | null {
  const m = text.match(/"suggestions"\s*:\s*\[([\s\S]*?)\]/);
  if (!m) return null;
  const items: string[] = [];
  const itemRe = /"((?:[^"\\]|\\.)*)"/g;
  let im: RegExpExecArray | null;
  while ((im = itemRe.exec(m[1])) !== null) {
    items.push(
      im[1]
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\'),
    );
  }
  return items.length > 0 ? items : null;
}

/** 尝试完整 JSON 解析 */
export function tryParseJsonObject(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 从 output 对象或兜底文本取 string 字段 */
export function pickString(
  obj: Record<string, unknown> | null,
  fallbackText: string,
  key: string,
): string | null {
  if (obj && typeof obj[key] === 'string') return obj[key] as string;
  if (obj && obj[key] != null && typeof obj[key] !== 'object') return String(obj[key]);
  return extractStringField(fallbackText, key);
}

/** 从 output 取 suggestions */
export function pickSuggestions(
  obj: Record<string, unknown> | null,
  fallbackText: string,
): string[] | null {
  if (obj && Array.isArray(obj.suggestions)) {
    const suggs = (obj.suggestions as unknown[]).map(String);
    return suggs.length > 0 ? suggs : null;
  }
  return extractSuggestions(fallbackText);
}
