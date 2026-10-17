/**
 * 讲解台的「执行过程」轨道：这一轮 AI 到底在干什么。
 *
 * ── 它解决什么 ──
 *
 * 一次讲解最长约 145s（联网 4~13s + 模型单次最多 70s × 2）。在接入执行事件之前，
 * 这段时间只有骨架 + 三条静态文案，用户唯一能做的就是等或者取消。
 * miao-ai 的 `event: exec` 会把「正在调哪个工具」在**阻塞开始那一刻**推过来，
 * 这里把它渲染成一行一次调用：工具名 + 耗时 + 成败。
 *
 * ── 三条呈现纪律 ──
 *
 * 1. **过去时与现在时分开**：`running` 的一行高亮呼吸（当前这一步），
 *    已结束的收敛成「工具名 + 耗时」。等待期用户只需要看「现在在做什么」。
 * 2. **失败不隐藏**：`ok:false` 用警示色 + 文字标签「失败」，并给出原因。
 *    与模块纪律一致 —— 让「卡在哪一步」可诊断，而不是转圈到超时。
 * 3. **状态不只靠颜色**：每一行都有文字标签（进行中 / 完成 / 失败），
 *    去掉颜色仍然可读（NFR-7）。
 *
 * ── 不做什么 ──
 *
 * 不渲染工具入参/出参：它们是过程信息，不是结论；展开看 JSON 只会把等待界面
 * 变成调试面板。结论只认 `done.output`（正文与逐位断言另由 `ChatTurn` 呈现）。
 */

import React from 'react';
import { LoadingOutlined } from '@ant-design/icons';
import type { ExecEntry, ExecTrace } from '../../utils/wubi/execStream';
import { toolLabel } from '../../utils/wubi/execStream';

interface ExecTraceProps {
  trace: ExecTrace;
  /** 首轮/追问正在等待时才有「进行中」语义；结束后整块收敛 */
  busy: boolean;
  reduceMotion: boolean;
}

/** 毫秒 → 人话（1.2s / 968ms） */
function formatMs(ms?: number): string | null {
  if (typeof ms !== 'number') return null;
  // 0~1ms 是「几乎瞬时」（如查内置码表）：显示出来只是噪音，不显示更干净
  if (ms < 5) return null;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

const STATUS_TEXT: Record<ExecEntry['status'], string> = {
  running: '进行中',
  ok: '完成',
  failed: '失败',
};

const ExecRow: React.FC<{ entry: ExecEntry; reduceMotion: boolean }> = ({
  entry,
  reduceMotion,
}) => {
  const label = toolLabel(entry.name);
  const ms = formatMs(entry.ms);
  const running = entry.status === 'running';

  return (
    <li
      className={`wt-exec__row wt-exec__row--${entry.status}${
        running && !reduceMotion ? ' wt-exec__row--pulse' : ''
      }`}
    >
      <span className="wt-exec__dot" aria-hidden="true">
        {running ? <LoadingOutlined /> : null}
      </span>
      <span className="wt-exec__name">{label}</span>
      {/* 状态同时用文字表达：不依赖颜色（NFR-7） */}
      <span className="wt-exec__status">{STATUS_TEXT[entry.status]}</span>
      {ms && <span className="wt-exec__ms">{ms}</span>}
      {entry.status === 'failed' && entry.error && (
        <span className="wt-exec__error" title={entry.error}>
          {entry.error}
        </span>
      )}
      {entry.truncated && <span className="wt-exec__truncated">（内容已截断）</span>}
    </li>
  );
};

const ExecTraceView: React.FC<ExecTraceProps> = ({ trace, busy, reduceMotion }) => {
  // 空轨不渲染：老版本 agent / 未上报时不占版面（过程可见是增强，不是必需）
  if (trace.entries.length === 0 && trace.notes.length === 0) return null;

  const finished = trace.entries.filter((e) => e.status !== 'running').length;
  const current = busy ? [...trace.entries].reverse().find((e) => e.status === 'running') : null;

  return (
    <section className="wt-exec" aria-label="AI 执行过程">
      <p className="wt-exec__head">
        <span className="wt-exec__title">执行过程</span>
        <span className="wt-exec__summary">
          {current
            ? `正在${toolLabel(current.name)}…`
            : `共 ${trace.entries.length} 步${
                finished === trace.entries.length ? '，已全部完成' : ''
              }`}
        </span>
      </p>

      <ul className="wt-exec__list">
        {trace.entries.map((entry) => (
          <ExecRow key={entry.callId} entry={entry} reduceMotion={reduceMotion} />
        ))}
      </ul>

      {trace.notes.length > 0 && (
        <ul className="wt-exec__notes">
          {trace.notes.map((note, i) => (
            // 说明条目没有稳定 id（平台不保证唯一），用「kind+序号」做 key 足够：
            // 这一块只追加不更新，不会出现错位复用
            <li
              key={`${note.kind}-${i}`}
              className={`wt-exec__note wt-exec__note--${note.level ?? 'info'}`}
            >
              {note.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default ExecTraceView;
