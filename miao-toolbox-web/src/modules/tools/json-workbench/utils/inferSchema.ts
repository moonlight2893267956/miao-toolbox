/**
 * 根据 JSON 数据自动推断生成 JSON Schema。
 *
 * 注意：这是一个简化的推断器，覆盖常见类型（string / number / integer / boolean / null / array / object），
 * 不会生成 oneOf / anyOf / pattern / format 等高级约束，仅作为快速入门的起点。
 */

/** 合并多个 item schema，取最宽泛的类型 */
function mergeSchemas(schemas: unknown[]): Record<string, unknown> {
  if (schemas.length === 0) return {};
  if (schemas.length === 1) return schemas[0] as Record<string, unknown>;

  const types = new Set<string>();
  let hasNull = false;
  for (const s of schemas) {
    const sch = s as Record<string, unknown>;
    const t = sch.type as string;
    if (t === 'null') { hasNull = true; continue; }
    if (t) types.add(t);
  }

  if (types.size === 0) return { type: 'null' };

  const typeArr = [...types];
  const result: Record<string, unknown> = {};

  if (hasNull) {
    result.type = typeArr.length === 1 ? [typeArr[0], 'null'] : [...typeArr, 'null'];
  } else {
    result.type = typeArr.length === 1 ? typeArr[0] : typeArr;
  }

  // 深度合并 properties（取并集）
  const allKeys = new Set<string>();
  for (const s of schemas) {
    const sch = s as Record<string, unknown>;
    if (sch.properties && typeof sch.properties === 'object') {
      for (const k of Object.keys(sch.properties as Record<string, unknown>)) {
        allKeys.add(k);
      }
    }
  }

  return result;
}

export function inferSchemaFromValue(obj: unknown): Record<string, unknown> {
  if (obj === null) return { type: 'null' };
  if (typeof obj === 'boolean') return { type: 'boolean' };
  if (typeof obj === 'number') {
    return Number.isInteger(obj) ? { type: 'integer' } : { type: 'number' };
  }
  if (typeof obj === 'string') return { type: 'string' };
  if (Array.isArray(obj)) {
    const itemSchemas = obj.map((item) => inferSchemaFromValue(item));
    return { type: 'array', items: mergeSchemas(itemSchemas) };
  }
  if (typeof obj === 'object') {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      properties[key] = inferSchemaFromValue(value);
      required.push(key);
    }
    return { type: 'object', properties, required };
  }
  return { type: 'string' };
}

/** 示例 Schema */
export const SAMPLE_SCHEMA: Record<string, unknown> = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    name: {
      type: 'string',
      description: '姓名',
      minLength: 1,
    },
    age: {
      type: 'integer',
      description: '年龄',
      minimum: 0,
    },
    email: {
      type: 'string',
      format: 'email',
      description: '邮箱',
    },
  },
  required: ['name', 'age'],
};
