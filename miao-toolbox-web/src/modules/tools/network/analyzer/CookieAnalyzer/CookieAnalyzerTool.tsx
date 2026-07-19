/**
 * Cookie 分析器 — 解析 Set-Cookie / document.cookie
 *
 * 复制策略（控制视觉噪音）：
 * - 保留：Name、Value、整行 name=value
 * - 去掉：Domain / Path / SameSite / HttpOnly / Secure 逐格复制（短字段，低频）
 * - 结果区顶部「复制」仍可一键拷贝完整结构化文本
 */
import React, { useCallback, useState } from 'react';
import { Input, message } from 'antd';
import { CheckOutlined, CopyOutlined } from '@ant-design/icons';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import {
  cookiesToJson,
  formatCookiesText,
  parseCookies,
  type CookieAttributes,
} from '../../utils/cookieAnalyzer';
import { resolveNetworkIcon } from '../../utils/iconMap';
import { useTabPageStore } from '../../../../../hooks/useTabPageState';
import '../../network.css';
import '../../components/NetworkToolLayout.css';
import './cookie-analyzer.css';

const { TextArea } = Input;

const SAMPLE =
  'session=abc123; Domain=.example.com; Path=/; HttpOnly; Secure; SameSite=Lax';
const PAGE_KEY = 'tools-network-cookie-analyzer';

function copyText(text: string, label?: string) {
  void navigator.clipboard?.writeText(text).then(
    () => message.success(label ? `已复制 ${label}` : '已复制'),
    () => message.error('复制失败'),
  );
}

function Flag({ on }: { on?: boolean }) {
  return (
    <span className={`ntl-ck-flag${on ? ' ntl-ck-flag--on' : ' ntl-ck-flag--off'}`}>
      {on ? '✓' : '—'}
    </span>
  );
}

/** 仅用于 Name / Value 等高频字段 */
function Copyable({
  value,
  label,
  className,
  children,
}: {
  value: string;
  label: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [done, setDone] = useState(false);
  if (!value) {
    return <span className={className}>{children ?? '—'}</span>;
  }

  const onCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard?.writeText(value).then(
      () => {
        message.success(`已复制 ${label}`);
        setDone(true);
        window.setTimeout(() => setDone(false), 1200);
      },
      () => message.error('复制失败'),
    );
  };

  return (
    <div className={`ntl-ck-copyable${className ? ` ${className}` : ''}`}>
      <span className="ntl-ck-copyable-text">{children ?? value}</span>
      <button
        type="button"
        className={`ntl-ck-copy-btn${done ? ' ntl-ck-copy-btn--done' : ''}`}
        title={`复制 ${label}`}
        aria-label={`复制 ${label}`}
        onClick={onCopy}
      >
        {done ? <CheckOutlined /> : <CopyOutlined />}
      </button>
    </div>
  );
}

function CookieTable({ cookies }: { cookies: CookieAttributes[] }) {
  return (
    <>
      <div className="ntl-ck-table-wrap" data-testid="cookie-table">
        <table className="ntl-ck-table">
          <thead>
            <tr>
              <th className="ntl-ck-th-idx">#</th>
              <th>Name</th>
              <th>Value</th>
              <th>Domain</th>
              <th>Path</th>
              <th>SameSite</th>
              <th>HttpOnly</th>
              <th>Secure</th>
              <th className="ntl-ck-th-action" title="复制 name=value">
                复制
              </th>
            </tr>
          </thead>
          <tbody>
            {cookies.map((c, i) => {
              const line = `${c.name}=${c.value}`;
              return (
                <tr key={`${c.name}-${i}`} data-testid={`cookie-row-${i}`}>
                  <td className="ntl-ck-idx">{i + 1}</td>
                  <td>
                    <Copyable value={c.name} label="Name">
                      <span className="ntl-ck-name">{c.name}</span>
                    </Copyable>
                  </td>
                  <td>
                    <Copyable value={c.value} label="Value">
                      <span className="ntl-ck-val">{c.value}</span>
                    </Copyable>
                  </td>
                  <td className="ntl-ck-plain">{c.Domain ?? '—'}</td>
                  <td className="ntl-ck-plain">{c.Path ?? '—'}</td>
                  <td className="ntl-ck-plain">{c.SameSite ?? '—'}</td>
                  <td>
                    <Flag on={c.HttpOnly} />
                  </td>
                  <td>
                    <Flag on={c.Secure} />
                  </td>
                  <td className="ntl-ck-td-action">
                    <button
                      type="button"
                      className="ntl-ck-row-copy"
                      title="复制 name=value"
                      aria-label={`复制 ${line}`}
                      onClick={() => copyText(line, 'name=value')}
                    >
                      <CopyOutlined />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="ntl-ck-cards" data-testid="cookie-cards">
        {cookies.map((c, i) => (
          <div className="ntl-ck-card" key={`${c.name}-card-${i}`}>
            <div className="ntl-ck-card-head">
              <div className="ntl-ck-card-title">
                <Copyable value={c.name} label="Name">
                  <span className="ntl-ck-name">{c.name}</span>
                </Copyable>
                <span className="ntl-ck-eq">=</span>
                <Copyable value={c.value} label="Value">
                  <span className="ntl-ck-val">{c.value}</span>
                </Copyable>
              </div>
              <button
                type="button"
                className="ntl-ck-row-copy"
                title="复制 name=value"
                onClick={() => copyText(`${c.name}=${c.value}`, 'name=value')}
              >
                <CopyOutlined />
              </button>
            </div>
            <dl className="ntl-ck-kv">
              <dt>Domain</dt>
              <dd>{c.Domain ?? '—'}</dd>
              <dt>Path</dt>
              <dd>{c.Path ?? '—'}</dd>
              <dt>SameSite</dt>
              <dd>{c.SameSite ?? '—'}</dd>
              <dt>HttpOnly</dt>
              <dd>
                <Flag on={c.HttpOnly} />
              </dd>
              <dt>Secure</dt>
              <dd>
                <Flag on={c.Secure} />
              </dd>
              {c.Expires != null && (
                <>
                  <dt>Expires</dt>
                  <dd>{c.Expires}</dd>
                </>
              )}
              {c['Max-Age'] != null && (
                <>
                  <dt>Max-Age</dt>
                  <dd>{c['Max-Age']}</dd>
                </>
              )}
            </dl>
          </div>
        ))}
      </div>
    </>
  );
}

const CookieAnalyzerTool: React.FC = () => {
  const { state, setField, setState } = useTabPageStore(PAGE_KEY, {
    input: SAMPLE,
    cookies: parseCookies(SAMPLE) as CookieAttributes[],
  });
  const { input, cookies } = state;
  const [loading, setLoading] = useState(false);

  const run = useCallback(() => {
    setLoading(true);
    window.setTimeout(() => {
      setState((prev) => ({ ...prev, cookies: parseCookies(prev.input) }));
      setLoading(false);
    }, 40);
  }, [setState]);

  const resultText =
    cookies.length > 0
      ? `${formatCookiesText(cookies)}\n\n--- JSON ---\n${cookiesToJson(cookies)}`
      : '未解析到 Cookie';

  return (
    <NetworkToolLayout
      title="Cookie 分析器"
      icon={resolveNetworkIcon('CookieOutlined')}
      description="解析 Set-Cookie / document.cookie · 结构化属性"
      submitText="解析"
      loading={loading}
      onSubmit={run}
      resultText={resultText}
      inputLabel="Cookie 文本"
      inputMeta="支持多行 / 多条"
      result={
        <div className="ntl-ck" data-testid="cookie-result">
          <div className="ntl-ck-toolbar">
            <span className="ntl-ck-badge" data-testid="cookie-count">
              {cookies.length === 0 ? '无结果' : `${cookies.length} 条 Cookie`}
            </span>
            <span className="ntl-ck-tip">Name / Value 悬停可复制 · 右侧复制 name=value</span>
          </div>
          {cookies.length === 0 ? (
            <div className="ntl-ck-empty" data-testid="cookie-empty">
              未解析到有效 Cookie，请检查格式
            </div>
          ) : (
            <CookieTable cookies={cookies} />
          )}
        </div>
      }
    >
      <div data-testid="network-tool-input-slot">
        <p className="ntl-ck-hint">
          支持：<code>Set-Cookie</code> 属性串、多行多条、或 <code>document.cookie</code>（
          <code>a=1; b=2</code>）
        </p>
        <TextArea
          value={input}
          onChange={(e) => setField('input', e.target.value)}
          rows={5}
          placeholder={SAMPLE}
          data-testid="cookie-input"
          spellCheck={false}
          style={{ fontFamily: 'var(--miao-font-mono, ui-monospace, Menlo, monospace)' }}
        />
      </div>
    </NetworkToolLayout>
  );
};

export default CookieAnalyzerTool;
