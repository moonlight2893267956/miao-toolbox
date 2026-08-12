import React, { useState, useEffect, useCallback } from 'react';
import {
  Button, Space, Select, message, Popconfirm, Empty, Spin,
} from 'antd';
import {
  BellOutlined, DeleteOutlined, CheckOutlined, InfoCircleOutlined,
  ToolOutlined, SafetyCertificateOutlined, UserOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../../contexts/NotificationContext';
import type { MessageResponse } from '../../services/notificationService';
import PageFadeIn from '../../components/shared/PageFadeIn';
import './MessagesPage.css';

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  SYSTEM:       { label: '系统', color: '#2D6BD6', bg: 'rgba(45, 107, 214, 0.10)',  icon: <InfoCircleOutlined /> },
  TOOL:         { label: '工具', color: '#36B37E', bg: 'rgba(54, 179, 126, 0.12)',   icon: <ToolOutlined /> },
  SECURITY:     { label: '安全', color: '#C2362F', bg: 'rgba(255, 77, 79, 0.10)',    icon: <SafetyCertificateOutlined /> },
  ACCOUNT:      { label: '账户', color: '#E58A00', bg: 'rgba(245, 158, 11, 0.12)',   icon: <UserOutlined /> },
  ANNOUNCEMENT: { label: '公告', color: '#7C3AED', bg: 'rgba(124, 58, 237, 0.10)',   icon: <BellOutlined /> },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  URGENT: { label: '紧急', color: '#C2362F', bg: 'rgba(255, 77, 79, 0.10)' },
  HIGH:   { label: '重要', color: '#E58A00', bg: 'rgba(245, 158, 11, 0.12)' },
  NORMAL: { label: '', color: '', bg: '' },
  LOW:    { label: '', color: '', bg: '' },
};

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

const MessagesPage: React.FC = () => {
  const navigate = useNavigate();
  const { loadMessages, markAllAsRead, dismissMessage, dismissMessages, unreadCount } = useNotification();

  const [messages, setMessages] = useState<MessageResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [readFilter, setReadFilter] = useState<string | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const fetchMessages = useCallback(async (p: number, type?: string, readStatus?: string) => {
    setLoading(true);
    try {
      const result = await loadMessages({ page: p, pageSize, type, readStatus });
      setMessages(result.items);
      setTotal(result.total);
      setPage(p);
    } catch {
      message.error('加载消息失败');
    } finally {
      setLoading(false);
    }
  }, [loadMessages, pageSize]);

  // 首次加载 & 筛选变化时刷新
  useEffect(() => {
    fetchMessages(1, typeFilter, readFilter);
    setSelectedIds(new Set());
  }, [fetchMessages, typeFilter, readFilter]);

  const handleViewDetail = useCallback((msg: MessageResponse) => {
    navigate(`/messages/${msg.id}`);
  }, [navigate]);

  const handleDismiss = useCallback(async (msgId: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await dismissMessage(msgId);
      message.success('已删除');
      // 乐观更新：本地立即减少计数
      setTotal(prev => Math.max(0, prev - 1));
      setMessages(prev => prev.filter(m => m.id !== msgId));
      // 后台刷新确认
      fetchMessages(page, typeFilter, readFilter);
    } catch {
      message.error('删除失败');
    }
  }, [dismissMessage, fetchMessages, page, typeFilter, readFilter]);

  const handleBatchDismiss = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    try {
      await dismissMessages(Array.from(selectedIds));
      message.success(`已删除 ${count} 条消息`);
      // 乐观更新
      setTotal(prev => Math.max(0, prev - count));
      setMessages(prev => prev.filter(m => !selectedIds.has(m.id)));
      setSelectedIds(new Set());
      // 后台刷新确认
      fetchMessages(page, typeFilter, readFilter);
    } catch {
      message.error('批量删除失败');
    }
  }, [dismissMessages, selectedIds, fetchMessages, page, typeFilter, readFilter]);

  const handleMarkAllRead = useCallback(async () => {
    try {
      await markAllAsRead();
      message.success('已全部标记为已读');
      fetchMessages(page, typeFilter, readFilter);
    } catch {
      message.error('操作失败');
    }
  }, [markAllAsRead, fetchMessages, page, typeFilter, readFilter]);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <PageFadeIn>
      <div className="msg-page">
        {/* 头部 */}
        <div className="msg-page-header">
          <div className="msg-page-header-left">
            <BellOutlined style={{ fontSize: 18 }} />
            <h2>消息中心</h2>
            {total > 0 && <span className="msg-page-total">{total} 条</span>}
          </div>
          <Space>
            <Select
              placeholder="消息类型"
              allowClear
              style={{ width: 120 }}
              value={typeFilter ?? undefined}
              onChange={(v) => setTypeFilter(v ?? undefined)}
              options={Object.entries(TYPE_CONFIG).map(([key, cfg]) => ({ label: cfg.label, value: key }))}
            />
            <Select
              placeholder="已读状态"
              allowClear
              style={{ width: 120 }}
              value={readFilter ?? undefined}
              onChange={(v) => setReadFilter(v ?? undefined)}
              options={[
                { label: '未读', value: 'unread' },
                { label: '已读', value: 'read' },
              ]}
            />
            {unreadCount > 0 && (
              <Button onClick={handleMarkAllRead} icon={<CheckOutlined />}>全部已读</Button>
            )}
            {selectedIds.size > 0 && (
              <Popconfirm title={`确定删除选中的 ${selectedIds.size} 条消息？`} onConfirm={handleBatchDismiss}>
                <Button danger icon={<DeleteOutlined />}>批量删除 ({selectedIds.size})</Button>
              </Popconfirm>
            )}
          </Space>
        </div>

        {/* 消息列表 */}
        {loading ? (
          <div className="msg-page-loading"><Spin /></div>
        ) : messages.length === 0 ? (
          <Empty description="暂无消息" image={Empty.PRESENTED_IMAGE_SIMPLE} className="msg-page-empty" />
        ) : (
          <div className="msg-list">
            {messages.map(msg => {
              const typeCfg = TYPE_CONFIG[msg.type] || TYPE_CONFIG.SYSTEM;
              const priorityCfg = PRIORITY_CONFIG[msg.priority];
              const isUrgent = msg.priority === 'URGENT';
              const isSelected = selectedIds.has(msg.id);

              return (
                <div
                  key={msg.id}
                  className={`msg-item${msg.read ? ' read' : ''}${isSelected ? ' selected' : ''}`}
                  onClick={() => handleViewDetail(msg)}
                >
                  {/* 左侧色条 */}
                  {isUrgent && <div className="msg-item-accent" style={{ background: '#ff4d4f' }} />}

                  {/* 选择框 */}
                  <div className="msg-item-check" onClick={(e) => { e.stopPropagation(); toggleSelect(msg.id); }}>
                    <div className={`msg-item-checkbox${isSelected ? ' checked' : ''}`} />
                  </div>

                  {/* 类型图标 */}
                  <div className="msg-item-icon" style={{ background: typeCfg.bg, color: typeCfg.color }}>
                    {typeCfg.icon}
                  </div>

                  {/* 内容 */}
                  <div className="msg-item-body">
                    <div className="msg-item-head">
                      <span className="msg-item-title">
                        {priorityCfg.color && (
                          <ExclamationCircleOutlined style={{ color: priorityCfg.color, marginRight: 4, fontSize: 12 }} />
                        )}
                        {msg.title}
                      </span>
                      {!msg.read && <span className="msg-item-unread-dot" />}
                    </div>
                    {msg.summary && (
                      <div className="msg-item-summary">{msg.summary}</div>
                    )}
                    <div className="msg-item-foot">
                      <span className="msg-item-type" style={{ color: typeCfg.color }}>{typeCfg.label}</span>
                      <span className="msg-item-time">{formatTime(msg.createdAt)}</span>
                    </div>
                  </div>

                  {/* 删除 */}
                  <Popconfirm title="确定删除该消息？" onConfirm={(e) => handleDismiss(msg.id, e as unknown as React.MouseEvent)} okText="删除" cancelText="取消">
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      className="msg-item-delete"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </Popconfirm>
                </div>
              );
            })}
          </div>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="msg-page-pagination">
            <Button size="small" disabled={page <= 1} onClick={() => fetchMessages(page - 1, typeFilter, readFilter)}>
              上一页
            </Button>
            <span className="msg-page-page-info">第 {page} 页 / 共 {totalPages} 页 · {total} 条</span>
            <Button size="small" disabled={page >= totalPages} onClick={() => fetchMessages(page + 1, typeFilter, readFilter)}>
              下一页
            </Button>
          </div>
        )}
      </div>
    </PageFadeIn>
  );
};

export default MessagesPage;
