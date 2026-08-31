import React, { useEffect, useRef, useState } from 'react';
import { fileStorageApi } from './fileStorageApi';

/**
 * 模块级 Blob URL 缓存：fileId → objectURL
 *
 * 同一目录下反复滚动 / 切回时避免重复请求后端。
 * 页面刷新自然清空（Blob 随页面生命周期回收）。
 */
const thumbCache = new Map<number, string>();

interface GridThumbnailProps {
  fileId: number;
  fileName: string;
}

/**
 * 网格视图图片缩略图
 *
 * - 仅用于 image 类型文件
 * - IntersectionObserver 懒加载：滚入视口才请求
 * - Blob URL 缓存：同 fileId 不重复请求
 * - 加载中展示骨架微光，失败回退到文件名首字
 */
const GridThumbnail: React.FC<GridThumbnailProps> = ({ fileId, fileName }) => {
  const [url, setUrl] = useState<string | null>(thumbCache.get(fileId) ?? null);
  const [failed, setFailed] = useState(false);
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 懒加载：元素进入视口时触发请求
  useEffect(() => {
    if (url) return; // 已有缓存或已加载
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }, // 提前 200px 预加载
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [url]);

  // 进入视口后拉取缩略图
  useEffect(() => {
    if (!inView || url) return;
    let cancelled = false;
    void (async () => {
      try {
        const blob = await fileStorageApi.previewFile(fileId);
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        thumbCache.set(fileId, objectUrl);
        setUrl(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [inView, fileId, url]);

  if (failed) {
    // 加载失败：回退到文件名首字符占位
    return (
      <div className="fs-grid-thumb fs-grid-thumb--image-fallback">
        <span>{fileName.charAt(0).toUpperCase()}</span>
      </div>
    );
  }

  if (url) {
    return (
      <div className="fs-grid-thumb fs-grid-thumb--image" ref={ref}>
        <img src={url} alt={fileName} loading="lazy" />
      </div>
    );
  }

  // 加载中 / 等待进入视口：骨架微光
  return (
    <div className="fs-grid-thumb fs-grid-thumb--image-loading" ref={ref}>
      <div className="fs-grid-thumb-shimmer" />
    </div>
  );
};

export default GridThumbnail;
