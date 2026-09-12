/**
 * 脚本版本历史（FR-1 / Story 1.3）。
 *
 * 版本只增不覆盖：列表按版本号倒序，可查看任意历史版本的完整内容。
 * 删除受后端双重保护——仅剩一个版本、或该版本被任务引用时被拒绝，
 * 前端只做「只剩一个版本」的即时禁用，其余交由后端判定并提示原因。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Empty, Modal, Skeleton, Tag, Tooltip, message } from 'antd';
import { DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { schedulerApi } from '../schedulerApi';
import type { ScriptVersion } from '../types';
import { extractErrorMessage, formatDateTime } from '../format';

interface VersionHistoryPanelProps {
  scriptId: number;
  /** 保存成功后自增以刷新（内容变更会生成新版本） */
  refreshToken?: number;
}

const VersionHistoryPanel: React.FC<VersionHistoryPanelProps> = ({ scriptId, refreshToken = 0 }) => {
  const [items, setItems] = useState<ScriptVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ScriptVersion | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await schedulerApi.listScriptVersions(scriptId));
    } catch (err) {
      setError(extractErrorMessage(err, '版本列表加载失败'));
    } finally {
      setLoading(false);
    }
  }, [scriptId]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  /** 「最新」以列表自身最大版本号为准：删掉最新版后无需父级回传即保持正确 */
  const latestVersion = items.reduce((max, item) => Math.max(max, item.version), 0);

  const handleDelete = useCallback(
    (item: ScriptVersion) => {
      Modal.confirm({
        title: `删除版本 v${item.version}？`,
        content: '该版本内容将永久删除且不可恢复。若仍有任务绑定此版本，需先改绑其它版本。',
        okText: '删除版本',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: async () => {
          setPendingId(item.id);
          try {
            await schedulerApi.deleteScriptVersion(scriptId, item.version);
            message.success(`已删除 v${item.version}`);
            await load();
          } catch (err) {
            message.error(extractErrorMessage(err, '删除失败'));
          } finally {
            setPendingId(null);
          }
        },
      });
    },
    [load, scriptId],
  );

  if (loading && items.length === 0) {
    return <Skeleton active paragraph={{ rows: 3 }} />;
  }

  if (error) {
    return <Alert type="error" showIcon message={error} />;
  }

  if (items.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无版本记录" />;
  }

  return (
    <>
      <div className="ts-version-list">
        {items.map((item) => {
          const isLatest = item.version === latestVersion;
          return (
            <div key={item.id} className={`ts-version-item${isLatest ? ' is-latest' : ''}`}>
              <span className="ts-version-badge">v{item.version}</span>
              {isLatest && <Tag className="ts-version-latest-tag">最新</Tag>}
              <span className="ts-version-time">{formatDateTime(item.createdAt)}</span>
              <span className="ts-field-actions ts-version-actions">
                <Tooltip title="查看该版本内容">
                  <Button
                    type="text"
                    size="small"
                    className="ts-field-action"
                    icon={<EyeOutlined />}
                    onClick={() => setPreview(item)}
                  >
                    查看
                  </Button>
                </Tooltip>
                <Tooltip
                  title={
                    items.length <= 1
                      ? '脚本至少保留一个版本'
                      : '删除该版本（被任务引用时会被拒绝）'
                  }
                >
                  <Button
                    type="text"
                    size="small"
                    className="ts-field-action"
                    icon={<DeleteOutlined />}
                    disabled={items.length <= 1}
                    loading={pendingId === item.id}
                    onClick={() => handleDelete(item)}
                  >
                    删除
                  </Button>
                </Tooltip>
              </span>
            </div>
          );
        })}
      </div>

      <Modal
        open={preview !== null}
        title={preview ? `版本 v${preview.version} 内容` : ''}
        onCancel={() => setPreview(null)}
        footer={null}
        width={760}
      >
        <pre className="ts-version-preview">{preview?.content ?? ''}</pre>
      </Modal>
    </>
  );
};

export default VersionHistoryPanel;
