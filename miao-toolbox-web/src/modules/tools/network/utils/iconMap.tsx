import React from 'react';
import {
  AlertOutlined,
  ApiOutlined,
  ApartmentOutlined,
  CloudServerOutlined,
  ClusterOutlined,
  CodeOutlined,
  ConsoleSqlOutlined,
  ContainerOutlined,
  DiffOutlined,
  FieldTimeOutlined,
  FileOutlined,
  FileSearchOutlined,
  GlobalOutlined,
  Html5Outlined,
  IdcardOutlined,
  KeyOutlined,
  LinkOutlined,
  LockOutlined,
  MailOutlined,
  NodeIndexOutlined,
  NumberOutlined,
  PartitionOutlined,
  ProfileOutlined,
  RadarChartOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SafetyOutlined,
  SearchOutlined,
  SecurityScanOutlined,
  SendOutlined,
  SwapOutlined,
  SyncOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';

const ICON_MAP: Record<string, React.ComponentType> = {
  AlertOutlined,
  ApiOutlined,
  ApartmentOutlined,
  CloudServerOutlined,
  ClusterOutlined,
  CodeOutlined,
  ConsoleSqlOutlined,
  ContainerOutlined,
  DiffOutlined,
  FieldTimeOutlined,
  FileOutlined,
  FileSearchOutlined,
  GlobalOutlined,
  Html5Outlined,
  IdcardOutlined,
  KeyOutlined,
  LinkOutlined,
  LockOutlined,
  MailOutlined,
  NodeIndexOutlined,
  NumberOutlined,
  PartitionOutlined,
  ProfileOutlined,
  RadarChartOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SafetyOutlined,
  SearchOutlined,
  SecurityScanOutlined,
  SendOutlined,
  SwapOutlined,
  SyncOutlined,
  ThunderboltOutlined,
  // YAML 中部分图标在 antd 6 不存在，做别名
  CookieOutlined: SafetyOutlined,
  RssOutlined: GlobalOutlined,
};

/**
 * 将 YAML 中的 Ant Design 图标名解析为 React 节点。
 */
export function resolveNetworkIcon(name?: string, className?: string): React.ReactNode {
  const Comp = (name && ICON_MAP[name]) || ApiOutlined;
  return <Comp className={className} />;
}

/**
 * tool-id → YAML icon 名（与 tools/network 下 yml 配置一致）
 * 用于刷新后从 localStorage 恢复 Tab 时同步补图标（无需等 API）
 */
export const NETWORK_TOOL_ICON_BY_ID: Record<string, string> = {
  'network-assistant': 'RobotOutlined',
  'cookie-analyzer': 'CookieOutlined',
  'cors-checker': 'NodeIndexOutlined',
  'diff-checker': 'DiffOutlined',
  'email-header': 'MailOutlined',
  'graphql-tester': 'ClusterOutlined',
  'http-request-builder': 'SendOutlined',
  'log-parser': 'FileSearchOutlined',
  'openapi-viewer': 'ApiOutlined',
  'robots-txt': 'RobotOutlined',
  'rss-parser': 'RssOutlined',
  'security-header': 'SecurityScanOutlined',
  'sitemap-parser': 'PartitionOutlined',
  'url-parser': 'LinkOutlined',
  'web-scraper': 'Html5Outlined',
  'webhook-receiver': 'ThunderboltOutlined',
  'base64-codec': 'CodeOutlined',
  'data-format': 'SwapOutlined',
  'file-hash': 'SafetyCertificateOutlined',
  'http-status': 'NumberOutlined',
  'ip-format': 'GlobalOutlined',
  'mime-type': 'FileOutlined',
  timestamp: 'FieldTimeOutlined',
  'cidr-calculator': 'ApartmentOutlined',
  'curl-generator': 'ConsoleSqlOutlined',
  'docker-network': 'ContainerOutlined',
  'hmac-signer': 'LockOutlined',
  'jwt-debugger': 'SafetyOutlined',
  'nginx-config': 'CloudServerOutlined',
  'http-api-sign': 'SafetyCertificateOutlined',
  'dns-query': 'SearchOutlined',
  'http-header': 'ProfileOutlined',
  'ip-reputation': 'AlertOutlined',
  'ssl-analyzer': 'SafetyCertificateOutlined',
  'tcp-ping': 'RadarChartOutlined',
  'websocket-tester': 'SyncOutlined',
  whois: 'IdcardOutlined',
};

/** 从路由路径解析网络工具 Tab 图标（同步、无需 API） */
export function resolveNetworkIconFromPath(path: string): React.ReactNode | undefined {
  if (!path.startsWith('/tools/network')) return undefined;
  if (path === '/tools/network' || path === '/tools/network/') {
    return resolveNetworkIcon('GlobalOutlined');
  }
  // /tools/network/converter/mime-type → mime-type
  const parts = path.split('/').filter(Boolean);
  const toolId = parts[parts.length - 1] ?? '';
  const iconName = NETWORK_TOOL_ICON_BY_ID[toolId];
  if (!iconName) {
    // 未知子路径：退回网络工具箱通用图标
    return resolveNetworkIcon('GlobalOutlined');
  }
  return resolveNetworkIcon(iconName);
}
