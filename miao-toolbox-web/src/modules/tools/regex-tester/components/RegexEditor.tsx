import React from 'react';
import { InfoCircleOutlined } from '@ant-design/icons';
import { Segmented, Tooltip } from 'antd';
import { useRegexContext } from '../useRegexContext';
import { ENGINES } from '../data/engines';
import type { RegexEngine } from '../types';

const RegexEditor: React.FC = () => {
  const { state, setPattern, toggleFlag, setEngine } = useRegexContext();
  const engineDef = ENGINES[state.engine];

  const engineOptions: { label: string; value: RegexEngine }[] = [
    { label: 'JS', value: 'js' },
    { label: 'Java', value: 'java' },
    { label: 'Python', value: 'python' },
    { label: 'Go', value: 'go' },
    { label: 'PHP', value: 'php' },
  ];

  return (
    <div className="rt-command-bar">
      <div className="rt-command-top">
        <div className="rt-regex-input">
          <span className="rt-regex-slash">/</span>
          <input
            type="text"
            value={state.pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="输入正则表达式，例如 \d+"
            spellCheck={false}
            className="rt-regex-field"
            aria-label="正则表达式"
          />
          <span className="rt-regex-slash">/</span>
          <span className="rt-regex-flags">{state.flags || '无'}</span>
        </div>

        <div className="rt-engine-select">
          <Segmented
            value={state.engine}
            onChange={(v) => setEngine(v as RegexEngine)}
            options={engineOptions}
          />
        </div>
      </div>

      {state.patternError && (
        <div className="rt-inline-error" role="alert">
          {state.patternError}
        </div>
      )}

      <div className="rt-flags" role="group" aria-label="正则标志位">
        {engineDef.flags.map((flag) => {
          const active = state.flags.includes(flag.key);
          return (
            <Tooltip key={flag.key} title={`${flag.name}：${flag.desc}`}>
              <button
                type="button"
                className={`rt-flag ${active ? 'rt-flag--active' : ''}`}
                onClick={() => toggleFlag(flag.key)}
                aria-pressed={active}
              >
                <span className="rt-flag-key">{flag.key}</span>
                <span className="rt-flag-name">{flag.name}</span>
              </button>
            </Tooltip>
          );
        })}
      </div>

      {state.engine !== 'js' && (
        <div className="rt-engine-hint">
          <InfoCircleOutlined /> 当前为 {engineDef.name} 引擎（仅 JS 引擎执行实时匹配；多引擎语法校验与代码生成将在后续 Story 提供）。
        </div>
      )}
    </div>
  );
};

export default RegexEditor;
