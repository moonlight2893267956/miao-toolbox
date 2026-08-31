import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Popconfirm, Table, Tag, Tooltip, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckOutlined, CopyOutlined, ReloadOutlined } from '@ant-design/icons';
import { fileStorageApi } from './fileStorageApi';
import { getFileIcon } from './FileIcon';
import type { ShareLinkInfo } from './types';

const STATUS_META: Record<ShareLinkInfo['status'], { text: string; color: string }> = {
  ACTIVE: { text: '生效中', color: 'green' },
  EXPIRED: { text: '已过期', color: 'default' },
  EXHAUSTED: { text: '已用尽', color: 'orange' },
  REVOKED: { text: '已取消', color: 'red' },
};

/** 把过期时间格式化为「x 天后失效」 */
function describeExpiry(expiresAt: string | null, status: ShareLinkInfo['status']): string {
  if (status === 'REVOKED') return '—';
  if (!expiresAt) return '永久';
  const target = new Date(expiresAt.replace(/-/g, '/'));
  if (Number.isNaN(target.getTime())) return '永久';
  const diffMs = target.getTime() - Date.now();
  if (diffMs <= 0) return '已过期';
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 24) return `${hours} 小时后失效`;
  return `${Math.ceil(hours / 24)} 天后失效`;
}

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

  const columns: ColumnsType<ShareLinkInfo> = [
    {
      title: '文件',
      dataIndex: 'fileName',
      key: 'fileName',
      ellipsis: true,
      render: (_, record) => (
        <div className="fs-sharelink-file">
          {getFileIcon(record.mimeType, 'fs-sharelink-file-icon', record.fileName)}
          <span title={record.fileName}>{record.fileName}</span>
        </div>
      ),
    },
    {
      title: '链接',
      dataIndex: 'shareUrl',
      key: 'shareUrl',
      width: 260,
      render: (_, record) => (
        <div className="fs-sharelink-url-row">
          <code className="fs-sharelink-url" title={record.shareUrl}>{record.shareUrl}</code>
          <Button
            type="text"
            size="small"
            icon={copiedId === record.id ? <CheckOutlined /> : <CopyOutlined />}
            className={copiedId === record.id ? 'fs-copy-btn is-copied' : 'fs-copy-btn'}
            onClick={() => handleCopy(record)}
          />
        </div>
      ),
    },
    {
      title: '提取码',
      key: 'accessCode',
      width: 120,
      render: () => (
        <Tooltip title="提取码加密存储，仅在创建时显示一次">
          <span className="fs-sharelink-code-mask">••••</span>
        </Tooltip>
      ),
    },
    {
      title: '有效期',
      key: 'expiresAt',
      width: 140,
      render: (_, record) => (
        <span className="fs-sharelink-muted">{describeExpiry(record.expiresAt, record.status)}</span>
      ),
    },
    {
      title: '访问情况',
      key: 'visits',
      width: 110,
      render: (_, record) => (
        <span className="fs-sharelink-muted">
          {record.visitCount} / {record.maxVisits ?? '不限'}
        </span>
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 96,
      render: (_, record) => (
        <Tag color={STATUS_META[record.status]?.color}>{STATUS_META[record.status]?.text ?? record.status}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => (
        record.status === 'ACTIVE' || record.status === 'EXHAUSTED' || record.status === 'EXPIRED' ? (
          <Popconfirm
            title="取消这条分享？"
            description="取消后链接立即失效，已拿到链接的人将无法访问。"
            okText="取消分享"
            cancelText="暂不"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleRevoke(record)}
          >
            <Button type="text" size="small" danger>取消分享</Button>
          </Popconfirm>
        ) : (
          <span className="fs-sharelink-muted">—</span>
        )
      ),
    },
  ];

  return (
    <div className="fs-sharelinks">
      <div className="fs-sharelinks-bar">
        <span className="fs-sharelinks-stat">
          生效中 <b>{activeCount}</b> 条 · 累计访问 <b>{totalVisits}</b> 次
        </span>
        <Button
          size="small"
          icon={<ReloadOutlined />}
          loading={loading}
          onClick={() => void load()}
        >
          刷新
        </Button>
      </div>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={links}
        pagination={false}
        locale={{ emptyText: '还没有创建过分享链接' }}
        scroll={{ x: 900 }}
      />
    </div>
  );
};

export default MyShareLinksView;
