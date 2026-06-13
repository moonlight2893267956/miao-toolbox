import type { DiffHunk, HunkType } from './types';

export type DiffRowKind = HunkType | 'unchanged';

export interface DiffRow {
  key: string;
  leftLineNo: number | null;
  rightLineNo: number | null;
  kind: DiffRowKind;
  hunkIndex: number | null;
  hunkRowIndex: number;
  hunkRowCount: number;
}

const splitLines = (text: string): string[] => {
  if (text.length === 0) return [];
  return text.split('\n');
};

const appendUnchangedRows = (
  rows: DiffRow[],
  leftLine: number,
  rightLine: number,
  count: number,
) => {
  for (let i = 0; i < count; i++) {
    rows.push({
      key: `u-${leftLine + i}-${rightLine + i}`,
      leftLineNo: leftLine + i,
      rightLineNo: rightLine + i,
      kind: 'unchanged',
      hunkIndex: null,
      hunkRowIndex: 0,
      hunkRowCount: 0,
    });
  }
};

/**
 * Builds an IDEA-style row map from backend hunks. The map is view-only: it
 * pairs old/new line numbers and inserts nulls where one side needs a blank
 * placeholder row.
 */
export function buildDiffRows(
  leftText: string,
  rightText: string,
  hunks: DiffHunk[] = [],
): DiffRow[] {
  const leftLines = splitLines(leftText);
  const rightLines = splitLines(rightText);
  const rows: DiffRow[] = [];
  const sortedHunks = hunks
    .map((hunk, index) => ({ hunk, index }))
    .filter((entry) => entry.hunk.type !== 'unchanged')
    .sort((a, b) => (a.hunk.oldStart - b.hunk.oldStart) || (a.hunk.newStart - b.hunk.newStart));

  let leftLine = 1;
  let rightLine = 1;

  for (const entry of sortedHunks) {
    const { hunk, index: hunkIndex } = entry;
    const unchangedBefore = Math.max(
      0,
      Math.min(hunk.oldStart - leftLine, hunk.newStart - rightLine),
    );

    appendUnchangedRows(rows, leftLine, rightLine, unchangedBefore);
    leftLine += unchangedBefore;
    rightLine += unchangedBefore;

    const rowCount = Math.max(hunk.oldLines, hunk.newLines);
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
      const hasLeft = rowIndex < hunk.oldLines;
      const hasRight = rowIndex < hunk.newLines;
      rows.push({
        key: `h-${hunkIndex}-${rowIndex}-${hunk.oldStart}-${hunk.newStart}`,
        leftLineNo: hasLeft ? hunk.oldStart + rowIndex : null,
        rightLineNo: hasRight ? hunk.newStart + rowIndex : null,
        kind: hunk.type,
        hunkIndex,
        hunkRowIndex: rowIndex,
        hunkRowCount: rowCount,
      });
    }

    leftLine = Math.max(leftLine, hunk.oldStart + hunk.oldLines);
    rightLine = Math.max(rightLine, hunk.newStart + hunk.newLines);
  }

  const tailCount = Math.max(leftLines.length - leftLine + 1, rightLines.length - rightLine + 1, 0);
  for (let i = 0; i < tailCount; i++) {
    rows.push({
      key: `t-${leftLine + i}-${rightLine + i}`,
      leftLineNo: leftLine + i <= leftLines.length ? leftLine + i : null,
      rightLineNo: rightLine + i <= rightLines.length ? rightLine + i : null,
      kind: 'unchanged',
      hunkIndex: null,
      hunkRowIndex: 0,
      hunkRowCount: 0,
    });
  }

  return rows;
}

export function getCurrentHunkFromRows(rows: DiffRow[], scrollTop: number, lineHeight: number): number {
  if (rows.length === 0) return -1;
  const topIndex = Math.max(0, Math.min(rows.length - 1, Math.floor(scrollTop / lineHeight)));
  const topRow = rows[topIndex];
  if (topRow?.hunkIndex != null) return topRow.hunkIndex;

  for (let i = topIndex + 1; i < rows.length; i++) {
    if (rows[i].hunkIndex != null) return rows[i].hunkIndex ?? -1;
  }
  return -1;
}

export function replaceLines(
  text: string,
  startLine: number,
  lineCount: number,
  replacement: string[],
): string {
  const lines = splitLines(text);
  const index = Math.max(0, Math.min(lines.length, startLine - 1));
  lines.splice(index, lineCount, ...replacement);
  return lines.join('\n');
}

export function getHunkLines(text: string, startLine: number, lineCount: number): string[] {
  if (lineCount <= 0) return [];
  const lines = splitLines(text);
  const index = Math.max(0, startLine - 1);
  return lines.slice(index, index + lineCount);
}
