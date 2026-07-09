import React, { useState } from 'react';
import { Input, Button, Alert } from 'antd';
import { ApartmentOutlined } from '@ant-design/icons';

/**
 * 语种识别 Tab —— 页面框架骨架（FR-5/6/7 布局占位）。
 *
 * 本 Story 仅搭建输入与结果区布局，真实识别逻辑由 story-1.4 实现。
 */
const TranslateDetectPanel: React.FC = () => {
  const [text, setText] = useState('');

  return (
    <div className="tt-panel">
      <Alert
        type="info"
        showIcon
        className="tt-panel-notice"
        message="语种识别功能开发中"
        description="支持中/英/日/韩/泰/越/俄 7 语种检测与主语种推荐，能力将在后续 Story 接入。"
      />

      <div className="tt-pane">
        <div className="tt-pane-label">待识别文本</div>
        <Input.TextArea
          className="tt-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="输入或粘贴文本，系统将识别其语种…"
          autoSize={{ minRows: 8, maxRows: 16 }}
        />
      </div>

      <div className="tt-output tt-output--placeholder tt-output--detect">
        <ApartmentOutlined className="tt-output-icon" />
        <span>识别结果将显示在这里（语种集合 / 主语种 / 推荐目标语言）</span>
      </div>

      <div className="tt-actions">
        <Button type="primary" disabled>
          <ApartmentOutlined /> 识别语种
        </Button>
      </div>
    </div>
  );
};

export default TranslateDetectPanel;
