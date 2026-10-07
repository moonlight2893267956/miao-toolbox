/**
 * 教程标记解析器
 *
 * 解析 Markdown 中的自定义标记：
 *   [[根:亻]]  → 字根标记，点击跳转字根图详情
 *   [[字:照]]  → 汉字标记，点击唤起拆字演示
 *
 * 解析失败时按纯文本渲染（不抛错、不白屏）。
 */

import React from 'react';

export type MarkType = 'radical' | 'char' | 'code' | 'plain';

export interface ParsedMark {
  type: MarkType;
  /** 标记内容（字根字形 / 汉字） */
  content: string;
  /**
   * `[[码:字|编码]]` 中的编码；仅 `type === 'code'` 有值。
   *
   * 这个标记的价值不只是渲染 —— 它让教程里的**编码断言可被测试核对**
   * （见 `tutorial-codes.test.ts`）。教程写错编码会直接教错，
   * 而「文档与实现对不上」在这个模块已经反复出现过，必须有机器把守。
   */
  code?: string;
  /** 原始文本（用于纯文本回退） */
  raw: string;
}

/**
 * 正则匹配 [[根:xxx]] / [[字:xxx]] / [[码:字|编码]]
 * 允许嵌套方括号中的中文、特殊字符与竖线
 */
const MARK_REGEX = /\[\[(根|字|码):([^\]]+)\]\]/g;

/**
 * 将 Markdown 文本解析为标记段列表。
 *
 * 非标记部分返回 type='plain'，标记部分返回对应类型。
 * 解析失败的标记（格式不匹配）按纯文本返回。
 */
export function parseTutorialMarks(text: string): ParsedMark[] {
  const marks: ParsedMark[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // 重置 regex 的 lastIndex（全局 regex 复用时需要）
  MARK_REGEX.lastIndex = 0;

  while ((match = MARK_REGEX.exec(text)) !== null) {
    const startIndex = match.index;
    const fullMatch = match[0];
    const kind = match[1]; // "根" 或 "字"
    const content = match[2]; // 标记内容

    // 将标记前的纯文本加入结果
    if (startIndex > lastIndex) {
      const plainText = text.slice(lastIndex, startIndex);
      if (plainText) {
        marks.push({ type: 'plain', content: plainText, raw: plainText });
      }
    }

    // 解析标记
    if (kind === '根') {
      marks.push({ type: 'radical', content, raw: fullMatch });
    } else if (kind === '字') {
      marks.push({ type: 'char', content, raw: fullMatch });
    } else if (kind === '码') {
      /*
       * 形如 [[码:五|gghg]]。
       *
       * 表格单元格里的竖线必须写成 `\|`（markdown 语法要求），
       * 所以这里统一剥掉反斜杠再切分 —— 两种写法都能解析。
       */
      const [char, code] = content.replace(/\\/g, '').split('|');
      if (char && code) {
        marks.push({ type: 'code', content: char, code, raw: fullMatch });
      } else {
        marks.push({ type: 'plain', content: fullMatch, raw: fullMatch });
      }
    } else {
      // 未知标记类型，按纯文本回退
      marks.push({ type: 'plain', content: fullMatch, raw: fullMatch });
    }

    lastIndex = startIndex + fullMatch.length;
  }

  // 将最后一段纯文本加入结果
  if (lastIndex < text.length) {
    const plainText = text.slice(lastIndex);
    if (plainText) {
      marks.push({ type: 'plain', content: plainText, raw: plainText });
    }
  }

  return marks;
}

/**
 * 渲染回调接口。
 * 调用方提供 onRadicalClick 和 onCharClick 来处理标记点击。
 */
export interface MarkRenderHandlers {
  onRadicalClick: (radical: string) => void;
  onCharClick: (char: string) => void;
}

/**
 * 将带标记的文本渲染为 React 元素。
 *
 * - plain 段直接返回文本
 * - radical 段渲染为可点击的 <span>，点击触发 onRadicalClick
 * - char 段渲染为可点击的 <span>，点击触发 onCharClick
 *
 * 解析失败的标记自动回退为纯文本（不抛错、不白屏）。
 */
export function renderMarks(
  text: string,
  handlers: MarkRenderHandlers,
  keyPrefix = 'mark',
): React.ReactNode[] {
  const marks = parseTutorialMarks(text);
  const nodes: React.ReactNode[] = [];

  marks.forEach((mark, i) => {
    const key = `${keyPrefix}-${i}`;

    if (mark.type === 'plain') {
      nodes.push(mark.content);
    } else if (mark.type === 'radical') {
      nodes.push(
        <span
          key={key}
          className="wt-tutorial__radical-mark"
          onClick={(e) => {
            e.preventDefault();
            handlers.onRadicalClick(mark.content);
          }}
          title={`字根：${mark.content}（点击查看详情）`}
        >
          {mark.content}
        </span>,
      );
    } else if (mark.type === 'char') {
      nodes.push(
        <span
          key={key}
          className="wt-tutorial__char-mark"
          onClick={(e) => {
            e.preventDefault();
            handlers.onCharClick(mark.content);
          }}
          title={`汉字：${mark.content}（点击查看拆分演示）`}
        >
          {mark.content}
        </span>,
      );
    } else if (mark.type === 'code') {
      // 汉字 + 编码：汉字可点击看拆分，编码等宽显示
      nodes.push(
        <span key={key} className="wt-tutorial__code-mark">
          <span
            className="wt-tutorial__char-mark"
            onClick={(e) => {
              e.preventDefault();
              handlers.onCharClick(mark.content);
            }}
            title={`汉字：${mark.content}（点击查看拆分演示）`}
          >
            {mark.content}
          </span>
          <code className="wt-tutorial__code">{mark.code}</code>
        </span>,
      );
    }
  });

  return nodes;
}
