/**
 * HTTP 状态码参考数据与搜索
 */

export interface HttpStatusInfo {
  code: number;
  phrase: string;
  zh: string;
  category: string;
  causes: string;
  advice: string;
}

export const HTTP_STATUS_LIST: HttpStatusInfo[] = [
  { code: 100, phrase: 'Continue', zh: '继续', category: '1xx 信息', causes: '客户端应继续请求', advice: '通常由浏览器/客户端自动处理' },
  { code: 101, phrase: 'Switching Protocols', zh: '切换协议', category: '1xx 信息', causes: '协议升级（如 WebSocket）', advice: '确认 Upgrade 头协商成功' },
  { code: 200, phrase: 'OK', zh: '成功', category: '2xx 成功', causes: '请求已成功处理', advice: '正常响应' },
  { code: 201, phrase: 'Created', zh: '已创建', category: '2xx 成功', causes: '资源创建成功', advice: '检查 Location 头' },
  { code: 204, phrase: 'No Content', zh: '无内容', category: '2xx 成功', causes: '成功但无响应体', advice: 'DELETE/PUT 常见' },
  { code: 301, phrase: 'Moved Permanently', zh: '永久重定向', category: '3xx 重定向', causes: '资源永久迁移', advice: '更新客户端/书签 URL' },
  { code: 302, phrase: 'Found', zh: '临时重定向', category: '3xx 重定向', causes: '临时跳转', advice: '注意方法是否变为 GET' },
  { code: 304, phrase: 'Not Modified', zh: '未修改', category: '3xx 重定向', causes: '缓存仍有效', advice: '使用本地缓存' },
  { code: 400, phrase: 'Bad Request', zh: '错误请求', category: '4xx 客户端', causes: '参数/语法错误', advice: '检查请求体与查询参数' },
  { code: 401, phrase: 'Unauthorized', zh: '未认证', category: '4xx 客户端', causes: '缺少或无效凭证', advice: '重新登录/刷新 Token' },
  { code: 403, phrase: 'Forbidden', zh: '禁止访问', category: '4xx 客户端', causes: '无权限', advice: '检查角色与 ACL' },
  { code: 404, phrase: 'Not Found', zh: '未找到', category: '4xx 客户端', causes: '路径错误或资源不存在', advice: '核对 URL 与路由' },
  { code: 405, phrase: 'Method Not Allowed', zh: '方法不允许', category: '4xx 客户端', causes: 'HTTP 方法不支持', advice: '查看 Allow 头' },
  { code: 408, phrase: 'Request Timeout', zh: '请求超时', category: '4xx 客户端', causes: '服务端等待请求超时', advice: '减小请求体/重试' },
  { code: 409, phrase: 'Conflict', zh: '冲突', category: '4xx 客户端', causes: '资源状态冲突', advice: '并发更新时先拉取最新' },
  { code: 413, phrase: 'Payload Too Large', zh: '实体过大', category: '4xx 客户端', causes: '请求体超限', advice: '压缩或分片上传' },
  { code: 415, phrase: 'Unsupported Media Type', zh: '不支持的媒体类型', category: '4xx 客户端', causes: 'Content-Type 不匹配', advice: '改为服务端支持的类型' },
  { code: 422, phrase: 'Unprocessable Entity', zh: '无法处理', category: '4xx 客户端', causes: '语义错误/校验失败', advice: '查看字段校验信息' },
  { code: 429, phrase: 'Too Many Requests', zh: '请求过多', category: '4xx 客户端', causes: '触发限流', advice: '退避重试；遵守 Retry-After' },
  { code: 500, phrase: 'Internal Server Error', zh: '服务器内部错误', category: '5xx 服务端', causes: '未捕获异常', advice: '查服务端日志' },
  { code: 502, phrase: 'Bad Gateway', zh: '错误网关', category: '5xx 服务端', causes: '上游无效响应', advice: '检查反向代理与上游健康' },
  { code: 503, phrase: 'Service Unavailable', zh: '服务不可用', category: '5xx 服务端', causes: '过载或维护', advice: '稍后重试/扩容' },
  { code: 504, phrase: 'Gateway Timeout', zh: '网关超时', category: '5xx 服务端', causes: '上游超时', advice: '增大超时或优化上游' },
];

export function searchHttpStatus(query: string): HttpStatusInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return HTTP_STATUS_LIST;
  return HTTP_STATUS_LIST.filter((item) => {
    const hay = `${item.code} ${item.phrase} ${item.zh} ${item.causes} ${item.advice}`.toLowerCase();
    return hay.includes(q) || String(item.code).startsWith(q);
  });
}

export function formatHttpStatusText(items: HttpStatusInfo[]): string {
  if (items.length === 0) return '未找到匹配的状态码';
  return items
    .map(
      (i) =>
        `${i.code} ${i.phrase}\n` +
        `中文: ${i.zh}（${i.category}）\n` +
        `常见原因: ${i.causes}\n` +
        `建议: ${i.advice}`,
    )
    .join('\n\n────────────────\n\n');
}
