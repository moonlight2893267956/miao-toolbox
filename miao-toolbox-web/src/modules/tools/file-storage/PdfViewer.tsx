import { useState, useCallback, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Button, Space, Tooltip, Spin } from 'antd';
import {
  ZoomInOutlined,
  ZoomOutOutlined,
  LeftOutlined,
  RightOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
} from '@ant-design/icons';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// 配置 pdfjs worker：使用 Vite 打包本地 worker，避免依赖 unpkg 等外部 CDN（自托管/内网环境不可达时 PDF 预览会失败）
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface PdfViewerProps {
  url: string;
  fileName?: string;
}

const SCALE_STEP = 0.25;
const SCALE_MIN = 0.5;
const SCALE_MAX = 3.0;
const SCALE_DEFAULT = 1.2;

const PdfViewer: React.FC<PdfViewerProps> = ({ url, fileName }) => {
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(SCALE_DEFAULT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
    setLoading(false);
    setError(false);
  }, []);

  const onDocumentLoadError = useCallback(() => {
    setLoading(false);
    setError(true);
  }, []);

  const goToPrev = () => setPageNumber((p) => Math.max(1, p - 1));
  const goToNext = () => setPageNumber((p) => Math.min(numPages, p + 1));
  const zoomIn = () => setScale((s) => Math.min(SCALE_MAX, +(s + SCALE_STEP).toFixed(2)));
  const zoomOut = () => setScale((s) => Math.max(SCALE_MIN, +(s - SCALE_STEP).toFixed(2)));
  const resetZoom = () => setScale(SCALE_DEFAULT);

  const toggleFullscreen = () => {
    const container = document.querySelector('.fs-pdf-viewer');
    if (!container) return;
    if (!fullscreen) {
      container.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  // 监听 fullscreen 变化
  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  return (
    <div className={`fs-pdf-viewer${fullscreen ? ' fs-pdf-viewer--fullscreen' : ''}`}>
      {/* 工具栏 */}
      <div className="fs-pdf-toolbar">
        <div className="fs-pdf-toolbar-left">
          <Space size={4}>
            <Tooltip title="上一页">
              <Button
                type="text"
                size="small"
                icon={<LeftOutlined />}
                disabled={pageNumber <= 1}
                onClick={goToPrev}
              />
            </Tooltip>
            <span className="fs-pdf-page-info">
              {pageNumber} / {numPages}
            </span>
            <Tooltip title="下一页">
              <Button
                type="text"
                size="small"
                icon={<RightOutlined />}
                disabled={pageNumber >= numPages}
                onClick={goToNext}
              />
            </Tooltip>
          </Space>
        </div>

        <div className="fs-pdf-toolbar-center">
          {fileName && <span className="fs-pdf-filename">{fileName}</span>}
        </div>

        <div className="fs-pdf-toolbar-right">
          <Space size={4}>
            <Tooltip title="缩小">
              <Button
                type="text"
                size="small"
                icon={<ZoomOutOutlined />}
                disabled={scale <= SCALE_MIN}
                onClick={zoomOut}
              />
            </Tooltip>
            <Button type="text" size="small" className="fs-pdf-scale-btn" onClick={resetZoom}>
              {Math.round(scale * 100)}%
            </Button>
            <Tooltip title="放大">
              <Button
                type="text"
                size="small"
                icon={<ZoomInOutlined />}
                disabled={scale >= SCALE_MAX}
                onClick={zoomIn}
              />
            </Tooltip>
            <Tooltip title={fullscreen ? '退出全屏' : '全屏'}>
              <Button
                type="text"
                size="small"
                icon={fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                onClick={toggleFullscreen}
              />
            </Tooltip>
          </Space>
        </div>
      </div>

      {/* 文档区域 */}
      <div className="fs-pdf-document">
        {loading && (
          <div className="fs-pdf-loading">
            <Spin tip="加载 PDF..." />
          </div>
        )}

        {error && (
          <div className="fs-pdf-error">
            <span>PDF 加载失败，请尝试下载后查看</span>
          </div>
        )}

        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading=""
          className="fs-pdf-doc"
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            renderTextLayer
            renderAnnotationLayer
            className="fs-pdf-page"
          />
        </Document>
      </div>
    </div>
  );
};

export default PdfViewer;
