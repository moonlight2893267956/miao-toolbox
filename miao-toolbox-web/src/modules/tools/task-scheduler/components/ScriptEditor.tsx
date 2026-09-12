/**
 * 脚本代码编辑器（CodeMirror 6）：支持 Shell/Python 语法高亮。
 *
 * 简化版——不需要 diff/搜索插件，仅行号、括号闭合、历史、语法高亮。
 * 独立于 text-compare/CodeEditor（后者与 diff 上下文耦合）。
 */
import { useEffect, useRef, useCallback } from 'react';
import { EditorView, keymap, placeholder, lineNumbers, highlightSpecialChars, drawSelection, highlightActiveLine } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { foldGutter, indentOnInput, indentUnit, foldKeymap } from '@codemirror/language';
import { defaultKeymap, history } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import { StreamLanguage } from '@codemirror/language';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { closeBrackets, autocompletion, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import type { ScriptType } from '../types';

interface ScriptEditorProps {
  value: string;
  onChange: (value: string) => void;
  scriptType: ScriptType;
  placeholder?: string;
  height?: string;
}

function getLanguageExtension(scriptType: ScriptType): Extension {
  if (scriptType === 'PYTHON') {
    return python();
  }
  return StreamLanguage.define(shell);
}

const ScriptEditor: React.FC<ScriptEditorProps> = ({
  value,
  onChange,
  scriptType,
  placeholder: ph = '在此粘贴或编写脚本内容…',
  height = '400px',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // 语言切换时重建编辑器
  useEffect(() => {
    if (!containerRef.current) return;

    const langExt = getLanguageExtension(scriptType);
    const extensions: Extension[] = [
      lineNumbers(),
      highlightSpecialChars(),
      foldGutter(),
      drawSelection(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      indentUnit.of('    '),
      history(),
      closeBrackets(),
      autocompletion(),
      highlightActiveLine(),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...completionKeymap,
        ...foldKeymap,
      ]),
      langExt,
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ 'aria-label': '脚本编辑器' }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
    ];

    if (ph) {
      extensions.push(placeholder(ph));
    }

    const state = EditorState.create({
      doc: value,
      extensions,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptType]);

  // 外部 value 变化时同步到编辑器（不触发 onChange）
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  const handleUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      onChangeRef.current(text);
    };
    reader.readAsText(file);
  }, []);

  return (
    <div className="ts-script-editor-wrap">
      <div
        ref={containerRef}
        className="ts-script-editor"
        style={{ height, overflow: 'auto' }}
      />
      <label className="ts-editor-upload-hint">
        或上传文件：
        <input
          type="file"
          accept={scriptType === 'PYTHON' ? '.py' : '.sh'}
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = '';
          }}
        />
        <span className="ts-upload-link">{scriptType === 'PYTHON' ? '.py' : '.sh'}</span>
      </label>
    </div>
  );
};

export default ScriptEditor;
