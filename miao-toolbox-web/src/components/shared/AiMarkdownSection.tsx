import React from 'react';
import MarkdownView from './MarkdownView';

export interface AiMarkdownSectionProps {
  /** 区块标题，如「解释」「诊断」 */
  title: string;
  /** Markdown 源文本；空则不渲染 */
  text: string | null | undefined;
  /** 工具 CSS 前缀：rt / ce */
  prefix: 'rt' | 'ce';
}

/**
 * AI 面板 prose 结果区：统一 section 壳 + Markdown 渲染。
 * 消除 regex/cron AIPanel 中重复的 h5 + MarkdownView 模板。
 */
const AiMarkdownSection: React.FC<AiMarkdownSectionProps> = ({ title, text, prefix }) => {
  if (!text) return null;
  return (
    <div className={`${prefix}-ai-result-section`}>
      <h5>{title}</h5>
      <MarkdownView>{text}</MarkdownView>
    </div>
  );
};

export default AiMarkdownSection;
