import React, { useState, useEffect, useCallback } from 'react';
import { Button, message, Skeleton, Table, Tag, Drawer, Popconfirm, Tooltip } from 'antd';
import {
  ReloadOutlined,
  DatabaseOutlined,
  FileOutlined,
  TeamOutlined,
  CloudServerOutlined,
  DeleteOutlined,
  FolderOutlined,
  FileTextOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  FileZipOutlined,
  FileExcelOutlined,
  VideoCameraOutlined,
  AudioOutlined,
  CodeOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  getStorageOverview,
  getAdminUserFiles,
  deleteAdminUserFile,
  type StorageOverview,
  type UserStorageInfo,
  type AdminFileInfo,
} from '../../services/adminService';
import PageFadeIn from '../../components/shared/PageFadeIn';
import AdminPageHeader from './components/AdminPageHeader';
import AdminStatCard from './components/AdminStatCard';
import EmptyState from './components/EmptyState';
import './components/admin.css';

/** MIME 类型短名映射：将常见冗长 MIME 缩为友好短标签 */
function shortMime(mime: string): string {
  if (!mime) return '?';
  const map: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/zip': 'ZIP',
    'application/x-rar-compressed': 'RAR',
    'application/x-7z-compressed': '7Z',
    'application/x-tar': 'TAR',
    'application/gzip': 'GZ',
    'application/json': 'JSON',
    'application/xml': 'XML',
    'application/octet-stream': 'BIN',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word (docx)',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel (xlsx)',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPT (pptx)',
    'application/msword': 'Word (doc)',
    'application/vnd.ms-excel': 'Excel (xls)',
    'application/vnd.ms-powerpoint': 'PPT (ppt)',
    'text/plain': 'TXT',
    'text/html': 'HTML',
    'text/css': 'CSS',
    'text/javascript': 'JS',
    'text/csv': 'CSV',
    'text/markdown': 'MD',
    'text/xml': 'XML',
    'text/x-shellscript': 'Shell',
    'text/x-python': 'Python',
  };
  return map[mime] ?? mime;
}

/** 格式化字节数为人类可读 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** 根据文件名生成图标（含彩色底） */
function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';

  let kind = 'generic';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) kind = 'image';
  else if (['pdf'].includes(ext)) kind = 'pdf';
  else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) kind = 'zip';
  else if (['xls', 'xlsx', 'csv'].includes(ext)) kind = 'xls';
  else if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) kind = 'video';
  else if (['mp3', 'wav', 'flac', 'ogg', 'm4a'].includes(ext)) kind = 'audio';
  else if (['txt', 'md', 'json', 'yml', 'yaml', 'xml', 'log'].includes(ext)) kind = 'code';
  else if (['doc', 'docx'].includes(ext)) kind = 'doc';

  const iconMap: Record<string, React.ReactNode> = {
    image: <FileImageOutlined />,
    pdf: <FilePdfOutlined />,
    zip: <FileZipOutlined />,
    xls: <FileExcelOutlined />,
    video: <VideoCameraOutlined />,
    audio: <AudioOutlined />,
    code: <CodeOutlined />,
    doc: <FileTextOutlined />,
    generic: <FileOutlined />,
  };

  const colorMap: Record<string, string> = {
    image: '#722ED1',
    pdf: '#C2362F',
    zip: '#D97020',
    xls: '#36B37E',
    video: '#1677FF',
    audio: '#B37FEB',
    code: '#1677FF',
    doc: '#2D6BD6',
    generic: 'var(--miao-text-tertiary)',
  };

  const color = colorMap[kind];
  return (
    <span className="miao-storage-file-icon" style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
      {iconMap[kind]}
    </span>
  );
}

const MIME_TYPE_LABELS: Record<string, string> = {
  image: '图片',
  text: '文本',
  video: '视频',
  audio: '音频',
  other: '其他',
};

/** 类型分布配色 */
const TYPE_COLORS: Record<string, string> = {
  image: '#722ED1',
  text: '#1677FF',
  video: '#C2362F',
  audio: '#D97020',
  other: '#8C8C9E',
};

/** 用量横条颜色：随百分比升温 */
function usageColor(pct: number): string {
  if (pct > 90) return '#C2362F';
  if (pct > 70) return '#D97020';
  return '#5C4FD0';
}

const StorageManagePage: React.FC = () => {
  const [data, setData] = useState<StorageOverview | null>(null);
  const [loading, setLoading] = useState(false);

  // 用户文件 Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerUser, setDrawerUser] = useState<UserStorageInfo | null>(null);
  const [userFiles, setUserFiles] = useState<AdminFileInfo[]>([]);
  const [userFilesTotal, setUserFilesTotal] = useState(0);
  const [userFilesPage, setUserFilesPage] = useState(1);
  const [userFilesLoading, setUserFilesLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await getStorageOverview();
      setData(res);
    } catch {
      message.error('加载存储概览失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await getStorageOverview();
        if (!cancelled) setData(res);
      } catch {
        if (!cancelled) message.error('加载存储概览失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fetchUserFiles = useCallback(async (userId: number, page = 0) => {
    setUserFilesLoading(true);
    try {
      const res = await getAdminUserFiles(userId, undefined, page, 20);
      setUserFiles(res.items);
      setUserFilesTotal(res.total);
      setUserFilesPage(page);
    } catch {
      message.error('加载用户文件失败');
    } finally {
      setUserFilesLoading(false);
    }
  }, []);

  const openUserFiles = (user: UserStorageInfo) => {
    setDrawerUser(user);
    setDrawerOpen(true);
    fetchUserFiles(user.userId);
  };

  const handleDeleteFile = async (fileId: number) => {
    if (!drawerUser) return;
    try {
      await deleteAdminUserFile(drawerUser.userId, fileId);
      message.success('文件已删除');
      fetchUserFiles(drawerUser.userId, userFilesPage);
      fetchData(); // 刷新概览
    } catch {
      message.error('删除文件失败');
    }
  };

  if (loading && !data) {
    return (
      <div style={{ padding: 32 }}>
        <Skeleton active paragraph={{ rows: 1 }} style={{ marginBottom: 32 }} />
        <div className="miao-admin-stat-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="miao-admin-stat-card">
              <Skeleton active paragraph={{ rows: 2 }} />
            </div>
          ))}
        </div>
        <Skeleton active paragraph={{ rows: 6 }} style={{ marginTop: 24 }} />
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: 32 }}>
        <EmptyState
          icon={<DatabaseOutlined />}
          title="暂无数据"
          description="无法加载存储概览，请稍后重试"
          action={<Button onClick={fetchData}>重新加载</Button>}
        />
      </div>
    );
  }

  // 总配额 = 所有用户配额之和；配额为 0 视为未配置，展示 0%
  const totalQuota = data.users.reduce((sum, u) => sum + (u.quotaBytes || 0), 0);
  const quotaPct = totalQuota > 0 ? Math.min((data.totalBytes / totalQuota) * 100, 100) : 0;

  const maxUsed = Math.max(...data.users.map((u) => u.usedBytes), 1);

  /** 类型分布堆叠数据 */
  const typeTotal = data.typeDistribution.reduce((s, t) => s + t.count, 0);
  const typeSegs = data.typeDistribution.map((t) => ({
    ...t,
    pct: typeTotal > 0 ? (t.count / typeTotal) * 100 : 0,
    color: TYPE_COLORS[t.type] || TYPE_COLORS.other,
  }));

  const fileColumns = [
    {
      title: '文件名',
      dataIndex: 'fileName',
      key: 'fileName',
      ellipsis: true,
      render: (name: string) => (
        <Tooltip title={name} placement="topLeft">
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {getFileIcon(name)}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
          </span>
        </Tooltip>
      ),
    },
    {
      title: '路径',
      dataIndex: 'path',
      key: 'path',
      width: 120,
      ellipsis: true,
      render: (path: string) => (
        <Tooltip title={path === '/' || path === '' ? '根目录' : path} placement="topLeft">
          <span style={{ color: 'var(--miao-text-secondary)', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: 110 }}>
            <FolderOutlined style={{ opacity: 0.7, flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {path === '/' || path === '' ? '根目录' : path}
            </span>
          </span>
        </Tooltip>
      ),
    },
    {
      title: '大小',
      dataIndex: 'sizeBytes',
      key: 'sizeBytes',
      width: 90,
      render: (v: number) => <span style={{ fontFamily: 'var(--miao-font-mono)', fontSize: 12 }}>{formatBytes(v)}</span>,
    },
    {
      title: '类型',
      dataIndex: 'mimeType',
      key: 'mimeType',
      width: 140,
      render: (mime: string) => (
        <Tooltip title={mime} placement="topLeft">
          <Tag style={{ fontSize: 11, borderRadius: 6, maxWidth: 128, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {shortMime(mime)}
          </Tag>
        </Tooltip>
      ),
    },
    {
      title: '上传时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 140,
      render: (v: string) => <span style={{ fontSize: 12, color: 'var(--miao-text-secondary)' }}>{v}</span>,
    },
    {
      title: '操作',
      key: 'action',
      width: 56,
      render: (_: unknown, record: AdminFileInfo) => (
        <Popconfirm
          title="确认删除此文件？"
          description="删除后不可恢复"
          onConfirm={() => handleDeleteFile(record.id)}
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
        >
          <Button type="text" danger size="small" icon={<DeleteOutlined />} aria-label={`删除 ${record.fileName}`} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <PageFadeIn>
      <div style={{ padding: 32 }}>
        <AdminPageHeader
          eyebrow="管理 · 存储"
          title={<>存储概览 <em>·</em> <em>资源分布</em></>}
          description="全局存储用量、用户配额使用排行与文件类型分布。"
          actions={
            <Button
              icon={<ReloadOutlined />}
              onClick={fetchData}
              loading={loading}
              className="miao-admin-btn-ghost"
            >
              刷新
            </Button>
          }
        />

        {/* 概览卡片 */}
        <div className="miao-admin-stat-grid--users">
          <AdminStatCard
            label="全局总用量"
            value={formatBytes(data.totalBytes)}
            icon={<CloudServerOutlined />}
            iconVariant="primary"
            feature
            ringPercent={quotaPct}
            ringColor={quotaPct > 90 ? '#C2362F' : quotaPct > 70 ? '#D97020' : undefined}
            ariaLabel={`全局总用量: ${formatBytes(data.totalBytes)}`}
          />
          <AdminStatCard
            label="文件总数"
            value={data.totalFiles}
            suffix="个"
            icon={<FileOutlined />}
            iconVariant="blue"
            barPercent={totalQuota > 0 ? Math.min((data.totalBytes / totalQuota) * 100, 100) : 0}
            barColor="var(--miao-indigo)"
            trend={{ direction: 'neutral', text: `配额总量 ${formatBytes(totalQuota)}` }}
            ariaLabel={`文件总数: ${data.totalFiles}`}
          />
          <AdminStatCard
            label="用户数"
            value={data.userCount}
            suffix="人"
            icon={<TeamOutlined />}
            iconVariant="green"
            barPercent={data.userCount > 0 ? Math.min((data.users.filter((u) => u.usedBytes > 0).length / data.userCount) * 100, 100) : 0}
            barColor="var(--miao-teal)"
            trend={{ direction: 'neutral', text: `${data.users.filter((u) => u.usedBytes > 0).length} 人已使用存储` }}
            ariaLabel={`用户数: ${data.userCount}`}
          />
        </div>

        {/* 中部双栏：用户用量排行 + 文件类型分布 */}
        <div className="miao-storage-split">
          {/* 用户用量排行 */}
          <div className="miao-admin-panel">
            <div className="miao-admin-panel-head">
              <div>
                <h3 className="miao-admin-panel-title">用户存储用量排行</h3>
                <div className="miao-admin-panel-sub">按已用空间降序 · 点击行查看文件</div>
              </div>
            </div>
            <div className="miao-storage-rank">
              {data.users.map((u, idx) => {
                const pct = u.quotaBytes > 0 ? Math.min((u.usedBytes / u.quotaBytes) * 100, 100) : 0;
                const barW = maxUsed > 0 ? (u.usedBytes / maxUsed) * 100 : 0;
                const isTop = idx < 3;
                return (
                  <div key={u.userId} className="miao-storage-rank-row" onClick={() => openUserFiles(u)}>
                    <span className={`miao-storage-rank-no ${isTop ? 'miao-storage-rank-no--top' : ''}`}>
                      {idx + 1}
                    </span>
                    <span className="miao-storage-rank-name" title={u.username}>{u.username}</span>
                    <div className="miao-storage-rank-track-wrap">
                      <div className="miao-storage-rank-track">
                        <div
                          className="miao-storage-rank-fill"
                          style={{ width: `${Math.max(barW, 2)}%`, background: usageColor(pct) }}
                        />
                      </div>
                    </div>
                    <div className="miao-storage-rank-meta">
                      <div className="miao-storage-rank-used">{formatBytes(u.usedBytes)}</div>
                      <div className="miao-storage-rank-quota">
                        / {formatBytes(u.quotaBytes)}{u.quotaBytes > 0 ? ` · ${pct.toFixed(0)}%` : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
              {data.users.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--miao-text-tertiary)', padding: '24px 0', fontSize: 13 }}>
                  暂无用户
                </div>
              )}
            </div>
          </div>

          {/* 文件类型分布 */}
          <div className="miao-admin-panel">
            <div className="miao-admin-panel-head">
              <div>
                <h3 className="miao-admin-panel-title">文件类型分布</h3>
                <div className="miao-admin-panel-sub">按 MIME 前缀分组</div>
              </div>
            </div>
            {typeSegs.length > 0 ? (
              <div className="miao-storage-types">
                <div className="miao-storage-type-stack">
                  {typeSegs.map((t) => (
                    <div
                      key={t.type}
                      className="miao-storage-type-seg"
                      style={{ width: `${t.pct}%`, background: t.color }}
                      title={`${MIME_TYPE_LABELS[t.type] || t.type} ${t.count} 个`}
                    />
                  ))}
                </div>
                {typeSegs.map((t) => (
                  <div key={t.type} className="miao-storage-type-row">
                    <span className="miao-storage-type-dot" style={{ background: t.color }} />
                    <span className="miao-storage-type-label">{MIME_TYPE_LABELS[t.type] || t.type}</span>
                    <span className="miao-storage-type-count">{t.count.toLocaleString()} 个</span>
                    <span className="miao-storage-type-size">{formatBytes(t.totalBytes)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--miao-text-tertiary)', padding: '24px 0', fontSize: 13 }}>
                暂无文件
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 用户文件 Drawer */}
      <Drawer
        title={`${drawerUser?.username ?? ''} 的文件`}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={760}
        styles={{ body: { padding: 0 } }}
      >
        {drawerUser && (
          <>
            <div className="miao-storage-drawer-head">
              <span className="miao-storage-drawer-avatar"><UserOutlined /></span>
              <div style={{ minWidth: 0 }}>
                <div className="miao-storage-drawer-name">{drawerUser.username}</div>
                <div className="miao-storage-drawer-meta">
                  已用 <span className="mono">{formatBytes(drawerUser.usedBytes)}</span>
                  {' '}· 配额 <span className="mono">{formatBytes(drawerUser.quotaBytes)}</span>
                  {drawerUser.quotaBytes > 0 && (
                    <> · 占用 <span className="mono">{drawerUser.percentage.toFixed(1)}%</span></>
                  )}
                </div>
              </div>
            </div>
            <Table
              dataSource={userFiles}
              columns={fileColumns}
              rowKey="id"
              size="small"
              loading={userFilesLoading}
              locale={{ emptyText: '该用户暂无文件' }}
              pagination={{
                current: userFilesPage + 1,
                total: userFilesTotal,
                pageSize: 20,
                size: 'small',
                showTotal: (t) => `共 ${t} 个文件`,
                onChange: (p) => fetchUserFiles(drawerUser.userId, p - 1),
              }}
              style={{ padding: '0 16px' }}
            />
          </>
        )}
      </Drawer>
    </PageFadeIn>
  );
};

export default StorageManagePage;
