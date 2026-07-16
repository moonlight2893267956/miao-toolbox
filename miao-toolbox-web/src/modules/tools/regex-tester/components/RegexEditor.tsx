import React from 'react';
import { BookOutlined, HistoryOutlined, CodeOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { useRegexContext } from '../useRegexContext';
import { JS_FLAGS } from '../data/flags';

const RegexEditor: React.FC = () => {
  const { state, setPattern, toggleFlag, toggleCheatSheet, toggleHistory, toggleCodeGen, setPatternCursor } = useRegexContext();

  return (
    <div className="rt-command-bar">
      <div className="rt-command-top">
        <div className="rt-regex-input">
          <span className="rt-regex-slash">/</span>
          <input
            type="text"
            value={state.pattern}
            onChange={(e) => setPattern(e.target.value)}
            onKeyUp={(e) => setPatternCursor((e.target as HTMLInputElement).selectionStart ?? 0)}
            onSelect={(e) => setPatternCursor((e.target as HTMLInputElement).selectionStart ?? 0)}
            placeholder="输入正则表达式，例如 \d+"
            spellCheck={false}
            className="rt-regex-field"
            aria-label="正则表达式"
          />
          <span className="rt-regex-slash">/</span>
          <span className="rt-regex-flags">{state.flags || '无'}</span>
        </div>

        <div className="rt-engine-select">
          <Tooltip title="代码生成">
            <button
              type="button"
              className={`rt-cheat-toggle ${state.showCodeGen ? 'rt-cheat-toggle--active' : ''}`}
              onClick={toggleCodeGen}
              disabled={!state.pattern}
              aria-label="代码生成"
            >
              <CodeOutlined />
            </button>
          </Tooltip>
          <Tooltip title="语法速查">
            <button
              type="button"
              className={`rt-cheat-toggle ${state.showCheatSheet ? 'rt-cheat-toggle--active' : ''}`}
              onClick={toggleCheatSheet}
              aria-label="语法速查"
            >
              <BookOutlined />
            </button>
          </Tooltip>
          <Tooltip title="匹配历史">
            <button
              type="button"
              className={`rt-cheat-toggle ${state.showHistory ? 'rt-cheat-toggle--active' : ''}`}
              onClick={toggleHistory}
              aria-label="匹配历史"
            >
              <HistoryOutlined />
            </button>
          </Tooltip>
        </div>
      </div>

      {state.patternError && (
        <div className="rt-inline-error" role="alert">
          {state.patternError}
        </div>
      )}

      <div className="rt-flags" role="group" aria-label="正则标志位">
        {JS_FLAGS.map((flag) => {
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
    </div>
  );
};

export default RegexEditor;
