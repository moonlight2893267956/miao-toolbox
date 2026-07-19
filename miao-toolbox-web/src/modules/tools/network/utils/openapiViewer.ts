/**
 * OpenAPI 3.x / Swagger 2.0 解析与归一（纯前端浏览用）
 */

import { load as yamlLoad } from 'js-yaml';

export type HttpMethod =
  | 'get'
  | 'post'
  | 'put'
  | 'patch'
  | 'delete'
  | 'head'
  | 'options'
  | 'trace';

export const HTTP_METHODS: HttpMethod[] = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
  'trace',
];

export interface OpenApiParameter {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schemaType?: string;
  example?: unknown;
}

export interface OpenApiRequestBody {
  required?: boolean;
  description?: string;
  contentTypes: string[];
  /** 优先展示的 example / schema 摘要 */
  preview?: string;
}

export interface OpenApiResponse {
  status: string;
  description?: string;
  contentTypes: string[];
  preview?: string;
}

export interface OpenApiEndpoint {
  id: string;
  method: HttpMethod;
  path: string;
  summary?: string;
  description?: string;
  operationId?: string;
  tags: string[];
  parameters: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses: OpenApiResponse[];
  deprecated?: boolean;
}

export interface OpenApiTagGroup {
  name: string;
  description?: string;
  endpoints: OpenApiEndpoint[];
}

export interface OpenApiDocumentView {
  specVersion: string;
  title: string;
  description?: string;
  version?: string;
  servers: string[];
  groups: OpenApiTagGroup[];
  endpointCount: number;
}

export type ParseOpenApiResult =
  | { ok: true; doc: OpenApiDocumentView }
  | { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function schemaPreview(schema: unknown, depth = 0): string {
  if (schema == null) return '';
  if (depth > 3) return '…';
  if (!isRecord(schema)) return String(schema);
  if (schema.$ref) return String(schema.$ref);
  const type = asString(schema.type);
  if (schema.example !== undefined) {
    try {
      return JSON.stringify(schema.example, null, 2);
    } catch {
      return String(schema.example);
    }
  }
  if (type === 'object' && isRecord(schema.properties)) {
    const props = Object.entries(schema.properties)
      .slice(0, 12)
      .map(([k, v]) => {
        const t = isRecord(v) ? asString(v.type) || (v.$ref ? 'ref' : 'any') : 'any';
        return `  ${k}: ${t}`;
      });
    const more =
      Object.keys(schema.properties).length > 12
        ? `\n  … +${Object.keys(schema.properties).length - 12}`
        : '';
    return `{\n${props.join('\n')}${more}\n}`;
  }
  if (type === 'array' && schema.items) {
    return `${schemaPreview(schema.items, depth + 1)}[]`;
  }
  if (type) return type;
  try {
    return JSON.stringify(schema, null, 2).slice(0, 800);
  } catch {
    return '';
  }
}

function contentPreview(content: unknown): { contentTypes: string[]; preview?: string } {
  if (!isRecord(content)) return { contentTypes: [] };
  const contentTypes = Object.keys(content);
  let preview: string | undefined;
  for (const ct of contentTypes) {
    const media = content[ct];
    if (!isRecord(media)) continue;
    if (media.example !== undefined) {
      try {
        preview = JSON.stringify(media.example, null, 2);
      } catch {
        preview = String(media.example);
      }
      break;
    }
    if (isRecord(media.examples)) {
      const first = Object.values(media.examples)[0];
      if (isRecord(first) && first.value !== undefined) {
        try {
          preview = JSON.stringify(first.value, null, 2);
        } catch {
          preview = String(first.value);
        }
        break;
      }
    }
    if (media.schema) {
      preview = schemaPreview(media.schema);
      if (preview) break;
    }
  }
  return { contentTypes, preview };
}

function normalizeParameters(list: unknown): OpenApiParameter[] {
  if (!Array.isArray(list)) return [];
  const out: OpenApiParameter[] = [];
  for (const item of list) {
    if (!isRecord(item)) continue;
    // $ref 参数简化展示
    if (item.$ref) {
      out.push({
        name: String(item.$ref).split('/').pop() || 'ref',
        in: 'ref',
        description: String(item.$ref),
      });
      continue;
    }
    const name = asString(item.name);
    if (!name) continue;
    const schema = isRecord(item.schema) ? item.schema : undefined;
    out.push({
      name,
      in: asString(item.in) || 'query',
      required: Boolean(item.required),
      description: asString(item.description),
      schemaType:
        (schema && (asString(schema.type) || asString(schema.$ref))) ||
        asString(item.type) ||
        undefined,
      example: item.example ?? schema?.example,
    });
  }
  return out;
}

function parseResponses(responses: unknown): OpenApiResponse[] {
  if (!isRecord(responses)) return [];
  return Object.entries(responses).map(([status, body]) => {
    if (!isRecord(body)) {
      return { status, description: undefined, contentTypes: [] };
    }
    // OAS3 content vs Swagger2 schema
    if (body.content) {
      const { contentTypes, preview } = contentPreview(body.content);
      return {
        status,
        description: asString(body.description),
        contentTypes,
        preview,
      };
    }
    let preview: string | undefined;
    if (body.schema) preview = schemaPreview(body.schema);
    else if (body.examples && isRecord(body.examples)) {
      const first = Object.values(body.examples)[0];
      try {
        preview = JSON.stringify(first, null, 2);
      } catch {
        preview = String(first);
      }
    }
    return {
      status,
      description: asString(body.description),
      contentTypes: body.schema ? ['application/json'] : [],
      preview,
    };
  });
}

function parseRequestBodyOas3(rb: unknown): OpenApiRequestBody | undefined {
  if (!isRecord(rb)) return undefined;
  const { contentTypes, preview } = contentPreview(rb.content);
  return {
    required: Boolean(rb.required),
    description: asString(rb.description),
    contentTypes,
    preview,
  };
}

function parseBodyParamSwagger2(rawParams: unknown): OpenApiRequestBody | undefined {
  if (!Array.isArray(rawParams)) return undefined;
  const body = rawParams.find((p) => isRecord(p) && asString(p.in) === 'body');
  if (!isRecord(body)) return undefined;
  return {
    required: Boolean(body.required),
    description: asString(body.description),
    contentTypes: ['application/json'],
    preview: body.schema ? schemaPreview(body.schema) : undefined,
  };
}

function collectEndpoints(paths: unknown): OpenApiEndpoint[] {
  if (!isRecord(paths)) return [];
  const endpoints: OpenApiEndpoint[] = [];

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!isRecord(pathItem)) continue;
    const pathParams = normalizeParameters(pathItem.parameters);

    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!isRecord(op)) continue;

      const opParams = normalizeParameters(op.parameters);
      // 合并 path 级参数（同名+in 去重，operation 优先）
      const paramMap = new Map<string, OpenApiParameter>();
      for (const p of pathParams) paramMap.set(`${p.in}:${p.name}`, p);
      for (const p of opParams) paramMap.set(`${p.in}:${p.name}`, p);
      const parameters = [...paramMap.values()];

      let requestBody = parseRequestBodyOas3(op.requestBody);
      if (!requestBody) {
        requestBody = parseBodyParamSwagger2(op.parameters);
      }

      // 过滤掉 body 参数（已进 requestBody）
      const filteredParams = parameters.filter((p) => p.in !== 'body');

      const tags =
        Array.isArray(op.tags) && op.tags.length
          ? op.tags.map(String)
          : ['默认'];

      endpoints.push({
        id: `${method.toUpperCase()} ${path}`,
        method,
        path,
        summary: asString(op.summary),
        description: asString(op.description),
        operationId: asString(op.operationId),
        tags,
        parameters: filteredParams,
        requestBody,
        responses: parseResponses(op.responses),
        deprecated: Boolean(op.deprecated),
      });
    }
  }

  return endpoints;
}

function groupEndpoints(
  endpoints: OpenApiEndpoint[],
  tagMeta: Record<string, string | undefined>,
): OpenApiTagGroup[] {
  const map = new Map<string, OpenApiEndpoint[]>();
  for (const ep of endpoints) {
    for (const tag of ep.tags.length ? ep.tags : ['默认']) {
      const list = map.get(tag) ?? [];
      // 避免同一端点因多 tag 重复？规范允许一端点多 tag，展示时在各组各出现一次
      list.push(ep);
      map.set(tag, list);
    }
  }

  const groups: OpenApiTagGroup[] = [];
  for (const [name, eps] of map) {
    groups.push({
      name,
      description: tagMeta[name],
      endpoints: eps.sort((a, b) =>
        a.path === b.path
          ? a.method.localeCompare(b.method)
          : a.path.localeCompare(b.path),
      ),
    });
  }
  groups.sort((a, b) => {
    if (a.name === '默认') return 1;
    if (b.name === '默认') return -1;
    return a.name.localeCompare(b.name);
  });
  return groups;
}

function detectSpecVersion(doc: Record<string, unknown>): string {
  if (typeof doc.openapi === 'string') return `OpenAPI ${doc.openapi}`;
  if (doc.swagger === '2.0' || doc.swagger === 2) return 'Swagger 2.0';
  if (typeof doc.swagger === 'string') return `Swagger ${doc.swagger}`;
  return 'Unknown';
}

function extractServers(doc: Record<string, unknown>, isSwagger2: boolean): string[] {
  if (isSwagger2) {
    const host = asString(doc.host) || '';
    const basePath = asString(doc.basePath) || '';
    const schemes = Array.isArray(doc.schemes)
      ? doc.schemes.map(String)
      : ['https'];
    if (!host) return basePath ? [basePath] : [];
    return schemes.map((s) => `${s}://${host}${basePath}`);
  }
  if (!Array.isArray(doc.servers)) return [];
  return doc.servers
    .map((s) => (isRecord(s) ? asString(s.url) : undefined))
    .filter((u): u is string => Boolean(u));
}

function tagMetaFromDoc(doc: Record<string, unknown>): Record<string, string | undefined> {
  const meta: Record<string, string | undefined> = {};
  if (!Array.isArray(doc.tags)) return meta;
  for (const t of doc.tags) {
    if (!isRecord(t)) continue;
    const name = asString(t.name);
    if (name) meta[name] = asString(t.description);
  }
  return meta;
}

/**
 * 解析粘贴的 JSON / YAML 文档
 */
export function parseOpenApiDocument(raw: string): ParseOpenApiResult {
  const text = raw.trim();
  if (!text) return { ok: false, error: '请粘贴 OpenAPI / Swagger 文档' };

  let data: unknown;
  try {
    if (text.startsWith('{') || text.startsWith('[')) {
      data = JSON.parse(text);
    } else {
      data = yamlLoad(text);
    }
  } catch (e) {
    // JSON 失败再试 YAML
    try {
      data = yamlLoad(text);
    } catch {
      return {
        ok: false,
        error: `文档解析失败：${e instanceof Error ? e.message : '格式无效'}`,
      };
    }
  }

  if (!isRecord(data)) {
    return { ok: false, error: '文档根节点必须是对象' };
  }

  const isSwagger2 = data.swagger === '2.0' || data.swagger === 2;
  const isOas3 = typeof data.openapi === 'string';
  if (!isSwagger2 && !isOas3) {
    return {
      ok: false,
      error: '无法识别规范版本：需要 openapi: "3.x" 或 swagger: "2.0"',
    };
  }

  if (!isRecord(data.paths)) {
    return { ok: false, error: '缺少 paths 字段' };
  }

  const info = isRecord(data.info) ? data.info : {};
  const endpoints = collectEndpoints(data.paths);
  if (endpoints.length === 0) {
    return { ok: false, error: 'paths 中未找到任何 HTTP 操作' };
  }

  const groups = groupEndpoints(endpoints, tagMetaFromDoc(data));

  // 去重统计端点数
  const uniqueIds = new Set(endpoints.map((e) => e.id));

  return {
    ok: true,
    doc: {
      specVersion: detectSpecVersion(data),
      title: asString(info.title) || '未命名 API',
      description: asString(info.description),
      version: asString(info.version),
      servers: extractServers(data, isSwagger2),
      groups,
      endpointCount: uniqueIds.size,
    },
  };
}

export function formatOpenApiSummary(doc: OpenApiDocumentView): string {
  const lines = [
    `${doc.title} (${doc.specVersion})`,
    doc.version ? `API version: ${doc.version}` : null,
    `Endpoints: ${doc.endpointCount}`,
    doc.servers.length ? `Servers: ${doc.servers.join(', ')}` : null,
    '',
    ...doc.groups.flatMap((g) => [
      `# ${g.name} (${g.endpoints.length})`,
      ...g.endpoints.map((e) => `  ${e.method.toUpperCase()} ${e.path}${e.summary ? ` — ${e.summary}` : ''}`),
      '',
    ]),
  ].filter((x) => x !== null) as string[];
  return lines.join('\n');
}

/** 验收/演示用最小 OpenAPI 3 样例 */
export const SAMPLE_OAS3 = `openapi: 3.0.3
info:
  title: Demo Pet API
  version: 1.0.0
  description: 示例宠物商店 API
servers:
  - url: https://api.example.com/v1
tags:
  - name: pets
    description: 宠物相关
paths:
  /pets:
    get:
      tags: [pets]
      summary: 列出宠物
      operationId: listPets
      parameters:
        - name: limit
          in: query
          required: false
          schema:
            type: integer
          description: 返回数量上限
      responses:
        "200":
          description: 成功
          content:
            application/json:
              example:
                - id: 1
                  name: Fluffy
    post:
      tags: [pets]
      summary: 创建宠物
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
                tag:
                  type: string
            example:
              name: Fluffy
              tag: cat
      responses:
        "201":
          description: 已创建
  /pets/{petId}:
    get:
      tags: [pets]
      summary: 获取宠物
      parameters:
        - name: petId
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: OK
        "404":
          description: Not Found
`;

/** 验收用 Swagger 2 样例 */
export const SAMPLE_SWAGGER2 = `{
  "swagger": "2.0",
  "info": {
    "title": "Demo User API",
    "version": "1.0.0"
  },
  "host": "api.example.com",
  "basePath": "/v2",
  "schemes": ["https"],
  "tags": [{ "name": "users", "description": "用户" }],
  "paths": {
    "/users": {
      "get": {
        "tags": ["users"],
        "summary": "列出用户",
        "parameters": [
          {
            "name": "page",
            "in": "query",
            "type": "integer",
            "required": false
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "schema": {
              "type": "array",
              "items": { "type": "object" }
            }
          }
        }
      },
      "post": {
        "tags": ["users"],
        "summary": "创建用户",
        "parameters": [
          {
            "name": "body",
            "in": "body",
            "required": true,
            "schema": {
              "type": "object",
              "properties": {
                "name": { "type": "string" }
              }
            }
          }
        ],
        "responses": {
          "201": { "description": "Created" }
        }
      }
    }
  }
}
`;
