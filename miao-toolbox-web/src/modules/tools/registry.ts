import type { ComponentType } from 'react';
import {
  AudioOutlined,
  CodeOutlined,
  DiffOutlined,
  LockOutlined,
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
  /** 权限路由码；没有路由码的占位工具不参与权限过滤 */
  routeCode?: string;
  /** 工具分类（用于分组） */
  category: ToolCategory;
  /** 是否已可用（`category === 'available'` 的便捷布尔） */
  available: boolean;
  /** 强调色（用于光晕和交互反馈） */
  accentColor: string;
  /** 图标背景色 */
  iconBg: string;
}

/**
 * 工具注册表：所有 AI 工具的唯一数据源。
 *
 * 数据从原 `ToolsPage.tsx` 内联数组迁移而来，`title` / `description` / `tags`
 * 文案保持不变；新增 `category` 与 `available` 字段以支持分组与判断。
 */
export const toolsRegistry: ToolMeta[] = [
  {
    key: 'text-compare',
    title: '文本对照',
    description: '粘贴或上传两段文本，支持字符/词/行级粒度对比，自动识别语言类型并高亮差异。',
    icon: DiffOutlined,
    status: '可用',
    tags: ['对比', '代码', 'Diff'],
    path: '/tools/text-compare',
    routeCode: 'TOOL_TEXT_COMPARE',
    category: 'available',
    available: true,
    accentColor: '#00d4aa',
    iconBg: 'rgba(0,212,170,0.12)',
  },
  {
    key: 'crypto',
    title: '加解密工具',
    description: '一站式加解密、哈希、编解码工具。AES/DES/RSA、MD5/SHA/HMAC、Base64/URL/Escape，纯前端运算，密钥不离开设备。',
    icon: LockOutlined,
    status: '可用',
    tags: ['加解密', '哈希', '开发工具'],
    path: '/tools/crypto',
    routeCode: 'TOOL_CRYPTO',
    category: 'available',
    available: true,
    accentColor: '#8b5cf6',
    iconBg: 'rgba(139,92,246,0.12)',
  },
  {
    key: 'json-workbench',
    title: 'JSON 工作台',
    description: '格式化、校验、编辑 JSON，支持大文件与 AI 辅助。树形视图 + 原始文本双栏同步。',
    icon: CodeOutlined,
    status: '可用',
    tags: ['JSON', '格式化', '开发工具'],
    path: '/tools/json-workbench',
    routeCode: 'TOOL_JSON_WORKBENCH',
    category: 'available',
    available: true,
    accentColor: '#6366f1',
    iconBg: 'rgba(99,102,241,0.12)',
  },
  {
    key: 'translate',
    title: '智能翻译',
    description: '面向日常写作和资料整理的多语言翻译入口。支持中英日韩及欧洲主要语言，保留原文语境与语气。',
    icon: TranslationOutlined,
    status: '可用',
    tags: ['文本', '多语言'],
    path: '/tools/translate',
    routeCode: 'TOOL_TRANSLATE',
    category: 'available',
    available: true,
    accentColor: '#6366f1',
    iconBg: 'rgba(99,102,241,0.12)',
  },
  {
    key: 'image',
    title: '文生图',
    description: '把提示词转成图片素材，适合封面、配图和灵感探索。支持多种风格与尺寸输出。',
    icon: PictureOutlined,
    status: '即将接入',
    tags: ['图像', '创作', 'AIGC'],
    path: null,
    category: 'coming-soon',
    available: false,
    accentColor: '#f59e0b',
    iconBg: 'rgba(245,158,11,0.12)',
  },
  {
    key: 'voice',
    title: '文生语音',
    description: '生成自然语音，用于试听、脚本样稿和轻量内容制作。支持多语种与情感调节。',
    icon: AudioOutlined,
    status: '即将接入',
    tags: ['语音', '内容', 'TTS'],
    path: null,
    category: 'coming-soon',
    available: false,
    accentColor: '#ec4899',
    iconBg: 'rgba(236,72,153,0.12)',
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
