import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { EditorView, keymap, placeholder, lineNumbers, highlightSpecialChars, drawSelection, highlightActiveLine, Decoration, ViewPlugin, ViewUpdate } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { EditorState, Prec, StateEffect, type Extension } from '@codemirror/state';
import { foldGutter, indentOnInput, indentUnit, foldKeymap } from '@codemirror/language';
import { defaultKeymap, history } from '@codemirror/commands';
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
import { closeBrackets, autocompletion, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { useDiffContext } from './useDiffContext';

// ── Find effects ──
const findQueryEffect = StateEffect.define<{ query: string; caseSensitive: boolean }>();
const findActiveEffect = StateEffect.define<number>();

// ── Find matches helper ──
function findMatchRanges(view: EditorView, query: string, caseSensitive: boolean): { from: number; to: number }[] {
  if (!query) return [];
  const text = view.state.doc.toString();
  const flags = caseSensitive ? 'g' : 'gi';
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, flags);
  const ranges: { from: number; to: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    ranges.push({ from: m.index, to: m.index + m[0].length });
    if (m[0].length === 0) re.lastIndex++; // 防止零宽匹配死循环
  }
  return ranges;
}

// ── Find highlight plugin ──
function buildFindDecos(view: EditorView, query: string, caseSensitive: boolean, activeIndex: number): DecorationSet {
  const ranges = findMatchRanges(view, query, caseSensitive);
  if (ranges.length === 0) return Decoration.none;
  return Decoration.set(
    ranges.map((r, i) =>
      Decoration.mark({
        class: i === activeIndex ? 'tc-find-mark tc-find-mark-active' : 'tc-find-mark',
      }).range(r.from, r.to),
    ),
  );
}

class FindPlugin {
  decorations: DecorationSet;
  query: string;
  caseSensitive: boolean;
  activeIndex: number;
  constructor() {
    this.query = '';
    this.caseSensitive = false;
    this.activeIndex = -1;
    this.decorations = Decoration.none;
  }
  update(update: ViewUpdate) {
    let dirty = false;
    for (const tr of update.transactions) {
      for (const eff of tr.effects) {
        if (eff.is(findQueryEffect)) {
          this.query = eff.value.query;
          this.caseSensitive = eff.value.caseSensitive;
          this.activeIndex = -1;
          dirty = true;
        } else if (eff.is(findActiveEffect)) {
          this.activeIndex = eff.value;
          dirty = true;
        }
      }
    }
    // 文档变更后重新计算匹配
    if (update.docChanged && this.query) dirty = true;
    if (dirty) {
      this.decorations = buildFindDecos(update.view, this.query, this.caseSensitive, this.activeIndex);
    }
  }
}

const findViewPlugin = ViewPlugin.fromClass(FindPlugin, { decorations: (v) => v.decorations });

export interface CodeEditorHandle {
  setFindQuery: (query: string, caseSensitive: boolean) => void;
  getMatchCount: () => number;
  focusMatch: (index: number) => void;
  clearSelection: () => void;
  blur: () => void;
}

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: string | null;
  showLineNumbers?: boolean;
  placeholder?: string;
  minRows?: number;
  maxRows?: number;
  onViewReady?: (view: EditorView, container: HTMLDivElement) => void;
  lineWrapping?: boolean;
  onFormatShortcut?: () => void;
  fillHeight?: boolean;
  onFocus?: () => void;
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

const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(({
  value,
  onChange,
  language,
  showLineNumbers = true,
  placeholder: placeholderText,
  minRows = 6,
  maxRows = 30,
  onViewReady,
  lineWrapping = true,
  onFormatShortcut,
  fillHeight = false,
  onFocus,
}, ref) => {
  const { runCompare } = useDiffContext();
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const initialValueRef = useRef(value);
  const onViewReadyRef = useRef(onViewReady);
  const onFormatShortcutRef = useRef(onFormatShortcut);
  const onCompareShortcutRef = useRef(runCompare);
  const onFocusRef = useRef(onFocus);

  useImperativeHandle(ref, () => ({
    setFindQuery(query: string, caseSensitive: boolean) {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({ effects: findQueryEffect.of({ query, caseSensitive }) });
    },
    getMatchCount() {
      const view = viewRef.current;
      if (!view) return 0;
      const plugin = view.plugin(findViewPlugin);
      if (!plugin) return 0;
      return plugin.decorations.size;
    },
    focusMatch(index: number) {
      const view = viewRef.current;
      if (!view) return;
      const plugin = view.plugin(findViewPlugin);
      if (!plugin) return;
      const ranges = findMatchRanges(view, plugin.query, plugin.caseSensitive);
      if (index < 0 || index >= ranges.length) return;
      const { from } = ranges[index];
      view.dispatch({
        effects: [
          findActiveEffect.of(index),
          EditorView.scrollIntoView(from, { y: 'center' }),
        ],
      });
    },
    clearSelection() {
      // 不再需要操作选区，查找仅通过装饰高亮
    },
    blur() {
      const view = viewRef.current;
      if (view) view.contentDOM.blur();
    },
  }), []);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { initialValueRef.current = value; }, [value]);
  useEffect(() => { onViewReadyRef.current = onViewReady; }, [onViewReady]);
  useEffect(() => { onFormatShortcutRef.current = onFormatShortcut; }, [onFormatShortcut]);
  useEffect(() => { onCompareShortcutRef.current = runCompare; }, [runCompare]);
  useEffect(() => { onFocusRef.current = onFocus; }, [onFocus]);

  const createEditor = useCallback(() => {
    if (!editorRef.current) return;

    const langExt = language ? LANGUAGE_EXTENSIONS[language] : null;

    const extensions: Extension[] = [
      Prec.high(keymap.of([{
        key: 'Mod-Enter',
        preventDefault: true,
        run: () => {
          onCompareShortcutRef.current?.();
          return true;
        },
      }])),
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
          onChangeRef.current?.(update.state.doc.toString());
        }
      }),
      EditorView.theme({
        '&': {
          height: '100%',
          fontSize: '13px',
          backgroundColor: 'var(--tc-editor-bg, transparent)',
          overflow: 'hidden',
        },
        '.cm-scroller': {
          fontFamily: 'var(--tc-font-mono, ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace)',
          overflow: 'auto',
        },
        '.cm-gutters': {
          borderRight: '1px solid var(--tc-border, transparent)',
          backgroundColor: 'var(--tc-editor-gutter-bg, transparent)',
        },
        '.cm-lineNumbers .cm-gutterElement': {
          color: 'var(--tc-text-tertiary, var(--dt-editor-muted, var(--ant-color-text-tertiary)))',
          fontSize: '12px',
          fontWeight: '500',
          minWidth: '44px',
          paddingLeft: '14px',
          paddingRight: '12px',
          textAlign: 'right',
        },
        '.cm-content': {
          minWidth: 'max-content',
          padding: '14px 24px 18px 10px',
          caretColor: 'var(--tc-text, var(--dt-text, var(--ant-color-text)))',
          backgroundColor: 'transparent',
        },
        '.cm-line': { padding: '0 10px', whiteSpace: 'pre' },
        '.cm-activeLine': { backgroundColor: 'transparent' },
        '.cm-activeLineGutter': { backgroundColor: 'var(--tc-editor-gutter-bg, transparent)' },
        '.cm-foldGutter': { cursor: 'pointer' },
        '.cm-foldPlaceholder': { color: 'var(--tc-text-tertiary, var(--dt-editor-muted, var(--ant-color-text-tertiary)))' },
      }),
      findViewPlugin,
    ];

    if (lineWrapping) extensions.push(EditorView.lineWrapping);
    if (showLineNumbers) extensions.push(lineNumbers(), foldGutter());
    if (placeholderText) extensions.push(placeholder(placeholderText));

    const state = EditorState.create({ doc: initialValueRef.current, extensions });
    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;
    onViewReadyRef.current?.(view, editorRef.current);
  }, [language, lineWrapping, showLineNumbers, placeholderText]);

  useEffect(() => {
    createEditor();
    return () => { viewRef.current?.destroy(); viewRef.current = null; };
  }, [createEditor]);

  // 编辑器获得焦点时通知父组件
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const handler = () => onFocusRef.current?.();
    view.contentDOM.addEventListener('focus', handler);
    return () => view.contentDOM.removeEventListener('focus', handler);
  }, [createEditor]);

  useEffect(() => {
    const view = viewRef.current;
    if (view) {
      const currentDoc = view.state.doc.toString();
      if (currentDoc !== value) {
        view.dispatch({ changes: { from: 0, to: currentDoc.length, insert: value } });
      }
    }
  }, [value, language, showLineNumbers, lineWrapping]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault();
        e.stopPropagation();
        onFormatShortcutRef.current?.();
      }
    };
    view.contentDOM.addEventListener('keydown', handler);
    return () => view.contentDOM.removeEventListener('keydown', handler);
  }, [language, lineWrapping, showLineNumbers, placeholderText]);

  return (
    <div className="dt-editor-wrap">
      <div
        ref={editorRef}
        className={`dt-editor-cm${lineWrapping ? ' is-wrap' : ''}`}
        style={{
          height: fillHeight ? '100%' : undefined,
          minHeight: fillHeight ? 0 : `${minRows * 18}px`,
          maxHeight: fillHeight ? 'none' : `${maxRows * 18}px`,
          border: 'none',
        }}
      />
    </div>
  );
});

export default CodeEditor;
