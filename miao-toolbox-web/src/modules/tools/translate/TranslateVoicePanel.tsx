import React, { useCallback, useState } from 'react';
import { Select, Button, Alert, Space, Tooltip, Empty, message } from 'antd';
import {
  AudioOutlined,
  TranslationOutlined,
  CopyOutlined,
  FileTextOutlined,
  ReloadOutlined,
  LoadingOutlined,
  StopOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import {
  LANGUAGE_OPTIONS,
  type LanguageCode,
  type SpeechTranslateResponse,
} from './types';
import { speechTranslate } from './translateService';
import { useTranslateHistory } from './useTranslateHistory';
import { useVoiceRecorder } from './useVoiceRecorder';

/**
 * 语音翻译 Tab —— 实现 FR-12（前端录音链路，story-3.2）。
 *
 * - 录音：点击申请麦克风权限 → MediaRecorder 采集 → 停止后自动转码为 WAV(16k/单声道)。
 * - 权限/设备异常：`useVoiceRecorder` 已映射为友好中文提示，可重试。
 * - 调用：复用 `speechTranslate`（multipart 调 `POST /api/translate/voice`）。
 * - 展示：成功后以基础双语文本展示识别原文与译文（字幕式滚动归 story-3.3）。
 *
 * 说明：本 story 仅消费 `sourceText`/`translatedText`；朗读(TTS/P2)、字幕动画(story-3.3)
 * 由后续 story 复用同一端点/结果结构实现，本面板不渲染这两类能力。
 */

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 后端 2MB 上限

const languageLabel = (code: LanguageCode): string =>
  LANGUAGE_OPTIONS.find((l) => l.code === code)?.label ?? code;

function formatTime(sec: number): string {
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

/** 实时波形：由 recorder.levels 驱动，无需 React 状态重算 */
const Waveform: React.FC<{ levels: number[]; active: boolean }> = ({ levels, active }) => (
  <div className={`tt-wave ${active ? 'tt-wave--active' : ''}`} aria-hidden>
    {levels.map((lv, i) => (
      <span
        key={i}
        className="tt-wave-bar"
        style={{ height: `${Math.max(6, Math.round(lv * 100))}%` }}
      />
    ))}
  </div>
);

const TranslateVoicePanel: React.FC = () => {
  const { add: addHistory } = useTranslateHistory();
  const rec = useVoiceRecorder();
  const [from, setFrom] = useState<LanguageCode>('auto');
  const [to, setTo] = useState<LanguageCode>('zh');
  const [result, setResult] = useState<SpeechTranslateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showRecorded = rec.status === 'recorded' && rec.audioBlob;
  const busy = rec.status === 'requesting' || rec.status === 'processing' || loading;

  const handleTranslate = useCallback(async () => {
    if (!rec.audioBlob) {
      message.warning('请先录音');
      return;
    }
    if (!to) {
      message.warning('请选择目标语言');
      return;
    }
    if (rec.audioBlob.size > MAX_UPLOAD_BYTES) {
      message.warning('录音文件过大（上限 2MB），请缩短录音');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await speechTranslate(rec.audioBlob, from, to);
      setResult(r);
      addHistory({
        source: r.sourceText && r.sourceText.trim() ? r.sourceText : '[语音]',
        target: r.translatedText ?? '',
        from: r.from || from,
        to: r.to || to,
        mode: 'voice',
      });
      message.success('翻译完成');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err.response?.data?.message || '语音翻译失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [rec.audioBlob, from, to, addHistory]);

  const handleRerecord = useCallback(() => {
    setResult(null);
    setError(null);
    rec.reset();
    rec.start();
  }, [rec]);

  const handleCopy = useCallback(async (text: string, label: string) => {
    if (!text.trim()) {
      message.warning('没有可复制的内容');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      message.success(`已复制${label}`);
    } catch {
      message.error('复制失败，请检查浏览器权限');
    }
  }, []);

  const renderRecordPane = () => {
    switch (rec.status) {
      case 'unsupported':
      case 'error':
        return (
          <div className="tt-voice-state">
            <ExclamationCircleOutlined className="tt-voice-state-icon tt-voice-state-icon--warn" />
            <div className="tt-voice-state-title">无法开始录音</div>
            <div className="tt-voice-state-desc">{rec.error}</div>
            <Button
              className="tt-primary-action"
              type="primary"
              icon={<ReloadOutlined />}
              onClick={rec.start}
            >
              重试
            </Button>
          </div>
        );
      case 'requesting':
        return (
          <div className="tt-voice-state">
            <span className="tt-voice-spinner" aria-label="请求麦克风权限中">
              <LoadingOutlined spin />
            </span>
            <div className="tt-voice-state-title">正在请求麦克风权限…</div>
            <div className="tt-voice-state-desc">请在浏览器弹窗中允许麦克风访问</div>
          </div>
        );
      case 'recording':
        return (
          <div className="tt-voice-rec">
            <div className="tt-voice-rec-top">
              <span className="tt-voice-dot" />
              <span className="tt-voice-timer">{formatTime(rec.elapsed)}</span>
              <span className="tt-voice-maxtip">/ {formatTime(rec.maxSeconds)}</span>
            </div>
            <Waveform levels={rec.levels} active />
            <Button
              className="tt-voice-stop"
              danger
              type="primary"
              icon={<StopOutlined />}
              onClick={rec.stop}
            >
              停止录音
            </Button>
          </div>
        );
      case 'processing':
        return (
          <div className="tt-voice-state">
            <span className="tt-voice-spinner" aria-label="音频处理中">
              <LoadingOutlined spin />
            </span>
            <div className="tt-voice-state-title">正在处理音频…</div>
            <div className="tt-voice-state-desc">转码为 WAV（16kHz 单声道）</div>
          </div>
        );
      case 'recorded':
        return (
          <div className="tt-voice-done">
            <audio className="tt-voice-audio" src={rec.audioUrl ?? undefined} controls />
            <div className="tt-voice-format-note">
              已转码为 WAV（16kHz · 单声道），可直接翻译
            </div>
          </div>
        );
      case 'idle':
      default:
        return (
          <div className="tt-voice-state">
            <button
              className="tt-voice-mic"
              onClick={rec.start}
              aria-label="开始录音"
              type="button"
            >
              <AudioOutlined />
            </button>
            <div className="tt-voice-state-title">点击开始录音</div>
            <div className="tt-voice-state-desc">
              单次最长 {rec.maxSeconds} 秒，建议在安静环境中清晰发音
            </div>
          </div>
        );
    }
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

      <div className="tt-command-bar tt-command-bar--image">
        <div className="tt-lang-bar tt-lang-bar--image">
          <Select<LanguageCode>
            className="tt-lang-select"
            value={from}
            onChange={setFrom}
            options={LANGUAGE_OPTIONS.map((l) => ({ value: l.code, label: l.label }))}
          />
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

        <div className="tt-command-actions">
          {showRecorded && (
            <Button
              className="tt-page-action"
              icon={<ReloadOutlined />}
              onClick={handleRerecord}
              disabled={busy}
            >
              重新录制
            </Button>
          )}
          <Button
            className="tt-primary-action"
            type="primary"
            icon={<TranslationOutlined />}
            onClick={handleTranslate}
            loading={loading}
            disabled={!showRecorded || busy}
          >
            翻译
          </Button>
        </div>
      </div>

      <div className="tt-split">
        {/* 左：录音区 */}
        <div className="tt-pane tt-pane--record">
          <div className="tt-pane-head">
            <span className="tt-pane-label">录音</span>
            {showRecorded && rec.audioBlob && (
              <span className="tt-pane-count">
                {(rec.audioBlob.size / 1024).toFixed(0)} KB
              </span>
            )}
          </div>
          {renderRecordPane()}
        </div>

        {/* 右：译文结果 */}
        <div className="tt-pane tt-pane--result">
          <div className="tt-pane-head">
            <span className="tt-pane-label">结果</span>
            {result && (
              <span className="tt-pane-count">
                {languageLabel(result.from)} → {languageLabel(result.to)}
              </span>
            )}
          </div>

          {loading ? (
            <div className="tt-output tt-output--loading">
              <span className="tt-loader" aria-label="翻译中">
                <i />
                <i />
                <i />
              </span>
              <span>识别并翻译中…</span>
            </div>
          ) : result ? (
            <div className="tt-output tt-output--voice">
              <div className="tt-text-actions">
                <Button
                  size="small"
                  type="text"
                  icon={<CopyOutlined />}
                  onClick={() => handleCopy(result.sourceText ?? '', '原文')}
                  disabled={!result.sourceText?.trim()}
                >
                  复制原文
                </Button>
                <Button
                  size="small"
                  type="text"
                  icon={<CopyOutlined />}
                  onClick={() => handleCopy(result.translatedText ?? '', '译文')}
                  disabled={!result.translatedText?.trim()}
                >
                  复制译文
                </Button>
                <Tooltip title="复制原文 / 译文对照">
                  <Button
                    size="small"
                    type="text"
                    icon={<FileTextOutlined />}
                    onClick={() =>
                      handleCopy(
                        `【原文】\n${result.sourceText ?? ''}\n\n【译文】\n${result.translatedText ?? ''}`,
                        '双语',
                      )
                    }
                    disabled={!result.sourceText?.trim() && !result.translatedText?.trim()}
                  >
                    复制双语
                  </Button>
                </Tooltip>
              </div>
              <div className="tt-voice-result">
                <div className="tt-result-block">
                  <div className="tt-result-tag">原文</div>
                  <div className="tt-result-src">
                    {result.sourceText && result.sourceText.trim()
                      ? result.sourceText
                      : '（未识别到文本）'}
                  </div>
                </div>
                <div className="tt-result-block tt-result-block--dst">
                  <div className="tt-result-tag tt-result-tag--dst">译文</div>
                  <div className="tt-result-dst">
                    {result.translatedText && result.translatedText.trim()
                      ? result.translatedText
                      : '（无译文）'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="tt-output tt-output--placeholder">
              <Empty
                image={Empty.PRESENTED_IMAGE_DEFAULT}
                description={
                  <Space direction="vertical" size={2}>
                    <span>译文将显示在这里</span>
                    <span className="tt-placeholder-hint">先录音，再点击「翻译」</span>
                  </Space>
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TranslateVoicePanel;
