import { describe, expect, it } from 'vitest';
import { compressAndEscapeJson, inspectEscapedJsonString, unescapeJsonString } from '../jsonEscape';

describe('jsonEscape', () => {
  it('compresses JSON and wraps it as an escaped string literal', () => {
    const result = compressAndEscapeJson({ name: 'test', active: true });

    expect(result).toBe('"{\\"name\\":\\"test\\",\\"active\\":true}"');
  });

  it('preserves special characters through escape and unescape', () => {
    const source = {
      text: 'line1\nline2\tTabbed "quote"',
    };
    const escaped = compressAndEscapeJson(source);

    expect(escaped).toContain('\\\\n');
    expect(escaped).toContain('\\\\t');
    expect(escaped).toContain('\\\\\\"quote\\\\\\"');

    const restored = unescapeJsonString(escaped, 2);
    expect('error' in restored).toBe(false);
    if (!('error' in restored)) {
      expect(JSON.parse(restored.value)).toEqual(source);
    }
  });

  it('unescapes an escaped JSON string and formats it', () => {
    const result = unescapeJsonString('"{\\"name\\":\\"test\\",\\"items\\":[1,2]}"', 2);

    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.value).toBe('{\n  "name": "test",\n  "items": [\n    1,\n    2\n  ]\n}');
    }
  });

  it('rejects non-escaped JSON input without changing content', () => {
    const result = unescapeJsonString('{"name":"test"}', 2);

    expect(result).toEqual({ error: '无法识别为转义 JSON' });
  });

  it('rejects string literals that do not contain valid JSON', () => {
    const result = unescapeJsonString('"plain text"', 2);

    expect(result).toEqual({ error: '无法识别为转义 JSON' });
  });

  it('detects escaped JSON strings as a normal result state', () => {
    const result = inspectEscapedJsonString('"{\\"name\\":\\"test\\"}"', 2);

    expect(result).toEqual({
      isEscaped: true,
      value: '{\n  "name": "test"\n}',
    });
  });

  it('does not classify ordinary JSON as escaped JSON', () => {
    expect(inspectEscapedJsonString('{"name":"test"}', 2)).toEqual({ isEscaped: false });
  });
});
