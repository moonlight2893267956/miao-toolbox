import React, { useEffect, useRef, useCallback } from 'react';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { lineNumbers, foldGutter, indentOnInput, indentUnit } from '@codemirror/language';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { json } from '@codemirror/lang-json';
import { java } from '@codemirror/lang-java';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { xml } from '@codemirror/lang-xml';
import { sql } from '@codemirror/lang-sql';
import { markdown } from '@codemirror/lang-markdown';
import { yaml } from '@codemirror/lang-yaml';
import { highlightSpecialChars, drawSelection, highlightActiveLine } from '@codemirror/view';
import { closeBrackets, autocompletion, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { foldKeymap } from '@codemirror/language';
import type { Extension } from '@codemirror/state';

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: string | null;
  showLineNumbers?: boolean;
  placeholder?: string;
  minRows?: number;
  maxRows?: number;
}

const LANGUAGE_EXTENSIONS: Record<string, Extension> = {
  json: json(),
  java: java(),
  python: python(),
  javascript: javascript(),
  typescript: javascript({ typescript: true }),
  jsx: javascript({ jsx: true }),
  tsx: javascript({ jsx: true, typescript: true }),
  css: css(),
  html: html(),
  xml: xml(),
  sql: sql(),
  markdown: markdown(),
  yaml: yaml(),
  yml: yaml(),
};

/**
 * CodeMirror 6 代码编辑器组件 — 带语法高亮、代码折叠、缩进指引线
 */
const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  language,
  showLineNumbers = true,
  placeholder: placeholderText,
  minRows = 6,
  maxRows = 30,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const createEditor = useCallback(() => {
    if (!editorRef.current) return;

    const langExt = language ? LANGUAGE_EXTENSIONS[language] : null;

    const extensions: Extension[] = [
      keymap.of([...defaultKeymap, ...closeBracketsKeymap, ...completionKeymap, ...foldKeymap]),
      history(),
      indentOnInput(),
      closeBrackets(),
      autocompletion(),
      highlightSpecialChars(),
      drawSelection(),
      highlightActiveLine(),
      langExt ?? [],
      indentUnit.of('  '),
      EditorView.updateListener.of(update => {
        if (update.docChanged) {
          const val = update.state.doc.toString();
          onChangeRef.current?.(val);
        }
      }),
      EditorView.theme({
        '&': { height: '100%', fontSize: '13px' },
        '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace' },
        '.cm-gutters': { borderRight: '1px solid var(--miao-border, #e6e3f0)' },
        '.cm-foldGutter': { cursor: 'pointer' },
        '.cm-activeLine': { backgroundColor: 'transparent' },
        '.cm-activeLineGutter': { backgroundColor: 'transparent' },
      }),
      EditorView.lineWrapping,
    ];

    if (showLineNumbers) {
      extensions.push(lineNumbers(), foldGutter());
    }

    if (placeholderText) {
      extensions.push(placeholder(placeholderText));
    }

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;
  }, [language, showLineNumbers, placeholderText, value]);

  useEffect(() => {
    createEditor();
    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [createEditor]);

  // 仅当外部 value 变化且与编辑器内容不同时更新
  useEffect(() => {
    const view = viewRef.current;
    if (view) {
      const currentDoc = view.state.doc.toString();
      if (currentDoc !== value) {
        view.dispatch({
          changes: { from: 0, to: currentDoc.length, insert: value },
        });
      }
    }
  }, [value, language, showLineNumbers]);

  return (
    <div
      ref={editorRef}
      style={{
        minHeight: `${minRows * 18}px`,
        maxHeight: `${maxRows * 18}px`,
        overflow: 'auto',
        border: 'none',
      }}
    />
  );
};

export default CodeEditor;
