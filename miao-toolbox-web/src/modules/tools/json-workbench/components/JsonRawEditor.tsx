import { useEffect, useRef, useState } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { syntaxHighlighting, defaultHighlightStyle, foldGutter, indentOnInput, bracketMatching, foldKeymap } from '@codemirror/language';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { linter, lintGutter } from '@codemirror/lint';
import type { ParseError } from '../types';

// ─── Props ──────────────────────────────────────────────

interface JsonRawEditorProps {
  value: string;
  onChange: (value: string) => void;
  parseError: ParseError | null;
  scrollTarget: number | null;
  onScrollTargetHandled: () => void;
}

// ─── Compartment 用于动态切换主题 ────────────────────────

const themeCompartment = new Compartment();

// ─── 亮色/暗色主题 ─────────────────────────────────────

function getThemeExtensions(): Extension {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  return EditorView.theme({
    '&': {
      height: '100%',
      fontSize: '13px',
      backgroundColor: isDark ? '#141414' : '#ffffff',
    },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace",
    },
    '.cm-content': {
      padding: '8px 0',
      caretColor: isDark ? '#60a5fa' : '#2563eb',
    },
    '.cm-cursor': {
      borderLeft: '3px solid',
      borderLeftColor: isDark ? '#60a5fa' : '#2563eb',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: isDark ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.15)',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: isDark ? '#6b7280' : '#9ca3af',
      border: 'none',
      paddingRight: '4px',
    },
    '.cm-activeLineGutter': {
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
    },
    '.cm-activeLine': {
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
    },
    '.cm-foldGutter .cm-gutterElement': {
      color: isDark ? '#6b7280' : '#9ca3af',
      cursor: 'pointer',
    },
    '.cm-lint-marker-error': {
      color: '#ff4d4f',
    },
  }, { dark: isDark });
}

// ─── 组件 ────────────────────────────────────────────────

export default function JsonRawEditor({
  value,
  onChange,
  parseError: _parseError,
  scrollTarget,
  onScrollTargetHandled,
}: JsonRawEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const isExternalUpdateRef = useRef(false);
  const [isEmpty, setIsEmpty] = useState(!value);

  // 保持 onChange 引用最新
  onChangeRef.current = onChange;

  // 跟踪是否为空
  useEffect(() => {
    setIsEmpty(!value);
  }, [value]);

  // ─── 初始化 CodeMirror ──────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;

    const jsonLinter = linter(jsonParseLinter(), { delay: 500 });

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        foldGutter(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        highlightSelectionMatches(),
        json(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        jsonLinter,
        lintGutter(),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          indentWithTab,
        ]),
        themeCompartment.of(getThemeExtensions()),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isExternalUpdateRef.current) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // 仅在 mount 时创建
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── 外部 value 更新（树形→Raw） ──────────────────────

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentDoc = view.state.doc.toString();
    if (currentDoc === value) return;

    isExternalUpdateRef.current = true;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
    isExternalUpdateRef.current = false;
  }, [value]);

  // ─── 滚动到目标行（AC-4） ─────────────────────────────

  useEffect(() => {
    const view = viewRef.current;
    if (!view || scrollTarget == null) return;

    const line = view.state.doc.line(Math.min(scrollTarget, view.state.doc.lines));
    view.dispatch({
      selection: { anchor: line.from },
      scrollIntoView: true,
    });

    onScrollTargetHandled();
  }, [scrollTarget, onScrollTargetHandled]);

  // ─── 主题变化时重新配置 Compartment ───────────────────

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const view = viewRef.current;
      if (!view) return;

      if (themeCompartment.get(view.state)) {
        view.dispatch({
          effects: themeCompartment.reconfigure(getThemeExtensions()),
        });
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, []);

  // ─── 渲染 ──────────────────────────────────────────

  return (
    <div className="jw-cm-editor">
      <div ref={containerRef} className={`jw-cm-editor__core ${isEmpty ? 'jw-cm-editor__core--empty' : ''}`} />
      {isEmpty && (
        <div className="jw-cm-editor__welcome">
          <svg className="jw-cm-editor__welcome-icon" width="40" height="40" viewBox="0 0 64 64" fill="none">
            <rect x="12" y="8" width="40" height="48" rx="4" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.4" />
            <path d="M20 16 L18 18 L20 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
            <path d="M44 16 L46 18 L44 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
            <circle cx="32" cy="18" r="2" fill="currentColor" opacity="0.2" />
            <rect x="20" y="26" width="24" height="3" rx="1.5" fill="currentColor" opacity="0.12" />
            <rect x="20" y="32" width="20" height="3" rx="1.5" fill="currentColor" opacity="0.1" />
            <rect x="20" y="38" width="22" height="3" rx="1.5" fill="currentColor" opacity="0.08" />
            <rect x="20" y="44" width="18" height="3" rx="1.5" fill="currentColor" opacity="0.06" />
          </svg>
          <p className="jw-cm-editor__welcome-title">粘贴 JSON 到此处，或直接在编辑器中输入</p>
          <p className="jw-cm-editor__welcome-hint">Ctrl+V 粘贴 · Ctrl+Z 撤销 · 实时解析</p>
        </div>
      )}
    </div>
  );
}
