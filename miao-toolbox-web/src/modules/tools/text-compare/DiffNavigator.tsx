import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useDiffContext } from './useDiffContext';

interface DiffNavigatorProps {
  hunkRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
}

const DiffNavigator: React.FC<DiffNavigatorProps> = ({ hunkRefs }) => {
  const { state } = useDiffContext();
  const [currentIndex, setCurrentIndex] = useState(0);
  const prevTotal = useRef(0);

  const totalHunks = useMemo(() => {
    if (!state.diffResult?.hunks) return 0;
    return state.diffResult.hunks.filter(h => h.type !== 'unchanged').length;
  }, [state.diffResult]);

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
    <div className="dt-nav-bubble">
      <button
        className="dt-nav-btn"
        disabled={currentIndex === 0}
        onClick={() => goTo(currentIndex - 1)}
        aria-label="上一处"
      >↑</button>
      <span className="dt-nav-label">{currentIndex + 1}/{totalHunks}</span>
      <button
        className="dt-nav-btn"
        disabled={currentIndex >= totalHunks - 1}
        onClick={() => goTo(currentIndex + 1)}
        aria-label="下一处"
      >↓</button>
    </div>
  );
};

export default DiffNavigator;
