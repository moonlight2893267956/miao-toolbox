/** 与后端 NetworkToolMeta 对齐的网络工具元数据 */
export interface NetworkToolMeta {
  id: string;
  name: string;
  category: string;
  phase: number;
  description: string;
  icon: string;
  route: string;
}

/**
 * 当前已上线的最高 Phase（含）。
 * phase ≤ 此值：入口开放（详情页可为占位壳）
 * phase > 此值：卡片显示「即将推出」
 */
/** Phase 2：服务端代理工具（TCP Ping 等）已开放入口 */
export const NETWORK_ONLINE_PHASE = 2;

export const NETWORK_CATEGORY_ORDER = [
  'converter',
  'generator',
  'analyzer',
  'inspector',
  'ai',
] as const;

export const NETWORK_CATEGORY_LABELS: Record<string, string> = {
  converter: '编码转换',
  generator: '配置生成',
  analyzer: '内容分析',
  inspector: '网络检查',
  ai: 'AI 助手',
};

export function isNetworkToolOnline(phase: number): boolean {
  return phase <= NETWORK_ONLINE_PHASE;
}
