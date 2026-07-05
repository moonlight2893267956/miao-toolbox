import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Popconfirm, message, Input, Modal, Form, Tag, Space } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, ReloadOutlined, SafetyCertificateOutlined, TeamOutlined, LockOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import axiosInstance from '../../services/axiosInstance';
import PageFadeIn from '../../components/shared/PageFadeIn';
import AdminPageHeader from './components/AdminPageHeader';
import './components/admin.css';

interface RoleItem {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  userCount?: number | null;
}

/** 角色卡片 — 替代表格行 */
const RoleCard: React.FC<{
  role: RoleItem;
  index: number;
  onEdit: (role: RoleItem) => void;
  onDelete: (role: RoleItem) => void;
  onUserCountClick: (code: string) => void;
}> = ({ role, index, onEdit, onDelete, onUserCountClick }) => {
  const userCount = role.userCount ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.05 }}
      style={{
        background: 'var(--miao-bg-elevated)',
        border: '1px solid var(--miao-border)',
        borderRadius: 'var(--miao-radius-lg)',
        padding: '20px 24px',
        transition: 'border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease',
        cursor: 'default',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--miao-border-strong)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(33, 26, 82, 0.08)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--miao-border)';
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* 系统角色背景标识 */}
      {role.isSystem && (
        <div style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 80,
          height: 80,
          background: 'radial-gradient(circle at 100% 0%, rgba(92, 79, 208, 0.06), transparent 70%)',
          pointerEvents: 'none',
        }} />
      )}

      {/* 顶部：图标 + 名称 + 系统标签 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: role.isSystem ? 'rgba(217, 112, 32, 0.10)' : 'rgba(45, 107, 214, 0.10)',
          color: role.isSystem ? 'var(--miao-accent)' : 'var(--miao-indigo)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          flexShrink: 0,
        }}>
          {role.isSystem ? <LockOutlined /> : <SafetyCertificateOutlined />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: 'var(--miao-font-display)',
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--miao-text-primary)',
              letterSpacing: '-0.01em',
            }}>
              {role.name}
            </span>
            {role.isSystem && (
              <Tag color="orange" style={{ fontSize: 11, lineHeight: '18px', padding: '0 6px', margin: 0 }}>系统内置</Tag>
            )}
          </div>
          <div style={{
            fontFamily: 'var(--miao-font-mono)',
            fontSize: 12,
            color: 'var(--miao-text-tertiary)',
            marginTop: 2,
            letterSpacing: '0.02em',
          }}>
            {role.code}
          </div>
        </div>
      </div>

      {/* 描述 */}
      <div style={{
        fontSize: 13.5,
        lineHeight: 1.6,
        color: 'var(--miao-text-secondary)',
        marginBottom: 16,
        minHeight: 22,
      }}>
        {role.description || '—'}
      </div>

      {/* 底部：用户数 + 操作 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderTop: '1px solid var(--miao-border)',
        paddingTop: 14,
      }}>
        {/* 用户数 */}
        <div
          onClick={() => userCount > 0 && onUserCountClick(role.code)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: userCount > 0 ? 'var(--miao-primary)' : 'var(--miao-text-tertiary)',
            cursor: userCount > 0 ? 'pointer' : 'default',
            transition: 'opacity 120ms ease',
          }}
          onMouseEnter={e => { if (userCount > 0) e.currentTarget.style.opacity = '0.7'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
        >
          <TeamOutlined style={{ fontSize: 14 }} />
          <span style={{ fontWeight: 600 }}>{userCount}</span>
          <span style={{ color: 'var(--miao-text-tertiary)', fontWeight: 400 }}>位用户</span>
        </div>

        {/* 操作按钮 */}
        <Space size={4}>
          {!role.isSystem && (
            <>
              <Button
                size="small"
                type="text"
                icon={<EditOutlined />}
                onClick={() => onEdit(role)}
                style={{ color: 'var(--miao-text-secondary)', fontSize: 12 }}
              >
                编辑
              </Button>
              <Popconfirm title="确定删除此角色？" onConfirm={() => onDelete(role)} okText="确定" cancelText="取消">
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  style={{ fontSize: 12 }}
                >
                  删除
                </Button>
              </Popconfirm>
            </>
          )}
          {role.isSystem && (
            <Button
              size="small"
              type="text"
              icon={<EditOutlined />}
              onClick={() => onEdit(role)}
              style={{ color: 'var(--miao-text-secondary)', fontSize: 12 }}
            >
              编辑描述
            </Button>
          )}
        </Space>
      </div>
    </motion.div>
  );
};

const RoleManagePage: React.FC = () => {
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null);
  const [form] = Form.useForm();
  const navigate = useNavigate();

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosInstance.get('/api/admin/roles', { params: { page, pageSize: 20, search: search || undefined } });
      setRoles(res.data.data.items);
      setTotal(res.data.data.total);
    } catch (err: any) {
      message.error(err?.response?.data?.message || '加载角色列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  const handleCreate = async (values: { name: string; description?: string }) => {
    try {
      await axiosInstance.post('/api/admin/roles', values);
      message.success('角色创建成功');
      setModalOpen(false);
      form.resetFields();
      fetchRoles();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '创建失败');
    }
  };

  const handleEdit = async (values: { name?: string; description?: string }) => {
    if (!editingRole) return;
    try {
      await axiosInstance.put(`/api/admin/roles/${editingRole.id}`, values);
      message.success('角色更新成功');
      setModalOpen(false);
      setEditingRole(null);
      form.resetFields();
      fetchRoles();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '更新失败');
    }
  };

  const handleDelete = async (role: RoleItem) => {
    try {
      await axiosInstance.delete(`/api/admin/roles/${role.id}`);
      message.success('角色已删除');
      fetchRoles();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '删除失败');
    }
  };

  const openCreateModal = () => {
    setEditingRole(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEditModal = (role: RoleItem) => {
    setEditingRole(role);
    form.setFieldsValue({ name: role.name, description: role.description || '' });
    setModalOpen(true);
  };

  // 分类：系统角色 vs 自定义角色
  const systemRoles = roles.filter(r => r.isSystem);
  const customRoles = roles.filter(r => !r.isSystem);

  return (
    <PageFadeIn>
      <AdminPageHeader
        eyebrow="ADMIN · ROLES"
        title={<>角色<em>管理</em></>}
        description="管理系统中的自定义角色，控制系统功能访问权限"
        actions={(
          <Space>
            <Input.Search
              placeholder="搜索角色名称..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              style={{ width: 240 }}
              allowClear
            />
            <Button icon={<ReloadOutlined />} onClick={fetchRoles} loading={loading} className="miao-admin-btn-ghost">
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              创建角色
            </Button>
          </Space>
        )}
      />

      {/* 系统内置角色 */}
      {systemRoles.length > 0 && (
        <>
          <div style={{
            fontFamily: 'var(--miao-font-mono)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--miao-text-tertiary)',
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <LockOutlined style={{ fontSize: 12, color: 'var(--miao-accent)' }} />
            系统内置角色
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: 16,
            marginBottom: 32,
          }}>
            {systemRoles.map((role, i) => (
              <RoleCard
                key={role.id}
                role={role}
                index={i}
                onEdit={openEditModal}
                onDelete={handleDelete}
                onUserCountClick={(code) => navigate(`/admin/users?role=${encodeURIComponent(code)}`)}
              />
            ))}
          </div>
        </>
      )}

      {/* 自定义角色 */}
      {customRoles.length > 0 && (
        <>
          <div style={{
            fontFamily: 'var(--miao-font-mono)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--miao-text-tertiary)',
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <SafetyCertificateOutlined style={{ fontSize: 12, color: 'var(--miao-indigo)' }} />
            自定义角色
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: 16,
          }}>
            {customRoles.map((role, i) => (
              <RoleCard
                key={role.id}
                role={role}
                index={i + systemRoles.length}
                onEdit={openEditModal}
                onDelete={handleDelete}
                onUserCountClick={(code) => navigate(`/admin/users?role=${encodeURIComponent(code)}`)}
              />
            ))}
          </div>
        </>
      )}

      {/* 空状态 */}
      {!loading && roles.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '56px 20px',
          color: 'var(--miao-text-tertiary)',
        }}>
          <SafetyCertificateOutlined style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }} />
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--miao-text-primary)', marginBottom: 4 }}>暂无自定义角色</div>
          <div style={{ fontSize: 13 }}>点击「创建角色」添加新的角色</div>
        </div>
      )}

      {/* 加载中 */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--miao-text-tertiary)' }}>加载中...</div>
      )}

      {/* 分页 */}
      {total > 20 && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 8,
          marginTop: 24,
          fontSize: 13,
          color: 'var(--miao-text-secondary)',
        }}>
          <Button size="small" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</Button>
          <span style={{ lineHeight: '32px' }}>第 {page} 页 · 共 {total} 个角色</span>
          <Button size="small" disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}>下一页</Button>
        </div>
      )}

      <Modal
        title={editingRole ? '编辑角色' : '创建角色'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText={editingRole ? '保存' : '创建'}
      >
        <Form form={form} layout="vertical" onFinish={editingRole ? handleEdit : handleCreate}>
          <Form.Item name="name" label="角色名称" rules={[{ required: true, message: '请输入角色名称' }, { min: 2, max: 20 }]}>
            <Input placeholder="如：VIP用户" disabled={!!editingRole?.isSystem} />
            {editingRole?.isSystem && <div style={{ color: 'var(--miao-text-tertiary)', fontSize: 12, marginTop: 4 }}>系统内置角色的名称不可修改</div>}
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="角色描述（可选）" maxLength={100} />
          </Form.Item>
        </Form>
      </Modal>
    </PageFadeIn>
  );
};

export default RoleManagePage;
