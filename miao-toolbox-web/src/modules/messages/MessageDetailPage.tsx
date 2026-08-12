import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Spin, message as antMessage } from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  ToolOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
  BellOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import { useNotification } from '../../contexts/NotificationContext';
import type { MessageDetailResponse } from '../../services/notificationService';
import PageFadeIn from '../../components/shared/PageFadeIn';
import './MessageDetailPage.css';

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
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
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

const MessageDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { loadMessageDetail, markAsRead } = useNotification();

  const [detail, setDetail] = useState<MessageDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const messageId = Number(id);
    setLoading(true);
    (async () => {
      try {
        const d = await loadMessageDetail(messageId);
        setDetail(d);
        if (!d.read) {
          await markAsRead(messageId);
          // 同步更新本地详情状态
          setDetail(prev => prev ? { ...prev, read: true } : prev);
        }
      } catch {
        antMessage.error('加载消息失败');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, loadMessageDetail, markAsRead]);

  const handleBack = useCallback(() => {
    navigate('/messages', { replace: true });
  }, [navigate]);

  if (loading) {
    return (
      <div className="msg-detail-page-loading">
        <Spin size="large" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="msg-detail-page-loading">
        <p>消息不存在或已被删除</p>
        <Button onClick={handleBack}>返回消息列表</Button>
      </div>
    );
  }

  const typeCfg = TYPE_CONFIG[detail.type] || TYPE_CONFIG.SYSTEM;
  const priorityCfg = PRIORITY_CONFIG[detail.priority];
  const isUrgent = detail.priority === 'URGENT';
  const isHigh = detail.priority === 'HIGH';

  return (
    <PageFadeIn>
      <div className="msg-detail-page">
        {/* 顶栏 */}
        <div className="msg-detail-page-topbar">
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={handleBack}
            className="msg-detail-page-back"
          >
            返回消息列表
          </Button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="msg-detail-page-card"
        >
          {/* 顶部色条 */}
          <div
            className="msg-detail-page-rail"
            style={{
              background: isUrgent
                ? 'linear-gradient(90deg, #ff4d4f, #ff7875, #ff4d4f)'
                : isHigh
                  ? 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)'
                  : `linear-gradient(90deg, ${typeCfg.color}, ${typeCfg.color}88)`,
            }}
          />

          {/* 信头 */}
          <div className="msg-detail-page-letterhead" style={{ background: typeCfg.bg }}>
            <div className="msg-detail-page-badges">
              <span className="msg-detail-page-type-badge" style={{ color: typeCfg.color, background: 'rgba(255,255,255,0.7)' }}>
                {typeCfg.icon} {typeCfg.label}
              </span>
              {priorityCfg.color && (
                <span className="msg-detail-page-priority-badge" style={{ color: priorityCfg.color, background: priorityCfg.bg }}>
                  {isUrgent && <ExclamationCircleOutlined style={{ fontSize: 10 }} />}
                  {priorityCfg.label}
                </span>
              )}
            </div>
            <h1 className="msg-detail-page-heading">{detail.title}</h1>
            <div className="msg-detail-page-timeline">
              <div className="msg-detail-page-timeline-dot" style={{ background: typeCfg.color }} />
              <span className="msg-detail-page-timeline-label">{formatTime(detail.createdAt)}</span>
              {detail.read && detail.readAt && (
                <>
                  <div className="msg-detail-page-timeline-line" />
                  <div className="msg-detail-page-timeline-dot msg-detail-page-timeline-dot--read" />
                  <span className="msg-detail-page-timeline-label msg-detail-page-timeline-label--muted">
                    已读 {formatTime(detail.readAt)}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* 分隔装饰 */}
          <div className="msg-detail-page-ornament">
            <span className="msg-detail-page-ornament-line" />
            <span className="msg-detail-page-ornament-icon" style={{ color: typeCfg.color }}>{typeCfg.icon}</span>
            <span className="msg-detail-page-ornament-line" />
          </div>

          {/* 正文 */}
          <div className="msg-detail-page-prose">
            {detail.content}
          </div>

          {/* 底部状态 */}
          <div className="msg-detail-page-status">
            {detail.read ? (
              <div className="msg-detail-page-status-read">
                <CheckCircleOutlined />
                <span>已读</span>
              </div>
            ) : (
              <div className="msg-detail-page-status-unread">
                <span className="msg-detail-page-status-pulse" style={{ '--pulse-color': typeCfg.color } as React.CSSProperties} />
                <span>未读消息</span>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </PageFadeIn>
  );
};

export default MessageDetailPage;
