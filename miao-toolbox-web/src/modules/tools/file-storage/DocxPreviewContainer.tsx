import { useRef, useEffect, useState } from 'react';
import { renderAsync } from 'docx-preview';
import { Spin } from 'antd';

interface DocxPreviewContainerProps {
  url: string;
}

const DocxPreviewContainer: React.FC<DocxPreviewContainerProps> = ({ url }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!url || !containerRef.current) return;

    const container = containerRef.current;
    // 清空之前的内容
    container.innerHTML = '';
    setLoading(true);
    setError(false);

    const renderDocx = async () => {
      try {
        const response = await fetch(url);
        const blob = await response.blob();

        await renderAsync(blob, container, undefined, {
          className: 'fs-docx-rendered',
          inWrapper: true,
          hideWrapperOnPrint: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
        });

        setLoading(false);
      } catch {
        setLoading(false);
        setError(true);
      }
    };

    renderDocx();
  }, [url]);

  return (
    <div className="fs-docx-viewer">
      {loading && (
        <div className="fs-docx-loading">
          <Spin tip="加载文档..." />
        </div>
      )}
      {error && (
        <div className="fs-docx-error">
          文档加载失败，请尝试下载后查看
        </div>
      )}
      <div ref={containerRef} className="fs-docx-container" />
    </div>
  );
};

export default DocxPreviewContainer;
