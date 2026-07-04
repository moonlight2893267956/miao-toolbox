/**
 * JSON Schema 校验工具
 *
 * Story 3.1: 使用 ajv 对 parsedJson 执行 JSON Schema 校验，
 * 返回路径→错误信息列表。
 */
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { SchemaError } from '../types';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

/**
 * 校验 JSON 数据是否符合 Schema。
 *
 * @param data   已解析的 JSON 数据
 * @param schema JSON Schema 对象
 * @returns 错误列表（包含路径、描述、严重程度）
 */
export function validateBySchema(
  data: unknown,
  schema: unknown,
): SchemaError[] {
  try {
    const validate = ajv.compile(schema as any);
    validate(data);

    if (!validate.errors || validate.errors.length === 0) return [];

    const rawErrors = validate.errors.map((err) => ({
      path: ajvErrorToJsonPath(err),
      message: err.message ?? '未知校验错误',
      severity: err.keyword === 'required' ? ('error' as const) : ('warning' as const),
    }));

    // 合并同一路径的多个错误（如多个 required 字段缺失都在父节点上）
    const merged = new Map<string, SchemaError>();
    for (const e of rawErrors) {
      if (merged.has(e.path)) {
        const prev = merged.get(e.path)!;
        prev.message += '；' + e.message;
        if (e.severity === 'error') prev.severity = 'error';
      } else {
        merged.set(e.path, { ...e });
      }
    }
    return [...merged.values()];
  } catch (err) {
    // Schema 本身无效
    return [
      {
        path: '$',
        message: `Schema 无效: ${err instanceof Error ? err.message : String(err)}`,
        severity: 'error' as const,
      },
    ];
  }
}

/**
 * 将 ajv 错误中的 instancePath + params 转换为 JSONPath。
 *
 * ajv 的 instancePath 是 /data/users/0/name 格式（JSON Pointer）
 * 加上 missingProperty 等附加信息。
 */
function ajvErrorToJsonPath(err: any): string {
  let path = '$';

  // instancePath: "/data/users/0" → "$.data.users[0]"
  // JSON Pointer 规范：~1 = /, ~0 = ~，需先 split 再逐段解码
  if (err.instancePath) {
    const segments = err.instancePath.split('/').filter(Boolean);
    for (const seg of segments) {
      // 解码 JSON Pointer 转义：先 ~1 → /，再 ~0 → ~
      const decoded = seg.replace(/~1/g, '/').replace(/~0/g, '~');
      if (/^\d+$/.test(decoded)) {
        path += `[${decoded}]`;
      } else {
        path += `.${safeKey(decoded)}`;
      }
    }
  }

  // missingProperty: required 错误，挂到父对象节点上（缺失字段本身不存在）
  if (err.params?.missingProperty) {
    // 保持 path 为父对象路径，不追加缺失字段（它在树中不存在）
  }

  // additionalProperty: 额外字段
  if (err.params?.additionalProperty) {
    const key = safeKey(err.params.additionalProperty);
    path = `${path}.${key}`;
  }

  return path;
}

function safeKey(key: string): string {
  if (/[.\[\]"']/.test(key)) {
    return `["${key.replace(/"/g, '\\"')}"]`;
  }
  return key;
}
