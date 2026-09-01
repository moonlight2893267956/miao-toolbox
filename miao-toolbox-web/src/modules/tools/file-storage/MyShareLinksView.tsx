import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Popconfirm, Tag, Tooltip, message } from 'antd';
import { CheckOutlined, CopyOutlined, LinkOutlined, ReloadOutlined } from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { fileStorageApi } from './fileStorageApi';
import { getFileIcon } from './FileIcon';
import { formatSize } from './fileCategory';
import type { ShareLinkInfo } from './types';

const STATUS_META: Record<ShareLinkInfo['status'], { text: string; color: string; stamp: string }> = {
  ACTIVE: { text: '生效中', color: 'green', stamp: 'ACTIVE' },
  EXPIRED: { text: '已过期', color: 'default', stamp: 'EXPIRED' },
  EXHAUSTED: { text: '已用尽', color: 'orange', stamp: 'EXHAUSTED' },
  REVOKED: { text: '已取消', color: 'red', stamp: 'REVOKED' },
};

/** 把过期时间格式化为「x 天后失效」 */
function describeExpiry(expiresAt: string | null, status: ShareLinkInfo['status']): string {
  if (status === 'REVOKED') return '—';
  if (!expiresAt) return '永久有效';
  const target = new Date(expiresAt.replace(/-/g, '/'));
  if (Number.isNaN(target.getTime())) return '永久有效';
  const diffMs = target.getTime() - Date.now();
  if (diffMs <= 0) return '已过期';
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return '即将失效';
  if (hours < 24) return `${hours} 小时后失效`;
  return `${Math.ceil(hours / 24)} 天后失效`;
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 260, damping: 22 },
  },
};

const MyShareLinksView: React.FC = () => {
  const [links, setLinks] = useState<ShareLinkInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const initialLoadDone = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLinks(await fileStorageApi.listShareLinks());
    } catch {
      message.error('加载我的分享失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopy = async (link: ShareLinkInfo) => {
    const url = `${window.location.origin}${link.shareUrl}`;
    try {
      await navigator.clipboard.writeText(url);
      message.success('链接已复制');
      setCopiedId(link.id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      message.error('复制失败，请手动选择复制');
    }
  };

  const handleRevoke = async (link: ShareLinkInfo) => {
    try {
      await fileStorageApi.revokeShareLink(link.id);
      message.success('分享已取消');
      void load();
    } catch {
      message.error('取消分享失败');
    }
  };

  const activeCount = links.filter(l => l.status === 'ACTIVE').length;
  const totalVisits = links.reduce((sum, l) => sum + (l.visitCount ?? 0), 0);

  return (
    <div className="fs-sharelinks">
      <header className="fs-sharelinks-header">
        <div>
          <h2 className="fs-sharelinks-title">我的分享</h2>
          <p className="fs-sharelinks-subtitle">
            生效中 <b>{activeCount}</b> 条 · 累计访问 <b>{totalVisits}</b> 次
          </p>
        </div>
        <Button
          className="fs-sharelinks-refresh"
          icon={<ReloadOutlined />}
          loading={loading}
          onClick={() => void load()}
        >
          刷新
        </Button>
      </header>

      {links.length === 0 && !loading ? (
        <div className="fs-sharelinks-empty">
          <div className="fs-sharelinks-empty-art">
            <LinkOutlined />
          </div>
          <h3 className="fs-sharelinks-empty-title">还没有创建过分享链接</h3>
          <p className="fs-sharelinks-empty-hint">
            在文件列表中选中文件，点击「分享」即可生成外链。
          </p>
        </div>
      ) : (
        <motion.ul
          className="fs-sharelinks-list"
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          <AnimatePresence mode="popLayout">
            {links.map(link => {
              const status = STATUS_META[link.status];
              const isCopied = copiedId === link.id;
              const canRevoke = link.status === 'ACTIVE' || link.status === 'EXHAUSTED' || link.status === 'EXPIRED';

              return (
                <motion.li
                  key={link.id}
                  className="fs-sharelink-card"
                  layout
                  variants={cardVariants}
                  whileHover={{ y: -3, boxShadow: '0 18px 44px rgba(26, 26, 62, 0.10)' }}
                >
                  <div className="fs-sharelink-card-accent" aria-hidden />

                  <div className="fs-sharelink-card-header">
                    <div className="fs-sharelink-card-file">
                      <div className="fs-sharelink-card-icon">
                        {getFileIcon(link.mimeType, 'fs-sharelink-card-icon-svg', link.fileName)}
                      </div>
                      <div className="fs-sharelink-card-file-meta">
                        <span className="fs-sharelink-card-name" title={link.fileName}>
                          {link.fileName}
                        </span>
                        <span className="fs-sharelink-card-size">
                          {formatSize(link.sizeBytes)} · {link.mimeType || '未知类型'}
                        </span>
                      </div>
                    </div>
                    <Tag
                      className={`fs-sharelink-card-status fs-sharelink-card-status--${link.status.toLowerCase()}`}
                    >
                      <span className="fs-sharelink-card-status-dot" />
                      {status.text}
                    </Tag>
                  </div>

                  <div className="fs-sharelink-card-divider" />

                  <div className="fs-sharelink-card-body">
                    <div className="fs-sharelink-field fs-sharelink-field--link">
                      <span className="fs-sharelink-field-label">分享链接</span>
                      <div className="fs-sharelink-url-row">
                        <code className="fs-sharelink-url" title={link.shareUrl}>
                          {window.location.origin}{link.shareUrl}
                        </code>
                        <Tooltip title={isCopied ? '已复制' : '复制链接'}>
                          <Button
                            type="text"
                            size="small"
                            className={`fs-sharelink-copy-btn${isCopied ? ' is-copied' : ''}`}
                            icon={isCopied ? <CheckOutlined /> : <CopyOutlined />}
                            onClick={() => handleCopy(link)}
                          />
                        </Tooltip>
                      </div>
                    </div>

                    <div className="fs-sharelink-field">
                      <span className="fs-sharelink-field-label">提取码</span>
                      <Tooltip title="提取码加密存储，仅在创建时显示一次">
                        <span className="fs-sharelink-code-mask">••••</span>
                      </Tooltip>
                    </div>

                    <div className="fs-sharelink-field">
                      <span className="fs-sharelink-field-label">有效期</span>
                      <span className="fs-sharelink-field-value">
                        {describeExpiry(link.expiresAt, link.status)}
                      </span>
                    </div>

                    <div className="fs-sharelink-field">
                      <span className="fs-sharelink-field-label">访问情况</span>
                      <span className="fs-sharelink-field-value">
                        {link.visitCount} <span className="fs-sharelink-field-sep">/</span> {link.maxVisits ?? '不限'}
                      </span>
                    </div>
                  </div>

                  <div className="fs-sharelink-card-footer">
                    {canRevoke ? (
                      <Popconfirm
                        title="取消这条分享？"
                        description="取消后链接立即失效，已拿到链接的人将无法访问。"
                        okText="取消分享"
                        cancelText="暂不"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => handleRevoke(link)}
                      >
                        <Button type="text" danger className="fs-sharelink-revoke-btn">
                          取消分享
                        </Button>
                      </Popconfirm>
                    ) : (
                      <span className="fs-sharelink-revoke-placeholder">—</span>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </motion.ul>
      )}

      {loading && links.length === 0 && (
        <div className="fs-sharelinks-skeleton">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="fs-sharelink-skeleton-card" />
          ))}
        </div>
      )}
    </div>
  );
};

export default MyShareLinksView;
