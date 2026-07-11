import React, { useCallback, useEffect, useState } from 'react';
import { Select, Input, Button, Alert, Space, Segmented, Tooltip, Switch } from 'antd';
import {
  TranslationOutlined,
  SwapOutlined,
  CopyOutlined,
  DownloadOutlined,
  ThunderboltOutlined,
  RobotOutlined,
  LinkOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import { message } from 'antd';
import {
  LANGUAGE_OPTIONS,
  type LanguageCode,
  type TranslateResponse,
  type AiEnhanceTone,
} from './types';
import { translateText, enhanceTranslate } from './translateService';
import { useTranslateContext } from './useTranslateContext';
import { useTranslateHistory } from './useTranslateHistory';

/**
 * 文本翻译 Tab —— 实现 FR-1/2/3/4。
 *
 * - FR-1 文本翻译：接通 `/api/translate`，展示译文/检测源语言/字符消耗；超 6000 字符自动分段并发翻译后拼接。
 * - FR-2 自动语种识别联动：`from=auto` 时依赖百度内部识别；返回仍为 auto 时提示手动选择。
 * - FR-3 双语对照视图：左右/上下布局切换、字体大小三档（14/16/20）。
 * - FR-4 复制/导出：纯译文、双语文本、`.txt`、`.md`。
 */

const MAX_CHUNK = 5900;
const MAX_CONCURRENCY = 4;
/** 上下文连贯（FR-17）拼接前文的字符上限，超出按最新往回滑窗截断，防止请求超长 / agent 超时。 */
const MAX_CONTEXT_CHARS = 4000;

interface Segment {
  src: string;
  dst: string;
}

/**
 * 上下文连贯翻译（FR-17）：把已累积的「原文→译文」对拼成前文字符串。
 * 从最新一轮往回累加，总长不超过 MAX_CONTEXT_CHARS。
 */
function buildContext(turns: Segment[]): string {
  const blocks: string[] = [];
  let total = 0;
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const block = `原文：${turns[i].src}\n译文：${turns[i].dst}`;
    if (total + block.length > MAX_CONTEXT_CHARS && blocks.length > 0) break;
    blocks.unshift(block);
    total += block.length + 2;
  }
  return blocks.join('\n\n');
}

/** 按段落优先切分，单段不超过 MAX_CHUNK；单段超长则硬切。 */
function chunkText(text: string): string[] {
  if (text.length <= MAX_CHUNK) return [text];
  const paragraphs = text.split(/\n+/);
  const chunks: string[] = [];
  let buf = '';
  for (const p of paragraphs) {
    if (buf && buf.length + p.length + 1 > MAX_CHUNK) {
      chunks.push(buf);
      buf = '';
    }
    buf = buf ? `${buf}\n${p}` : p;
    if (buf.length > MAX_CHUNK) {
      let i = 0;
      while (i < buf.length) {
        chunks.push(buf.slice(i, i + MAX_CHUNK));
        i += MAX_CHUNK;
      }
      buf = '';
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

/** 并发翻译各段（限制并发数以避免触达后端信号量），合并译文与字符消耗。 */
async function translateChunks(
  text: string,
  from: LanguageCode,
  to: LanguageCode,
): Promise<TranslateResponse & { segments: Segment[] }> {
  const chunks = chunkText(text);
  const results: Segment[] = new Array(chunks.length);
  let charCount = 0;
  let detectedFrom: LanguageCode = from;

  let idx = 0;
  const worker = async () => {
    while (idx < chunks.length) {
      const i = idx++;
      const r = await translateText({ text: chunks[i], from, to });
      results[i] = { src: chunks[i], dst: r.translatedText };
      charCount += r.charCount;
      if (i === 0) detectedFrom = r.from;
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENCY, chunks.length) }, worker),
  );

  return {
    translatedText: results.map((s) => s.dst).join('\n'),
    from: detectedFrom,
    charCount,
    segments: results,
  };
}

/** 双语文本（FR-4）：每段「原文 + 空行 + 译文」，段间以 --- 分隔。 */
function buildBilingual(segments: Segment[]): string {
  return segments
    .map((s) => `原文：\n${s.src}\n\n译文：\n${s.dst}`)
    .join('\n\n---\n\n');
}

/** Markdown 对照块（FR-4）。 */
function buildMarkdown(segments: Segment[]): string {
  const block = (s: Segment) =>
    `> **原文**\n>\n> ${s.src.split('\n').join('\n> ')}\n>\n> **译文**\n>\n> ${s.dst.split('\n').join('\n> ')}`;
  return `# 翻译对照\n\n${segments.map(block).join('\n\n---\n\n')}`;
}

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const TranslateTextPanel: React.FC = () => {
  const { state: ttState, dispatch: ttDispatch } = useTranslateContext();
  const { add: addHistory } = useTranslateHistory();
  const [from, setFrom] = useState<LanguageCode>(ttState.prefill?.from ?? 'auto');
  const [to, setTo] = useState<LanguageCode>(ttState.prefill?.to ?? 'en');
  const [source, setSource] = useState(ttState.prefill?.text ?? '');
  const [result, setResult] = useState<TranslateResponse | null>(
    ttState.prefill?.target
      ? {
          translatedText: ttState.prefill.target,
          from: ttState.prefill.from,
          charCount: ttState.prefill.text.length,
        }
      : null,
  );
  const [segments, setSegments] = useState<Segment[]>(
    ttState.prefill?.target
      ? [{ src: ttState.prefill.text, dst: ttState.prefill.target }]
      : [],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI 翻译模式（FR-16 / story-4.2 迭代：默认一键 AI 翻译，结果直接进译文栏）
  const [aiMode, setAiMode] = useState(true);
  const [polishTone, setPolishTone] = useState<AiEnhanceTone>('formal');

  // 上下文连贯翻译（FR-17）：开关默认关；contextTurns 为本会话累积的「原文→译文」对（内存态，刷新即清空）
  const [contextMode, setContextMode] = useState(false);
  const [contextTurns, setContextTurns] = useState<Segment[]>([]);

  // 挂载后清空跨面板联动预填（FR-7），避免重复应用；
  // 用 requestAnimationFrame 延迟 dispatch，规避 effect 内同步 setState 的 lint 告警
  useEffect(() => {
    if (ttState.prefill) {
      const id = requestAnimationFrame(() => ttDispatch({ type: 'CLEAR_PREFILL' }));
      return () => cancelAnimationFrame(id);
    }
  }, [ttState.prefill, ttDispatch]);

  const languageLabel = (code: LanguageCode) =>
    LANGUAGE_OPTIONS.find((l) => l.code === code)?.label ?? code;

  // 切换语言会使已累积前文跨语言错配，需清空上下文（FR-17 决策 4）
  const handleFromChange = (v: LanguageCode) => {
    setFrom(v);
    setContextTurns([]);
  };
  const handleToChange = (v: LanguageCode) => {
    setTo(v);
    setContextTurns([]);
  };

  const handleSwap = () => {
    if (from === 'auto') return;
    setFrom(to);
    setTo(from);
    setContextTurns([]);
  };

  const handleTranslate = useCallback(async () => {
    const text = source.trim();
    if (!text) {
      message.warning('请先输入待翻译文本');
      return;
    }
    if (to === from) {
      message.warning('源语言与目标语言不能相同');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await translateChunks(text, from, to);
      setResult(r);
      setSegments(r.segments);
      addHistory({ source: text, target: r.translatedText, from: r.from, to });
      if (from === 'auto' && r.from === 'auto') {
        message.warning('未能自动识别语种，请手动选择源语言');
      } else {
        message.success('翻译完成');
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      const msg = err.response?.data?.message || '翻译失败，请稍后重试';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [source, from, to, addHistory]);

  const handleAiTranslate = useCallback(async () => {
    const text = source.trim();
    if (!text) {
      message.warning('请先输入待翻译文本');
      return;
    }
    if (to === from) {
      message.warning('源语言与目标语言不能相同');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await enhanceTranslate({
        text,
        sourceLang: from,
        targetLang: to,
        tone: polishTone,
        // 上下文连贯（FR-17）：开启时以 context 任务附带累积前文
        ...(contextMode
          ? { task: 'context' as const, context: buildContext(contextTurns) }
          : {}),
      });
      // 用增强结果构造与普通翻译兼容的响应
      const normalized: TranslateResponse & { segments: Segment[] } = {
        translatedText: r.translated,
        // 后端暂未返回自动检测到的具体语种，auto 时先展示为 auto
        from,
        charCount: text.length,
        segments: [{ src: text, dst: r.translated }],
      };
      setResult(normalized);
      setSegments(normalized.segments);
      addHistory({ source: text, target: r.translated, from, to });
      // 仅成功后追加上下文；失败轮不污染后续连贯性（AC7）
      if (contextMode) {
        setContextTurns((prev) => [...prev, { src: text, dst: r.translated }]);
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      const msg = err.response?.data?.message || 'AI 翻译失败，请稍后重试';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [source, from, to, polishTone, contextMode, contextTurns, addHistory]);

  const handleSubmit = useCallback(() => {
    if (aiMode) {
      handleAiTranslate();
    } else {
      handleTranslate();
    }
  }, [aiMode, handleAiTranslate, handleTranslate]);

  const handleModeChange = (mode: boolean) => {
    setAiMode(mode);
    // 切换模式后清空旧结果，避免数据错配
    setResult(null);
    setSegments([]);
    // 切换 AI/普通模式时上下文失效，清空（FR-17 决策 4）
    setContextTurns([]);
  };

  const handleClearContext = () => {
    setContextTurns([]);
    message.success('已清空上下文');
  };

  const handleCopyTranslation = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.translatedText);
      message.success('已复制译文');
    } catch {
      message.error('复制失败，请检查浏览器权限');
    }
  };

  const handleCopyBilingual = async () => {
    if (!segments.length) return;
    try {
      await navigator.clipboard.writeText(buildBilingual(segments));
      message.success('已复制双语文本');
    } catch {
      message.error('复制失败，请检查浏览器权限');
    }
  };

  const handleExport = (kind: 'txt' | 'md') => {
    if (!segments.length) return;
    const stamp = new Date().toISOString().slice(0, 10);
    if (kind === 'txt') {
      downloadFile(`translation-${stamp}.txt`, buildBilingual(segments), 'text/plain;charset=utf-8');
    } else {
      downloadFile(`translation-${stamp}.md`, buildMarkdown(segments), 'text/markdown;charset=utf-8');
    }
    message.success(`已导出 ${kind.toUpperCase()}`);
  };

  // ===== AI 翻译风格（FR-16）=====

  const POLISH_TONES: { label: string; value: AiEnhanceTone }[] = [
    { label: '正式', value: 'formal' },
    { label: '口语', value: 'casual' },
    { label: '营销', value: 'marketing' },
    { label: '学术', value: 'academic' },
  ];

  const handleToneChange = (v: AiEnhanceTone) => {
    setPolishTone(v);
    // 切换风格不自动触发，需用户重新点击翻译；风格变化会破坏前文语气连贯，清空上下文（FR-17 决策 4）
    setContextTurns([]);
  };



  return (
    <div className="tt-panel">
      {error && (
        <Alert
          type="error"
          showIcon
          closable
          onClose={() => setError(null)}
          message={error}
          className="tt-panel-notice"
        />
      )}

      <div className="tt-command-bar">
        <div className="tt-lang-bar">
          <Select<LanguageCode>
            className="tt-lang-select"
            value={from}
            onChange={handleFromChange}
            options={LANGUAGE_OPTIONS.map((l) => ({ value: l.code, label: l.label }))}
          />
          <Tooltip title={from === 'auto' ? '自动检测时不可交换' : '交换语言'}>
            <Button
              type="text"
              className="tt-lang-swap"
              icon={<SwapOutlined />}
              onClick={handleSwap}
              disabled={from === 'auto'}
              aria-label="交换语言"
            />
          </Tooltip>
          <Select<LanguageCode>
            className="tt-lang-select"
            value={to}
            onChange={handleToChange}
            options={LANGUAGE_OPTIONS.filter((l) => l.code !== 'auto').map((l) => ({
              value: l.code,
              label: l.label,
            }))}
          />
        </div>

        <div className="tt-command-actions">
          {aiMode && (
            <div className="tt-context-toggle">
              <Tooltip title="开启后，每段翻译会参考前文已译内容，保证术语、语气、指代前后一致">
                <span className="tt-context-toggle-label">
                  <LinkOutlined /> 上下文连贯
                </span>
              </Tooltip>
              <Switch size="small" checked={contextMode} onChange={setContextMode} />
              {contextMode && contextTurns.length > 0 && (
                <>
                  <span className="tt-context-badge">已连贯 {contextTurns.length} 段</span>
                  <Tooltip title="清空已累积的上下文">
                    <Button
                      size="small"
                      type="text"
                      icon={<ClearOutlined />}
                      onClick={handleClearContext}
                      aria-label="清空上下文"
                    />
                  </Tooltip>
                </>
              )}
            </div>
          )}
          {aiMode && (
            <Segmented
              className="tt-segmented tt-tone-segmented"
              value={polishTone}
              onChange={(v) => handleToneChange(v as AiEnhanceTone)}
              options={POLISH_TONES}
            />
          )}
          <Segmented
            className="tt-segmented tt-mode-segmented"
            value={aiMode}
            onChange={(v) => handleModeChange(v as boolean)}
            options={[
              { label: 'AI 翻译', value: true },
              { label: '普通翻译', value: false },
            ]}
          />
          <Button
            className="tt-primary-action"
            type="primary"
            icon={aiMode ? <ThunderboltOutlined /> : <TranslationOutlined />}
            onClick={handleSubmit}
            loading={loading}
          >
            {aiMode ? 'AI 翻译' : '翻译'}
          </Button>
        </div>
      </div>

      <div className="tt-split">
        <div className="tt-pane tt-pane--source">
          <div className="tt-pane-head">
            <span className="tt-pane-label">原文</span>
            <span className="tt-pane-count">{source.length.toLocaleString()} 字符</span>
          </div>
          <Input.TextArea
            className="tt-textarea"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="在此粘贴或输入待翻译文本…（单段上限约 6000 字符，超出将自动分段翻译）"
          />
        </div>

        <div className="tt-pane tt-pane--result">
          <div className="tt-pane-head">
            <span className="tt-pane-label">译文</span>
            <Space size={2} className="tt-pane-tools">
              <Tooltip title="复制译文">
                <Button size="small" type="text" icon={<CopyOutlined />} onClick={handleCopyTranslation} disabled={!result} />
              </Tooltip>
              <Tooltip title="复制双语文本">
                <Button size="small" type="text" icon={<CopyOutlined />} onClick={handleCopyBilingual} disabled={!segments.length} />
              </Tooltip>
              <Tooltip title="导出 TXT">
                <Button size="small" type="text" icon={<DownloadOutlined />} onClick={() => handleExport('txt')} disabled={!segments.length} />
              </Tooltip>
              <Tooltip title="导出 Markdown">
                <Button size="small" type="text" icon={<DownloadOutlined />} onClick={() => handleExport('md')} disabled={!segments.length} />
              </Tooltip>
            </Space>
          </div>
          {loading ? (
            <div className="tt-output tt-output--loading">
              <span className="tt-loader" aria-label="翻译中">
                <i />
                <i />
                <i />
              </span>
              <span>{aiMode ? 'AI 翻译中…' : '翻译中…'}</span>
            </div>
          ) : result ? (
            <div className="tt-output tt-output--text">
              <div className="tt-output-meta">
                检测到：{languageLabel(result.from)} · 消耗 {result.charCount} 字符
                {aiMode && (
                  <span className="tt-output-meta-badge">
                    <RobotOutlined /> {POLISH_TONES.find((t) => t.value === polishTone)?.label}
                  </span>
                )}
                {aiMode && contextMode && (
                  <span className="tt-output-meta-badge tt-output-meta-badge--context">
                    <LinkOutlined /> 上下文连贯
                  </span>
                )}
              </div>
              <div className="tt-translation-text">{result.translatedText}</div>
            </div>
          ) : (
            <div className="tt-output tt-output--placeholder">
              <TranslationOutlined className="tt-output-icon" />
              <span>译文将显示在这里</span>
            </div>
          )}
        </div>
      </div>

      {result && !loading && <div className="tt-char-hint tt-char-hint--footer">已翻译 {result.charCount} 字符</div>}
    </div>
  );
};

export default TranslateTextPanel;
