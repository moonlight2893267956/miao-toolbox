import React from 'react';
import { CodeSandboxOutlined } from '@ant-design/icons';
import { Alert, Input } from 'antd';
import { RegexProvider } from './RegexProvider';
import { useRegexContext } from './useRegexContext';
import RegexEditor from './components/RegexEditor';
import MatchHighlight from './components/MatchHighlight';
import MatchGroups from './components/MatchGroups';
import ReplacePreview from './components/ReplacePreview';
import './regex-tester.css';

const RegexTesterContent: React.FC = () => {
  const { state, setTestText } = useRegexContext();

  return (
    <>
      <header className="rt-header">
        <div className="rt-header-inner">
          <div className="rt-header-icon">
            <CodeSandboxOutlined />
          </div>
          <div className="rt-header-text">
            <h2>正则测试器</h2>
            <div className="rt-header-subtitle">
              <span className="rt-dot" />
              实时匹配高亮 · 多引擎对照 · 开发调试
            </div>
          </div>
        </div>
      </header>

      <RegexEditor />

      {state.timeoutWarning && (
        <Alert
          type="warning"
          showIcon
          message={state.timeoutWarning}
          className="rt-timeout-alert"
        />
      )}

      <section className="rt-workbench">
        <div className="rt-panel rt-panel--input">
          <div className="rt-panel-head">
            <span className="rt-panel-label">测试文本</span>
            <span className="rt-panel-meta">输入或粘贴待匹配的文本</span>
          </div>
          <div className="rt-panel-body">
            <Input.TextArea
              value={state.testText}
              onChange={(e) => setTestText(e.target.value)}
              placeholder="在此粘贴待匹配的文本…"
              autoSize={false}
              spellCheck={false}
              className="rt-test-text"
            />
          </div>
        </div>

        <div className="rt-panel rt-panel--output">
          <div className="rt-panel-head">
            <span className="rt-panel-label">匹配高亮</span>
            <span
              className={`rt-match-count ${state.matchCount === 0 ? 'rt-match-count--zero' : ''}`}
            >
              {state.matchCount} 处匹配
            </span>
          </div>
          <div className="rt-panel-body">
            <MatchHighlight />
            <MatchGroups />
          </div>
        </div>
      </section>

      <ReplacePreview />
    </>
  );
};

const RegexTesterPage: React.FC = () => (
  <RegexProvider>
    <div className="rt-page">
      <RegexTesterContent />
    </div>
  </RegexProvider>
);

export default RegexTesterPage;
