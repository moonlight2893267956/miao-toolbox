import { useEffect, useState, useRef } from 'react';
import { notificationService } from '../services/notificationService';

/**
 * 消息配图加载工具
 *
 * 因安全体系要求所有 API 携带 JWT，`<img>` 标签无法附加 Authorization 头，
 * 故通过 axios 获取 blob 后创建 ObjectURL 渲染。
 */

/** 一次性获取消息图片 ObjectURL（调用方负责在不再使用时 revokeObjectURL） */
export async function loadMessageImageObjectUrl(messageId: number): Promise<string> {
  const blob = await notificationService.fetchMessageImage(messageId);
  return URL.createObjectURL(blob);
}

/**
 * 消息图片 hook：组件挂载/ messageId 变化时加载图片 blob，
 * 卸载时自动 revoke ObjectURL 防止内存泄漏。
 */
export function useMessageImage(messageId: number | null): {
  imageUrl: string | null;
  loading: boolean;
  error: boolean;
} {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!messageId) {
      // 延迟到渲染后更新，避免 effect 内同步 setState 造成级联渲染
      queueMicrotask(() => {
        if (!cancelled) {
          setImageUrl(null);
          setLoading(false);
          setError(false);
        }
      });
      return;
    }

    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setError(false);

      notificationService.fetchMessageImage(messageId)
        .then((blob) => {
          if (cancelled) return;
          if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
          }
          const url = URL.createObjectURL(blob);
          objectUrlRef.current = url;
          setImageUrl(url);
        })
        .catch(() => {
          if (!cancelled) {
            setError(true);
            setImageUrl(null);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });

    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [messageId]);

  return { imageUrl, loading, error };
}

/** 手动释放 ObjectURL（供一次性加载场景使用） */
export function revokeObjectUrl(url: string | null) {
  if (url) URL.revokeObjectURL(url);
}
