import type { ComponentType } from 'react';
import {
  AudioOutlined,
  CodeOutlined,
  DiffOutlined,
  FileTextOutlined,
  FolderOutlined,
  GlobalOutlined,
  LockOutlined,
  PictureOutlined,
  TranslationOutlined,
  CodeSandboxOutlined,
  ScheduleOutlined,
  BugOutlined,
} from '@ant-design/icons';

/**
 * 工具分组分类：
 * - `available`：已可用，可直接进入工具页面
 * - `coming-soon`：暂未接入，仅展示占位
 */
export type ToolCategory = 'available' | 'coming-soon';

/**
 * 工具功能分组：用于侧栏和工作台首页的子分类展示。
 * 顺序决定侧栏中的排列先后。
 */
export type ToolGroup = 'dev' | 'log' | 'text' | 'ai' | 'other';

/** 分组元数据：标签与排序 */
export const TOOL_GROUPS: Record<ToolGroup, { label: string; order: number }> = {
  dev:   { label: '开发工具', order: 0 },
  log:   { label: '日志解析', order: 1 },
  text:  { label: '文本处理', order: 2 },
  ai:    { label: 'AI 创作',  order: 3 },
  other: { label: '其他',     order: 99 },
};

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
  /** 功能分组（用于侧栏/工作台子分类），未指定时归入 'other' */
  group?: ToolGroup;
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
    group: 'text',
    available: true,
    accentColor: '#5c4fd0',
    iconBg: 'rgba(92,79,208,0.12)',
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
    group: 'dev',
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
    group: 'dev',
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
    group: 'text',
    available: true,
    accentColor: '#0ea5e9',
    iconBg: 'rgba(14,165,233,0.12)',
  },
  {
    key: 'regex-tester',
    title: '正则测试器',
    description: '实时编写、调试和测试正则表达式，支持匹配高亮、分组详情、替换预览与多语言代码生成。',
    icon: CodeSandboxOutlined,
    status: '可用',
    tags: ['正则', '开发工具', '调试'],
    path: '/tools/regex-tester',
    routeCode: 'TOOL_REGEX_TESTER',
    category: 'available',
    group: 'dev',
    available: true,
    accentColor: '#ec4899',
    iconBg: 'rgba(236,72,153,0.12)',
  },
  {
    key: 'cron-editor',
    title: 'Cron 表达式编辑器',
    description: '可视化构建、实时校验 Cron 表达式，提供中文可读翻译与未来执行时间预览。',
    icon: ScheduleOutlined,
    status: '可用',
    tags: ['Cron', '定时', '开发工具'],
    path: '/tools/cron-editor',
    routeCode: 'TOOL_CRON_EDITOR',
    category: 'available',
    group: 'dev',
    available: true,
    accentColor: '#14b8a6',
    iconBg: 'rgba(20,184,166,0.12)',
  },
  {
    key: 'php-log-extractor',
    title: '收银台日志提取器',
    description: '从收银台日志中提取 inputdata / outputdata / param / result，纯前端解析。',
    icon: FileTextOutlined,
    status: '可用',
    tags: ['PHP', '日志', '日志解析'],
    path: '/tools/php-log-extractor',
    routeCode: 'TOOL_PHP_LOG_EXTRACTOR',
    category: 'available',
    group: 'log',
    available: true,
    accentColor: '#f59e0b',
    iconBg: 'rgba(245,158,11,0.12)',
  },
  {
    key: 'network-toolbox',
    title: '网络工具箱',
    description: '编码转换、网络诊断、API 调试与 AI 排障助手。一次入口覆盖 30+ 网络实用工具。',
    icon: GlobalOutlined,
    status: '可用',
    tags: ['网络', '诊断', '开发工具'],
    path: '/tools/network',
    routeCode: 'TOOL_NETWORK_TOOLBOX',
    category: 'available',
    group: 'dev',
    available: true,
    accentColor: '#2563eb',
    iconBg: 'rgba(37,99,235,0.12)',
  },
  {
    key: 'ral-log-parser',
    title: 'RAL 日志解析器',
    description: '粘贴 RAL 日志，一键获得结构化指标表格与 AI 异常解读，快速定位超时、连接失败等异常调用。',
    icon: BugOutlined,
    status: '可用',
    tags: ['RAL', '日志', '日志解析'],
    path: '/tools/ral-log-parser',
    routeCode: 'TOOL_RAL_LOG_PARSER',
    category: 'available',
    group: 'log',
    available: true,
    accentColor: '#ef4444',
    iconBg: 'rgba(239,68,68,0.12)',
  },
  {
    key: 'file-storage',
    title: '文件管理',
    description: '上传下载、目录管理、安全存储，一次登录即可管理云端文件。',
    icon: FolderOutlined,
    status: '可用',
    tags: ['存储', '文件', 'COS'],
    path: '/tools/file-storage',
    routeCode: 'TOOL_FILE_STORAGE',
    category: 'available',
    group: 'other',
    available: true,
    accentColor: '#3B82F6',
    iconBg: 'rgba(59,130,246,0.12)',
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
    group: 'ai',
    available: false,
    accentColor: '#22d3ee',
    iconBg: 'rgba(34,211,238,0.12)',
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
    group: 'ai',
    available: false,
    accentColor: '#3B82F6',
    iconBg: 'rgba(59,130,246,0.12)',
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
