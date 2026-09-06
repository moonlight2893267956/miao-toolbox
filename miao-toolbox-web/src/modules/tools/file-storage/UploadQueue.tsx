import React, { useState } from 'react';
import { Button, Modal, Progress } from 'antd';
import {
  CheckCircleFilled,
  ClockCircleOutlined,
  CloseCircleFilled,
  CloseOutlined,
  ExclamationCircleFilled,
  LoadingOutlined,
  MinusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { getFileIcon } from './FileIcon';
import { formatSize } from './fileCategory';
import type { ConflictStrategy, UploadTask } from './types';

// ==================== 上传队列面板（Story 5.11 / FR-35） ====================
// 右下角悬浮面板：逐文件进度、排队/取消/失败重试、可折叠。跟随主题 CSS 变量。

interface UploadQueuePanelProps {
  tasks: UploadTask[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onCancel: (uid: string) => void;
  onRetry: (uid: string) => void;
  onClearFinished: () => void;
  onClose: () => void;
}

const statusIcon = (task: UploadTask) => {
  switch (task.status) {
    case 'uploading':
      return <LoadingOutlined spin className="fs-upload-status fs-upload-status--uploading" />;
    case 'queued':
      return <ClockCircleOutlined className="fs-upload-status fs-upload-status--queued" />;
    case 'success':
      return <CheckCircleFilled className="fs-upload-status fs-upload-status--success" />;
    case 'error':
      return <CloseCircleFilled className="fs-upload-status fs-upload-status--error" />;
    case 'canceled':
      return <CloseCircleFilled className="fs-upload-status fs-upload-status--canceled" />;
    default:
      return null;
  }
};

const statusText = (task: UploadTask) => {
  switch (task.status) {
    case 'queued':
      return '排队中';
    case 'uploading':
      return `${task.progress}%`;
    case 'success':
      return '已完成';
    case 'error':
      return task.errorMsg ?? '上传失败';
    case 'canceled':
      return '已取消';
    default:
      return '';
  }
};

export const UploadQueuePanel: React.FC<UploadQueuePanelProps> = ({
  tasks, collapsed, onToggleCollapse, onCancel, onRetry, onClearFinished, onClose,
}) => {
  if (tasks.length === 0) return null;

  const settled = tasks.filter(t => t.status === 'success' || t.status === 'canceled').length;
  const failed = tasks.filter(t => t.status === 'error').length;
  const hasFinished = settled + failed > 0;

  if (collapsed) {
    const hasActive = tasks.some(t => t.status === 'uploading' || t.status === 'queued');
    return (
      <button type="button" className="fs-upload-panel fs-upload-panel--collapsed" onClick={onToggleCollapse}>
        {hasActive ? (
          <LoadingOutlined spin />
        ) : failed > 0 ? (
          <CloseCircleFilled className="fs-upload-status--error" />
        ) : (
          <CheckCircleFilled className="fs-upload-status--success" />
        )}
        <span>{hasFinished ? `${settled}/${tasks.length}` : `${tasks.length} 个任务`}</span>
        {failed > 0 && <span className="fs-upload-fail-badge">{failed}</span>}
      </button>
    );
  }

  return (
    <div className="fs-upload-panel">
      <div className="fs-upload-panel__header">
        <span className="fs-upload-panel__title">
          上传队列（{hasFinished ? `${settled + failed}/${tasks.length}` : `${tasks.length}`}）
        </span>
        <span className="fs-upload-panel__actions">
          {hasFinished && (
            <Button type="link" size="small" onClick={onClearFinished}>清除已完成</Button>
          )}
          <Button type="text" size="small" icon={<MinusOutlined />} onClick={onToggleCollapse} aria-label="收起" />
          <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} aria-label="关闭" />
        </span>
      </div>
      <div className="fs-upload-panel__list">
        {tasks.map(task => (
          <div key={task.uid} className={`fs-upload-row fs-upload-row--${task.status}`}>
            <div className="fs-upload-row__icon">{statusIcon(task)}</div>
            <div className="fs-upload-row__body">
              <div className="fs-upload-row__name" title={task.file.name}>{task.file.name}</div>
              <div className="fs-upload-row__meta">
                <span>{formatSize(task.file.size)}</span>
                <span className="fs-upload-row__status">{statusText(task)}</span>
              </div>
              {(task.status === 'uploading' || task.status === 'success') && (
                <Progress
                  percent={task.progress}
                  size="small"
                  showInfo={false}
                  status={task.status === 'success' ? 'success' : 'active'}
                />
              )}
            </div>
            <div className="fs-upload-row__ops">
              {(task.status === 'uploading' || task.status === 'queued') && (
                <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => onCancel(task.uid)} aria-label="取消" />
              )}
              {task.status === 'error' && (
                <Button type="text" size="small" icon={<ReloadOutlined />} onClick={() => onRetry(task.uid)} aria-label="重试" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ==================== 同名冲突策略弹窗（Story 5.11 / FR-36） ====================
// 上传 / 移动 / 粘贴共用。每个策略有独立颜色身份，选中态一目了然。

export interface ConflictDecision {
  name: string;
  strategy: ConflictStrategy;
}

export interface ConflictFileMeta {
  name: string;
  mimeType?: string;
}

interface ConflictStrategyModalProps {
  open: boolean;
  fileNames: string[];
  conflictFiles: ConflictFileMeta[];
  onDecide: (decisions: ConflictDecision[] | null) => void;
}

/** 策略元数据：标签 + 主题色。replace=红、keepBoth=蓝、skip=灰 */
const STRATEGY_META: Record<ConflictStrategy, { label: string; color: string }> = {
  replace:  { label: '替换',     color: '#ef4444' },
  keepBoth: { label: '保留两者', color: '#3b82f6' },
  skip:     { label: '跳过',     color: '#94a3b8' },
};

const STRATEGY_ORDER: ConflictStrategy[] = ['replace', 'keepBoth', 'skip'];

/**
 * 策略选择按钮组——三个等宽按钮，选中项填充对应主题色 + 白字，
 * 未选中项为透明底 + 彩色文字 + 细边框。扫一眼就知道每行选了什么。
 */
const StrategyButtons: React.FC<{
  value: ConflictStrategy;
  onChange: (v: ConflictStrategy) => void;
}> = ({ value, onChange }) => (
  <div className="fs-strategy-btns">
    {STRATEGY_ORDER.map(s => {
      const meta = STRATEGY_META[s];
      const active = value === s;
      return (
        <button
          key={s}
          type="button"
          className={`fs-strategy-btn${active ? ' fs-strategy-btn--active' : ''}`}
          style={{
            '--strategy-color': meta.color,
            background: active ? meta.color : 'transparent',
            color: active ? '#fff' : meta.color,
            borderColor: active ? meta.color : `${meta.color}40`,
          } as React.CSSProperties}
          onClick={() => onChange(s)}
        >
          {meta.label}
        </button>
      );
    })}
  </div>
);

export const ConflictStrategyModal: React.FC<ConflictStrategyModalProps> = ({
  open, fileNames, conflictFiles, onDecide,
}) => {
  const [strategies, setStrategies] = useState<Record<string, ConflictStrategy>>({});

  // 每次打开重置为默认策略（冲突文件默认「保留两者」）
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const init: Record<string, ConflictStrategy> = {};
      conflictFiles.forEach(f => { init[f.name] = 'keepBoth'; });
      setStrategies(init);
    }
  }

  const applyToAll = (strategy: ConflictStrategy) => {
    const next: Record<string, ConflictStrategy> = {};
    conflictFiles.forEach(f => { next[f.name] = strategy; });
    setStrategies(next);
  };

  /** 全部冲突文件策略一致时返回该值，否则 undefined（应用到全部按钮组高亮） */
  const applyAllValue = conflictFiles.length > 0
    ? STRATEGY_ORDER.find(s => conflictFiles.every(f => (strategies[f.name] ?? 'keepBoth') === s))
    : undefined;

  return (
    <Modal
      open={open}
      title={null}
      footer={null}
      onCancel={() => onDecide(null)}
      width={480}
      maskClosable={false}
      className="fs-conflict-modal"
    >
      {/* 头部：琥珀警示条 + 标题 */}
      <div className="fs-conflict-head">
        <span className="fs-conflict-head__icon">
          <ExclamationCircleFilled />
        </span>
        <div className="fs-conflict-head__text">
          <div className="fs-conflict-head__title">检测到同名文件</div>
          <div className="fs-conflict-head__sub">
            目标目录中已存在 <strong>{conflictFiles.length}</strong> 个同名文件
          </div>
        </div>
      </div>

      {/* 应用到全部 */}
      <div className="fs-conflict-apply-all">
        <span className="fs-conflict-apply-all__label">应用到全部</span>
        <StrategyButtons
          value={applyAllValue ?? 'keepBoth'}
          onChange={applyToAll}
        />
      </div>

      {/* 冲突文件列表 */}
      <div className="fs-conflict-list">
        {conflictFiles.length === 0 ? (
          <div className="fs-conflict-empty">未检测到冲突文件</div>
        ) : (
          conflictFiles.map(f => (
            <div key={f.name} className="fs-conflict-item">
              <span className="fs-conflict-item__icon">
                {getFileIcon(f.mimeType ?? '', 'fs-conflict-file-icon', f.name)}
              </span>
              <span className="fs-conflict-item__name" title={f.name}>{f.name}</span>
              <StrategyButtons
                value={strategies[f.name] ?? 'keepBoth'}
                onChange={v => setStrategies(prev => ({ ...prev, [f.name]: v }))}
              />
            </div>
          ))
        )}
      </div>

      {/* 底部 */}
      <div className="fs-conflict-footer">
        <Button onClick={() => onDecide(null)}>取消</Button>
        <Button
          type="primary"
          onClick={() => onDecide(fileNames.map(name => ({ name, strategy: strategies[name] ?? 'keepBoth' })))}
        >
          开始处理
        </Button>
      </div>
    </Modal>
  );
};
