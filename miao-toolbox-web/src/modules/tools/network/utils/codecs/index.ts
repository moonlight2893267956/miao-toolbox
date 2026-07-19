import { base64Decode, base64Encode, Base64DecodeError } from './base64';
import { urlDecode, urlEncode } from './url';
import { htmlDecode, htmlEncode } from './htmlEntities';
import { hexDecode, hexEncode } from './hex';

export type CodecKind = 'base64' | 'url' | 'html' | 'hex';
export type CodecDirection = 'encode' | 'decode';

export interface CodecOptions {
  /** Base64 URL-safe */
  urlSafe?: boolean;
}

export interface CodecResult {
  output: string;
  error?: string;
}

export function runCodec(
  kind: CodecKind,
  direction: CodecDirection,
  input: string,
  options: CodecOptions = {},
): CodecResult {
  const text = input;
  if (!text) {
    return { output: '' };
  }
  try {
    switch (kind) {
      case 'base64':
        return {
          output:
            direction === 'encode'
              ? base64Encode(text, options.urlSafe)
              : base64Decode(text, options.urlSafe),
        };
      case 'url':
        return {
          output: direction === 'encode' ? urlEncode(text) : urlDecode(text),
        };
      case 'html':
        return {
          output: direction === 'encode' ? htmlEncode(text) : htmlDecode(text),
        };
      case 'hex':
        return {
          output: direction === 'encode' ? hexEncode(text) : hexDecode(text),
        };
      default:
        return { output: '', error: '未知编解码类型' };
    }
  } catch (e) {
    if (e instanceof Base64DecodeError) {
      return { output: '', error: e.message };
    }
    const msg = e instanceof Error ? e.message : '编解码失败';
    return { output: '', error: msg };
  }
}

export {
  base64Encode,
  base64Decode,
  Base64DecodeError,
  urlEncode,
  urlDecode,
  htmlEncode,
  htmlDecode,
  hexEncode,
  hexDecode,
};
