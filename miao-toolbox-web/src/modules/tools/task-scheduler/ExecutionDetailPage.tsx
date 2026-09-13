import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Descriptions, Skeleton, Tag, Tooltip, message } from 'antd';
import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import PageFadeIn from '../../../components/shared/PageFadeIn';
import { schedulerApi } from './schedulerApi';
import type { TaskExecutionDetail } from './types';
import { extractErrorMessage, formatDateTime, formatDuration, paramEnvName, prettyJson } from './format';
import SchedulerHeader from './components/SchedulerHeader';
import SchedulerPanel from './components/SchedulerPanel';
import ExecutionStatusTag from './components/ExecutionStatusTag';
import './task-scheduler.css';

const TRIGGER_LABEL: Record<string, string> = {
  SCHEDULED: '调度触发',
  MANUAL: '手动触发',
};

/** 从 responseSummary 中安全提取字段 */
function getSummaryField(detail: TaskExecutionDetail | null, key: string): unknown {
  return detail?.responseSummary?.[key];
}

/** stdout / stderr 文本（可能被截断） */
function getOutputText(detail: TaskExecutionDetail | null, key: string): string {
  const value = getSummaryField(detail, key);
  return typeof value === 'string' ? value : '';
}

/** 执行详情页（FR-10）：独立页面展示单次执行的完整信息 */
const ExecutionDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const executionId = Number(id);

  const [detail, setDetail] = useState<TaskExecutionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await schedulerApi.getExecution(executionId);
      setDetail(data);
    } catch (err) {
      setLoadError(extractErrorMessage(err, '执行详情加载失败'));
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [executionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCopy = async (text: string, label: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      message.success(`已复制${label}`);
    } catch {
      message.error('复制失败');
    }
  };

  const exitCode = getSummaryField(detail, 'exitCode');
  const stdout = getOutputText(detail, 'stdout');
  const stderr = getOutputText(detail, 'stderr');
  const truncated = Boolean(getSummaryField(detail, 'truncated'));
  const params = detail?.requestSummary?.params as Record<string, unknown> | undefined;

  const header = (
    <SchedulerHeader
      icon={<ClockCircleOutlined />}
      title="执行详情"
      subtitle={detail ? `#${detail.id} · ${TRIGGER_LABEL[detail.triggerType] ?? detail.triggerType}` : '加载中…'}
      actions={
        <>
          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => void load()}
          >
            刷新
          </Button>
          {detail && (
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(`/tools/task-scheduler/${detail.taskId}`)}
            >
              返回任务
            </Button>
          )}
        </>
      }
    />
  );

  return (
    <PageFadeIn>
      <div className="ts-page">
        {header}

        {loadError ? (
          <Alert
            type="error"
            showIcon
            message={loadError}
            action={<Button onClick={() => void load()}>重试</Button>}
          />
        ) : loading && !detail ? (
          <div className="ts-exec-detail-skeleton">
            <Skeleton active paragraph={{ rows: 4 }} />
            <Skeleton active paragraph={{ rows: 6 }} />
          </div>
        ) : detail ? (
          <>
            {/* ── 概览：状态 + 关键指标 ── */}
            <SchedulerPanel
              label="执行概览"
              meta={`#${detail.id}`}
              tone="accent"
              index={0}
            >
              <Descriptions size="small" column={3} bordered>
                <Descriptions.Item label="状态">
                  <ExecutionStatusTag status={detail.status} />
                </Descriptions.Item>
                <Descriptions.Item label="退出码">
                  <code className="ts-code">{exitCode == null ? '-' : String(exitCode)}</code>
                </Descriptions.Item>
                <Descriptions.Item label="触发方式">
                  <Tag>{TRIGGER_LABEL[detail.triggerType] ?? detail.triggerType}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="触发时间">
                  {formatDateTime(detail.triggeredAt)}
                </Descriptions.Item>
                <Descriptions.Item label="开始时间">
                  {formatDateTime(detail.startedAt)}
                </Descriptions.Item>
                <Descriptions.Item label="结束时间">
                  {formatDateTime(detail.finishedAt)}
                </Descriptions.Item>
                <Descriptions.Item label="耗时">
                  <span className="ts-exec-duration">
                    {formatDuration(detail.durationMs)}
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="重试次数">
                  {detail.retryCount > 0 ? (
                    <Tag color="warning">{detail.retryCount} 次</Tag>
                  ) : (
                    <span className="ts-muted">无重试</span>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="关联任务">
                  <Button
                    type="link"
                    size="small"
                    className="ts-exec-task-link"
                    onClick={() => navigate(`/tools/task-scheduler/${detail.taskId}`)}
                  >
                    #{detail.taskId}
                  </Button>
                </Descriptions.Item>
              </Descriptions>

              {detail.errorMessage && (
                <Alert
                  className="ts-exec-error-alert"
                  type={detail.status === 'TIMEOUT' ? 'warning' : 'error'}
                  showIcon
                  message="错误信息"
                  description={
                    <code className="ts-exec-error-text">{detail.errorMessage}</code>
                  }
                />
              )}
            </SchedulerPanel>

            {/* ── 参数快照 ── */}
            <SchedulerPanel
              label="参数快照"
              meta={params ? `${Object.keys(params).length} 个` : '无'}
              tone="target"
              index={1}
            >
              {params && Object.keys(params).length > 0 ? (
                <div className="ts-exec-params">
                  {Object.entries(params).map(([name, value]) => (
                    <div key={name} className="ts-exec-param-row">
                      <div className="ts-exec-param-head">
                        <code className="ts-exec-param-name">{name}</code>
                        <span className="ts-exec-param-env">
                          <span className="ts-muted">$</span>
                          {paramEnvName(name)}
                        </span>
                      </div>
                      <code className="ts-exec-param-value">{String(value)}</code>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="ts-muted">
                  本次执行未注入参数（脚本参数声明无默认值且任务未显式覆盖，或脚本无参数声明）
                </span>
              )}
            </SchedulerPanel>

            {/* ── 脚本输出 ── */}
            <SchedulerPanel
              label="脚本输出"
              meta={
                truncated ? (
                  <Tag color="warning">已截断（各 4KB 上限）</Tag>
                ) : null
              }
              tone="schedule"
              index={2}
            >
              <div className="ts-exec-output">
                <div className="ts-exec-output-block">
                  <div className="ts-exec-output-head">
                    <span className="ts-exec-output-label">
                      <span className="ts-exec-output-dot ts-exec-output-dot--out" aria-hidden="true" />
                      stdout
                    </span>
                    <div className="ts-exec-output-meta">
                      {stdout.length > 0 && <span className="ts-muted">{stdout.length} 字节</span>}
                      <Tooltip title="复制 stdout">
                        <Button
                          type="text"
                          size="small"
                          className="ts-exec-copy-btn"
                          icon={<CopyOutlined />}
                          disabled={!stdout}
                          onClick={() => void handleCopy(stdout, ' stdout')}
                        />
                      </Tooltip>
                    </div>
                  </div>
                  <pre className="ts-exec-output-pre ts-exec-output-pre--out">
                    {stdout || <span className="ts-muted">（无输出）</span>}
                  </pre>
                </div>

                <div className="ts-exec-output-block">
                  <div className="ts-exec-output-head">
                    <span className="ts-exec-output-label">
                      <span className="ts-exec-output-dot ts-exec-output-dot--err" aria-hidden="true" />
                      stderr
                    </span>
                    <div className="ts-exec-output-meta">
                      {stderr.length > 0 && <span className="ts-muted">{stderr.length} 字节</span>}
                      <Tooltip title="复制 stderr">
                        <Button
                          type="text"
                          size="small"
                          className="ts-exec-copy-btn"
                          icon={<CopyOutlined />}
                          disabled={!stderr}
                          onClick={() => void handleCopy(stderr, ' stderr')}
                        />
                      </Tooltip>
                    </div>
                  </div>
                  <pre className="ts-exec-output-pre ts-exec-output-pre--err">
                    {stderr || <span className="ts-muted">（无输出）</span>}
                  </pre>
                </div>
              </div>
            </SchedulerPanel>

            {/* ── 原始摘要 ── */}
            <SchedulerPanel
              label="原始摘要"
              meta="JSON"
              index={3}
            >
              <div className="ts-exec-raw">
                <div>
                  <div className="ts-exec-raw-title">request_summary</div>
                  <pre className="ts-body-preview">
                    {prettyJson(detail.requestSummary as Record<string, unknown> | null)}
                  </pre>
                </div>
                <div>
                  <div className="ts-exec-raw-title">response_summary</div>
                  <pre className="ts-body-preview">
                    {prettyJson(detail.responseSummary as Record<string, unknown> | null)}
                  </pre>
                </div>
              </div>
            </SchedulerPanel>
          </>
        ) : null}
      </div>
    </PageFadeIn>
  );
};

export default ExecutionDetailPage;
