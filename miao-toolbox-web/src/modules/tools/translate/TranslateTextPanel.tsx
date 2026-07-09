import React, { useCallback, useEffect, useState } from 'react';
import { Select, Input, Button, Alert, Space, Segmented, Tooltip, Spin } from 'antd';
import { TranslationOutlined, SwapOutlined, CopyOutlined, DownloadOutlined } from '@ant-design/icons';
import { message } from 'antd';
import { LANGUAGE_OPTIONS, type LanguageCode, type TranslateResponse } from './types';
import { translateText } from './translateService';
import { useTranslateContext } from './useTranslateContext';

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

interface Segment {
  src: string;
  dst: string;
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
  const [from, setFrom] = useState<LanguageCode>(ttState.prefill?.from ?? 'auto');
  const [to, setTo] = useState<LanguageCode>(ttState.prefill?.to ?? 'en');
  const [source, setSource] = useState(ttState.prefill?.text ?? '');
  const [result, setResult] = useState<TranslateResponse | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState<'split' | 'stack'>('split');
  const [fontSize, setFontSize] = useState<'sm' | 'md' | 'lg'>('md');

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

  const handleSwap = () => {
    if (from === 'auto') return;
    setFrom(to);
    setTo(from);
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
  }, [source, from, to]);

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

  return (
    <div className={`tt-panel tt-fs-${fontSize}`}>
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

      <div className="tt-toolbar">
        <Space>
          <Segmented
            value={layout}
            onChange={(v) => setLayout(v as 'split' | 'stack')}
            options={[
              { label: '左右', value: 'split' },
              { label: '上下', value: 'stack' },
            ]}
          />
          <Segmented
            value={fontSize}
            onChange={(v) => setFontSize(v as 'sm' | 'md' | 'lg')}
            options={[
              { label: '小', value: 'sm' },
              { label: '中', value: 'md' },
              { label: '大', value: 'lg' },
            ]}
          />
        </Space>
      </div>

      <div className="tt-lang-bar">
        <Select<LanguageCode>
          className="tt-lang-select"
          value={from}
          onChange={setFrom}
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
          onChange={setTo}
          options={LANGUAGE_OPTIONS.filter((l) => l.code !== 'auto').map((l) => ({
            value: l.code,
            label: l.label,
          }))}
        />
      </div>

      <div className={`tt-split ${layout === 'stack' ? 'tt-split--stack' : ''}`}>
        <div className="tt-pane">
          <div className="tt-pane-label">原文</div>
          <Input.TextArea
            className="tt-textarea"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="在此粘贴或输入待翻译文本…（单段上限约 6000 字符，超出将自动分段翻译）"
            autoSize={{ minRows: 10, maxRows: 20 }}
          />
        </div>

        <div className="tt-pane">
          <div className="tt-pane-head">
            <span className="tt-pane-label">译文</span>
            <Space size={2} className="tt-pane-tools">
              <Tooltip title="复制纯译文">
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
              <Spin />
              <span>翻译中…</span>
            </div>
          ) : result ? (
            <div className="tt-output tt-output--text">
              <div className="tt-output-meta">
                检测到：{languageLabel(result.from)} · 消耗 {result.charCount} 字符
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

      <div className="tt-actions">
        <Space>
          {result && !loading && <span className="tt-char-hint">已翻译 {result.charCount} 字符</span>}
          <Button type="primary" icon={<TranslationOutlined />} onClick={handleTranslate} loading={loading}>
            翻译
          </Button>
        </Space>
      </div>
    </div>
  );
};

export default TranslateTextPanel;
