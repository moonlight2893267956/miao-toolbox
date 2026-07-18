import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import './MarkdownView.css';

export interface MarkdownViewProps {
  /** Markdown 源文本；空串 / 仅空白时不渲染 */
  children: string | null | undefined;
  className?: string;
}

const REMARK_PLUGINS = [remarkGfm];

const markdownComponents: Components = {
  a: ({ href, children: linkChildren, ...rest }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
      {linkChildren}
    </a>
  ),
  // 避免 MD 内 h1 盖过面板 section 标题层级
  h1: ({ children: c, ...rest }) => <h3 {...rest}>{c}</h3>,
  h2: ({ children: c, ...rest }) => <h4 {...rest}>{c}</h4>,
  h3: ({ children: c, ...rest }) => <h5 {...rest}>{c}</h5>,
};

/**
 * AI / 工具结果区安全 Markdown 渲染。
 * - 默认不解析 raw HTML（react-markdown 默认行为）
 * - GFM：表格、删除线、任务列表、自动链接
 * - 外链新窗口打开
 */
const MarkdownView: React.FC<MarkdownViewProps> = ({ children, className }) => {
  const source = typeof children === 'string' ? children : '';
  if (!source.trim()) return null;

  return (
    <div className={['md-view', className].filter(Boolean).join(' ')}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={markdownComponents}>
        {source}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownView;
