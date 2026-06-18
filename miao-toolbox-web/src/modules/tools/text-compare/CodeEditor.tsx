import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { EditorView, keymap, placeholder, lineNumbers, highlightSpecialChars, drawSelection, highlightActiveLine } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
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

const CodeEditor = forwardRef<{ view: EditorView | null }, CodeEditorProps>(({
  value,
  onChange,
  language,
  showLineNumbers = true,
  placeholder: placeholderText,
  minRows = 6,
  maxRows = 30,
  onViewReady,
  lineWrapping = true,
}, ref) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const initialValueRef = useRef(value);
  const onViewReadyRef = useRef(onViewReady);

  useImperativeHandle(ref, () => ({ get view() { return viewRef.current; } }), []);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { initialValueRef.current = value; }, [value]);
  useEffect(() => { onViewReadyRef.current = onViewReady; }, [onViewReady]);

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

  useEffect(() => {
    const view = viewRef.current;
    if (view) {
      const currentDoc = view.state.doc.toString();
      if (currentDoc !== value) {
        view.dispatch({ changes: { from: 0, to: currentDoc.length, insert: value } });
      }
    }
  }, [value, language, showLineNumbers, lineWrapping]);

  return (
    <div className="dt-editor-wrap">
      <div
        ref={editorRef}
        className="dt-editor-cm"
        style={{
          minHeight: `${minRows * 18}px`,
          maxHeight: `${maxRows * 18}px`,
          border: 'none',
        }}
      />
    </div>
  );
});

export default CodeEditor;
