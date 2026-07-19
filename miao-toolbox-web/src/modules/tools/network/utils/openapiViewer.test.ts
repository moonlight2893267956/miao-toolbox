import { describe, expect, it } from 'vitest';
import {
  SAMPLE_OAS3,
  SAMPLE_SWAGGER2,
  parseOpenApiDocument,
} from './openapiViewer';

describe('openapiViewer', () => {
  it('AC1: OpenAPI 3 YAML 解析与分组', () => {
    const r = parseOpenApiDocument(SAMPLE_OAS3);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.specVersion).toContain('OpenAPI 3');
    expect(r.doc.title).toBe('Demo Pet API');
    expect(r.doc.endpointCount).toBe(3);
    expect(r.doc.groups.some((g) => g.name === 'pets')).toBe(true);
    const pets = r.doc.groups.find((g) => g.name === 'pets')!;
    const list = pets.endpoints.find((e) => e.method === 'get' && e.path === '/pets');
    expect(list).toBeTruthy();
    expect(list!.parameters.some((p) => p.name === 'limit' && p.in === 'query')).toBe(true);
    expect(list!.responses.some((x) => x.status === '200')).toBe(true);

    const create = pets.endpoints.find((e) => e.method === 'post' && e.path === '/pets');
    expect(create?.requestBody?.preview).toBeTruthy();
  });

  it('AC1: OpenAPI 3 JSON 也可解析', () => {
    const json = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'J', version: '0' },
      paths: {
        '/ping': {
          get: {
            responses: { '200': { description: 'pong' } },
          },
        },
      },
    });
    const r = parseOpenApiDocument(json);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.endpointCount).toBe(1);
  });

  it('AC2: Swagger 2.0 解析', () => {
    const r = parseOpenApiDocument(SAMPLE_SWAGGER2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.specVersion).toBe('Swagger 2.0');
    expect(r.doc.title).toBe('Demo User API');
    expect(r.doc.servers[0]).toContain('api.example.com');
    expect(r.doc.endpointCount).toBe(2);
    const users = r.doc.groups.find((g) => g.name === 'users');
    expect(users).toBeTruthy();
    const post = users!.endpoints.find((e) => e.method === 'post');
    expect(post?.requestBody).toBeTruthy();
    expect(post?.summary).toBe('创建用户');
  });

  it('非法文档报错', () => {
    expect(parseOpenApiDocument('').ok).toBe(false);
    expect(parseOpenApiDocument('not: valid: api').ok).toBe(false);
    expect(parseOpenApiDocument('{"info":{}}').ok).toBe(false);
  });
});
