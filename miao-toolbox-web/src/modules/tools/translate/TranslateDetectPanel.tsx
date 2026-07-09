import React, { useCallback, useState } from 'react';
import { Input, Button, Alert, Space, Tooltip, Spin, Progress, Segmented } from 'antd';
import {
  ApartmentOutlined,
  CopyOutlined,
  DownloadOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { message } from 'antd';
import { LANGUAGE_OPTIONS, type LanguageCode, type DetectResponse } from './types';
import { detectLanguage } from './translateService';
import { useTranslateContext } from './useTranslateContext';

/**
 * 语种识别 Tab —— 实现 FR-5/FR-6/FR-7。
 *
 * - FR-5 单段/批量语种检测：调用 `/api/translate/detect`，渲染识别到的语种集合（language + confidence）；
 *   超出 7 语种子集的语种回退提示「未知/未在支持列表」。
 * - FR-6 混合语种识别与主语种提示：渲染字符占比最大的主语种（dominant）为高亮卡片。
 * - FR-7 推荐目标语言：渲染推荐目标语言（recommendedTarget），并提供「使用推荐语言翻译」入口，
 *   通过 TranslateContext 的 prefill 跨面板联动带入文本翻译 Tab。
 */

const isKnown = (code: string) => LANGUAGE_OPTIONS.some((l) => l.code === code);

const languageLabel = (code: string): string =>
  LANGUAGE_OPTIONS.find((l) => l.code === code)?.label ?? `${code}（未知/未在支持列表）`;

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

/** 纯文本摘要（FR-7 复制/导出） */
function buildPlain(result: DetectResponse, text: string): string {
  const excerpt = text.length > 200 ? `${text.slice(0, 200)}…` : text;
  const lines = [
    `待识别文本：${excerpt}`,
    `主语种：${languageLabel(result.dominant)}`,
    `推荐目标语言：${languageLabel(result.recommendedTarget)}`,
    '识别结果：',
    ...result.results.map(
      (r) => `  - ${languageLabel(r.language)} ${(r.confidence * 100).toFixed(0)}%`,
    ),
  ];
  return lines.join('\n');
}

/** Markdown 对照（FR-7 导出） */
function buildMarkdown(result: DetectResponse, text: string): string {
  const excerpt = text.length > 200 ? `${text.slice(0, 200)}…` : text;
  const list = result.results
    .map((r) => `- **${languageLabel(r.language)}** — ${(r.confidence * 100).toFixed(0)}%`)
    .join('\n');
  return [
    '# 语种识别结果',
    '',
    `> 待识别文本：${excerpt}`,
    '',
    `**主语种**：${languageLabel(result.dominant)}`,
    '',
    `**推荐目标语言**：${languageLabel(result.recommendedTarget)}`,
    '',
    '## 识别到的语种',
    list,
  ].join('\n');
}

const TranslateDetectPanel: React.FC = () => {
  const { dispatch } = useTranslateContext();
  const [text, setText] = useState('');
  const [result, setResult] = useState<DetectResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState<'split' | 'stack'>('split');

  const handleDetect = useCallback(async () => {
    const t = text.trim();
    if (!t) {
      message.warning('请先输入待识别文本');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await detectLanguage({ text: t });
      setResult(r);
      message.success('识别完成');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      const msg = err.response?.data?.message || '语种识别失败，请稍后重试';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [text]);

  /** FR-7 联动：将识别结果带入文本翻译 Tab */
  const handleUseRecommended = () => {
    if (!result) return;
    const from: LanguageCode = isKnown(result.dominant) ? result.dominant : 'auto';
    const to: LanguageCode = isKnown(result.recommendedTarget) ? result.recommendedTarget : 'zh';
    dispatch({
      type: 'SET_PREFILL',
      payload: { text: text, from, to },
    });
    dispatch({ type: 'SET_ACTIVE_TAB', payload: 'text' });
  };

  const handleCopyPlain = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(buildPlain(result, text));
      message.success('已复制识别结果');
    } catch {
      message.error('复制失败，请检查浏览器权限');
    }
  };

  const handleCopyStructured = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(
        result.results.map((r) => `${r.language}:${r.confidence.toFixed(3)}`).join('\n'),
      );
      message.success('已复制结构化结果');
    } catch {
      message.error('复制失败，请检查浏览器权限');
    }
  };

  const handleExport = (kind: 'txt' | 'md') => {
    if (!result) return;
    const stamp = new Date().toISOString().slice(0, 10);
    const content = kind === 'txt' ? buildPlain(result, text) : buildMarkdown(result, text);
    const mime = kind === 'txt' ? 'text/plain;charset=utf-8' : 'text/markdown;charset=utf-8';
    downloadFile(`detect-${stamp}.${kind}`, content, mime);
    message.success(`已导出 ${kind.toUpperCase()}`);
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
        </Space>
      </div>

      <div className={`tt-split ${layout === 'stack' ? 'tt-split--stack' : ''}`}>
        <div className="tt-pane">
          <div className="tt-pane-label">待识别文本</div>
          <Input.TextArea
            className="tt-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="输入或粘贴文本，系统将识别其语种（限中/英/日/韩/泰/越/俄 7 语种子集）…"
            autoSize={{ minRows: 10, maxRows: 20 }}
          />
        </div>

        <div className="tt-pane">
          <div className="tt-pane-head">
            <span className="tt-pane-label">识别结果</span>
            <Space size={2} className="tt-pane-tools">
              <Tooltip title="复制纯文本摘要">
                <Button size="small" type="text" icon={<CopyOutlined />} onClick={handleCopyPlain} disabled={!result} />
              </Tooltip>
              <Tooltip title="复制结构化结果（语言码:置信度）">
                <Button size="small" type="text" icon={<CopyOutlined />} onClick={handleCopyStructured} disabled={!result} />
              </Tooltip>
              <Tooltip title="导出 TXT">
                <Button size="small" type="text" icon={<DownloadOutlined />} onClick={() => handleExport('txt')} disabled={!result} />
              </Tooltip>
              <Tooltip title="导出 Markdown">
                <Button size="small" type="text" icon={<DownloadOutlined />} onClick={() => handleExport('md')} disabled={!result} />
              </Tooltip>
            </Space>
          </div>

          {loading ? (
            <div className="tt-output tt-output--loading">
              <Spin />
              <span>识别中…</span>
            </div>
          ) : result ? (
            <div className="tt-output tt-output--detect-result">
              <div className="tt-detect-dominant">
                <span className="tt-detect-dominant-label">主语种</span>
                <span className="tt-detect-dominant-value">{languageLabel(result.dominant)}</span>
              </div>

              <div className="tt-detect-recommend">
                <span>
                  推荐翻译目标：<strong>{languageLabel(result.recommendedTarget)}</strong>
                </span>
                <Button
                  size="small"
                  type="primary"
                  icon={<ArrowRightOutlined />}
                  onClick={handleUseRecommended}
                >
                  使用推荐语言翻译
                </Button>
              </div>

              <div className="tt-detect-list">
                {result.results.map((r) => (
                  <div className="tt-detect-item" key={r.language}>
                    <div className="tt-detect-item-main">
                      <span className="tt-detect-item-label">{languageLabel(r.language)}</span>
                      <span className="tt-detect-item-pct">{(r.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <Progress
                      percent={Math.round(r.confidence * 100)}
                      showInfo={false}
                      strokeColor="var(--tt-accent)"
                      trailColor="rgba(255,255,255,0.08)"
                      size="small"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="tt-output tt-output--placeholder tt-output--detect">
              <ApartmentOutlined className="tt-output-icon" />
              <span>识别结果将显示在这里（语种集合 / 主语种 / 推荐目标语言）</span>
            </div>
          )}
        </div>
      </div>

      <div className="tt-actions">
        <Button type="primary" icon={<ApartmentOutlined />} onClick={handleDetect} loading={loading}>
          识别语种
        </Button>
      </div>
    </div>
  );
};

export default TranslateDetectPanel;
