/**
 * RSA 加解密工具函数
 *
 * 使用 jsencrypt 实现 RSA 密钥生成、加密、解密。
 * 支持 PKCS1 v1.5 和 OAEP 填充。
 */

import JSEncrypt from 'jsencrypt';

export interface RsaKeyPair {
  publicKey: string;
  privateKey: string;
}

export type RsaPadding = 'pkcs1' | 'oaep';

/** 计算指定密钥长度和填充模式下，明文最大字节数 */
export function getMaxPlaintextLength(keySize: number, padding: RsaPadding = 'pkcs1'): number {
  const modulusLength = keySize / 8;
  if (padding === 'oaep') {
    // OAEP with SHA-1: 2 * hashLen + 2, SHA-1 hashLen = 20
    return modulusLength - 2 * 20 - 2;
  }
  // PKCS1 v1.5
  return modulusLength - 11;
}

/** 生成 RSA 密钥对 */
export function generateRsaKeyPair(keySize: 512 | 1024 | 2048 | 4096 = 2048): Promise<RsaKeyPair> {
  return new Promise((resolve, reject) => {
    try {
      const encrypt = new JSEncrypt({ default_key_size: String(keySize) });
      encrypt.getKey(() => {
        const publicKey = encrypt.getPublicKey();
        const privateKey = encrypt.getPrivateKey();
        if (!publicKey || !privateKey) {
          reject(new Error('密钥生成失败'));
          return;
        }
        resolve({ publicKey, privateKey });
      });
    } catch (e) {
      reject(e);
    }
  });
}

function createJSEncrypt(padding: RsaPadding): JSEncrypt {
  const instance = new JSEncrypt();
  // jsencrypt 默认使用 PKCS1 v1.5；OAEP 通过环境变量/内部选项开启
  // 新版本的 jsencrypt 支持 setPadding 方法
  if (padding === 'oaep') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (instance as any).setOaep?.(true);
  }
  return instance;
}

export function rsaEncrypt(input: string, publicKey: string, keySize: number, padding: RsaPadding = 'pkcs1'): string {
  if (!publicKey.trim()) throw new Error('请输入公钥');
  if (!publicKey.includes('-----BEGIN PUBLIC KEY-----')) throw new Error('公钥格式无效');

  const encoder = new TextEncoder();
  const byteLength = encoder.encode(input).length;
  const maxLen = getMaxPlaintextLength(keySize, padding);
  if (byteLength > maxLen) {
    throw new Error(`明文过长，最大支持 ${maxLen} 字节`);
  }

  try {
    const encrypt = createJSEncrypt(padding);
    encrypt.setPublicKey(publicKey);
    const result = encrypt.encrypt(input);
    if (!result) throw new Error('RSA 加密失败：请检查公钥格式');
    return result;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('RSA')) throw e;
    throw new Error('RSA 加密失败：请检查公钥格式', { cause: e });
  }
}

export function rsaDecrypt(ciphertext: string, privateKey: string, padding: RsaPadding = 'pkcs1'): string {
  if (!privateKey.trim()) throw new Error('请输入私钥');
  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----') && !privateKey.includes('-----BEGIN RSA PRIVATE KEY-----')) {
    throw new Error('私钥格式无效');
  }

  try {
    const decrypt = createJSEncrypt(padding);
    decrypt.setPrivateKey(privateKey);
    const result = decrypt.decrypt(ciphertext);
    // jsencrypt 可能返回 false / null / "" 表示解密失败
    if (!result) throw new Error('解密失败，密钥与密文不匹配');
    return result;
  } catch (e) {
    if (e instanceof Error && (e.message.startsWith('解密失败') || e.message.startsWith('私钥'))) throw e;
    throw new Error('解密失败，密钥与密文不匹配', { cause: e });
  }
}
