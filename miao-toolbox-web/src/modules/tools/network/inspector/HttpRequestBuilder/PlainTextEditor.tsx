import { useEffect, useRef } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine, placeholder } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching } from '@codemirror/language';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const themeCompartment = new Compartment();

function getThemeExtensions(): Extension {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  return EditorView.theme({
    '&': {
      height: '100%',
      fontSize: '13px',
      backgroundColor: 'transparent',
    },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace",
      lineHeight: '1.6',
    },
    '.cm-content': {
      padding: '8px 0',
      caretColor: 'var(--tool-accent)',
    },
    '.cm-cursor': {
      borderLeft: '2px solid',
      borderLeftColor: 'var(--tool-accent)',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: isDark
        ? 'color-mix(in srgb, var(--tool-accent) 30%, transparent)'
        : 'color-mix(in srgb, var(--tool-accent) 15%, transparent)',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--miao-text-tertiary)',
      border: 'none',
      borderRight: '1px solid var(--miao-border)',
      paddingRight: '6px',
    },
    '.cm-activeLineGutter': {
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.03)',
    },
    '.cm-activeLine': {
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.02)',
    },
    '.cm-placeholder': {
      color: 'var(--miao-text-tertiary)',
      fontStyle: 'italic',
    },
  }, { dark: isDark });
}

export default function PlainTextEditor({ value, onChange, placeholder: placeholderText }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const isExternalUpdateRef = useRef(false);
  const isEmpty = !value;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        highlightSelectionMatches(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        themeCompartment.of(getThemeExtensions()),
        placeholderText ? placeholder(placeholderText) : [],
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isExternalUpdateRef.current) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    const observer = new MutationObserver(() => {
      const v = viewRef.current;
      if (!v) return;
      if (themeCompartment.get(v.state)) {
        v.dispatch({ effects: themeCompartment.reconfigure(getThemeExtensions()) });
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      observer.disconnect();
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    isExternalUpdateRef.current = true;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    isExternalUpdateRef.current = false;
  }, [value]);

  return (
    <div className={`hrb-pt-editor ${isEmpty ? 'hrb-pt-editor--empty' : ''}`}>
      <div ref={containerRef} className="hrb-pt-editor__core" />
    </div>
  );
}
