import React, { useState, useEffect, useCallback } from 'react';
import { Table, Switch, Tag, Button, Popconfirm, message, InputNumber, Dropdown, Spin, Empty } from 'antd';
import { ReloadOutlined, DownOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  getAdminUsers,
  disableUser,
  enableUser,
  setUserRole,
  setUserRateLimit,
  type AdminUser,
} from '../../services/adminService';

const UserManagePage: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAdminUsers(page, pageSize);
      setUsers(data.items);
      setTotal(data.total);
    } catch {
      message.error('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggleEnabled = async (user: AdminUser, enabled: boolean) => {
    try {
      if (enabled) {
        await enableUser(user.id);
        message.success('已启用');
      } else {
        await disableUser(user.id);
        message.success('已禁用');
      }
      fetchData();
    } catch {
      message.error(enabled ? '启用失败' : '禁用失败');
    }
  };

  const handleRoleChange = async (user: AdminUser, newRole: string) => {
    try {
      await setUserRole(user.id, newRole);
      message.success('角色已变更');
      fetchData();
    } catch (err: any) {
      const msg = err?.response?.data?.message || '角色变更失败';
      message.error(msg);
    }
  };

  const handleSetRateLimit = async (userId: number, value: number | null) => {
    if (value === null) return;
    try {
      await setUserRateLimit(userId, value);
      message.success('限流已设置');
    } catch {
      message.error('设置限流失败');
    }
  };

  const columns: ColumnsType<AdminUser> = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      render: (v: string | null) => v || '-',
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (role: string, user: AdminUser) => (
        <Dropdown
          menu={{
            items: [
              { key: 'USER', label: 'USER' },
              { key: 'ADMIN', label: 'ADMIN' },
            ],
            onClick: ({ key }) => {
              if (key === role) return;
              handleRoleChange(user, key);
            },
          }}
          trigger={['click']}
        >
          <Button size="small" type="link" aria-label={`变更角色 ${user.username}`}>
            <Tag color={role === 'ADMIN' ? 'red' : 'blue'}>{role}</Tag>
            <DownOutlined style={{ fontSize: 10 }} />
          </Button>
        </Dropdown>
      ),
    },
    {
      title: '状态',
      dataIndex: 'isEnabled',
      key: 'isEnabled',
      render: (enabled: boolean, user: AdminUser) => (
        <Popconfirm
          title={enabled ? '确定禁用该用户？禁用后该用户将无法登录和使用任何工具。' : '确定启用该用户？'}
          onConfirm={() => handleToggleEnabled(user, !enabled)}
          okText="确定"
          cancelText="取消"
        >
          <Switch
            checked={enabled}
            checkedChildren="启用"
            unCheckedChildren="禁用"
            aria-label={`禁用用户 ${user.username}`}
          />
        </Popconfirm>
      ),
    },
    {
      title: '限流(次/分)',
      key: 'rateLimit',
      render: (_: unknown, user: AdminUser) => (
        <InputNumber
          min={1}
          max={10000}
          placeholder="默认"
          style={{ width: 100 }}
          onPressEnter={(e) => {
            const val = parseInt((e.target as HTMLInputElement).value, 10);
            if (!isNaN(val) && val > 0) handleSetRateLimit(user.id, val);
          }}
          onBlur={(e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val) && val > 0) handleSetRateLimit(user.id, val);
          }}
          aria-label={`设置限流 ${user.username}`}
        />
      ),
    },
    {
      title: '最后登录',
      dataIndex: 'lastLoginAt',
      key: 'lastLoginAt',
      render: (v: string | null) => (v ? new Date(v).toLocaleString() : '-'),
    },
    {
      title: '注册时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: string) => new Date(v).toLocaleString(),
    },
  ];

  if (loading && users.length === 0) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spin size="large" /></div>;
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>用户管理</h2>
        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>刷新</Button>
      </div>

      <Table<AdminUser>
        rowKey="id"
        columns={columns}
        dataSource={users}
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
        locale={{ emptyText: <Empty description="暂无用户" /> }}
      />
    </div>
  );
};

export default UserManagePage;
