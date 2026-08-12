import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Spin, Empty, Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  BellOutlined,
  ArrowLeftOutlined,
  CloseOutlined,
  InfoCircleOutlined,
  ToolOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotification } from '../../contexts/NotificationContext';
import type { MessageResponse, MessageDetailResponse } from '../../services/notificationService';
import './NotificationPanel.css';

/** 消息类型配置 */
const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  SYSTEM:       { label: '系统', color: '#2D6BD6', bg: 'rgba(45, 107, 214, 0.10)',  icon: <InfoCircleOutlined /> },
  TOOL:         { label: '工具', color: '#36B37E', bg: 'rgba(54, 179, 126, 0.12)',   icon: <ToolOutlined /> },
  SECURITY:     { label: '安全', color: '#C2362F', bg: 'rgba(255, 77, 79, 0.10)',    icon: <SafetyCertificateOutlined /> },
  ACCOUNT:      { label: '账户', color: '#E58A00', bg: 'rgba(245, 158, 11, 0.12)',   icon: <UserOutlined /> },
  ANNOUNCEMENT: { label: '公告', color: '#7C3AED', bg: 'rgba(124, 58, 237, 0.10)',   icon: <BellOutlined /> },
};

/** 优先级标记 */
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

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
}

const NotificationPanel: React.FC<NotificationPanelProps> = ({ open, onClose }) => {
  const navigate = useNavigate();
  const {
    loadMessages, loadMessageDetail,
    markAsRead, markAllAsRead, unreadCount,
  } = useNotification();

  const [messages, setMessages] = useState<MessageResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [activeType, setActiveType] = useState<string | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [currentDetail, setCurrentDetail] = useState<MessageDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  const listRef = useRef<HTMLDivElement>(null);

  const pageSize = 10;

  // 加载消息列表
  const fetchMessages = useCallback(async (p: number, type?: string, silent?: boolean) => {
    if (!silent) setLoading(true);
    try {
      const result = await loadMessages({ page: p, pageSize, type });
      setMessages(result.items);
      setTotal(result.total);
      setPage(p);
      setTotalPages(Math.max(1, Math.ceil(result.total / pageSize)));
    } catch {
      // 静默
    } finally {
      if (!silent) setLoading(false);
    }
  }, [loadMessages, pageSize]);

  // Drawer 打开时定期刷新类型计数（感知外部删除等操作）
  useEffect(() => {
    if (!open) return;
    fetchTypeCounts();
    const timer = setInterval(fetchTypeCounts, 5000);
    return () => clearInterval(timer);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // 加载各类型消息总数
  const fetchTypeCounts = useCallback(async () => {
    try {
      const types = Object.keys(TYPE_CONFIG);
      const results = await Promise.all(
        types.map(async (type) => {
          const result = await loadMessages({ page: 1, pageSize: 1, type });
          return [type, result.total] as const;
        })
      );
      const counts: Record<string, number> = {};
      let allTotal = 0;
      for (const [type, count] of results) {
        counts[type] = count;
        allTotal += count;
      }
      counts._all = allTotal;
      setTypeCounts(counts);
    } catch {
      // 静默
    }
  }, [loadMessages]);

  // 打开时加载
  useEffect(() => {
    if (open) {
      setExpandedId(null);
      setCurrentDetail(null);
      fetchMessages(1, undefined);
      fetchTypeCounts();
    }
  }, [open, fetchMessages, fetchTypeCounts]);

  const handleTypeFilter = useCallback((type: string | undefined) => {
    setActiveType(type);
    setExpandedId(null);
    setCurrentDetail(null);
    fetchMessages(1, type);
  }, [fetchMessages]);

  const handlePageChange = useCallback((newPage: number) => {
    fetchMessages(newPage, activeType, true);
    listRef.current?.scrollTo(0, 0);
  }, [fetchMessages, activeType]);

  const handleMessageClick = useCallback(async (msg: MessageResponse) => {
    if (expandedId === msg.id) {
      setExpandedId(null);
      setCurrentDetail(null);
      return;
    }
    setExpandedId(msg.id);
    setDetailLoading(true);
    try {
      const detail = await loadMessageDetail(msg.id);
      setCurrentDetail(detail);
      if (!msg.read) {
        markAsRead(msg.id);
        // 同步更新本地列表状态
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, read: true } : m));
        // 同步更新详情状态
        setCurrentDetail(prev => prev ? { ...prev, read: true } : prev);
      }
    } catch {
      // 静默
    } finally {
      setDetailLoading(false);
    }
  }, [expandedId, loadMessageDetail, markAsRead]);

  const handleBackToList = useCallback(() => {
    setExpandedId(null);
    setCurrentDetail(null);
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    await markAllAsRead();
    // 同步更新本地列表状态
    setMessages(prev => prev.map(m => ({ ...m, read: true })));
  }, [markAllAsRead]);

  // ─── 详情视图 ───
  if (expandedId && currentDetail) {
    const typeCfg = TYPE_CONFIG[currentDetail.type] || TYPE_CONFIG.SYSTEM;
    const priorityCfg = PRIORITY_CONFIG[currentDetail.priority];
    const isUrgent = currentDetail.priority === 'URGENT';
    const isHigh = currentDetail.priority === 'HIGH';
    return (
      <div className="miao-notif-drawer-inner miao-notif-drawer-inner--detail">
        {/* 顶栏 */}
        <div className="miao-notif-topbar">
          <Button type="text" size="small" icon={<ArrowLeftOutlined />} onClick={handleBackToList} className="miao-notif-topbar-btn">
            返回
          </Button>
          <span className="miao-notif-topbar-title">消息详情</span>
          <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} className="miao-notif-topbar-btn" />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentDetail.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="miao-notif-detail-scroll"
          >
            {/* 顶部装饰线 */}
            <div
              className="miao-notif-detail-rail"
              style={{
                background: isUrgent
                  ? 'linear-gradient(90deg, #ff4d4f, #ff7875, #ff4d4f)'
                  : isHigh
                    ? 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)'
                    : `linear-gradient(90deg, ${typeCfg.color}, ${typeCfg.color}88)`,
              }}
            />

            {/* 信头 */}
            <div className="miao-notif-detail-letterhead">
              {/* 类型 + 优先级 标签行 */}
              <div className="miao-notif-detail-badges">
                <span className="miao-notif-detail-type-badge" style={{ color: typeCfg.color, background: typeCfg.bg }}>
                  {typeCfg.icon} {typeCfg.label}
                </span>
                {priorityCfg.color && (
                  <span className="miao-notif-detail-priority-badge" style={{ color: priorityCfg.color, background: priorityCfg.bg }}>
                    {isUrgent && <ExclamationCircleOutlined style={{ fontSize: 10 }} />}
                    {priorityCfg.label}
                  </span>
                )}
              </div>

              {/* 标题 */}
              <h2 className="miao-notif-detail-heading">{currentDetail.title}</h2>

              {/* 时间线 */}
              <div className="miao-notif-detail-timeline">
                <div className="miao-notif-detail-timeline-dot" style={{ background: typeCfg.color }} />
                <span className="miao-notif-detail-timeline-label">{formatTime(currentDetail.createdAt)}</span>
                {currentDetail.read && currentDetail.readAt && (
                  <>
                    <div className="miao-notif-detail-timeline-line" />
                    <div className="miao-notif-detail-timeline-dot miao-notif-detail-timeline-dot--read" />
                    <span className="miao-notif-detail-timeline-label miao-notif-detail-timeline-label--muted">
                      已读 {formatTime(currentDetail.readAt)}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* 分隔装饰 */}
            <div className="miao-notif-detail-ornament">
              <span className="miao-notif-detail-ornament-line" />
              <span className="miao-notif-detail-ornament-icon" style={{ color: typeCfg.color }}>{typeCfg.icon}</span>
              <span className="miao-notif-detail-ornament-line" />
            </div>

            {/* 正文 */}
            <div className="miao-notif-detail-prose">
              {currentDetail.content}
            </div>

            {/* 底部状态 */}
            <div className="miao-notif-detail-status">
              {!currentDetail.read ? (
                <div className="miao-notif-detail-status-unread">
                  <span className="miao-notif-detail-status-pulse" style={{ '--pulse-color': typeCfg.color } as React.CSSProperties} />
                  <span>未读消息</span>
                </div>
              ) : (
                <div className="miao-notif-detail-status-read">
                  <CheckCircleOutlined />
                  <span>已读</span>
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  // 详情加载中
  if (expandedId && detailLoading) {
    return (
      <div className="miao-notif-drawer-inner miao-notif-drawer-inner--detail">
        <div className="miao-notif-topbar">
          <Button type="text" size="small" icon={<ArrowLeftOutlined />} onClick={handleBackToList} className="miao-notif-topbar-btn">
            返回
          </Button>
          <span className="miao-notif-topbar-title">消息详情</span>
          <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} className="miao-notif-topbar-btn" />
        </div>
        <div className="miao-notif-detail-loading">
          <Spin />
        </div>
      </div>
    );
  }

  // ─── 列表视图 ───
  return (
    <div className="miao-notif-drawer-inner">
      {/* 顶栏 */}
      <div className="miao-notif-topbar">
        <div className="miao-notif-topbar-left">
          <BellOutlined style={{ fontSize: 16 }} />
          <span className="miao-notif-topbar-title">消息通知</span>
          {unreadCount > 0 && <span className="miao-notif-topbar-count">{unreadCount}</span>}
        </div>
        <div className="miao-notif-topbar-right">
          {total > 0 && (
            <Button type="text" size="small" onClick={handleMarkAllRead} className="miao-notif-topbar-btn">
              全部已读
            </Button>
          )}
          <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} className="miao-notif-topbar-btn" />
        </div>
      </div>

      {/* 类型筛选 */}
      <div className="miao-notif-filters">
        <span
          className={`miao-notif-filter-chip${!activeType ? ' active' : ''}`}
          onClick={() => handleTypeFilter(undefined)}
        >
          全部
          {typeCounts._all != null && <span className="miao-notif-chip-count">{typeCounts._all}</span>}
        </span>
        {Object.entries(TYPE_CONFIG).map(([key, cfg]) => {
          const count = typeCounts[key];
          return (
            <span
              key={key}
              className={`miao-notif-filter-chip${activeType === key ? ' active' : ''}`}
              onClick={() => handleTypeFilter(key)}
              style={activeType === key ? {
                color: cfg.color,
                background: cfg.bg,
                borderColor: cfg.color,
              } : undefined}
            >
              {cfg.icon} {cfg.label}
              {count != null && <span className="miao-notif-chip-count">{count}</span>}
            </span>
          );
        })}
      </div>

      {/* 消息列表 */}
      <div className="miao-notif-list" ref={listRef}>
        {loading ? (
          <div className="miao-notif-list-loading">
            <Spin />
          </div>
        ) : messages.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无消息"
            className="miao-notif-empty"
          />
        ) : (
          <div className="miao-notif-list-content">
            {messages.map(msg => {
              const typeCfg = TYPE_CONFIG[msg.type] || TYPE_CONFIG.SYSTEM;
              const priorityCfg = PRIORITY_CONFIG[msg.priority];
              const isUrgent = msg.priority === 'URGENT';
              return (
                <div
                  key={msg.id}
                  className={`miao-notif-item${msg.read ? ' read' : ''}`}
                  onClick={() => handleMessageClick(msg)}
                >
                  {/* 左侧色条 */}
                  {isUrgent && <div className="miao-notif-item-accent" style={{ background: '#ff4d4f' }} />}

                  {/* 类型图标 */}
                  <div className="miao-notif-item-icon" style={{ background: typeCfg.bg, color: typeCfg.color }}>
                    {typeCfg.icon}
                  </div>

                  {/* 内容 */}
                  <div className="miao-notif-item-body">
                    <div className="miao-notif-item-head">
                      <span className="miao-notif-item-title">
                        {priorityCfg.color && (
                          <ExclamationCircleOutlined style={{ color: priorityCfg.color, marginRight: 4, fontSize: 12 }} />
                        )}
                        {msg.title}
                      </span>
                      {!msg.read && <span className="miao-notif-item-unread-dot" />}
                    </div>
                    {msg.summary && (
                      <div className="miao-notif-item-summary">{msg.summary}</div>
                    )}
                    <div className="miao-notif-item-foot">
                      <span className="miao-notif-item-type" style={{ color: typeCfg.color }}>
                        {typeCfg.label}
                      </span>
                      <span className="miao-notif-item-time">{formatTime(msg.createdAt)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 底栏：分页 + 查看全部 */}
      <div className="miao-notif-bottombar">
        {totalPages > 1 ? (
          <div className="miao-notif-pagination">
            <Button type="text" size="small" disabled={page <= 1} onClick={() => handlePageChange(page - 1)}>
              上一页
            </Button>
            <span className="miao-notif-page-info">{page} / {totalPages}</span>
            <Button type="text" size="small" disabled={page >= totalPages} onClick={() => handlePageChange(page + 1)}>
              下一页
            </Button>
          </div>
        ) : (
          <div />
        )}
        {total > 0 && (
          <Button type="link" size="small" onClick={() => { onClose(); navigate('/messages'); }}>
            查看全部消息 →
          </Button>
        )}
      </div>
    </div>
  );
};

export default NotificationPanel;
