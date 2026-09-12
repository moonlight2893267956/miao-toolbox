/**
 * 脚本代码编辑器（CodeMirror 6）——「运维控制台代码面」
 *
 * 设计语言延续本模块的 Scheduling Console：琥珀点缀 + 面板化外壳 +
 * 克制的分层。编辑器自带三段式外壳（语言条 / 代码面 / 状态条），
 * 状态条内嵌 64KB 用量计量条，让「体积上限」这一约束可被直观感知。
 *
 * 主题：亮暗双色（跟随 :root[data-theme]），语法配色走 CSS 变量，
 * 由 .ts-script-editor 作用域统一供给（见 task-scheduler.css）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
} from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import {
  StreamLanguage,
  syntaxHighlighting,
  HighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
  bracketMatching,
} from '@codemirror/language';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { python } from '@codemirror/lang-python';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { tags } from '@lezer/highlight';
import { Button } from 'antd';
import { CodeOutlined, UploadOutlined } from '@ant-design/icons';
import type { ScriptType } from '../types';

/** 脚本内容上限（与后端 ScriptService.MAX_CONTENT_BYTES 一致） */
const MAX_CONTENT_BYTES = 64 * 1024;

interface ScriptEditorProps {
  value: string;
  onChange: (value: string) => void;
  scriptType: ScriptType;
  /** 代码面高度（默认 420px） */
  height?: string;
}

// Compartment：运行时切换主题 / 语言，无需重建视图（保留撤销栈）
const themeCompartment = new Compartment();
const langCompartment = new Compartment();

/** 语法配色：颜色全部取自 CSS 变量，随 data-theme 自动切换 */
const scriptHighlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: 'var(--ts-code-comment)', fontStyle: 'italic' },
  { tag: [tags.keyword, tags.modifier, tags.controlKeyword, tags.moduleKeyword], color: 'var(--ts-code-keyword)', fontWeight: '600' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: 'var(--ts-code-string)' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom, tags.unit], color: 'var(--ts-code-number)' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.labelName], color: 'var(--ts-code-func)' },
  { tag: [tags.className, tags.typeName, tags.namespace, tags.tagName], color: 'var(--ts-code-type)' },
  { tag: [tags.propertyName, tags.attributeName, tags.attributeValue], color: 'var(--ts-code-var)' },
  { tag: [tags.variableName, tags.definition(tags.variableName)], color: 'var(--ts-code-var)' },
  { tag: [tags.operator, tags.punctuation, tags.separator, tags.bracket, tags.derefOperator], color: 'var(--ts-code-op)' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: '700' },
]);

/** 语言扩展：Shell 走 legacy StreamLanguage，Python 走官方 Lezer 语法 */
function languageExtension(scriptType: ScriptType): Extension {
  return scriptType === 'PYTHON' ? python() : StreamLanguage.define(shell);
}

/** 编辑器主题（跟随 data-theme，暗色下标记 dark 让 CodeMirror 内部默认值同步） */
function buildTheme(): Extension {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return [
    EditorView.theme(
      {
        '&': {
          height: '100%',
          fontSize: '13px',
          color: 'var(--miao-text-primary)',
          backgroundColor: 'transparent',
        },
        '&.cm-focused': { outline: 'none' },
        '.cm-scroller': {
          fontFamily: 'var(--miao-font-mono)',
          lineHeight: '1.75',
          overflow: 'auto',
        },
        '.cm-content': {
          padding: '12px 0 18px',
          caretColor: 'var(--tool-accent)',
        },
        '.cm-line': { padding: '0 18px 0 12px' },
        '.cm-cursor, .cm-dropCursor': { borderLeft: '2px solid var(--tool-accent)' },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
          backgroundColor: `color-mix(in srgb, var(--tool-accent) ${isDark ? 32 : 24}%, transparent)`,
        },
        '.cm-gutters': {
          backgroundColor: 'var(--ts-code-gutter)',
          color: 'var(--miao-text-tertiary)',
          border: 'none',
          borderRight: '1px solid var(--miao-border)',
          fontSize: '12px',
        },
        '.cm-lineNumbers .cm-gutterElement': {
          minWidth: '36px',
          padding: '0 10px 0 14px',
        },
        '.cm-activeLineGutter': {
          backgroundColor: 'var(--ts-code-active)',
          color: 'var(--miao-text-secondary)',
        },
        '.cm-activeLine': { backgroundColor: 'var(--ts-code-active)' },
        '.cm-foldGutter .cm-gutterElement': { color: 'var(--miao-text-tertiary)', cursor: 'pointer' },
        '.cm-matchingBracket, .cm-nonmatchingBracket': {
          backgroundColor: 'color-mix(in srgb, var(--tool-accent) 22%, transparent)',
          outline: '1px solid color-mix(in srgb, var(--tool-accent) 45%, transparent)',
        },
        '.cm-selectionMatch': {
          backgroundColor: 'color-mix(in srgb, var(--tool-accent) 18%, transparent)',
        },
        '.cm-tooltip': {
          border: '1px solid var(--miao-border)',
          backgroundColor: 'var(--miao-bg-elevated)',
          borderRadius: '8px',
          overflow: 'hidden',
        },
        '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
          backgroundColor: 'color-mix(in srgb, var(--tool-accent) 18%, transparent)',
          color: 'var(--miao-text-primary)',
        },
      },
      { dark: isDark },
    ),
    syntaxHighlighting(scriptHighlightStyle),
  ];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const ScriptEditor: React.FC<ScriptEditorProps> = ({ value, onChange, scriptType, height = '420px' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [isEmpty, setIsEmpty] = useState(!value);

  const langLabel = scriptType === 'PYTHON' ? 'Python' : 'Shell';
  const fileExt = scriptType === 'PYTHON' ? '.py' : '.sh';

  // ─── 挂载：创建视图（仅一次） ─────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        highlightSpecialChars(),
        drawSelection(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        indentUnit.of('    '),
        foldGutter(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        history(),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...completionKeymap,
          ...historyKeymap,
          ...foldKeymap,
          indentWithTab,
        ]),
        langCompartment.of(languageExtension(scriptType)),
        themeCompartment.of(buildTheme()),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': '脚本编辑器', spellcheck: 'false' }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });
    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // 仅挂载时创建；后续变化经 Compartment 重配置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── 外部 value 同步（回填场景） ──────────────────────────
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
    setIsEmpty(!value);
  }, [value]);

  // ─── 语言切换（重建语言扩展，保留撤销栈） ─────────────────
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: langCompartment.reconfigure(languageExtension(scriptType)) });
  }, [scriptType]);

  // ─── 亮暗主题切换 ─────────────────────────────────────────
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({ effects: themeCompartment.reconfigure(buildTheme()) });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  // ─── 上传文件 ─────────────────────────────────────────────
  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => onChangeRef.current(String(reader.result ?? ''));
    reader.readAsText(file);
  }, []);

  // ─── 用量计量 ─────────────────────────────────────────────
  const bytes = useMemo(() => new Blob([value]).size, [value]);
  const lines = useMemo(() => (value ? value.split('\n').length : 0), [value]);
  const ratio = bytes / MAX_CONTENT_BYTES;
  const level = ratio > 1 ? 'over' : ratio > 0.8 ? 'warn' : 'ok';

  return (
    <div className="ts-script-editor">
      <div className="ts-script-editor-bar">
        <span className={`ts-script-lang ts-script-lang--${scriptType.toLowerCase()}`}>
          <span className="ts-script-lang-dot" aria-hidden="true" />
          {langLabel}
        </span>
        <span className="ts-script-editor-stats">
          <span>{lines} 行</span>
          <span className="ts-script-editor-stats-sep" aria-hidden="true" />
          <span>{value.length} 字符</span>
        </span>
      </div>

      <div className="ts-script-editor-body" style={{ height }}>
        <div ref={containerRef} className="ts-script-editor-surface" />
        {isEmpty && (
          <div className="ts-script-editor-empty">
            <CodeOutlined className="ts-script-editor-empty-icon" />
            <p className="ts-script-editor-empty-title">在此粘贴或编写 {langLabel} 脚本</p>
            <p className="ts-script-editor-empty-hint">
              Ctrl+V 粘贴 · 或上传 {fileExt} 文件 · 上限 64 KB
            </p>
          </div>
        )}
      </div>

      <div className="ts-script-editor-foot">
        <Button
          size="small"
          type="text"
          icon={<UploadOutlined />}
          onClick={() => fileInputRef.current?.click()}
        >
          上传 {fileExt}
        </Button>
        <div className="ts-script-size" title="脚本内容体积（上限 64 KB）">
          <span className="ts-script-size-text">
            <b className={level === 'ok' ? '' : `is-${level}`}>{formatBytes(bytes)}</b>
            <span className="ts-script-size-cap"> / 64 KB</span>
          </span>
          <span className="ts-script-size-meter" aria-hidden="true">
            <span
              className={`ts-script-size-fill is-${level}`}
              style={{ width: `${Math.min(ratio * 100, 100)}%` }}
            />
          </span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={fileExt}
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
};

export default ScriptEditor;
