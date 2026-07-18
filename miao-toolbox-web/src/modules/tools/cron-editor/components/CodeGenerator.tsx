// Cron 表达式编辑器 — 多框架代码生成（FR-16 / Story 2.1）
// Modal + 4 Tab 切换 + 一键复制；仅读取表达式与方言，不写回。
import React, { useMemo, useState } from 'react';
import { CopyOutlined, CheckOutlined, CodeOutlined } from '@ant-design/icons';
import { Modal } from 'antd';
import { useCronContext } from '../useCronContext';
import { buildSnippets, FRAMEWORK_TABS, type FrameworkKey } from '../codeSnippets';

const CodeGenerator: React.FC = () => {
  const { state, validation } = useCronContext();
  const [active, setActive] = useState<FrameworkKey>('spring');
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  // 表达式无效（语法错误）时禁止生成
  const exprValid = validation.valid && state.expression.trim() !== '';

  const result = useMemo(
    () => (exprValid ? buildSnippets(state.expression, state.dialect) : { valid: false, snippets: {} }),
    [exprValid, state.expression, state.dialect],
  );

  const current = result.valid ? result.snippets[active] : undefined;

  const handleCopy = async () => {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(current.code);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = current.code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <button
        type="button"
        className="ce-action-btn ce-action-btn--primary"
        onClick={() => setOpen(true)}
        aria-label="生成多框架代码片段"
        title="生成多框架代码片段"
      >
        <CodeOutlined /> 代码生成
      </button>

      <Modal
        title={null}
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={680}
        destroyOnHidden
        className="ce-code-gen-modal"
        closable
      >
        <div className="ce-code-gen">
          <div className="ce-code-gen-head">
            <span className="ce-code-gen-title">
              <CodeOutlined /> 代码生成
            </span>
            <button
              type="button"
              className="ce-code-gen-copy"
              onClick={handleCopy}
              disabled={!current}
              title="复制代码"
            >
              {copied ? <CheckOutlined /> : <CopyOutlined />}
              {copied ? '已复制' : '复制'}
            </button>
          </div>

          <div className="ce-code-gen-tabs" role="tablist">
            {FRAMEWORK_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active === tab.key}
                className={`ce-code-gen-tab ${active === tab.key ? 'ce-code-gen-tab--active' : ''}`}
                onClick={() => setActive(tab.key)}
                title={tab.desc}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {!result.valid ? (
            <div className="ce-code-gen-invalid">
              表达式无效，请先修正后再生成。
            </div>
          ) : (
            <>
              <pre className="ce-code-gen-code">
                <code>{current?.code}</code>
              </pre>
              {current?.note && <div className="ce-code-gen-note">• {current.note}</div>}
            </>
          )}
        </div>
      </Modal>
    </>
  );
};

export default CodeGenerator;
