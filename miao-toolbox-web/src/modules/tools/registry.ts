import type { ComponentType } from 'react';
import {
  AudioOutlined,
  DiffOutlined,
  PictureOutlined,
  TranslationOutlined,
} from '@ant-design/icons';

/**
 * 工具分组分类：
 * - `available`：已可用，可直接进入工具页面
 * - `coming-soon`：暂未接入，仅展示占位
 */
export type ToolCategory = 'available' | 'coming-soon';

/**
 * 工具元数据：纯数据描述，可在工具页、侧边栏、概览等多处复用。
 * 渲染方负责将 `icon` 渲染为 JSX（例如 `<tool.icon />`）。
 */
export interface ToolMeta {
  /** 唯一标识，对应路由 slug */
  key: string;
  /** 展示标题 */
  title: string;
  /** 一句话描述 */
  description: string;
  /** 图标组件引用 */
  icon: ComponentType;
  /** UI 展示用的状态文案 */
  status: string;
  /** 标签，用于筛选 / 视觉点缀 */
  tags: string[];
  /** 路由路径；未实现时为 `null` */
  path: string | null;
  /** 工具分类（用于分组） */
  category: ToolCategory;
  /** 是否已可用（`category === 'available'` 的便捷布尔） */
  available: boolean;
}

/**
 * 工具注册表：所有 AI 工具的唯一数据源。
 *
 * 数据从原 `ToolsPage.tsx` 内联数组迁移而来，`title` / `description` / `tags`
 * 文案保持不变；新增 `category` 与 `available` 字段以支持分组与判断。
 */
export const toolsRegistry: ToolMeta[] = [
  {
    key: 'translate',
    title: '智能翻译',
    description: '面向日常写作和资料整理的多语言翻译入口。',
    icon: TranslationOutlined,
    status: '可用',
    tags: ['文本', '多语言'],
    path: null,
    category: 'coming-soon',
    available: false,
  },
  {
    key: 'text-compare',
    title: '文本对照',
    description: '粘贴或上传两段文本，支持字符/词/行级粒度对比，自动识别语言类型。',
    icon: DiffOutlined,
    status: '可用',
    tags: ['对比', '代码'],
    path: '/tools/text-compare',
    category: 'available',
    available: true,
  },
  {
    key: 'image',
    title: '文生图',
    description: '把提示词转成图片素材，适合封面、配图和灵感探索。',
    icon: PictureOutlined,
    status: '即将接入',
    tags: ['图像', '创作'],
    path: null,
    category: 'coming-soon',
    available: false,
  },
  {
    key: 'voice',
    title: '文生语音',
    description: '生成自然语音，用于试听、脚本样稿和轻量内容制作。',
    icon: AudioOutlined,
    status: '即将接入',
    tags: ['语音', '内容'],
    path: null,
    category: 'coming-soon',
    available: false,
  },
];

/**
 * 按 `key` 查找工具；找不到时返回 `undefined`。
 */
export function getToolByKey(key: string): ToolMeta | undefined {
  return toolsRegistry.find((tool) => tool.key === key);
}

/**
 * 按 `category` 过滤工具列表。
 * 传入未知分类时返回空数组（不会抛错）。
 */
export function getToolsByCategory(category: string): ToolMeta[] {
  return toolsRegistry.filter((tool) => tool.category === category);
}
