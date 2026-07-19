/**
 * 文件哈希计算器 — MD5 / SHA-1 / SHA-256 / SHA-512 + 预期比对
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Input, message } from 'antd';
import { CheckOutlined, CopyOutlined, InboxOutlined } from '@ant-design/icons';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import {
  FILE_HASH_ALGOS,
  compareHash,
  formatFileHashText,
  formatFileSize,
  hashFile,
  type FileHashAlgo,
  type FileHashResult,
} from '../../utils/fileHash';
import { resolveNetworkIcon } from '../../utils/iconMap';
import { useTabPageState } from '../../../../../hooks/useTabPageState';
import '../../network.css';
import '../../components/NetworkToolLayout.css';
import './file-hash.css';

const WARN_SIZE = 50 * 1024 * 1024; // 50MB
const PAGE_KEY = 'tools-network-file-hash';

const FileHashTool: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [results, setResults] = useState<FileHashResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 文件本身无法序列化，仅持久化预期哈希 */
  const [expected, setExpected] = useTabPageState(PAGE_KEY, '');
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState<FileHashAlgo | null>(null);

  const comparison = useMemo(() => compareHash(results, expected), [results, expected]);

  const processFile = useCallback(async (f: File) => {
    setFile(f);
    setError(null);
    setLoading(true);
    setResults(null);
    try {
      const hashes = await hashFile(f);
      setResults(hashes);
    } catch (e) {
      setError(e instanceof Error ? e.message : '计算哈希失败');
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const onPick = (list: FileList | null) => {
    const f = list?.[0];
    if (f) void processFile(f);
  };

  const copyOne = (algo: FileHashAlgo, value: string) => {
    void navigator.clipboard?.writeText(value).then(
      () => {
        message.success(`已复制 ${algo}`);
        setCopied(algo);
        window.setTimeout(() => setCopied((c) => (c === algo ? null : c)), 1200);
      },
      () => message.error('复制失败'),
    );
  };

  const resultText =
    results && file
      ? formatFileHashText(results, { name: file.name, size: file.size })
      : '';

  return (
    <NetworkToolLayout
      title="文件哈希计算器"
      icon={resolveNetworkIcon('SafetyCertificateOutlined')}
      description="本地计算 MD5 / SHA-1 / SHA-256 / SHA-512 · 文件不上传"
      submitText="重新计算"
      showSubmit={Boolean(file)}
      loading={loading}
      onSubmit={() => {
        if (file) void processFile(file);
      }}
      resultText={resultText}
      error={error}
      inputLabel="文件"
      inputMeta="本地选择 · 不离开浏览器"
      result={
        <div className="ntl-fh" data-testid="file-hash-results">
          {!results && !loading && (
            <div className="ntl-fh-empty">选择文件后显示哈希结果</div>
          )}
          {results && (
            <>
              {file && (
                <div className="ntl-fh-meta" data-testid="file-hash-meta">
                  <span>
                    文件 <strong>{file.name}</strong>
                  </span>
                  <span>
                    大小 <strong>{formatFileSize(file.size)}</strong>
                  </span>
                </div>
              )}
              <div className="ntl-fh-grid">
                {FILE_HASH_ALGOS.map((algo) => {
                  const val = results[algo];
                  const isMatch = comparison.matched.includes(algo);
                  const testId =
                    algo === 'MD5'
                      ? 'file-hash-md5'
                      : algo === 'SHA-1'
                        ? 'file-hash-sha1'
                        : algo === 'SHA-256'
                          ? 'file-hash-sha256'
                          : 'file-hash-sha512';
                  return (
                    <div
                      key={algo}
                      className={`ntl-fh-card${isMatch ? ' is-match' : ''}`}
                      data-testid={testId}
                    >
                      <span className="ntl-fh-algo">{algo}</span>
                      <code className="ntl-fh-val">{val}</code>
                      <button
                        type="button"
                        className={`ntl-fh-copy${copied === algo ? ' ntl-fh-copy--done' : ''}`}
                        title={`复制 ${algo}`}
                        aria-label={`复制 ${algo}`}
                        onClick={() => copyOne(algo, val)}
                      >
                        {copied === algo ? <CheckOutlined /> : <CopyOutlined />}
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="ntl-fh-expect">
                <label htmlFor="file-hash-expect">预期哈希（可选，自动比对）</label>
                <Input
                  id="file-hash-expect"
                  value={expected}
                  onChange={(e) => setExpected(e.target.value)}
                  placeholder="粘贴 MD5 / SHA-1 / SHA-256 / SHA-512…"
                  data-testid="file-hash-expect"
                  allowClear
                  spellCheck={false}
                />
                {expected.trim() && (
                  <div
                    className={`ntl-fh-compare${
                      comparison.anyMatch
                        ? ' ntl-fh-compare--ok'
                        : ' ntl-fh-compare--bad'
                    }`}
                    data-testid="file-hash-compare"
                  >
                    {comparison.anyMatch
                      ? `✓ 匹配：${comparison.matched.join('、')}`
                      : '✗ 与计算结果不匹配'}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      }
    >
      <div data-testid="network-tool-input-slot">
        <div
          className={`ntl-fh-drop${dragOver ? ' is-drag' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            onPick(e.dataTransfer.files);
          }}
        >
          <InboxOutlined style={{ fontSize: 28, color: 'var(--tool-accent, #2563eb)' }} />
          <div className="ntl-fh-drop-title">
            {file ? '点击或拖拽更换文件' : '点击选择或拖拽文件到此处'}
          </div>
          <div className="ntl-fh-drop-hint">哈希仅在浏览器本地计算，不会上传</div>
          <input
            type="file"
            data-testid="file-hash-input"
            onChange={(e) => onPick(e.target.files)}
          />
        </div>
        {file && file.size > WARN_SIZE && (
          <div className="ntl-fh-warn" style={{ marginTop: 10 }}>
            文件较大（{formatFileSize(file.size)}），计算可能较慢，请稍候…
          </div>
        )}
      </div>
    </NetworkToolLayout>
  );
};

export default FileHashTool;
