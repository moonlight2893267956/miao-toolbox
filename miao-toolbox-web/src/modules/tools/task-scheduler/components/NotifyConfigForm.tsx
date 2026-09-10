import React from 'react';
import { Alert } from 'antd';
import type { NotifyConfig } from '../types';

interface NotifyConfigFormProps {
  /**
   * 详情里读到的既有配置。
   *
   * Epic 2 未交付期间不做可视化编辑，但保存时会把该对象原样回传——
   * 后端 updateTask 用请求里的 notifyConfig 整体覆盖，漏传即等于清空。
   */
  existing?: NotifyConfig | null;
}

function describe(notify?: NotifyConfig | null): string {
  if (!notify) return '当前任务未配置通知。';
  const parts: string[] = [];
  if (notify.webhook?.url) parts.push(`Webhook：${notify.webhook.url}`);
  if (notify.email?.recipients?.length) parts.push(`邮件：${notify.email.recipients.join('、')}`);
  return parts.length > 0
    ? `已配置——${parts.join('；')}（本次保存将原样保留）`
    : '当前任务未配置通知。';
}

/** 通知配置占位（FR-10/FR-11 由 Epic 2 交付） */
const NotifyConfigForm: React.FC<NotifyConfigFormProps> = ({ existing }) => (
  <Alert
    type="info"
    showIcon
    message="通知配置（Webhook / 邮件）将在 Epic 2 交付"
    description={describe(existing)}
  />
);

export default NotifyConfigForm;
