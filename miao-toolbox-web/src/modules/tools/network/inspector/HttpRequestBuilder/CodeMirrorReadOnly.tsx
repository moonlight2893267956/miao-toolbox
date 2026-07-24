import { useEffect, useRef } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { lineNumbers, highlightActiveLineGutter, highlightActiveLine } from '@codemirror/view';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { linter } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';

interface Props {
  value: string;
  language?: 'json' | 'text';
  height?: number | string;
}

const themeCompartment = new Compartment();

function getThemeExtensions(): Extension {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  return EditorView.theme(
    {
      '&': {
        height: '100%',
        fontSize: '13px',
        backgroundColor: 'transparent',
      },
      '.cm-scroller': {
        overflow: 'auto',
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace",
        lineHeight: '1.6',
      },
      '.cm-content': {
        padding: '10px 0',
        caretColor: 'transparent',
      },
      '.cm-gutters': {
        backgroundColor: 'transparent',
        color: 'var(--miao-text-tertiary)',
        border: 'none',
        borderRight: '1px solid var(--miao-border)',
        paddingRight: '6px',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'transparent',
      },
      '.cm-activeLine': {
        backgroundColor: 'transparent',
      },
    },
    { dark: isDark },
  );
}

export default function CodeMirrorReadOnly({ value, language = 'json', height = '100%' }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  // mount
  useEffect(() => {
    if (!containerRef.current) return;

    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),
      bracketMatching(),
      themeCompartment.of(getThemeExtensions()),
    ];

    if (language === 'json') {
      extensions.push(
        json(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        // linter still produces diagnostics but they will not be editable
        linter(jsonParseLinter(), { delay: 300 }),
      );
    }

    const state = EditorState.create({
      doc: value,
      extensions,
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
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => {
      observer.disconnect();
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  // external value sync
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }, [value]);

  return (
    <div className="hrb-cm-readonly" style={{ height }}>
      <div ref={containerRef} className="hrb-cm-readonly__core" />
    </div>
  );
}