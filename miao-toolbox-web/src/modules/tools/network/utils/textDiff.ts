/**
 * 轻量行级 Diff（统一 / 并排），可选 JSON 预格式化
 */

import { diffLines } from 'diff';

export type DiffViewMode = 'unified' | 'split';

export type DiffLineKind = 'equal' | 'add' | 'remove';

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  leftNo?: number;
  rightNo?: number;
}

export interface DiffResult {
  lines: DiffLine[];
  added: number;
  removed: number;
  leftFormatted: string;
  rightFormatted: string;
  jsonFormatted: boolean;
}

/** 尝试 JSON 美化；失败返回原文 */
export function tryFormatJson(text: string): { text: string; formatted: boolean } {
  const t = text.trim();
  if (!t) return { text, formatted: false };
  try {
    const v = JSON.parse(t);
    return { text: JSON.stringify(v, null, 2) + '\n', formatted: true };
  } catch {
    return { text, formatted: false };
  }
}

export function computeLineDiff(
  leftRaw: string,
  rightRaw: string,
  opts: { formatJson?: boolean } = {},
): DiffResult {
  let left = leftRaw;
  let right = rightRaw;
  let jsonFormatted = false;

  if (opts.formatJson) {
    const L = tryFormatJson(leftRaw);
    const R = tryFormatJson(rightRaw);
    left = L.text;
    right = R.text;
    jsonFormatted = L.formatted || R.formatted;
  }

  const parts = diffLines(left, right);
  const lines: DiffLine[] = [];
  let leftNo = 0;
  let rightNo = 0;
  let added = 0;
  let removed = 0;

  for (const part of parts) {
    const chunkLines = part.value.replace(/\n$/, '').split('\n');
    // diff 库在 value 以 \n 结尾时 split 会多一个空串
    const rows =
      part.value.endsWith('\n') && chunkLines[chunkLines.length - 1] === ''
        ? chunkLines.slice(0, -1)
        : chunkLines;

    for (const text of rows) {
      if (part.added) {
        rightNo += 1;
        added += 1;
        lines.push({ kind: 'add', text, rightNo });
      } else if (part.removed) {
        leftNo += 1;
        removed += 1;
        lines.push({ kind: 'remove', text, leftNo });
      } else {
        leftNo += 1;
        rightNo += 1;
        lines.push({ kind: 'equal', text, leftNo, rightNo });
      }
    }
  }

  return { lines, added, removed, leftFormatted: left, rightFormatted: right, jsonFormatted };
}

/** 并排行：将 remove/add 配对为同一视觉行 */
export interface SplitRow {
  left?: { no: number; text: string; kind: DiffLineKind };
  right?: { no: number; text: string; kind: DiffLineKind };
}

export function toSplitRows(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let i = 0;
  while (i < lines.length) {
    const cur = lines[i];
    if (cur.kind === 'equal') {
      rows.push({
        left: { no: cur.leftNo!, text: cur.text, kind: 'equal' },
        right: { no: cur.rightNo!, text: cur.text, kind: 'equal' },
      });
      i += 1;
      continue;
    }
    // 收集连续 remove 再 add
    const removes: DiffLine[] = [];
    const adds: DiffLine[] = [];
    while (i < lines.length && lines[i].kind === 'remove') {
      removes.push(lines[i]);
      i += 1;
    }
    while (i < lines.length && lines[i].kind === 'add') {
      adds.push(lines[i]);
      i += 1;
    }
    const n = Math.max(removes.length, adds.length);
    for (let k = 0; k < n; k++) {
      const L = removes[k];
      const R = adds[k];
      rows.push({
        left: L
          ? { no: L.leftNo!, text: L.text, kind: 'remove' }
          : undefined,
        right: R
          ? { no: R.rightNo!, text: R.text, kind: 'add' }
          : undefined,
      });
    }
  }
  return rows;
}

export function formatDiffSummary(r: DiffResult): string {
  return [
    `+${r.added} / -${r.removed}${r.jsonFormatted ? ' (JSON 已格式化)' : ''}`,
    '',
    ...r.lines.map((l) => {
      const p = l.kind === 'add' ? '+' : l.kind === 'remove' ? '-' : ' ';
      return `${p} ${l.text}`;
    }),
  ].join('\n');
}
