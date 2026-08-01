/**
 * 跨组件轻量级状态共享：差异结果全屏开关。
 *
 * 用途：DiffViewer 切换全屏时通知 AIAnalysisDock 隐藏浮层，
 * 避免 React Portal 渲染的 AI 浮层遮挡全屏视图。
 *
 * 使用模块级单例 + 订阅模式，不依赖 React Context，
 * 适用于跨组件（包括 Portal）共享的瞬时 UI 状态。
 */

let _fullscreen = false;
const listeners = new Set<(v: boolean) => void>();

export const diffFullscreenStore = {
  get(): boolean {
    return _fullscreen;
  },
  set(next: boolean): void {
    if (_fullscreen === next) return;
    _fullscreen = next;
    listeners.forEach((l) => l(next));
  },
  subscribe(listener: (v: boolean) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};