import { memo, useCallback } from 'react';
import type { BreadcrumbSegment } from '../utils/breadcrumb';

// ─── Props ──────────────────────────────────────────────

interface BreadcrumbProps {
  segments: BreadcrumbSegment[];
  onNavigate: (path: string) => void;
}

// ─── 组件 ────────────────────────────────────────────────

const Breadcrumb = memo(function Breadcrumb({ segments, onNavigate }: BreadcrumbProps) {
  const handleClick = useCallback(
    (path: string, e: React.MouseEvent) => {
      e.preventDefault();
      onNavigate(path);
    },
    [onNavigate],
  );

  if (segments.length === 0) return null;

  return (
    <nav className="jw-breadcrumb" aria-label="JSON 路径导航">
      <ol className="jw-breadcrumb__list">
        {segments.map((seg, i) => {
          const isLast = i === segments.length - 1;
          return (
            <li key={seg.path} className="jw-breadcrumb__item">
              {i > 0 && <span className="jw-breadcrumb__sep">/</span>}
              {isLast ? (
                <span className="jw-breadcrumb__current">{seg.label}</span>
              ) : (
                <button
                  className="jw-breadcrumb__link"
                  onClick={(e) => handleClick(seg.path, e)}
                  title={seg.path}
                >
                  {seg.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
});

export default Breadcrumb;
