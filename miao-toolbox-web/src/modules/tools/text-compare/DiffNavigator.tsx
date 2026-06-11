import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Button, Tag } from 'antd';
import { UpOutlined, DownOutlined } from '@ant-design/icons';
import { useDiffContext } from './useDiffContext';

interface DiffNavigatorProps {
  hunkRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
}

/**
 * 差异块导航 — 上/下一处箭头 + 当前位置/总数
 */
const DiffNavigator: React.FC<DiffNavigatorProps> = ({ hunkRefs }) => {
  const { state } = useDiffContext();
  const [currentIndex, setCurrentIndex] = useState(0);
  const prevTotal = useRef(0);

  const totalHunks = useMemo(() => {
    if (!state.diffResult?.hunks) return 0;
    return state.diffResult.hunks.filter(h => h.type !== 'unchanged').length;
  }, [state.diffResult]);

  // totalHunks 变化时重置索引
  useEffect(() => {
    if (prevTotal.current !== 0 && prevTotal.current !== totalHunks) {
      setCurrentIndex(0);
    }
    prevTotal.current = totalHunks;
  }, [totalHunks]);

  const goTo = (index: number) => {
    const ref = hunkRefs.current[index];
    if (ref) {
      ref.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setCurrentIndex(index);
    }
  };

  if (totalHunks === 0) return null;

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '4px 12px', background: 'var(--miao-surface, #fff)',
      border: '1px solid var(--miao-border, #e6e3f0)', borderRadius: 20,
    }}>
      <Button type="text" size="small" icon={<UpOutlined />}
        disabled={currentIndex === 0}
        onClick={() => goTo(currentIndex - 1)}
        aria-label="上一处差异" />
      <Tag color="default" style={{ minWidth: 48, textAlign: 'center', margin: 0 }}>
        {currentIndex + 1}/{totalHunks}
      </Tag>
      <Button type="text" size="small" icon={<DownOutlined />}
        disabled={currentIndex >= totalHunks - 1}
        onClick={() => goTo(currentIndex + 1)}
        aria-label="下一处差异" />
    </div>
  );
};

export default DiffNavigator;
