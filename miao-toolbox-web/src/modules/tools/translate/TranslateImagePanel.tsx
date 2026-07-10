import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Select, Button, Alert, Space, Tooltip, Empty, message } from 'antd';
import {
  PictureOutlined,
  TranslationOutlined,
  CopyOutlined,
  UploadOutlined,
  ReloadOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import {
  LANGUAGE_OPTIONS,
  type LanguageCode,
  type ImageTranslateResponse,
  type ImageTextBlock,
} from './types';
import { imageTranslate } from './translateService';
import { useTranslateHistory } from './useTranslateHistory';

/**
 * 图片翻译 Tab —— 实现 FR-8。
 *
 * - 上传：点击选择 / 拖拽上传 / 粘贴截图（三种方式，仅接受 jpg/png，前端预校验 ≤4MB）。
 * - 调用：复用 `imageTranslate`（FormData multipart 调 `POST /api/translate/image`）。
 * - 展示：成功后逐块展示「原文(src) / 译文(dst)」，每块可单独复制；展示检测语种与文本块数量。
 *
 * 说明：本 story 仅消费 `blocks` 的 `src`/`dst`（FR-8 核心）。`renderedImage`(FR-9)
 * 与 `sourceText`/`translatedText` 的纯文本复制/导出(FR-10) 由后续 story 复用同一端点返回
 * 的数据实现，本面板不渲染这两类字段。
 */

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png'];

const languageLabel = (code: LanguageCode): string =>
  LANGUAGE_OPTIONS.find((l) => l.code === code)?.label ?? code;

/** 从粘贴/拖拽/选择事件归一化出第一个图片 File，非图片返回 null */
function pickImage(files: FileList | null | undefined): File | null {
  if (!files || files.length === 0) return null;
  for (const f of Array.from(files)) {
    if (ACCEPTED.includes(f.type)) return f;
  }
  return null;
}

const TranslateImagePanel: React.FC = () => {
  const { add: addHistory } = useTranslateHistory();
  const [from, setFrom] = useState<LanguageCode>('auto');
  const [to, setTo] = useState<LanguageCode>('en');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ImageTranslateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0);

  // 释放预览 URL，避免内存泄漏
  const revokePreview = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }, [previewUrl]);

  useEffect(() => () => revokePreview(), [revokePreview]);

  const acceptFile = useCallback(
    (f: File | null) => {
      if (!f) return;
      if (!ACCEPTED.includes(f.type)) {
        message.warning('仅支持 jpg / png 格式图片');
        return;
      }
      if (f.size > MAX_IMAGE_BYTES) {
        message.warning('图片大小不能超过 4MB');
        return;
      }
      revokePreview();
      setFile(f);
      setPreviewUrl(URL.createObjectURL(f));
      setResult(null);
      setError(null);
    },
    [revokePreview],
  );

  // 粘贴截图（监听 window，捕获在任意焦点态下的截图粘贴）
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const img = pickImage(e.clipboardData?.files);
      if (img) {
        e.preventDefault();
        acceptFile(img);
        message.success('已粘贴截图');
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [acceptFile]);

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    acceptFile(pickImage(e.target.files));
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    acceptFile(pickImage(e.dataTransfer.files));
  };

  const handleReset = () => {
    revokePreview();
    setFile(null);
    setResult(null);
    setError(null);
  };

  const handleTranslate = useCallback(async () => {
    if (!file) {
      message.warning('请先选择或粘贴图片');
      return;
    }
    if (!to) {
      message.warning('请选择目标语言');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await imageTranslate(file, from, to);
      setResult(r);
      addHistory({
        source: r.sourceText && r.sourceText.trim() ? r.sourceText : '[图片]',
        target: r.translatedText ?? '',
        from: r.from,
        to: r.to,
      });
      if (!r.blocks || r.blocks.length === 0) {
        message.info('未识别到文本，请尝试更清晰的图片');
      } else {
        message.success(`识别到 ${r.blocks.length} 个文本块`);
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      const msg = err.response?.data?.message || '图片翻译失败，请稍后重试';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [file, from, to, addHistory]);

  const handleCopyBlock = async (block: ImageTextBlock) => {
    try {
      await navigator.clipboard.writeText(block.dst);
      message.success('已复制该块译文');
    } catch {
      message.error('复制失败，请检查浏览器权限');
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
          {file && (
            <Button
              className="tt-page-action"
              icon={<ReloadOutlined />}
              onClick={handleReset}
              disabled={loading}
            >
              重新上传
            </Button>
          )}
          <Button
            className="tt-primary-action"
            type="primary"
            icon={<TranslationOutlined />}
            onClick={handleTranslate}
            loading={loading}
            disabled={!file}
          >
            翻译
          </Button>
        </div>
      </div>

      <div className="tt-split">
        {/* 左：上传 / 预览 */}
        <div className="tt-pane tt-pane--upload">
          <div className="tt-pane-head">
            <span className="tt-pane-label">图片</span>
            {file && (
              <span className="tt-pane-count">
                {(file.size / 1024).toFixed(0)} KB · {file.name}
              </span>
            )}
          </div>

          {file && previewUrl ? (
            <div className="tt-image-preview">
              <img src={previewUrl} alt="待翻译图片预览" className="tt-image-preview-img" />
            </div>
          ) : (
            <div
              className={`tt-dropzone ${dragActive ? 'tt-dropzone--active' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(e) => {
                e.preventDefault();
                dragDepth.current += 1;
                setDragActive(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => {
                dragDepth.current -= 1;
                if (dragDepth.current <= 0) {
                  dragDepth.current = 0;
                  setDragActive(false);
                }
              }}
              onDrop={handleDrop}
              role="button"
              tabIndex={0}
              aria-label="上传图片：点击选择、拖拽或粘贴截图"
            >
              <InboxOutlined className="tt-dropzone-icon" />
              <div className="tt-dropzone-title">点击选择、拖拽上传，或直接粘贴截图</div>
              <div className="tt-dropzone-desc">支持 jpg / png，单张不超过 4MB</div>
              <Button className="tt-page-action" icon={<UploadOutlined />} type="text">
                选择图片
              </Button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="tt-file-input"
            onChange={handleSelect}
          />
        </div>

        {/* 右：OCR 结果 */}
        <div className="tt-pane tt-pane--result">
          <div className="tt-pane-head">
            <span className="tt-pane-label">OCR 结果</span>
            {result && (
              <span className="tt-pane-count">
                检测到 {languageLabel(result.from)} · {result.blocks?.length ?? 0} 个文本块
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
            result.blocks && result.blocks.length > 0 ? (
              <div className="tt-output tt-output--blocks">
                {result.blocks.map((block, i) => (
                  <div className="tt-ocr-block" key={i}>
                    <div className="tt-ocr-block-src">{block.src}</div>
                    <div className="tt-ocr-block-dst">
                      <span className="tt-ocr-block-dst-text">{block.dst}</span>
                      <Tooltip title="复制该块译文">
                        <Button
                          size="small"
                          type="text"
                          icon={<CopyOutlined />}
                          onClick={() => handleCopyBlock(block)}
                          aria-label="复制该块译文"
                        />
                      </Tooltip>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="tt-output tt-output--placeholder">
                <PictureOutlined className="tt-output-icon" />
                <span>未识别到文本，请尝试更清晰的图片</span>
              </div>
            )
          ) : (
            <div className="tt-output tt-output--placeholder">
              <Empty
                image={Empty.PRESENTED_IMAGE_DEFAULT}
                description={
                  <Space direction="vertical" size={2}>
                    <span>译文将按文本块逐条展示在这里</span>
                    <span className="tt-placeholder-hint">先上传或粘贴一张图片吧</span>
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

export default TranslateImagePanel;
