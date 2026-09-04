import { useCallback, useEffect, useRef, useState } from 'react';

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface UseRubberBandOptions {
  /** 查找参与框选的卡片元素（返回 id 与 DOMRect 数组） */
  getItems: () => { id: string; rect: DOMRect }[];
  /** 框选结果回调，additive=true 时追加到已有选中集合 */
  onSelect: (ids: string[], additive: boolean) => void;
  /** 滚动容器 ref（自动滚动边缘检测 + mousedown 监听挂载点，覆盖网格外的空白区域） */
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  /** 开始拖拽阈值（px），超过才开始框选 */
  threshold?: number;
  /** 边缘自动滚动检测距离（px） */
  edgeThreshold?: number;
  /** 自动滚动速度（px/frame） */
  scrollSpeed?: number;
}

/**
 * 橡皮筋框选 hook
 *
 * 与 dnd-kit PointerSensor 共存策略：
 * - mousedown 在卡片上时（target.closest('.fs-grid-item')）不启动框选，交给 dnd-kit
 * - mousedown 在空白处时启动框选监听，移动超过 threshold 才绘制选框
 * - mousemove/mouseup 绑定在 document 上，避免拖到容器边缘外丢失事件
 *
 * containerEl 通过 callback ref 传入（而非 RefObject），确保 DOM 元素挂载/切换时
 * useEffect 重新执行并重新绑定监听器。
 */
export function useRubberBandSelection({
  getItems,
  onSelect,
  scrollContainerRef,
  threshold = 8,
  edgeThreshold = 40,
  scrollSpeed = 8,
}: UseRubberBandOptions) {
  const [marqueeRect, setMarqueeRect] = useState<Rect | null>(null);

  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const additiveRef = useRef(false);
  const scrollRafRef = useRef<number | null>(null);
  const lastMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // 框选拖拽结束后，浏览器会把 click 派发到 mousedown/mouseup 的公共祖先，
  // 该 click 会命中外层的「空白处点击清空」逻辑，误清刚框选的结果——需吞掉
  const suppressClickRef = useRef(false);

  // 最新回调的 ref，避免 effect 依赖频繁变化
  const getItemsRef = useRef(getItems);
  const onSelectRef = useRef(onSelect);
  getItemsRef.current = getItems;
  onSelectRef.current = onSelect;

  const rectsIntersect = (a: DOMRect, b: Rect): boolean => {
    return !(
      a.right < b.left ||
      a.left > b.left + b.width ||
      a.bottom < b.top ||
      a.top > b.top + b.height
    );
  };

  const updateSelection = useCallback((rect: Rect) => {
    const items = getItemsRef.current();
    const hitIds = items
      .filter(({ rect: itemRect }) => rectsIntersect(itemRect, rect))
      .map(({ id }) => id);
    onSelectRef.current(hitIds, additiveRef.current);
  }, []);

  const handleAutoScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || !isDraggingRef.current) return;

    const mouseY = lastMouseRef.current.y;
    const containerRect = container.getBoundingClientRect();
    const topEdge = containerRect.top + edgeThreshold;
    const bottomEdge = containerRect.bottom - edgeThreshold;

    if (mouseY < topEdge) {
      container.scrollBy(0, -scrollSpeed);
    } else if (mouseY > bottomEdge) {
      container.scrollBy(0, scrollSpeed);
    }

    scrollRafRef.current = requestAnimationFrame(handleAutoScroll);
  }, [scrollContainerRef, edgeThreshold, scrollSpeed]);

  // 清理拖拽状态
  const cleanupDrag = useCallback(() => {
    isDraggingRef.current = false;
    setMarqueeRect(null);
    startPointRef.current = null;
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) {
        // 非左键时若正在拖拽，先清理
        if (isDraggingRef.current) cleanupDrag();
        return;
      }

      const target = e.target as HTMLElement;
      // 按下在卡片上 → 交给 dnd-kit
      if (target.closest('.fs-grid-item')) return;
      // 不在列表区域内 → 忽略（允许在网格容器外的空白区域启动框选）
      if (!container.contains(target)) return;

      startPointRef.current = { x: e.clientX, y: e.clientY };
      additiveRef.current = e.metaKey || e.ctrlKey;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!startPointRef.current) return;

      const start = startPointRef.current;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      lastMouseRef.current = { x: e.clientX, y: e.clientY };

      if (!isDraggingRef.current && dist < threshold) return;

      isDraggingRef.current = true;

      const left = Math.min(start.x, e.clientX);
      const top = Math.min(start.y, e.clientY);
      const width = Math.abs(dx);
      const height = Math.abs(dy);

      const rect: Rect = { left, top, width, height };
      setMarqueeRect(rect);
      updateSelection(rect);

      if (scrollRafRef.current === null) {
        scrollRafRef.current = requestAnimationFrame(handleAutoScroll);
      }
    };

    const onMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        suppressClickRef.current = true;
        setMarqueeRect(null);
      }
      startPointRef.current = null;
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };

    // 捕获阶段拦截框选拖拽后的 click，阻止其到达 React 的空白点击处理
    const onClickCapture = (e: MouseEvent) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        e.stopPropagation();
        e.preventDefault();
      }
    };

    // mousedown 绑定在滚动容器（.fs-list-area），覆盖网格容器外的空白区域
    container.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('click', onClickCapture, true);
    // 窗口失焦时清理（Alt+Tab / 切换标签页等场景）
    window.addEventListener('blur', onMouseUp);

    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('blur', onMouseUp);
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [scrollContainerRef, threshold, updateSelection, handleAutoScroll, cleanupDrag]);

  return { marqueeRect };
}
