import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { EditorView, keymap, placeholder, lineNumbers, highlightSpecialChars, drawSelection, highlightActiveLine, Decoration } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
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
import type { Extension, Range } from '@codemirror/state';
import type { DecorationSet } from '@codemirror/view';
import { setDecorations, decorationsField, addedLineDeco, removedLineDeco, modifiedLineDeco, wordChangedDeco, reviewedLineDeco } from './diffDecorations';
import { HunkCheckboxWidget } from './HunkCheckboxWidget';
import type { DiffHunk } from './types';
import { computeInlineDiff } from './wordDiff';

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: string | null;
  showLineNumbers?: boolean;
  placeholder?: string;
  minRows?: number;
  maxRows?: number;
  diffHunks?: DiffHunk[];
  diffSide?: 'left' | 'right';
  reviewedHunkIds?: number[];
  onToggleHunkReviewed?: (hunkIndex: number) => void;
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
  diffHunks,
  diffSide,
  reviewedHunkIds,
  onToggleHunkReviewed,
  onViewReady,
  lineWrapping = true,
}, ref) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const initialValueRef = useRef(value);

  useImperativeHandle(ref, () => ({ get view() { return viewRef.current; } }), []);

  const onViewReadyRef = useRef(onViewReady);
  const onToggleHunkReviewedRef = useRef(onToggleHunkReviewed);
  const reviewedHunkIdsRef = useRef(reviewedHunkIds);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onViewReadyRef.current = onViewReady;
  }, [onViewReady]);

  useEffect(() => {
    onToggleHunkReviewedRef.current = onToggleHunkReviewed;
  }, [onToggleHunkReviewed]);

  useEffect(() => {
    reviewedHunkIdsRef.current = reviewedHunkIds;
  }, [reviewedHunkIds]);

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
      decorationsField,
      EditorView.updateListener.of(update => {
        if (update.docChanged) {
          const val = update.state.doc.toString();
          onChangeRef.current?.(val);
        }
      }),
      EditorView.theme({
        '&': { height: '100%', fontSize: '13px', backgroundColor: 'transparent' },
        '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace' },
        '.cm-gutters': {
          borderRight: 'none',
          backgroundColor: 'transparent',
        },
        '.cm-lineNumbers .cm-gutterElement': {
          color: 'var(--dt-editor-muted, var(--ant-color-text-tertiary))',
          fontSize: '11px',
          fontWeight: '500',
          paddingLeft: '12px',
        },
        '.cm-content': {
          padding: '16px 0 16px 8px',
          caretColor: 'var(--dt-text, var(--ant-color-text))',
          backgroundColor: 'transparent',
        },
        '.cm-activeLine': { backgroundColor: 'transparent' },
        '.cm-activeLineGutter': { backgroundColor: 'transparent' },
        '.cm-foldGutter': { cursor: 'pointer' },
        '.cm-foldPlaceholder': { color: 'var(--dt-editor-muted, var(--ant-color-text-tertiary))' },
      }),
    ];

    if (lineWrapping) {
      extensions.push(EditorView.lineWrapping);
    }

    if (showLineNumbers) {
      extensions.push(lineNumbers(), foldGutter());
    }

    if (placeholderText) {
      extensions.push(placeholder(placeholderText));
    }

    const state = EditorState.create({
      doc: initialValueRef.current,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;
    onViewReadyRef.current?.(view, editorRef.current);
  }, [language, lineWrapping, showLineNumbers, placeholderText]);

  useEffect(() => {
    createEditor();
    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [createEditor]);

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

  // Incrementally update diff decorations via StateEffect (no editor rebuild).
  // Also re-dispatches after editor rebuild (createEditor dependency) to restore decorations.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    let decos: DecorationSet;
    if (diffHunks && diffHunks.length > 0 && diffSide !== undefined) {
      const doc = view.state.doc;
      const lineCount = doc.lines;
      const lineRanges: Range<Decoration>[] = [];
      const widgetRanges: { from: number; widget: HunkCheckboxWidget }[] = [];

      for (let hunkIndex = 0; hunkIndex < diffHunks.length; hunkIndex++) {
        const hunk = diffHunks[hunkIndex];
        const type = hunk.type;
        if (type === 'unchanged') continue;

        const shouldDecorateLine =
          (type === 'added' && diffSide === 'right') ||
          (type === 'removed' && diffSide === 'left') ||
          type === 'modified';

        const startLine = diffSide === 'left' ? hunk.oldStart : hunk.newStart;
        const numLines = diffSide === 'left' ? hunk.oldLines : hunk.newLines;
        const isReviewed = reviewedHunkIdsRef.current?.includes(hunkIndex) ?? false;

        if (shouldDecorateLine) {
          let lineDeco: typeof addedLineDeco | null = null;
          if (type === 'added') lineDeco = addedLineDeco;
          else if (type === 'removed') lineDeco = removedLineDeco;
          else if (type === 'modified') lineDeco = modifiedLineDeco;

          if (lineDeco) {
            for (let i = 0; i < numLines; i++) {
              const lineNum = startLine + i;
              if (lineNum >= 1 && lineNum <= lineCount) {
                lineRanges.push(lineDeco.range(doc.line(lineNum).from));
                if (isReviewed) {
                  lineRanges.push(reviewedLineDeco.range(doc.line(lineNum).from));
                }
              }
            }
          }
        }

        // Hunk checkbox widget: 注入到 hunk 起始行行号列（在 gutter 内）
        if (startLine >= 1 && startLine <= lineCount && onToggleHunkReviewedRef.current) {
          widgetRanges.push({
            from: doc.line(startLine).from,
            widget: new HunkCheckboxWidget(hunkIndex, isReviewed, onToggleHunkReviewedRef.current),
          });
        }

        // Word-level mark decorations for modified hunks
        if (type === 'modified') {
          for (let i = 0; i < hunk.changes.length; i++) {
            const change = hunk.changes[i];
            if (change.type !== 'modified' || change.oldValue == null) continue;

            const lineNum = startLine + i;
            if (lineNum < 1 || lineNum > lineCount) continue;

            const lineFrom = doc.line(lineNum).from;
            const inlineDiff = computeInlineDiff(change.oldValue, change.value);
            const segments =
              diffSide === 'left' ? inlineDiff.oldSegments : inlineDiff.newSegments;

            for (const seg of segments) {
              if (seg.changed) {
                lineRanges.push(wordChangedDeco.range(lineFrom + seg.start, lineFrom + seg.end));
              }
            }
          }
        }
      }

      // 合并 line/mark decorations + widget decorations
      const allRanges: Range<Decoration>[] = [
        ...lineRanges,
        ...widgetRanges.map((wr) => Decoration.widget({ widget: wr.widget, side: -1 }).range(wr.from)),
      ];
      decos = Decoration.set(allRanges, true);
    } else {
      decos = Decoration.none;
    }

    view.dispatch({ effects: setDecorations.of(decos) });
  }, [diffHunks, diffSide, createEditor, reviewedHunkIds]);

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
});

export default CodeEditor;
