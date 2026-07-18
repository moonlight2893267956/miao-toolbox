// Cron 预设模板条（Story 1.3 / FR-7 常用模板快速选择 + FR-8 可微调）
// 点击经 setExpression 单一入口写入（spring6 时 transformDialect 补秒），与构建器双向同步。
import React, { useMemo } from 'react';
import { useCronContext } from '../useCronContext';
import { CRON_PRESETS, presetToExpression, matchPreset } from '../presets';

const PresetBar: React.FC = () => {
  const { state, setExpression } = useCronContext();
  const { expression, dialect } = state;

  const activeKey = useMemo(() => {
    const hit = CRON_PRESETS.find((p) => matchPreset(expression, dialect, p));
    return hit?.key ?? null;
  }, [expression, dialect]);

  return (
    <section className="ce-preset-bar" aria-label="预设模板">
      <span className="ce-preset-label">常用模板</span>
      <div className="ce-preset-strip" role="list">
        {CRON_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="listitem"
            className={`ce-preset-chip ${activeKey === p.key ? 'is-active' : ''}`}
            aria-pressed={activeKey === p.key}
            title={p.desc}
            onClick={() => setExpression(presetToExpression(p, dialect))}
          >
            {p.label}
          </button>
        ))}
      </div>
    </section>
  );
};

export default PresetBar;
