import { describe, it, expect } from 'vitest';
import { parseAndFlatten } from '../parseAndFlatten';
import type { ParseSuccess } from '../parseAndFlatten';

function makeUser() {
  return {
    _id: Math.random().toString(36).slice(2, 26),
    name: 'jerry.zhangstg',
    email: 'jerry.zhangstg@github.com',
    age: 21,
    city: 'Sydney',
    phone: '04-2823-2201',
    action: 'login',
    amount: 7289, score: 60,
    tags: ['active', 'staff', 'guarantee', 'engineering'],
    history: Array.from({ length: 8 }, (_, i) => ({ at: '2024-' + String(i + 1).padStart(2, '0') + '-21', action: 'login', amount: 200 + i * 30 })),
    address: { street: 'jerry valley', city: 'Sydney', zip: 27500 },
    profile: { verified: true, internal: true },
  };
}

function generateJson(targetMB: number): string {
  const targetSize = targetMB * 1024 * 1024;
  const users: unknown[] = [];
  let json = '';
  while (json.length < targetSize) {
    users.push(makeUser());
    json = JSON.stringify({ result: { code: 200, data: users } });
  }
  return json;
}

describe('回归：迭代版 parseAndFlatten 不再爆栈', () => {
  it('1.3MB JSON（用户截图规模）应正常解析', () => {
    const json = generateJson(1.3);
    console.log('JSON 大小:', (json.length / 1024).toFixed(2), 'KB');

    const result = parseAndFlatten(json, 1);
    expect('error' in result).toBe(false);
    const success = result as ParseSuccess;
    expect(success.flatNodes.length).toBeGreaterThan(0);
    console.log('flatNodes:', success.flatNodes.length);
  });

  it('3MB JSON 应正常解析（远超原爆栈阈值）', { timeout: 30_000 }, () => {
    const json = generateJson(3.0);
    console.log('JSON 大小:', (json.length / 1024).toFixed(2), 'KB');

    const result = parseAndFlatten(json, 1);
    expect('error' in result).toBe(false);
    const success = result as ParseSuccess;
    expect(success.flatNodes.length).toBeGreaterThan(0);
    console.log('flatNodes:', success.flatNodes.length);
  });
});