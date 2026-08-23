/** 提取预设（FR-4.2 / UX-DR7）：点击一键填入正则 + 推荐 flags */

export interface ExtractPreset {
  /** 预设唯一 key */
  key: string;
  /** 中文标签 */
  label: string;
  /** 图标（emoji 或符号） */
  icon: string;
  /** 正则表达式；line-contains 特殊值走纯函数（无 ReDoS 风险） */
  pattern: string;
  /** 推荐 flags */
  flags: string;
  /** 简要说明（tooltip） */
  desc: string;
}

/** 特殊值：行包含提取（不走 Worker，纯函数） */
export const PRESET_LINE_CONTAINS = '__line_contains__';

export const EXTRACT_PRESETS: ExtractPreset[] = [
  {
    key: 'email',
    label: '邮箱',
    icon: '✉',
    pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
    flags: 'g',
    desc: '提取邮箱地址',
  },
  {
    key: 'url',
    label: 'URL',
    icon: '🔗',
    pattern: 'https?://[\\w-]+(\\.[\\w-]+)+[/#?]?[^\\s]*',
    flags: 'g',
    desc: '提取 http/https 链接',
  },
  {
    key: 'ipv4',
    label: 'IPv4',
    icon: '🌐',
    pattern: '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)){3}',
    flags: 'g',
    desc: '提取 IPv4 地址',
  },
  {
    key: 'phone',
    label: '手机号',
    icon: '📱',
    pattern: '1[3-9]\\d{9}',
    flags: 'g',
    desc: '提取中国大陆手机号',
  },
  {
    key: 'number',
    label: '纯数字',
    icon: '🔢',
    pattern: '\\d+',
    flags: 'g',
    desc: '提取连续数字',
  },
  {
    key: 'line-contains',
    label: '行包含',
    icon: '≡',
    pattern: PRESET_LINE_CONTAINS,
    flags: '',
    desc: '提取包含指定关键词的整行（不走正则）',
  },
];
