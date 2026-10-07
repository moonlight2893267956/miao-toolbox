/**
 * 教程渲染器
 *
 * 职责：
 * - 使用 react-markdown 渲染 Markdown 正文
 * - 拦截文本节点，解析 [[根:xxx]] / [[字:xxx]] 自定义标记
 * - 章节按需懒加载（import()）
 * - 阅读进度持久化到 localStorage
 *
 * !! 禁止 dangerouslySetInnerHTML !!
 */

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { renderMarks, type MarkRenderHandlers } from '../utils/wubi/tutorial-marks';
import { TUTORIAL_CHAPTERS, type TutorialChapter } from '../data/tutorial';

interface TutorialRendererProps {
  /** 章节对象 */
  chapter: TutorialChapter;
  /** 字根点击回调 */
  onRadicalClick: (radical: string) => void;
  /** 汉字点击回调 */
  onCharClick: (char: string) => void;
}

/**
 * 自定义 ReactMarkdown 组件映射。
 *
 * 拦截文本节点，解析自定义标记。
 * 其他节点使用默认渲染。
 */
function useMarkdownComponents(handlers: MarkRenderHandlers) {
  return React.useMemo(
    () => ({
      // 拦截文本节点，解析 [[根:xxx]] / [[字:xxx]] 标记
      text: ({ children }: { children?: React.ReactNode }) => {
        const text = String(children ?? '');
        if (!text.includes('[[')) {
          return <>{children}</>;
        }
        return <>{renderMarks(text, handlers)}</>;
      },
      // 链接：在新标签打开
      a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      ),
      // 表格：添加样式类
      table: ({ children }: { children?: React.ReactNode }) => (
        <div className="wt-tutorial__table-wrap">
          <table className="wt-tutorial__table">{children}</table>
        </div>
      ),
    }),
    [handlers],
  );
}

const TutorialRenderer: React.FC<TutorialRendererProps> = ({
  chapter,
  onRadicalClick,
  onCharClick,
}) => {
  const [markdown, setMarkdown] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handlers: MarkRenderHandlers = React.useMemo(
    () => ({ onRadicalClick, onCharClick }),
    [onRadicalClick, onCharClick],
  );

  const components = useMarkdownComponents(handlers);

  // 懒加载章节 Markdown
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    chapter
      .load()
      .then((md) => {
        if (!cancelled) {
          setMarkdown(md);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(`章节加载失败: ${err.message}`);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [chapter]);

  // 阅读进度持久化
  useEffect(() => {
    const key = 'wt-tutorial-progress';
    const stored = localStorage.getItem(key);
    const progress = stored ? JSON.parse(stored) : {};
    progress.lastChapter = chapter.id;
    progress.lastVisit = Date.now();
    localStorage.setItem(key, JSON.stringify(progress));
  }, [chapter.id]);

  if (loading) {
    return (
      <div className="wt-tutorial__loading">
        <div className="wt-tutorial__loading-spinner" />
        <p>正在加载第 {chapter.id} 章…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="wt-tutorial__error">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="wt-tutorial__content">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{markdown}</ReactMarkdown>
    </div>
  );
};

// ─── 教程主组件 ──────────────────────────────────────────

interface TutorialProps {
  onRadicalClick: (radical: string) => void;
  onCharClick: (char: string) => void;
  onPracticeNavigate: (scope: string) => void;
}

/**
 * 教程主组件。
 *
 * 包含章节导航 + 渲染区 + 章节切换。
 */
const Tutorial: React.FC<TutorialProps> = ({
  onRadicalClick,
  onCharClick,
  onPracticeNavigate,
}) => {
  const [currentChapterId, setCurrentChapterId] = useState(1);

  // 恢复上次阅读位置
  useEffect(() => {
    const stored = localStorage.getItem('wt-tutorial-progress');
    if (stored) {
      try {
        const progress = JSON.parse(stored);
        if (progress.lastChapter && progress.lastChapter >= 1 && progress.lastChapter <= 9) {
          setCurrentChapterId(progress.lastChapter);
        }
      } catch {
        // 忽略解析错误
      }
    }
  }, []);

  const currentChapter = TUTORIAL_CHAPTERS.find((c) => c.id === currentChapterId)!;

  const handlePrev = useCallback(() => {
    setCurrentChapterId((id) => Math.max(1, id - 1));
  }, []);

  const handleNext = useCallback(() => {
    setCurrentChapterId((id) => Math.min(TUTORIAL_CHAPTERS.length, id + 1));
  }, []);

  const handleChapterSelect = useCallback((id: number) => {
    setCurrentChapterId(id);
  }, []);

  const isFirst = currentChapterId === 1;
  const isLast = currentChapterId === TUTORIAL_CHAPTERS.length;

  return (
    <div className="wt-tutorial">
      {/* 章节导航侧栏 */}
      <aside className="wt-tutorial__sidebar">
        <div className="wt-tutorial__sidebar-header">
          <h3>教程目录</h3>
          <span className="wt-tutorial__chapter-count">
            {currentChapterId} / {TUTORIAL_CHAPTERS.length}
          </span>
        </div>
        <ul className="wt-tutorial__chapter-list">
          {TUTORIAL_CHAPTERS.map((ch) => (
            <li key={ch.id}>
              <button
                className={`wt-tutorial__chapter-btn${
                  ch.id === currentChapterId ? ' wt-tutorial__chapter-btn--active' : ''
                }`}
                onClick={() => handleChapterSelect(ch.id)}
              >
                <span className="wt-tutorial__chapter-num">第{ch.id}章</span>
                <span className="wt-tutorial__chapter-title">{ch.title}</span>
                <span className="wt-tutorial__chapter-time">{ch.readTime}min</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* 渲染区 */}
      <div className="wt-tutorial__main">
        <div className="wt-tutorial__header">
          <h2 className="wt-tutorial__title">
            第{currentChapter.id}章：{currentChapter.title}
          </h2>
          <div className="wt-tutorial__goal">
            <span className="wt-tutorial__goal-label">读完你应该能：</span>
            <span className="wt-tutorial__goal-text">{currentChapter.goal}</span>
          </div>
        </div>

        <Suspense fallback={<div className="wt-tutorial__loading">加载中…</div>}>
          <TutorialRenderer
            chapter={currentChapter}
            onRadicalClick={onRadicalClick}
            onCharClick={onCharClick}
          />
        </Suspense>

        {/* 底部操作栏 */}
        <div className="wt-tutorial__footer">
          <button
            className="wt-tutorial__nav-btn wt-tutorial__nav-btn--prev"
            onClick={handlePrev}
            disabled={isFirst}
          >
            ← 上一章
          </button>

          <button
            className="wt-tutorial__practice-btn"
            onClick={() => onPracticeNavigate(currentChapter.practiceScope)}
          >
            去练习 →
          </button>

          <button
            className="wt-tutorial__nav-btn wt-tutorial__nav-btn--next"
            onClick={handleNext}
            disabled={isLast}
          >
            下一章 →
          </button>
        </div>
      </div>
    </div>
  );
};

export default Tutorial;
