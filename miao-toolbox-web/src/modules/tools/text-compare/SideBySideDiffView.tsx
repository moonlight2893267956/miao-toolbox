import React, { useMemo, useRef, useCallback } from 'react';
import { CloudUploadOutlined, FileTextOutlined } from '@ant-design/icons';
import { Upload, message } from 'antd';
import type { UploadProps } from 'antd';
import type { DiffHunk, HunkType } from './types';
import { buildDiffRows, getHunkLines, replaceLines } from './diffRows';
import type { DiffRow } from './diffRows';

interface SideBySideDiffViewProps {
  leftText: string;
  rightText: string;
  leftLabel: string;
  rightLabel: string;
  hunks?: DiffHunk[];
  reviewedHunkIds: number[];
  onLeftChange: (text: string) => void;
  onRightChange: (text: string) => void;
  onToggleHunkReviewed: (hunkIndex: number) => void;
  onCurrentHunkChange?: (hunkIndex: number) => void;
  onFileLoaded?: (side: 'left' | 'right', file: { name: string; content: string }) => void;
  showLineNumbers?: boolean;
}

const lineClass = (side: 'left' | 'right', row: DiffRow, reviewed: boolean): string => {
  const classes = ['dt-idea-line'];
  if (row.hunkIndex != null) {
    classes.push(`is-${row.kind}`);
    if ((side === 'left' && row.leftLineNo == null) || (side === 'right' && row.rightLineNo == null)) {
      classes.push('is-placeholder');
    }
    if (reviewed) classes.push('is-reviewed');
  }
  return classes.join(' ');
};

const gutterKind = (kind: DiffRow['kind']): HunkType | 'unchanged' => kind;

const splitLines = (text: string) => (text.length === 0 ? [] : text.split('\n'));

const DiffUpload: React.FC<{
  side: 'left' | 'right';
  onFileLoaded?: SideBySideDiffViewProps['onFileLoaded'];
}> = ({ side, onFileLoaded }) => {
  const uploadProps: UploadProps = {
    showUploadList: false,
    beforeUpload: (file) => {
      if (file.size > 100 * 1024 * 1024) {
        message.error('文件大小超过 100MB 限制');
        return Upload.LIST_IGNORE;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        onFileLoaded?.(side, { name: file.name, content: e.target?.result as string });
      };
      reader.readAsText(file);
      return false;
    },
  };

  return (
    <Upload {...uploadProps}>
      <button className="dt-upload-btn" type="button">
        <CloudUploadOutlined /> 上传
      </button>
    </Upload>
  );
};

const SideHeader: React.FC<{
  side: 'left' | 'right';
  label: string;
  text: string;
  onFileLoaded?: SideBySideDiffViewProps['onFileLoaded'];
}> = ({ side, label, text, onFileLoaded }) => (
  <div className="dt-idea-header">
    <div className="dt-panel-label">
      <span className={`dt-side-tag ${side}`}>{side === 'left' ? 'A' : 'B'}</span>
      <span className="dt-panel-title">{label}</span>
      {text && <span className="dt-panel-meta"><FileTextOutlined /> {splitLines(text).length} 行</span>}
    </div>
    <DiffUpload side={side} onFileLoaded={onFileLoaded} />
  </div>
);

const SideCell: React.FC<{
  side: 'left' | 'right';
  row: DiffRow;
  lines: string[];
  showLineNumbers?: boolean;
  reviewed: boolean;
}> = ({ side, row, lines, showLineNumbers, reviewed }) => {
  const lineNo = side === 'left' ? row.leftLineNo : row.rightLineNo;
  const text = lineNo == null ? '' : lines[lineNo - 1] ?? '';

  return (
    <div className={lineClass(side, row, reviewed)}>
      {showLineNumbers && (
        <span className="dt-idea-line-no" aria-hidden="true">
          {lineNo ?? ''}
        </span>
      )}
      <code className="dt-idea-code">{text || ' '}</code>
    </div>
  );
};

const GutterCell: React.FC<{
  row: DiffRow;
  reviewed: boolean;
  onToggle: (hunkIndex: number) => void;
  onApplyLeft: (hunk: DiffHunk) => void;
  onApplyRight: (hunk: DiffHunk) => void;
  hunk?: DiffHunk;
}> = ({ row, reviewed, onToggle, onApplyLeft, onApplyRight, hunk }) => {
  const first = row.hunkIndex != null && row.hunkRowIndex === 0;
  const last = row.hunkIndex != null && row.hunkRowIndex === row.hunkRowCount - 1;

  return (
    <div className={`dt-center-gutter-row is-${gutterKind(row.kind)}${first ? ' is-first' : ''}${last ? ' is-last' : ''}`}>
      {row.hunkIndex != null && (
        <span className="dt-hunk-connector" aria-hidden="true" />
      )}
      {first && row.hunkIndex != null && hunk && (
        <div className="dt-gutter-actions">
          <button
            type="button"
            className={`dt-gutter-checkbox${reviewed ? ' is-checked' : ''}`}
            onClick={() => onToggle(row.hunkIndex ?? -1)}
            aria-label={`标记差异块 ${row.hunkIndex + 1} 为已审`}
            data-testid="dt-hunk-checkbox"
          />
          <button
            type="button"
            className="dt-gutter-apply"
            onClick={() => onApplyRight(hunk)}
            aria-label="将左侧应用到右侧"
            title="将左侧应用到右侧"
          >
            &gt;
          </button>
          <button
            type="button"
            className="dt-gutter-apply"
            onClick={() => onApplyLeft(hunk)}
            aria-label="将右侧应用到左侧"
            title="将右侧应用到左侧"
          >
            &lt;
          </button>
        </div>
      )}
    </div>
  );
};

const EditorPane: React.FC<{
  side: 'left' | 'right';
  value: string;
  onChange: (text: string) => void;
  label: string;
}> = ({ side, value, onChange, label }) => (
  <textarea
    className="dt-idea-input"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    spellCheck={false}
    aria-label={side === 'left' ? `${label} 输入` : `${label} 输入`}
  />
);

const SideBySideDiffView: React.FC<SideBySideDiffViewProps> = ({
  leftText,
  rightText,
  leftLabel,
  rightLabel,
  hunks = [],
  reviewedHunkIds,
  onLeftChange,
  onRightChange,
  onToggleHunkReviewed,
  onCurrentHunkChange,
  onFileLoaded,
  showLineNumbers = true,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const leftLines = useMemo(() => splitLines(leftText), [leftText]);
  const rightLines = useMemo(() => splitLines(rightText), [rightText]);
  const rows = useMemo(() => buildDiffRows(leftText, rightText, hunks), [leftText, rightText, hunks]);
  const hasDiff = hunks.some((hunk) => hunk.type !== 'unchanged');
  const hunkMap = useMemo(() => new Map(hunks.map((hunk, index) => [index, hunk])), [hunks]);

  const applyLeft = useCallback((hunk: DiffHunk) => {
    const rightChunk = getHunkLines(rightText, hunk.newStart, hunk.newLines);
    onLeftChange(replaceLines(leftText, hunk.oldStart, hunk.oldLines, rightChunk));
  }, [leftText, onLeftChange, rightText]);

  const applyRight = useCallback((hunk: DiffHunk) => {
    const leftChunk = getHunkLines(leftText, hunk.oldStart, hunk.oldLines);
    onRightChange(replaceLines(rightText, hunk.newStart, hunk.newLines, leftChunk));
  }, [leftText, onRightChange, rightText]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !onCurrentHunkChange) return;
    const lineHeight = Number.parseFloat(getComputedStyle(el).getPropertyValue('--dt-line-height')) || 22;
    const topIndex = Math.max(0, Math.min(rows.length - 1, Math.floor(el.scrollTop / lineHeight)));
    const current = rows[topIndex]?.hunkIndex;
    if (current != null) {
      onCurrentHunkChange(current);
      return;
    }
    const next = rows.slice(topIndex).find((row) => row.hunkIndex != null)?.hunkIndex;
    onCurrentHunkChange(next ?? -1);
  }, [onCurrentHunkChange, rows]);

  return (
    <section className="dt-diff-shell" aria-label="IDEA 风格文本比对">
      <div className="dt-idea-top">
        <SideHeader side="left" label={leftLabel} text={leftText} onFileLoaded={onFileLoaded} />
        <div className="dt-idea-gutter-head" aria-hidden="true" />
        <SideHeader side="right" label={rightLabel} text={rightText} onFileLoaded={onFileLoaded} />
      </div>

      <div className="dt-idea-editor-row">
        <EditorPane side="left" value={leftText} onChange={onLeftChange} label={leftLabel} />
        <div className="dt-idea-editor-divider" aria-hidden="true" />
        <EditorPane side="right" value={rightText} onChange={onRightChange} label={rightLabel} />
      </div>

      <div ref={scrollRef} className="dt-idea-scroll" onScroll={handleScroll} data-testid="dt-idea-diff-view">
        <div className="dt-idea-grid">
          <div className="dt-idea-side" data-side="left">
            {rows.map((row) => (
              <SideCell
                key={`l-${row.key}`}
                side="left"
                row={row}
                lines={leftLines}
                showLineNumbers={showLineNumbers}
                reviewed={row.hunkIndex != null && reviewedHunkIds.includes(row.hunkIndex)}
              />
            ))}
          </div>

          <div className="dt-center-gutter" aria-label="差异块操作">
            {rows.map((row) => (
              <GutterCell
                key={`g-${row.key}`}
                row={row}
                hunk={row.hunkIndex == null ? undefined : hunkMap.get(row.hunkIndex)}
                reviewed={row.hunkIndex != null && reviewedHunkIds.includes(row.hunkIndex)}
                onToggle={onToggleHunkReviewed}
                onApplyLeft={applyLeft}
                onApplyRight={applyRight}
              />
            ))}
          </div>

          <div className="dt-idea-side" data-side="right">
            {rows.map((row) => (
              <SideCell
                key={`r-${row.key}`}
                side="right"
                row={row}
                lines={rightLines}
                showLineNumbers={showLineNumbers}
                reviewed={row.hunkIndex != null && reviewedHunkIds.includes(row.hunkIndex)}
              />
            ))}
          </div>
        </div>
        {!hasDiff && leftText && rightText && (
          <div className="dt-idea-empty">无差异</div>
        )}
      </div>
    </section>
  );
};

export default SideBySideDiffView;
