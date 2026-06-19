export type LayoutMode = 'split' | 'stacked';

export type HunkType = 'added' | 'removed' | 'modified' | 'unchanged';

export type ChangeType = 'equal' | 'added' | 'removed' | 'modified';

export interface DiffChange {
  type: ChangeType;
  value: string;
  oldValue?: string;
}

export interface DiffHunk {
  type: HunkType;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  changes: DiffChange[];
}

export interface DiffStatistics {
  additions: number;
  deletions: number;
  modifications: number;
}

export interface DiffResult {
  statistics: DiffStatistics;
  hunks: DiffHunk[];
  language: string | null;
  fileKeys?: string[];
}

export interface DiffRequestBody {
  left: string;
  right: string;
  ignoreWhitespace?: boolean;
  structuredDiff?: boolean;
  leftLabel?: string;
  rightLabel?: string;
}

export interface FileUploadResult {
  fileKey: string;
  fileName: string;
  size: number;
}

export interface FormatResponse {
  formatted: string;
  language: string;
  lines: number;
  bytes: number;
}

export interface DiffState {
  leftText: string;
  rightText: string;
  leftLabel: string;
  rightLabel: string;
  layout: LayoutMode;
  ignoreWhitespace: boolean;
  structuredDiff: boolean;
  showLineNumbers: boolean;
  language: string | null;
  diffResult: DiffResult | null;
  loading: boolean;
  error: string | null;
  currentHunkIndex: number;
  goToHunk: number | null;
}

export type DiffAction =
  | { type: 'SET_LEFT'; payload: string }
  | { type: 'SET_RIGHT'; payload: string }
  | { type: 'SET_LAYOUT'; payload: LayoutMode }
  | { type: 'SET_IGNORE_WHITESPACE'; payload: boolean }
  | { type: 'SET_STRUCTURED_DIFF'; payload: boolean }
  | { type: 'SET_SHOW_LINE_NUMBERS'; payload: boolean }
  | { type: 'SET_LANGUAGE'; payload: string | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_DIFF_RESULT'; payload: DiffResult | null }
  | { type: 'SET_LEFT_FILE'; payload: { name: string; content: string } }
  | { type: 'SET_RIGHT_FILE'; payload: { name: string; content: string } }
  | { type: 'SET_CURRENT_HUNK_INDEX'; payload: number }
  | { type: 'GO_TO_HUNK'; payload: number | null };
