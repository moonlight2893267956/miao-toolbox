// Cron 可视化构建器（FR-3 双向绑定 / FR-4 字段级编辑）
// 折叠面板：默认收起，展开后展示字段摘要气泡条 + 点击激活字段的编辑面板
import React, { useMemo, useState } from 'react';
import { useCronContext } from '../useCronContext';
import { FIELD_ORDER_5, FIELD_ORDER_6, FIELD_DEFS } from '../types';
import { FIELD_CONFIGS } from '../fieldOptions';
import { getFieldTokens } from '../utils/cronFieldTokens';
import { summarizeField } from '../utils/summarizeField';
import FieldBubble from './FieldBubble';
import FieldEditor from './FieldEditor';

const VisualBuilder: React.FC = () => {
  const { state, setExpression, validation } = useCronContext();
  const { expression, dialect } = state;

  const order = dialect === 'linux5' ? FIELD_ORDER_5 : FIELD_ORDER_6;
  const tokens = useMemo(() => getFieldTokens(expression, dialect), [expression, dialect]);

  const errorIndexes = useMemo(
    () => new Set(validation.errors.map((e) => e.fieldIndex)),
    [validation.errors],
  );

  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  const updateField = (idx: number, raw: string) => {
    const next = tokens.slice();
    next[idx] = raw;
    setExpression(next.join(' '));
  };

  const toggle = (i: number) => setActiveIndex((cur) => (cur === i ? null : i));

  const activeType = activeIndex !== null ? order[activeIndex] : null;

  return (
    <section className="ce-builder" aria-label="可视化构建器">
      <button
        type="button"
        className={`ce-builder-header ce-builder-toggle ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="ce-builder-title">字段构建器</span>
        <span className="ce-builder-head-right">
          <span className="ce-builder-subtitle">
            {order.length} 字段 · {dialect === 'linux5' ? '5 位' : '6 位（含秒）'}
          </span>
          <span className="ce-collapse-caret" aria-hidden="true">
            ▾
          </span>
        </span>
      </button>

      <div className={`ce-builder-body ${open ? 'is-open' : ''}`}>
        <div className="ce-builder-body-inner">
          <div className="ce-bubble-strip" role="list">
            {order.map((type, i) => {
              const raw = tokens[i] ?? '*';
              const { summary, full } = summarizeField(raw, FIELD_DEFS[type]);
              return (
                <FieldBubble
                  key={`${type}-${dialect}`}
                  def={FIELD_DEFS[type]}
                  summary={summary}
                  full={full}
                  hasError={errorIndexes.has(i)}
                  active={activeIndex === i}
                  onToggle={() => toggle(i)}
                />
              );
            })}
          </div>

          {activeType !== null && activeIndex !== null && (
            <div
              className={`ce-field-pop ${errorIndexes.has(activeIndex) ? 'is-invalid' : ''}`}
              role="dialog"
              aria-label={`${FIELD_DEFS[activeType].label} 编辑`}
            >
              <FieldEditor
                index={activeIndex}
                def={FIELD_DEFS[activeType]}
                config={FIELD_CONFIGS[activeType]}
                currentRaw={tokens[activeIndex] ?? '*'}
                hasError={errorIndexes.has(activeIndex)}
                onChange={(raw) => updateField(activeIndex, raw)}
                onClose={() => setActiveIndex(null)}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default VisualBuilder;
