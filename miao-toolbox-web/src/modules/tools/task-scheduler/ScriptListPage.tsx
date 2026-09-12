import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Input, Modal, Table, Tag, Tooltip, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CodeOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import PageFadeIn from '../../../components/shared/PageFadeIn';
import { schedulerApi } from './schedulerApi';
import type { ScriptListItem } from './types';
import { extractErrorMessage, formatDateTime } from './format';
import SchedulerHeader from './components/SchedulerHeader';
import SchedulerPanel from './components/SchedulerPanel';
import SchedulerEmpty from './components/SchedulerEmpty';
import './task-scheduler.css';

const TYPE_LABEL: Record<string, { text: string; color: string }> = {
  SHELL: { text: 'Shell', color: 'green' },
  PYTHON: { text: 'Python', color: 'blue' },
};

/** 脚本列表页（FR-1） */
const ScriptListPage: React.FC = () => {
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [items, setItems] = useState<ScriptListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const loadSeqRef = React.useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await schedulerApi.listScripts({ page, pageSize, search: keyword || undefined });
      if (seq !== loadSeqRef.current) return;
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      if (seq !== loadSeqRef.current) return;
      setLoadError(extractErrorMessage(err, '脚本列表加载失败'));
      setItems([]);
      setTotal(0);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [page, pageSize, keyword]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = useCallback(
    (script: ScriptListItem) => {
      Modal.confirm({
        title: '删除脚本',
        content: `确定删除「${script.name}」吗？该脚本的所有版本将被删除。若被启用任务引用将拒绝删除。`,
        okText: '删除',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: async () => {
          setBusyId(script.id);
          try {
            await schedulerApi.deleteScript(script.id);
            message.success('脚本已删除');
            await load();
          } catch (err) {
            message.error(extractErrorMessage(err, '删除失败'));
          } finally {
            setBusyId(null);
          }
        },
      });
    },
    [load],
  );

  const columns: ColumnsType<ScriptListItem> = [
    {
      title: '名称',
      dataIndex: 'name',
      width: 220,
      render: (name: string, script) => (
        <Button type="link" className="ts-name-link" onClick={() => navigate(`/tools/task-scheduler/scripts/${script.id}`)}>
          {name}
        </Button>
      ),
    },
    {
      title: '类型',
      dataIndex: 'scriptType',
      width: 100,
      render: (type: string) => {
        const info = TYPE_LABEL[type] ?? { text: type, color: 'default' };
        return <Tag color={info.color}>{info.text}</Tag>;
      },
    },
    {
      title: '描述',
      dataIndex: 'description',
      width: 240,
      render: (desc: string | null) =>
        desc ? <span className="ts-muted">{desc}</span> : <span className="ts-muted">-</span>,
    },
    {
      title: '版本',
      dataIndex: 'latestVersion',
      width: 80,
      render: (v: number) => <Tag>v{v}</Tag>,
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 185,
      render: (value: string | null) => <span className="ts-muted">{formatDateTime(value)}</span>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      fixed: 'right',
      render: (_, script) => {
        const busy = busyId === script.id;
        return (
          <span className="ts-row-actions">
            <Tooltip title="编辑">
              <Button
                type="text"
                size="small"
                aria-label="编辑"
                icon={<EditOutlined />}
                onClick={() => navigate(`/tools/task-scheduler/scripts/${script.id}/edit`)}
              />
            </Tooltip>
            <Tooltip title="删除">
              <Button
                type="text"
                size="small"
                danger
                aria-label="删除"
                loading={busy}
                icon={<DeleteOutlined />}
                onClick={() => handleDelete(script)}
              />
            </Tooltip>
          </span>
        );
      },
    },
  ];

  return (
    <PageFadeIn>
      <div className="ts-page">
        <SchedulerHeader
          icon={<CodeOutlined />}
          title="脚本管理"
          subtitle="自定义运维脚本 · Shell/Python · 版本管理"
          actions={
            <>
              <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
                刷新
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => navigate('/tools/task-scheduler/scripts/new')}
              >
                新建脚本
              </Button>
            </>
          }
        />

        <div className="ts-command-bar">
          <div className="ts-command-group">
            <Input.Search
              allowClear
              placeholder="按脚本名称搜索"
              style={{ width: 260 }}
              onChange={(event) => {
                if (!event.target.value) {
                  setKeyword('');
                  setPage(1);
                }
              }}
              onSearch={(value) => {
                setKeyword(value.trim());
                setPage(1);
              }}
            />
          </div>
          <div className="ts-command-group">
            <span className="ts-panel-meta">共 {total} 个脚本</span>
          </div>
        </div>

        {loadError ? (
          <Alert type="error" showIcon message={loadError} />
        ) : (
          <SchedulerPanel label="脚本列表" meta={loading ? '加载中…' : null} index={0} flush fill>
            <Table<ScriptListItem>
              className="ts-table"
              rowKey="id"
              columns={columns}
              dataSource={items}
              loading={loading}
              scroll={{ x: 845 }}
              locale={{
                emptyText: (
                  <SchedulerEmpty
                    icon={<CodeOutlined />}
                    title="暂无脚本"
                    hint="点击右上角「新建脚本」，录入第一个运维脚本"
                  />
                ),
              }}
              pagination={{
                current: page,
                pageSize,
                total,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                showTotal: (count) => `共 ${count} 条`,
                onChange: (nextPage, nextPageSize) => {
                  setPage(nextPage);
                  setPageSize(nextPageSize);
                },
              }}
            />
          </SchedulerPanel>
        )}
      </div>
    </PageFadeIn>
  );
};

export default ScriptListPage;
