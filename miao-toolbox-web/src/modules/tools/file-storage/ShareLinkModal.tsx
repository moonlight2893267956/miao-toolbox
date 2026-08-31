import React, { useState } from 'react';
import { Button, Modal, Segmented, Select, message } from 'antd';
import { CheckOutlined, CopyOutlined, LinkOutlined } from '@ant-design/icons';
import { fileStorageApi } from './fileStorageApi';
import { formatSize } from './fileCategory';
import { getFileIcon } from './FileIcon';
import type { FileInfo, ShareLinkInfo } from './types';

export type ExpireOption = '1' | '7' | '30' | 'forever';
export type VisitOption = 'unlimited' | '10' | '50' | '100';

export interface ShareLinkModalProps {
  open: boolean;
  file: FileInfo | null;
  onClose: () => void;
  /** 创建成功后回调，用于刷新「我的分享」列表 */
  onCreated?: () => void;
}

/** 复制到剪贴板，成功后展示轻提示 */
async function copyText(text: string, tip: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    message.success(tip);
    return true;
  } catch {
    message.error('复制失败，请手动选择复制');
    return false;
  }
}

const ShareLinkModal: React.FC<ShareLinkModalProps> = ({ open, file, onClose, onCreated }) => {
  const [expire, setExpire] = useState<ExpireOption>('7');
  const [visits, setVisits] = useState<VisitOption>('unlimited');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<ShareLinkInfo | null>(null);
  const [copied, setCopied] = useState(false);

  // 说明：弹窗打开/切换文件时的状态重置由父组件的 key 触发（重建实例），
  // 避免在 effect 里同步 setState 造成的级联渲染。

  const fullUrl = created ? `${window.location.origin}${created.shareUrl}` : '';

  const handleCreate = async () => {
    if (!file) return;
    setCreating(true);
    try {
      const payload = {
        fileId: file.id,
        expireDays: expire === 'forever' ? null : Number(expire),
        maxVisits: visits === 'unlimited' ? null : Number(visits),
      };
      const link = await fileStorageApi.createShareLink(payload);
      setCreated(link);
      onCreated?.();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
        || (e instanceof Error ? e.message : '');
      message.error(msg || '创建分享链接失败');
    } finally {
      setCreating(false);
    }
  };

  const handleCopyAll = async () => {
    if (!created) return;
    const sizeText = file ? formatSize(file.sizeBytes) : '';
    const text = [
      '【阿渺工具箱】文件分享',
      file ? `文件：${file.fileName}${sizeText ? `（${sizeText}）` : ''}` : '',
      `链接：${fullUrl}`,
      `提取码：${created.accessCode ?? ''}`,
    ].filter(Boolean).join('\n');
    const ok = await copyText(text, '链接和提取码已复制，快去分享吧');
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Modal
      title={
        <span className="fs-share-title">
          <LinkOutlined className="fs-share-title-icon" />
          {created ? '分享链接已创建' : '创建分享链接'}
        </span>
      }
      open={open}
      onCancel={onClose}
      width={520}
      destroyOnClose
      rootClassName="fs-modal"
      footer={[
        <Button key="close" onClick={onClose}>
          {created ? '完成' : '取消'}
        </Button>,
        ...(created
          ? [<Button key="again" onClick={() => setCreated(null)}>再创建一条</Button>]
          : [
              <Button
                key="create"
                type="primary"
                loading={creating}
                disabled={!file}
                onClick={handleCreate}
              >
                创建链接
              </Button>,
            ]),
      ]}
    >
      {file && (
        <div className="fs-share-body">
          <div className="fs-share-file-name">
            {getFileIcon(file.mimeType, undefined, file.fileName)}
            <span title={file.fileName}>{file.fileName}</span>
            <span className="fs-share-file-size">{formatSize(file.sizeBytes)}</span>
          </div>

          {!created ? (
            <>
              <div className="fs-share-field">
                <div className="fs-share-field-label">有效期</div>
                <Segmented
                  block
                  value={expire}
                  onChange={(v) => setExpire(v as ExpireOption)}
                  options={[
                    { label: '1 天', value: '1' },
                    { label: '7 天', value: '7' },
                    { label: '30 天', value: '30' },
                    { label: '永久', value: 'forever' },
                  ]}
                />
              </div>

              <div className="fs-share-field">
                <div className="fs-share-field-label">访问次数上限</div>
                <Select
                  value={visits}
                  onChange={setVisits}
                  style={{ width: 160 }}
                  options={[
                    { value: 'unlimited', label: '不限次数' },
                    { value: '10', label: '10 次' },
                    { value: '50', label: '50 次' },
                    { value: '100', label: '100 次' },
                  ]}
                />
              </div>

              <div className="fs-share-note">
                提取码由系统自动生成，创建后请妥善保存。拿到链接的人无需登录，输入提取码即可查看与下载该文件。
              </div>
            </>
          ) : (
            <>
              <div className="fs-share-ticket">
                <div className="fs-share-ticket-label">分享链接</div>
                <code className="fs-share-ticket-url" title={fullUrl}>{fullUrl}</code>
                <div className="fs-share-ticket-divider" />
                <div className="fs-share-ticket-label">提取码</div>
                <div className="fs-share-code-boxes">
                  {(created.accessCode ?? '').split('').map((ch, i) => (
                    <span
                      key={i}
                      className="fs-share-code-char"
                      style={{ '--i': i } as React.CSSProperties}
                    >
                      {ch}
                    </span>
                  ))}
                </div>
              </div>

              <Button
                type="primary"
                size="large"
                block
                icon={copied ? <CheckOutlined /> : <CopyOutlined />}
                className={copied ? 'fs-share-copy-all is-copied' : 'fs-share-copy-all'}
                onClick={handleCopyAll}
              >
                {copied ? '已复制，快去分享吧' : '复制链接和提取码'}
              </Button>

              <div className="fs-share-note fs-share-note--warn">
                提取码仅在此处显示一次，关闭后将无法再次查看，请及时保存。
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
};

export default ShareLinkModal;
