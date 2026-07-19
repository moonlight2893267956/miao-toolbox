/**
 * Diff 检查器 — 行级统一/并排 · 可选 JSON 格式化
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Input } from 'antd';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import {
  computeLineDiff,
  formatDiffSummary,
  toSplitRows,
  type DiffViewMode,
} from '../../utils/textDiff';
import { resolveNetworkIcon } from '../../utils/iconMap';
import '../../network.css';
import '../../components/NetworkToolLayout.css';
import './diff-checker.css';

const { TextArea } = Input;

const SAMPLE_LEFT = `{
  "name": "demo",
  "version": 1,
  "enabled": true
}`;

const SAMPLE_RIGHT = `{
  "name": "demo",
  "version": 2,
  "enabled": true,
  "tags": ["a", "b"]
}`;

const DiffCheckerTool: React.FC = () => {
  const [left, setLeft] = useState(SAMPLE_LEFT);
  const [right, setRight] = useState(SAMPLE_RIGHT);
  const [formatJson, setFormatJson] = useState(true);
  const [mode, setMode] = useState<DiffViewMode>('unified');
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const run = useCallback(() => {
    setLoading(true);
    window.setTimeout(() => {
      setTick((t) => t + 1);
      setLoading(false);
    }, 40);
  }, []);

  const result = useMemo(
    () => computeLineDiff(left, right, { formatJson }),
    // tick 强制在点「对比」后重算（与输入实时联动其实也够，保留按钮语义）
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [left, right, formatJson, tick],
  );

  const splitRows = useMemo(() => toSplitRows(result.lines), [result.lines]);
  const resultText = formatDiffSummary(result);

  return (
    <NetworkToolLayout
      title="Diff 检查器"
      icon={resolveNetworkIcon('DiffOutlined')}
      description="行级 diff · JSON 自动格式化 · 统一/并排"
      submitText="对比"
      loading={loading}
      onSubmit={run}
      resultText={resultText}
      inputLabel="左右文本"
      inputMeta="支持 JSON / 纯文本"
      result={
        <div className="ntl-df" data-testid="diff-result">
          <div className="ntl-df-toolbar">
            <div className="ntl-df-stats">
              <span className="ntl-df-stat ntl-df-stat--add" data-testid="diff-added">
                +{result.added}
              </span>
              <span className="ntl-df-stat ntl-df-stat--del" data-testid="diff-removed">
                −{result.removed}
              </span>
              {result.jsonFormatted && (
                <span className="ntl-df-stat" data-testid="diff-json-flag">
                  JSON 已格式化
                </span>
              )}
            </div>
            <div className="ntl-df-modes" data-testid="diff-mode">
              <button
                type="button"
                className={mode === 'unified' ? 'is-on' : ''}
                onClick={() => setMode('unified')}
                data-testid="diff-mode-unified"
              >
                统一
              </button>
              <button
                type="button"
                className={mode === 'split' ? 'is-on' : ''}
                onClick={() => setMode('split')}
                data-testid="diff-mode-split"
              >
                并排
              </button>
            </div>
          </div>

          {mode === 'unified' ? (
            <div className="ntl-df-view" data-testid="diff-unified">
              {result.lines.map((l, i) => (
                <div
                  key={i}
                  className={`ntl-df-urow ntl-df-urow--${l.kind === 'equal' ? 'eq' : l.kind}`}
                >
                  <span className="ntl-df-sign">
                    {l.kind === 'add' ? '+' : l.kind === 'remove' ? '−' : ' '}
                  </span>
                  <span className="ntl-df-no">{l.leftNo ?? l.rightNo ?? ''}</span>
                  <span className="ntl-df-text">{l.text}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="ntl-df-view" data-testid="diff-split">
              <div className="ntl-df-split">
                <div className="ntl-df-split-col">
                  {splitRows.map((r, i) => (
                    <div
                      key={`L${i}`}
                      className={`ntl-df-srow${
                        !r.left
                          ? ' ntl-df-srow--empty'
                          : r.left.kind === 'remove'
                            ? ' ntl-df-srow--remove'
                            : ''
                      }`}
                    >
                      <span className="ntl-df-no">{r.left?.no ?? ''}</span>
                      <span className="ntl-df-text">{r.left?.text ?? ''}</span>
                    </div>
                  ))}
                </div>
                <div className="ntl-df-split-col">
                  {splitRows.map((r, i) => (
                    <div
                      key={`R${i}`}
                      className={`ntl-df-srow${
                        !r.right
                          ? ' ntl-df-srow--empty'
                          : r.right.kind === 'add'
                            ? ' ntl-df-srow--add'
                            : ''
                      }`}
                    >
                      <span className="ntl-df-no">{r.right?.no ?? ''}</span>
                      <span className="ntl-df-text">{r.right?.text ?? ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      }
    >
      <div data-testid="network-tool-input-slot">
        <div className="ntl-df-toolbar" style={{ marginBottom: 10 }}>
          <label className="ntl-df-check">
            <input
              type="checkbox"
              checked={formatJson}
              onChange={(e) => setFormatJson(e.target.checked)}
              data-testid="diff-format-json"
            />
            JSON 自动格式化后对比
          </label>
        </div>
        <div className="ntl-df-inputs">
          <div className="ntl-df-panel">
            <label htmlFor="diff-left">左侧（旧）</label>
            <TextArea
              id="diff-left"
              value={left}
              onChange={(e) => setLeft(e.target.value)}
              rows={10}
              data-testid="diff-left"
              spellCheck={false}
              style={{ fontFamily: 'var(--miao-font-mono, ui-monospace, Menlo, monospace)', fontSize: 12.5 }}
            />
          </div>
          <div className="ntl-df-panel">
            <label htmlFor="diff-right">右侧（新）</label>
            <TextArea
              id="diff-right"
              value={right}
              onChange={(e) => setRight(e.target.value)}
              rows={10}
              data-testid="diff-right"
              spellCheck={false}
              style={{ fontFamily: 'var(--miao-font-mono, ui-monospace, Menlo, monospace)', fontSize: 12.5 }}
            />
          </div>
        </div>
      </div>
    </NetworkToolLayout>
  );
};

export default DiffCheckerTool;
