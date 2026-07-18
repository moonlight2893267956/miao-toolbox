// Cron 字段可视化编辑器（FR-4 / FR-5 / FR-6）
// Ant Design 简洁风：Tag + Segmented + Tag.CheckableTag + Input
import React, { useEffect, useMemo, useState } from 'react';
import { Input, Segmented, Tag, Tooltip } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import type { FieldDef } from '../types';
import { expandFieldValues } from '../utils/cronParser';
import { summarizeField } from '../utils/summarizeField';
import type { FieldConfig, FieldEditorMode } from '../fieldOptions';

interface FieldEditorProps {
  index: number;
  def: FieldDef;
  config: FieldConfig;
  currentRaw: string;
  hasError: boolean;
  onChange: (raw: string) => void;
  onClose: () => void;
}

const MODE_OPTIONS: { label: string; value: FieldEditorMode }[] = [
  { label: '快捷', value: 'quick' },
  { label: '多选', value: 'multi' },
  { label: '高级', value: 'advanced' },
];

/** 将勾选数值集合压缩为友好 raw */
function compressValues(selected: number[], all: number[]): string {
  if (selected.length === 0) return '*';
  if (selected.length === all.length && all.every((v) => selected.includes(v))) return '*';
  const sorted = [...selected].sort((a, b) => a - b);
  const contiguous = sorted[sorted.length - 1] - sorted[0] === sorted.length - 1;
  if (contiguous) {
    return sorted[0] === sorted[sorted.length - 1]
      ? String(sorted[0])
      : `${sorted[0]}-${sorted[sorted.length - 1]}`;
  }
  return sorted.join(',');
}

const padIndex = (i: number) => String(i + 1).padStart(2, '0');

const FieldEditor: React.FC<FieldEditorProps> = ({
  index,
  def,
  config,
  currentRaw,
  hasError,
  onChange,
  onClose,
}) => {
  const [mode, setMode] = useState<FieldEditorMode>('quick');
  const [advValue, setAdvValue] = useState(currentRaw);

  useEffect(() => {
    setAdvValue(currentRaw);
  }, [currentRaw]);

  const labelOf = config.valueLabel ?? ((v: number) => String(v));

  const selectedSet = useMemo(() => {
    const { values, special } = expandFieldValues(currentRaw, def);
    const set = new Set<number>();
    if (special === '*') {
      config.multiValues.forEach((v) => set.add(v));
    } else {
      values.forEach((v) => set.add(v));
    }
    return set;
  }, [currentRaw, def, config.multiValues]);

  const { summary, full } = useMemo(
    () => summarizeField(currentRaw, def),
    [currentRaw, def],
  );

  const isDefaultStar = currentRaw === '*' || currentRaw === '' || currentRaw === '?';
  const isQuickMatched = config.quickOptions.some((o) => o.value === currentRaw);

  return (
    <div className={`ce-editor ${hasError ? 'is-invalid' : ''}`}>
      <div className="ce-editor-head">
        <div className="ce-editor-head-left">
          <span className="ce-editor-index">{padIndex(index)}</span>
          <span className="ce-editor-label">{def.label}</span>
          <span className="ce-editor-range">
            {def.min}–{def.max}
          </span>
        </div>
        <button
          type="button"
          className="ce-editor-close"
          onClick={onClose}
          aria-label="关闭编辑面板"
        >
          <CloseOutlined />
        </button>
      </div>

      <div className="ce-editor-current">
        <span className="ce-editor-current-label">当前值</span>
        <Tooltip title={full}>
          <Tag
            color={isDefaultStar ? 'default' : isQuickMatched ? 'default' : 'blue'}
            className="ce-editor-current-tag"
          >
            {summary}
          </Tag>
        </Tooltip>
        {hasError && <span className="ce-editor-error-hint">语法/语义错误</span>}
      </div>

      <Segmented
        className="ce-editor-mode"
        value={mode}
        onChange={(v) => setMode(v as FieldEditorMode)}
        options={MODE_OPTIONS as unknown as { label: string; value: string }[]}
      />

      <div className="ce-editor-body">
        {mode === 'quick' && (
          <div className="ce-editor-quick">
            {config.quickOptions.map((opt) => (
              <Tag.CheckableTag
                key={opt.value}
                checked={currentRaw === opt.value}
                onChange={() => onChange(opt.value)}
                className="ce-editor-chip"
              >
                {opt.label}
              </Tag.CheckableTag>
            ))}
            {!isQuickMatched && !isDefaultStar && (
              <span className="ce-editor-custom">自定义 · {currentRaw || '∅'}</span>
            )}
          </div>
        )}

        {mode === 'multi' && (
          <div className="ce-editor-multi">
            {config.multiValues.map((v) => (
              <Tag.CheckableTag
                key={v}
                checked={selectedSet.has(v)}
                onChange={(checked) => {
                  const next = new Set(selectedSet);
                  if (checked) next.add(v);
                  else next.delete(v);
                  onChange(compressValues(Array.from(next), config.multiValues));
                }}
                className="ce-editor-chip"
              >
                {labelOf(v)}
              </Tag.CheckableTag>
            ))}
          </div>
        )}

        {mode === 'advanced' && (
          <Input
            className="ce-editor-advanced"
            value={advValue}
            spellCheck={false}
            autoComplete="off"
            placeholder="如 * / 5 / 9-18 / L / 1W"
            status={hasError ? 'error' : undefined}
            aria-label={`${def.label}高级输入`}
            onChange={(e) => {
              setAdvValue(e.target.value);
              onChange(e.target.value);
            }}
          />
        )}
      </div>
    </div>
  );
};

export default FieldEditor;
