/**
 * 讲解台的输入区：快捷追问 + 多行输入。
 *
 * ── 三个必须做对的细节 ──
 *
 * 1. **输入法（IME）**：问的是中文，`Enter` 在候选词确认时也会触发 keydown。
 *    组合期间必须放过（`isComposing` 与 composition 事件双保险），否则用户
 *    打「日」的时候会把半截拼音发出去。
 * 2. **快捷追问只是「填入」不是「发送」**：给用户改一个字的机会，
 *    免得点了就被一句不想问的话占住一个轮次（AI 调用是有成本的）。
 * 3. **等待期间必须能取消**：首轮可能是几十秒，没有退路的等待等于卡死。
 */

import React, { useCallback, useRef, useState } from 'react';
import { SendOutlined } from '@ant-design/icons';
import type { QuickAsk } from '../../utils/wubi/explainQuestions';

interface ChatComposerProps {
  /** AI 不可用（配置问题）时整体禁用 */
  disabled: boolean;
  busy: boolean;
  quickAsks: QuickAsk[];
  placeholder: string;
  /** 选中字即自动讲解（可直接在输入区切换：会话开始后就该一直够得着） */
  autoExplain: boolean;
  onToggleAutoExplain: (next: boolean) => void;
  onSend: (question: string) => void;
  onCancel: () => void;
}

const ChatComposer: React.FC<ChatComposerProps> = ({
  disabled,
  busy,
  quickAsks,
  placeholder,
  autoExplain,
  onToggleAutoExplain,
  onSend,
  onCancel,
}) => {
  const [value, setValue] = useState('');
  /** IME 组合态：组合期间不响应 Enter */
  const composingRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const submit = useCallback(() => {
    const q = value.trim();
    if (!q || busy || disabled) return;
    setValue('');
    onSend(q);
  }, [value, busy, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      if (composingRef.current || e.nativeEvent.isComposing) return;
      e.preventDefault();
      submit();
    },
    [submit],
  );

  /** 点快捷追问：填入并聚焦，由用户决定发不发 */
  const fill = useCallback((question: string) => {
    setValue(question);
    inputRef.current?.focus();
  }, []);

  const blocked = disabled || busy;

  return (
    <div className="wt-chat__foot">
      {quickAsks.length > 0 && !blocked && (
        <div className="wt-chat__chips" role="group" aria-label="可以这样问">
          {quickAsks.map((ask) => (
            <button
              key={ask.id}
              type="button"
              className={`wt-chat__chip${ask.kind === 'revise' ? ' wt-chat__chip--revise' : ''}`}
              onClick={() => fill(ask.question)}
              title={ask.question}
            >
              {ask.label}
            </button>
          ))}
        </div>
      )}

      {busy && (
        <div className="wt-chat__pending" role="status">
          <span className="wt-chat__pending-dot" aria-hidden="true" />
          <span>正在结合上文回答…</span>
          <button type="button" className="wt-chat__cancel" onClick={onCancel}>
            取消
          </button>
        </div>
      )}

      <form
        className="wt-chat__form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={inputRef}
          className="wt-chat__input"
          rows={1}
          value={value}
          disabled={blocked}
          placeholder={
            disabled
              ? '先有可展示的讲解，才能追问'
              : placeholder
          }
          aria-label="继续追问"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
        />
        <button
          type="submit"
          className="wt-chat__send"
          disabled={blocked || !value.trim()}
          aria-label="发送追问"
        >
          <SendOutlined />
        </button>
      </form>
      <p className="wt-chat__tip">
        {/*
          开关放在输入区：会话一旦开始，「选中即讲解」在别处就够不着了 ——
          想关掉自动调用（省额度、省等待）必须随时能关。
        */}
        <label className="wt-chat__switch wt-chat__switch--compact">
          <input
            type="checkbox"
            checked={autoExplain}
            onChange={(e) => onToggleAutoExplain(e.target.checked)}
          />
          <span>选中即讲解</span>
        </label>
        <span className="wt-chat__tip-text">Enter 发送 · Shift+Enter 换行</span>
      </p>
    </div>
  );
};

export default ChatComposer;
