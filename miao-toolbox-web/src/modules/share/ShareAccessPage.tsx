import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button, Spin } from 'antd';
import {
  DownloadOutlined,
  FileOutlined,
  ClockCircleOutlined,
  StopOutlined,
  InboxOutlined,
  LockOutlined,
} from '@ant-design/icons';
import FilePreviewer from '../tools/file-storage/FilePreviewer';
import { getFileIcon } from '../tools/file-storage/FileIcon';
import { formatSize, getFileCategory, isPreviewable } from '../tools/file-storage/fileCategory';
import type { SharePublicInfo } from '../tools/file-storage/types';
// FilePreviewer 复用文件管理页的 .fs-preview-* 样式（图片棋盘格底、终端式文本卡等），
// 该样式文件只被文件管理页（代码分包）引入，分享页需显式加载才能保持预览形式一致
import '../tools/file-storage/file-storage.css';
import AccessCodeInput from './AccessCodeInput';
import { shareApi, toShareError } from './shareApi';
import './share.css';

type Phase = 'loading' | 'locked' | 'unlocked' | 'invalid';

interface InvalidState {
  code: string;
  message: string;
}

/** 失效类型 → 空状态文案 */
const INVALID_TEXT: Record<string, { title: string; hint: string; icon: React.ReactNode }> = {
  SHARE_LINK_NOT_FOUND: {
    title: '分享不存在',
    hint: '链接可能有误，或分享已被删除。请向分享者确认链接是否正确。',
    icon: <InboxOutlined />,
  },
  SHARE_LINK_REVOKED: {
    title: '分享已被取消',
    hint: '分享者已关闭这条分享链接，如有需要请联系对方重新分享。',
    icon: <StopOutlined />,
  },
  SHARE_LINK_EXPIRED: {
    title: '分享已过期',
    hint: '这条分享链接已超过有效期，请联系分享者重新生成。',
    icon: <ClockCircleOutlined />,
  },
  SHARE_LINK_EXHAUSTED: {
    title: '分享次数已用尽',
    hint: '这条分享链接的访问次数已达上限，请联系分享者重新生成。',
    icon: <StopOutlined />,
  },
  SHARE_ACCESS_TICKET_INVALID: {
    title: '访问凭证已失效',
    hint: '页面停留时间较长，请重新输入提取码以继续查看。',
    icon: <LockOutlined />,
  },
  SHARE_UNLOCK_TOO_MANY_ATTEMPTS: {
    title: '尝试次数过多',
    hint: '提取码错误次数过多，请稍后再试。',
    icon: <StopOutlined />,
  },
};

const FALLBACK_INVALID = {
  title: '无法打开分享',
  hint: '发生了未知错误，请刷新页面重试。',
  icon: <FileOutlined />,
};

/** 把过期时间格式化成「x 天后失效」这类提示 */
function describeExpiry(expiresAt: string | null): string | null {
  if (!expiresAt) return '永久有效';
  const target = new Date(expiresAt.replace(/-/g, '/'));
  if (Number.isNaN(target.getTime())) return null;
  const diffMs = target.getTime() - Date.now();
  if (diffMs <= 0) return '已过期';
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return '将在 1 小时内失效';
  if (hours < 24) return `${hours} 小时后失效`;
  return `${Math.ceil(hours / 24)} 天后失效`;
}

const ShareAccessPage: React.FC = () => {
  const { code = '' } = useParams<{ code: string }>();

  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<SharePublicInfo | null>(null);
  const [invalid, setInvalid] = useState<InvalidState | null>(null);

  const [accessCode, setAccessCode] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const [ticket, setTicket] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const objectUrlRef = useRef<string | null>(null);

  const releaseObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPreviewObjectUrl(null);
  }, []);

  // 组件卸载时释放 Blob URL
  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  // 拉取分享信息
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await shareApi.getInfo(code);
        if (cancelled) return;
        setInfo(data);
        // 已失效的分享直接展示对应的空状态，不再要求输入提取码
        if (data.status !== 'ACTIVE') {
          setInvalid({ code: `SHARE_LINK_${data.status}`, message: '' });
          setPhase('invalid');
        } else {
          setPhase('locked');
        }
      } catch (e) {
        if (cancelled) return;
        const err = toShareError(e, 'SHARE_LINK_NOT_FOUND', '分享不存在');
        setInvalid(err);
        setPhase('invalid');
      }
    };
    if (code) void load();
    return () => { cancelled = true; };
  }, [code]);

  // 解锁后加载预览内容
  const loadPreview = useCallback(async (shareCode: string, tk: string, fileInfo: SharePublicInfo) => {
    const category = getFileCategory(fileInfo.mimeType, fileInfo.fileName);
    setPreviewLoading(true);
    releaseObjectUrl();
    setPreviewText(null);
    try {
      if (category === 'text') {
        const content = await shareApi.fetchTextPreview(shareCode, tk);
        setPreviewText(content);
      } else if (isPreviewable(fileInfo.mimeType, fileInfo.fileName)) {
        const blob = await shareApi.fetchPreviewBlob(shareCode, tk);
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setPreviewObjectUrl(url);
      }
    } catch (e) {
      // 预览失败时票据可能已过期，退回输入态提示重新验证
      const err = toShareError(e, 'SHARE_ACCESS_TICKET_INVALID', '预览加载失败');
      setInvalid(err);
      setPhase('invalid');
      setTicket('');
    } finally {
      setPreviewLoading(false);
    }
  }, [releaseObjectUrl]);

  const handleUnlock = useCallback(async () => {
    if (unlocking || accessCode.length < 4) return;
    setUnlocking(true);
    setUnlockError(null);
    try {
      const tk = await shareApi.unlock(code, accessCode);
      setTicket(tk);
      setPhase('unlocked');
      if (info) void loadPreview(code, tk, info);
    } catch (e) {
      const err = toShareError(e, 'SHARE_ACCESS_CODE_INVALID', '提取码错误');
      if (err.code === 'SHARE_UNLOCK_TOO_MANY_ATTEMPTS'
        || err.code === 'SHARE_LINK_EXPIRED'
        || err.code === 'SHARE_LINK_REVOKED'
        || err.code === 'SHARE_LINK_EXHAUSTED') {
        setInvalid(err);
        setPhase('invalid');
      } else {
        setUnlockError(err.message);
        setAccessCode('');
      }
    } finally {
      setUnlocking(false);
    }
  }, [accessCode, code, info, loadPreview, unlocking]);

  const handleDownload = useCallback(async () => {
    if (!ticket || downloading) return;
    setDownloading(true);
    try {
      const { blob, filename } = await shareApi.download(code, ticket);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      const err = toShareError(e, 'SHARE_ACCESS_TICKET_INVALID', '下载失败');
      setInvalid(err);
      setPhase('invalid');
    } finally {
      setDownloading(false);
    }
  }, [code, downloading, ticket]);

  const renderInvalid = () => {
    const preset = INVALID_TEXT[invalid?.code ?? ''] ?? FALLBACK_INVALID;
    return (
      <div className="share-card share-card--state">
        <div className="share-state-art">{preset.icon}</div>
        <div className="share-state-title">{preset.title}</div>
        <div className="share-state-hint">{invalid?.message || preset.hint}</div>
        <div className="share-state-actions">
          <Link to="/login">
            <Button type="primary" ghost>前往登录</Button>
          </Link>
        </div>
      </div>
    );
  };

  const renderLocked = () => {
    if (!info) return null;
    const expiryText = describeExpiry(info.expiresAt);
    return (
      <div className="share-card">
        <div className="share-file-head">
          <span className={`share-file-icon share-file-icon--${getFileCategory(info.mimeType, info.fileName)}`}>
            {getFileIcon(info.mimeType, undefined, info.fileName)}
          </span>
          <div className="share-file-meta">
            <div className="share-file-name" title={info.fileName}>{info.fileName}</div>
            <div className="share-file-sub">{formatSize(info.sizeBytes)} · {info.mimeType || '未知类型'}</div>
          </div>
        </div>

        <div className="share-file-footnote">
          {info.ownerName ? <>由 <b>{info.ownerName}</b> 分享 · </> : null}
          {expiryText}
        </div>

        <div className="share-divider" />

        <div className="share-code-label">请输入分享者提供的提取码</div>
        <AccessCodeInput
          length={4}
          value={accessCode}
          onChange={(v) => { setAccessCode(v); setUnlockError(null); }}
          onSubmit={handleUnlock}
          disabled={unlocking}
          error={!!unlockError}
        />
        {unlockError && <div className="share-code-error">{unlockError}</div>}

        <Button
          type="primary"
          block
          size="large"
          className="share-submit-btn"
          loading={unlocking}
          disabled={accessCode.length < 4}
          onClick={handleUnlock}
        >
          提取文件
        </Button>
        <div className="share-tip">提取码由分享者提供，无需登录即可查看</div>
      </div>
    );
  };

  const renderUnlocked = () => {
    if (!info) return null;
    return (
      <div className="share-card share-card--preview">
        <div className="share-preview-bar">
          <div className="share-preview-title">
            {getFileIcon(info.mimeType, 'share-preview-title-icon', info.fileName)}
            <span className="share-preview-name" title={info.fileName}>{info.fileName}</span>
            <span className="share-preview-size">{formatSize(info.sizeBytes)}</span>
          </div>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            loading={downloading}
            onClick={handleDownload}
          >
            下载
          </Button>
        </div>
        <div className="share-preview-body">
          <FilePreviewer
            fileName={info.fileName}
            mimeType={info.mimeType}
            objectUrl={previewObjectUrl}
            text={previewText}
            loading={previewLoading}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="share-page">
      <header className="share-topbar">
        <div className="share-brand">
          <img src="/brand-logo.svg" alt="" className="share-brand-logo" />
          <span className="share-brand-name">阿渺工具箱</span>
        </div>
        <Link to="/login" className="share-topbar-link">登录</Link>
      </header>

      <main className="share-main">
        {phase === 'loading' && (
          <div className="share-card share-card--state">
            <Spin size="large" />
            <div className="share-state-hint">正在加载分享信息…</div>
          </div>
        )}
        {phase === 'invalid' && renderInvalid()}
        {phase === 'locked' && renderLocked()}
        {phase === 'unlocked' && renderUnlocked()}
      </main>

      <footer className="share-footer">文件由用户自行分享，请谨慎甄别内容来源</footer>
    </div>
  );
};

export default ShareAccessPage;
