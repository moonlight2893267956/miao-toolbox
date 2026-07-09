import React, { useState } from 'react';
import { Select, Input, Button, Alert, Space } from 'antd';
import { TranslationOutlined, SwapOutlined } from '@ant-design/icons';
import { LANGUAGE_OPTIONS, type LanguageCode } from './types';

/**
 * 文本翻译 Tab —— 页面框架骨架（FR-1/2/3 布局占位）。
 *
 * 本 Story 仅搭建输入/输出分栏布局与语言选择器，真实翻译逻辑由 story-1.3 实现。
 * 当前以占位提示呈现，不发起真实后端调用。
 */
const TranslateTextPanel: React.FC = () => {
  const [from, setFrom] = useState<LanguageCode>('auto');
  const [to, setTo] = useState<LanguageCode>('en');
  const [source, setSource] = useState('');

  return (
    <div className="tt-panel">
      <Alert
        type="info"
        showIcon
        className="tt-panel-notice"
        message="文本翻译功能开发中"
        description="输入/输出布局与语言选择已就绪，翻译能力将在后续 Story 接入。"
      />

      <div className="tt-lang-bar">
        <Select<LanguageCode>
          className="tt-lang-select"
          value={from}
          onChange={setFrom}
          options={LANGUAGE_OPTIONS.map((l) => ({ value: l.code, label: l.label }))}
        />
        <Button type="text" className="tt-lang-swap" icon={<SwapOutlined />} disabled aria-label="交换语言" />
        <Select<LanguageCode>
          className="tt-lang-select"
          value={to}
          onChange={setTo}
          options={LANGUAGE_OPTIONS.filter((l) => l.code !== 'auto').map((l) => ({ value: l.code, label: l.label }))}
        />
      </div>

      <div className="tt-split">
        <div className="tt-pane">
          <div className="tt-pane-label">原文</div>
          <Input.TextArea
            className="tt-textarea"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="在此粘贴或输入待翻译文本…"
            autoSize={{ minRows: 10, maxRows: 20 }}
          />
        </div>

        <div className="tt-pane">
          <div className="tt-pane-label">译文</div>
          <div className="tt-output tt-output--placeholder">
            <TranslationOutlined className="tt-output-icon" />
            <span>译文将显示在这里</span>
          </div>
        </div>
      </div>

      <div className="tt-actions">
        <Space>
          <Button type="primary" disabled>
            <TranslationOutlined /> 翻译
          </Button>
        </Space>
      </div>
    </div>
  );
};

export default TranslateTextPanel;
