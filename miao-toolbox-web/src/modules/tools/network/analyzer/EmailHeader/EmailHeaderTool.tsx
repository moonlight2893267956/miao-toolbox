import React, { useCallback, useState } from 'react';
import { Input } from 'antd';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import HoverCopy from '../../components/HoverCopy';
import {
  SAMPLE_EMAIL_HEADERS,
  analyzeEmailHeaders,
  formatEmailAnalysisText,
  type EmailHeaderAnalysis,
} from '../../utils/emailHeader';
import { resolveNetworkIcon } from '../../utils/iconMap';
import '../../network.css';
import '../../components/NetworkToolLayout.css';
import './email-header.css';

const { TextArea } = Input;

const CAT_LABEL: Record<string, string> = {
  routing: '路由',
  auth: '认证',
  addressing: '地址',
  content: '内容',
  other: '其他',
};

function authClass(result: string): string {
  const r = result.toLowerCase();
  if (r === 'pass' || r === 'signed') return 'ntl-eh-auth-pill--pass';
  if (r === 'fail' || r === 'softfail' || r === 'hardfail') return 'ntl-eh-auth-pill--fail';
  return 'ntl-eh-auth-pill--other';
}

const EmailHeaderTool: React.FC = () => {
  const [input, setInput] = useState(SAMPLE_EMAIL_HEADERS);
  const [analysis, setAnalysis] = useState<EmailHeaderAnalysis | null>(() =>
    analyzeEmailHeaders(SAMPLE_EMAIL_HEADERS),
  );
  const [loading, setLoading] = useState(false);

  const run = useCallback(() => {
    setLoading(true);
    window.setTimeout(() => {
      setAnalysis(analyzeEmailHeaders(input));
      setLoading(false);
    }, 40);
  }, [input]);

  const resultText = analysis ? formatEmailAnalysisText(analysis) : '';

  return (
    <NetworkToolLayout
      title="Email Header 分析器"
      icon={resolveNetworkIcon('MailOutlined')}
      description="Received 链 · SPF/DKIM/DMARC · 字段分类"
      submitText="解析"
      loading={loading}
      onSubmit={run}
      resultText={resultText}
      inputLabel="邮件原始 Header"
      inputMeta="含 Received / Authentication-Results"
      result={
        !analysis || analysis.fields.length === 0 ? (
          <div className="ntl-eh-empty" data-testid="email-empty">
            未解析到 Header 字段
          </div>
        ) : (
          <div className="ntl-eh" data-testid="email-result">
            <div className="ntl-eh-summary" data-testid="email-summary">
              {[
                ['Subject', analysis.subject],
                ['From', analysis.from],
                ['To', analysis.to],
                ['Date', analysis.date],
              ].map(([k, v]) =>
                v ? (
                  <div className="ntl-eh-card" key={k as string}>
                    <small>{k}</small>
                    <HoverCopy value={v} label={k as string} className="ntl-hover-copy--block">
                      <strong>{v}</strong>
                    </HoverCopy>
                  </div>
                ) : null,
              )}
            </div>

            <h4 className="ntl-eh-section-title">认证结果 SPF / DKIM / DMARC</h4>
            <div className="ntl-eh-auth" data-testid="email-auth">
              {analysis.auth.length === 0 ? (
                <span className="ntl-eh-empty" style={{ padding: '8px 12px' }}>
                  未检测到认证结果
                </span>
              ) : (
                analysis.auth.map((a, i) => (
                  <HoverCopy
                    key={`${a.protocol}-${i}`}
                    value={`${a.protocol}=${a.result}${a.detail ? ` ${a.detail}` : ''}`}
                    label={a.protocol.toUpperCase()}
                  >
                    <span
                      className={`ntl-eh-auth-pill ${authClass(a.result)}`}
                      title={a.detail}
                      data-testid={`email-auth-${a.protocol}`}
                    >
                      {a.protocol} · {a.result}
                    </span>
                  </HoverCopy>
                ))
              )}
            </div>

            <h4 className="ntl-eh-section-title">
              Received 链（近 → 远）· {analysis.received.length} 跳
            </h4>
            <div className="ntl-eh-hops" data-testid="email-received">
              {analysis.received.length === 0 ? (
                <div className="ntl-eh-empty">无 Received 头</div>
              ) : (
                analysis.received.map((h, i) => {
                  const meta =
                    `${h.from ? `from ${h.from}` : ''}${h.by ? ` → by ${h.by}` : ''}${h.with ? ` with ${h.with}` : ''}${h.date ? `\n@ ${h.date}` : ''}`.trim();
                  return (
                    <div className="ntl-eh-hop" key={i} data-testid={`email-hop-${i}`}>
                      <div className="ntl-eh-hop-head">
                        <div className="ntl-eh-hop-title">
                          #{i + 1}
                          {h.delaySeconds != null ? ` · 延迟 ${h.delaySeconds}s` : ''}
                        </div>
                        <HoverCopy value={h.raw} label={`Received #${i + 1}`} alwaysShow={false}>
                          <span className="ntl-eh-hop-copy-hint">复制原文</span>
                        </HoverCopy>
                      </div>
                      <HoverCopy value={meta} label={`跳 ${i + 1}`} className="ntl-hover-copy--block">
                        <div className="ntl-eh-hop-meta">{meta}</div>
                      </HoverCopy>
                    </div>
                  );
                })
              )}
            </div>

            <h4 className="ntl-eh-section-title">全部字段（{analysis.fields.length}）</h4>
            <div className="ntl-eh-table-wrap" data-testid="email-fields">
              <table className="ntl-eh-table">
                <thead>
                  <tr>
                    <th>分类</th>
                    <th>Name</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.fields.map((f, i) => (
                    <tr key={`${f.name}-${i}`}>
                      <td className="ntl-eh-cat">{CAT_LABEL[f.category] || f.category}</td>
                      <td className="ntl-eh-name">
                        <HoverCopy value={f.name} label="Name">
                          <span className="ntl-eh-name-text">{f.name}</span>
                        </HoverCopy>
                      </td>
                      <td>
                        <HoverCopy value={f.value} label={f.name} className="ntl-hover-copy--block">
                          {f.value}
                        </HoverCopy>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      }
    >
      <div data-testid="network-tool-input-slot">
        <TextArea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={12}
          data-testid="email-input"
          spellCheck={false}
          style={{ fontFamily: 'var(--miao-font-mono, ui-monospace, Menlo, monospace)', fontSize: 12.5 }}
        />
      </div>
    </NetworkToolLayout>
  );
};

export default EmailHeaderTool;
