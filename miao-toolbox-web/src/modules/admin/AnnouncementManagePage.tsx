import React, { useState, useEffect, useCallback } from 'react';
import {
  Button, Space, Modal, message, Popconfirm,
  Form, Input, Select, Radio, Spin, Popover,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  GlobalOutlined, UserOutlined, SoundOutlined,
  ReloadOutlined, ClockCircleOutlined, ExclamationCircleOutlined,
  UsergroupAddOutlined, MailOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import { notificationService, type MessageResponse, type SendMessageRequest, type RecipientInfo } from '../../services/notificationService';
import { getAdminUsers } from '../../services/adminService';
import PageFadeIn from '../../components/shared/PageFadeIn';
import AdminPageHeader from './components/AdminPageHeader';
import './components/admin.css';
import './AnnouncementManagePage.css';

const { TextArea } = Input;

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return formatTime(dateStr);
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string; borderColor: string }> = {
  URGENT: { label: '紧急', color: '#C2362F', bg: 'rgba(255, 77, 79, 0.08)', borderColor: 'rgba(255, 77, 79, 0.20)' },
  HIGH:   { label: '重要', color: 'var(--miao-amber)', bg: 'rgba(245, 158, 11, 0.08)', borderColor: 'rgba(245, 158, 11, 0.20)' },
  NORMAL: { label: '普通', color: 'var(--miao-text-tertiary)', bg: 'var(--miao-bg-muted)', borderColor: 'var(--miao-border)' },
  LOW:    { label: '低', color: 'var(--miao-text-tertiary)', bg: 'var(--miao-bg-muted)', borderColor: 'var(--miao-border)' },
};

/** 公告卡片 */
const AnnouncementCard: React.FC<{
  item: MessageResponse;
  index: number;
  onEdit: (item: MessageResponse) => void;
  onDelete: (id: number) => void;
}> = ({ item, index, onEdit, onDelete }) => {
  const priority = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.NORMAL;
  const isBroadcast = item.scope === 'BROADCAST';
  const isDeleted = !!item.deleted;

  // 定向接收人 Popover 状态
  const [recipients, setRecipients] = useState<RecipientInfo[] | null>(null);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const handlePopoverOpenChange = useCallback(async (open: boolean) => {
    if (!open) {
      setPopoverOpen(false);
      return;
    }
    // 仅定向发送且未加载过时请求
    if (isBroadcast || isDeleted) return;
    setPopoverOpen(true);
    if (recipients !== null) return; // 已加载过
    setRecipientsLoading(true);
    try {
      const data = await notificationService.getAnnouncementRecipients(item.id);
      setRecipients(data);
    } catch {
      message.error('加载接收人失败');
    } finally {
      setRecipientsLoading(false);
    }
  }, [isBroadcast, isDeleted, recipients, item.id]);

  const recipientPopoverContent = (
    <div className="miao-announce-recipient-popover">
      {recipientsLoading ? (
        <div className="miao-announce-recipient-loading">
          <Spin size="small" />
          <span>正在加载...</span>
        </div>
      ) : recipients && recipients.length > 0 ? (
        <>
          <div className="miao-announce-recipient-header">
            <span className="miao-announce-recipient-count">
              共 <strong>{recipients.length}</strong> 位接收人
            </span>
            <UsergroupAddOutlined style={{ fontSize: 13, color: 'var(--miao-teal)' }} />
          </div>
          <ul className="miao-announce-recipient-list">
            {recipients.map(r => (
              <li key={r.userId} className="miao-announce-recipient-item">
                <span className="miao-announce-recipient-avatar">
                  {r.username.slice(0, 1).toUpperCase()}
                </span>
                <div className="miao-announce-recipient-info">
                  <span className="miao-announce-recipient-name">{r.username}</span>
                  {r.email && (
                    <span className="miao-announce-recipient-email">
                      <MailOutlined style={{ fontSize: 10 }} /> {r.email}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="miao-announce-recipient-empty">
          <UserOutlined style={{ fontSize: 22, color: 'var(--miao-text-tertiary)' }} />
          <span>暂无接收人</span>
        </div>
      )}
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      className={`miao-announce-card ${isDeleted ? 'miao-announce-card--deleted' : ''}`}
    >
      {/* 左侧优先级色条 */}
      <div
        className="miao-announce-card-accent"
        style={{ background: isDeleted ? 'var(--miao-border)' : priority.color }}
      />

      <div className="miao-announce-card-body">
        {/* 顶部：图标 + 标题 + 标签 */}
        <div className="miao-announce-card-head">
          <div className="miao-announce-card-icon" style={{
            background: isDeleted
              ? 'var(--miao-bg-muted)'
              : isBroadcast
                ? 'rgba(45, 107, 214, 0.10)'
                : 'rgba(54, 179, 126, 0.12)',
            color: isDeleted
              ? 'var(--miao-text-tertiary)'
              : isBroadcast
                ? 'var(--miao-indigo)'
                : 'var(--miao-teal)',
          }}>
            {isBroadcast ? <GlobalOutlined /> : <UserOutlined />}
          </div>

          <div className="miao-announce-card-title-area">
            <div className="miao-announce-card-title-row">
              <span className="miao-announce-card-title">
                {item.title}
              </span>
              {isDeleted && (
                <span className="miao-announce-badge miao-announce-badge--deleted">已删除</span>
              )}
              {item.editedAt && !isDeleted && (
                <span className="miao-announce-badge miao-announce-badge--edited">已编辑</span>
              )}
            </div>
            <div className="miao-announce-card-meta">
              <span className="miao-announce-scope-badge" style={{
                background: isBroadcast ? 'rgba(45, 107, 214, 0.08)' : 'rgba(54, 179, 126, 0.10)',
                color: isBroadcast ? 'var(--miao-indigo)' : 'var(--miao-teal)',
                ...(isBroadcast ? {} : { cursor: 'pointer' }),
              }}>
                {isBroadcast ? (
                  <><GlobalOutlined style={{ fontSize: 11 }} /> 全员广播</>
                ) : (
                  <Popover
                    content={recipientPopoverContent}
                    title={
                      <span className="miao-announce-recipient-title">
                        <UserOutlined style={{ fontSize: 13, marginRight: 6 }} />
                        定向接收人
                      </span>
                    }
                    trigger="click"
                    open={popoverOpen}
                    onOpenChange={handlePopoverOpenChange}
                    placement="bottomLeft"
                    overlayClassName="miao-announce-recipient-overlay"
                  >
                    <span className="miao-announce-scope-clickable">
                      <UserOutlined style={{ fontSize: 11 }} /> 定向发送{item.recipientCount ? ` · ${item.recipientCount}人` : ''}
                    </span>
                  </Popover>
                )}
              </span>
              <span className="miao-announce-priority-badge" style={{
                background: priority.bg,
                color: priority.color,
                border: `1px solid ${priority.borderColor}`,
              }}>
                {item.priority === 'URGENT' && <ExclamationCircleOutlined style={{ fontSize: 10 }} />}
                {priority.label}
              </span>
            </div>
          </div>
        </div>

        {/* 摘要 */}
        {item.summary && (
          <div className="miao-announce-card-summary">
            {item.summary}
          </div>
        )}

        {/* 底部：时间 + 操作 */}
        <div className="miao-announce-card-foot">
          <div className="miao-announce-card-time">
            <ClockCircleOutlined style={{ fontSize: 12, color: 'var(--miao-text-tertiary)' }} />
            <span title={formatTime(item.createdAt)}>{formatRelativeTime(item.createdAt)}</span>
            {item.editedAt && (
              <span className="miao-announce-edited-time" title={formatTime(item.editedAt)}>
                · 编辑于 {formatRelativeTime(item.editedAt)}
              </span>
            )}
          </div>

          {!isDeleted && (
            <Space size={4}>
              <Button
                size="small"
                type="text"
                icon={<EditOutlined />}
                onClick={() => onEdit(item)}
                className="miao-announce-action-btn"
              >
                编辑
              </Button>
              <Popconfirm
                title="确定删除该公告？"
                description="删除后所有用户将不可见"
                onConfirm={() => onDelete(item.id)}
                okText="确定删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
              >
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  className="miao-announce-action-btn"
                >
                  删除
                </Button>
              </Popconfirm>
            </Space>
          )}
        </div>
      </div>
    </motion.div>
  );
};

const AnnouncementManagePage: React.FC = () => {
  const [announcements, setAnnouncements] = useState<MessageResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [users, setUsers] = useState<{ id: number; username: string; email: string | null }[]>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [form] = Form.useForm();

  const scopeValue = Form.useWatch('scope', form);

  const fetchAnnouncements = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const result = await notificationService.listAnnouncements({ page: p, pageSize });
      setAnnouncements(result.items);
      setTotal(result.total);
      setPage(p);
    } catch {
      message.error('加载公告列表失败');
    } finally {
      setLoading(false);
    }
  }, [pageSize]);

  useEffect(() => {
    fetchAnnouncements(1);
  }, [fetchAnnouncements]);

  /** 搜索用户 */
  const handleUserSearch = useCallback(async (query: string) => {
    if (!query || query.length < 1) return;
    setUserSearchLoading(true);
    try {
      const result = await getAdminUsers(1, 20);
      setUsers(result.items.map(u => ({
        id: u.id, username: u.username, email: u.email,
      })));
    } catch {
      // 静默
    } finally {
      setUserSearchLoading(false);
    }
  }, []);

  /** 打开发布弹窗 */
  const handleCreate = useCallback(() => {
    setEditMode(false);
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ scope: 'BROADCAST', priority: 'NORMAL' });
    setModalVisible(true);
  }, [form]);

  /** 打开编辑弹窗 */
  const handleEdit = useCallback((record: MessageResponse) => {
    setEditMode(true);
    setEditingId(record.id);
    form.setFieldsValue({
      title: record.title,
      content: record.summary,
      priority: record.priority,
    });
    setModalVisible(true);
  }, [form]);

  /** 提交发布/编辑 */
  const handleSubmit = useCallback(async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      if (editMode && editingId) {
        await notificationService.updateAnnouncement(editingId, {
          title: values.title,
          content: values.content,
        });
        message.success('公告已更新');
      } else {
        const request: SendMessageRequest = {
          title: values.title,
          content: values.content,
          type: 'ANNOUNCEMENT',
          priority: values.priority || 'NORMAL',
          scope: values.scope,
          userIds: values.scope === 'TARGETED' ? values.userIds : undefined,
        };
        await notificationService.sendMessage(request);
        message.success('公告已发布');
      }

      setModalVisible(false);
      fetchAnnouncements(1);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(editMode ? '更新失败' : '发布失败');
    } finally {
      setSubmitting(false);
    }
  }, [editMode, editingId, form, fetchAnnouncements]);

  /** 删除公告 */
  const handleDelete = useCallback(async (messageId: number) => {
    try {
      await notificationService.deleteAnnouncement(messageId);
      message.success('公告已删除');
      fetchAnnouncements(page);
    } catch {
      message.error('删除失败');
    }
  }, [fetchAnnouncements, page]);

  return (
    <PageFadeIn>
      <div style={{ padding: 32 }}>
        <AdminPageHeader
          eyebrow="管理 · 公告"
          title={<>公告<em>管理</em></>}
          description="创建和管理系统公告，支持全员广播和定向发送"
          actions={
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => fetchAnnouncements(page)}
                loading={loading}
                className="miao-admin-btn-ghost"
              >
                刷新
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                发布公告
              </Button>
            </Space>
          }
        />

        {/* 统计条 */}
        <div className="miao-announce-stats">
          <div className="miao-announce-stat-chip">
            <SoundOutlined style={{ fontSize: 13 }} />
            <span>共 <strong>{total}</strong> 条公告</span>
          </div>
          {announcements.filter(a => a.priority === 'URGENT').length > 0 && (
            <div className="miao-announce-stat-chip miao-announce-stat-chip--urgent">
              <ExclamationCircleOutlined style={{ fontSize: 13 }} />
              <span><strong>{announcements.filter(a => a.priority === 'URGENT').length}</strong> 条紧急</span>
            </div>
          )}
        </div>

        {/* 卡片列表 */}
        {loading ? (
          <div className="miao-announce-loading">
            <Spin />
          </div>
        ) : announcements.length === 0 ? (
          <div className="miao-admin-empty">
            <div className="miao-admin-empty-art">
              <SoundOutlined />
            </div>
            <h3 className="miao-admin-empty-title">暂无公告</h3>
            <p className="miao-admin-empty-desc">点击「发布公告」创建第一条系统公告</p>
          </div>
        ) : (
          <div className="miao-announce-list">
            {announcements.map((item, i) => (
              <AnnouncementCard
                key={item.id}
                item={item}
                index={i}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {/* 分页 */}
        {total > pageSize && (
          <div className="miao-announce-pager">
            <Button
              size="small"
              disabled={page <= 1}
              onClick={() => fetchAnnouncements(page - 1)}
              className="miao-admin-btn-ghost"
            >
              上一页
            </Button>
            <span className="miao-announce-pager-info">
              第 {page} 页 · 共 {total} 条
            </span>
            <Button
              size="small"
              disabled={page * pageSize >= total}
              onClick={() => fetchAnnouncements(page + 1)}
              className="miao-admin-btn-ghost"
            >
              下一页
            </Button>
          </div>
        )}

        {/* 发布/编辑弹窗 */}
        <Modal
          title={editMode ? '编辑公告' : '发布公告'}
          open={modalVisible}
          onOk={handleSubmit}
          onCancel={() => setModalVisible(false)}
          confirmLoading={submitting}
          okText={editMode ? '保存' : '发布'}
          cancelText="取消"
          width={600}
          destroyOnClose
          className="miao-announce-modal"
        >
          <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
            <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }, { max: 100, message: '标题不能超过100字' }]}>
              <Input placeholder="请输入公告标题" maxLength={100} showCount />
            </Form.Item>

            <Form.Item name="content" label="正文" rules={[{ required: true, message: '请输入正文' }, { max: 2000, message: '正文不能超过2000字' }]}>
              <TextArea placeholder="请输入公告正文" rows={6} maxLength={2000} showCount />
            </Form.Item>

            {!editMode && (
              <>
                <Form.Item name="scope" label="发送范围">
                  <Radio.Group>
                    <Radio value="BROADCAST">全部用户（广播）</Radio>
                    <Radio value="TARGETED">指定用户</Radio>
                  </Radio.Group>
                </Form.Item>

                {scopeValue === 'TARGETED' && (
                  <Form.Item name="userIds" label="选择用户" rules={[{ required: true, message: '请选择至少一个用户' }]}>
                    <Select
                      mode="multiple"
                      placeholder="搜索用户名"
                      filterOption={false}
                      onSearch={handleUserSearch}
                      loading={userSearchLoading}
                      options={users.map(u => ({ label: u.email ? `${u.username} (${u.email})` : u.username, value: u.id }))}
                      notFoundContent={userSearchLoading ? <Spin size="small" /> : '输入用户名搜索'}
                    />
                  </Form.Item>
                )}

                <Form.Item name="priority" label="优先级">
                  <Select options={[
                    { label: '普通', value: 'NORMAL' },
                    { label: '重要', value: 'HIGH' },
                    { label: '紧急', value: 'URGENT' },
                  ]} />
                </Form.Item>
              </>
            )}
          </Form>
        </Modal>
      </div>
    </PageFadeIn>
  );
};

export default AnnouncementManagePage;
