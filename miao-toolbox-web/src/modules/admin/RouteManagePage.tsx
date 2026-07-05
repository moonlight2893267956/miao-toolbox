import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Select, Space, Switch, Table, Tag, message } from 'antd';
import { ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  getRouteMatrix,
  updateRouteMatrix,
  type AdminRole,
  type AdminRoute,
  type RouteMatrix,
} from '../../services/adminService';
import PageFadeIn from '../../components/shared/PageFadeIn';
import AdminPageHeader from './components/AdminPageHeader';
import './components/admin.css';

function cloneMappings(mappings: Record<string, number[]>): Record<string, number[]> {
  return Object.fromEntries(Object.entries(mappings).map(([key, value]) => [key, [...value]]));
}

function mappingsEqual(a: Record<string, number[]>, b: Record<string, number[]>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const left = [...(a[key] ?? [])].sort((x, y) => x - y);
    const right = [...(b[key] ?? [])].sort((x, y) => x - y);
    if (left.length !== right.length) return false;
    if (left.some((item, index) => item !== right[index])) return false;
  }
  return true;
}

const RouteManagePage: React.FC = () => {
  const [matrix, setMatrix] = useState<RouteMatrix | null>(null);
  const [draftMappings, setDraftMappings] = useState<Record<string, number[]>>({});
  const [roleFilter, setRoleFilter] = useState<number | 'all'>('all');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchMatrix = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getRouteMatrix();
      setMatrix(data);
      setDraftMappings(cloneMappings(data.mappings));
    } catch {
      message.error('加载路由矩阵失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMatrix();
  }, [fetchMatrix]);

  const dirty = useMemo(() => (
    matrix ? !mappingsEqual(matrix.mappings, draftMappings) : false
  ), [draftMappings, matrix]);

  const visibleRoles = useMemo(() => {
    const roles = matrix?.roles ?? [];
    return roleFilter === 'all' ? roles : roles.filter(role => role.id === roleFilter);
  }, [matrix?.roles, roleFilter]);

  // SUPER_ADMIN 固定列（后端不在 roles 中返回，前端固定渲染为灰显“全部通行”列）
  const superAdminColumn = useMemo((): ColumnsType<AdminRoute>[number] => ({
    title: (
      <Space size={6}>
        <span>超级管理员</span>
        <Tag color="purple">全部通行</Tag>
      </Space>
    ),
    key: 'role-super-admin',
    align: 'center' as const,
    width: 150,
    render: () => <Switch checked disabled />,
  }), []);

  const toggleRoleRoute = (routeId: number, role: AdminRole, checked: boolean) => {
    setDraftMappings((prev) => {
      const key = String(routeId);
      const next = new Set(prev[key] ?? []);
      if (checked) next.add(role.id);
      else next.delete(role.id);
      return { ...prev, [key]: Array.from(next).sort((a, b) => a - b) };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateRouteMatrix(draftMappings);
      setMatrix(updated);
      setDraftMappings(cloneMappings(updated.mappings));
      message.success('路由权限已保存');
    } catch {
      message.error('保存路由权限失败');
    } finally {
      setSaving(false);
    }
  };

  const routeColumns: ColumnsType<AdminRoute> = [
    {
      title: '路由',
      dataIndex: 'name',
      fixed: 'left',
      width: 220,
      render: (_: string, route) => (
        <div>
          <div style={{ fontWeight: 700 }}>{route.name}</div>
          <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--miao-text-tertiary)' }}>{route.code}</div>
        </div>
      ),
    },
    {
      title: '路径',
      dataIndex: 'path',
      width: 220,
      render: (path: string) => <span style={{ fontFamily: 'monospace' }}>{path}</span>,
    },
    superAdminColumn,
    ...visibleRoles.map((role): ColumnsType<AdminRoute>[number] => ({
      title: (
        <Space size={6}>
          <span>{role.name}</span>
        </Space>
      ),
      key: `role-${role.id}`,
      align: 'center',
      width: 150,
      render: (_: unknown, route) => {
        const checked = (draftMappings[String(route.id)] ?? []).includes(role.id);
        return (
          <Switch
            checked={checked}
            onChange={(next) => toggleRoleRoute(route.id, role, next)}
          />
        );
      },
    })),
  ];

  const adminColumns: ColumnsType<AdminRoute> = [
    { title: '名称', dataIndex: 'name', width: 180 },
    { title: '路由码', dataIndex: 'code', width: 220, render: (code: string) => <span style={{ fontFamily: 'monospace' }}>{code}</span> },
    { title: '路径', dataIndex: 'path', render: (path: string) => <span style={{ fontFamily: 'monospace' }}>{path}</span> },
    { title: '访问策略', width: 180, render: () => <Tag color="purple">仅超级管理员</Tag> },
  ];

  return (
    <PageFadeIn>
      <AdminPageHeader
        eyebrow="ADMIN · ROUTES"
        title={<>路由<em>权限</em></>}
        description="配置非管理区页面对各角色的可见性；管理区路由由系统固定为超级管理员可访问。"
        actions={(
          <Space>
            <Select
              style={{ width: 180 }}
              value={roleFilter}
              onChange={setRoleFilter}
              options={[
                { value: 'all', label: '全部角色' },
                ...(matrix?.roles ?? []).map(role => ({ value: role.id, label: role.name })),
              ]}
            />
            <Button icon={<ReloadOutlined />} onClick={fetchMatrix} loading={loading} className="miao-admin-btn-ghost">刷新</Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving} disabled={!dirty}>保存</Button>
          </Space>
        )}
      />

      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        message="未勾选任何角色的路由对非超级管理员默认不可见。"
      />

      <Table<AdminRoute>
        rowKey="id"
        columns={routeColumns}
        dataSource={matrix?.routes ?? []}
        loading={loading}
        pagination={false}
        scroll={{ x: Math.max(760, visibleRoles.length * 150 + 440) }}
      />

      <h3 style={{ margin: '28px 0 12px' }}>管理区路由</h3>
      <Table<AdminRoute>
        rowKey="id"
        columns={adminColumns}
        dataSource={matrix?.adminRoutes ?? []}
        loading={loading}
        pagination={false}
        size="small"
      />
    </PageFadeIn>
  );
};

export default RouteManagePage;
