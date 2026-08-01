import { useState, useMemo, useCallback, useRef } from 'react';
import {
  Table,
  Popover,
  Switch,
  InputNumber,
} from 'antd';
import {
  BugOutlined,
  ClearOutlined,
  CopyOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined,
  PlayCircleOutlined,
  DownOutlined,
  RightOutlined,
  FilterOutlined,
  PlusOutlined,
  CloseOutlined,
  SettingOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  parseRalLog,
  SAMPLE_RAL_LOG,
  DEFAULT_ANOMALY_CONFIG,
  type RalCallRecord,
  type RalParseResult,
  type RalAnomalyConfig,
} from './ralLogParser';
import { useRalLogTabs } from './useRalLogTabs';
import './ral-log-parser.css';

/* ---------- 耗时分解条组件 ---------- */

function CostBreakdownBar({ record }: { record: RalCallRecord }) {
  const total = record.cost || 1;
  const segments = [
    { label: 'connect', value: record.connect, color: 'var(--ral-blue)' },
    { label: 'write', value: record.write, color: 'var(--ral-violet)' },
    { label: 'read', value: record.read, color: 'var(--ral-amber)' },
    { label: 'pack', value: record.pack, color: 'var(--ral-green)' },
    { label: 'unpack', value: record.unpack, color: 'var(--ral-indigo)' },
  ];

  return (
    <Popover
      content={
        <div className="ral-popover-breakdown">
          {segments.map(s => (
            <div key={s.label} className="ral-popover-row">
              <span className="ral-popover-dot" style={{ background: s.color }} />
              <span className="ral-popover-label">{s.label}</span>
              <span className="ral-popover-value">{s.value}ms</span>
            </div>
          ))}
          <div className="ral-popover-total">
            <span>total</span>
            <span>{record.cost}ms</span>
          </div>
        </div>
      }
      title="耗时分解"
      trigger="hover"
      overlayClassName="ral-breakdown-popover"
    >
      <div className="ral-cost-bar">
        {segments.map(s => {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          if (pct < 0.5) return null;
          return (
            <div
              key={s.label}
              className="ral-cost-segment"
              style={{ width: `${pct}%`, backgroundColor: s.color }}
            />
          );
        })}
      </div>
    </Popover>
  );
}

/* ---------- 统计卡片 ---------- */

function StatCard({
  label,
  value,
  suffix,
  icon,
  variant,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  icon: React.ReactNode;
  variant?: 'default' | 'danger' | 'warning';
}) {
  return (
    <div className={`ral-stat-card ral-stat-card--${variant || 'default'}`}>
      <div className="ral-stat-icon">{icon}</div>
      <div className="ral-stat-body">
        <div className="ral-stat-label">{label}</div>
        <div className="ral-stat-value">
          {value}
          {suffix && <span className="ral-stat-suffix">{suffix}</span>}
        </div>
      </div>
    </div>
  );
}

/* ---------- 页签状态 ---------- */

type TabStatus = 'parsed' | 'pending' | 'empty';

function getTabStatus(tab: { input: string; result: RalParseResult | null }): TabStatus {
  if (tab.result) return 'parsed';
  if (tab.input.trim()) return 'pending';
  return 'empty';
}

/* ---------- 页签重命名组件 ---------- */

const TabName: React.FC<{
  name: string;
  onRename: (name: string) => void;
}> = ({ name, onRename }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setDraft(name);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) onRename(trimmed);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="ral-tab-name-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <span className="ral-tab-name" onDoubleClick={startEdit} title="双击重命名">
      {name}
    </span>
  );
};

/* ---------- 异常配置面板 ---------- */

interface AnomalyConfigPanelProps {
  config: RalAnomalyConfig;
  onChange: (config: RalAnomalyConfig) => void;
  visible: boolean;
  onClose: () => void;
}

function AnomalyConfigPanel({ config, onChange, visible, onClose }: AnomalyConfigPanelProps) {
  if (!visible) return null;

  const toggle = (key: keyof RalAnomalyConfig) => {
    onChange({ ...config, [key]: !config[key] });
  };

  const setThreshold = (key: keyof RalAnomalyConfig, value: number | null) => {
    if (value !== null) {
      onChange({ ...config, [key]: value });
    }
  };

  const resetToDefault = () => {
    onChange({ ...DEFAULT_ANOMALY_CONFIG });
  };

  const rules: { key: keyof RalAnomalyConfig; label: string; desc: string; hasThreshold?: boolean; thresholdKey?: keyof RalAnomalyConfig; unit?: string }[] = [
    { key: 'checkLogLevel', label: '日志级别异常', desc: 'WARNING / ERROR 级别标记为异常' },
    { key: 'checkErrNo', label: 'err_no 非零', desc: 'err_no ≠ 0 时标记为异常' },
    { key: 'checkCurlCode', label: 'curl_code 非零', desc: 'curl_code ≠ 0 时标记为异常' },
    { key: 'checkProtCode', label: 'prot_code 异常', desc: 'prot_code = 0 或 ≥ 500 时标记为异常' },
    { key: 'checkCostOverRtimeout', label: 'cost 超读超时', desc: 'cost > rtimeout 时标记为异常' },
    { key: 'checkCostThreshold', label: 'cost 超阈值', desc: 'cost 超过设定阈值时标记为异常', hasThreshold: true, thresholdKey: 'costThreshold', unit: 'ms' },
    { key: 'checkConnectThreshold', label: 'connect 超阈值', desc: 'connect 超过设定阈值时标记为异常', hasThreshold: true, thresholdKey: 'connectThreshold', unit: 'ms' },
    { key: 'checkReadThreshold', label: 'read 超阈值', desc: 'read 超过设定阈值时标记为异常', hasThreshold: true, thresholdKey: 'readThreshold', unit: 'ms' },
  ];

  return (
    <div className="ral-config-overlay" onClick={onClose}>
      <div className="ral-config-panel" onClick={e => e.stopPropagation()}>
        <div className="ral-config-header">
          <div className="ral-config-title">
            <SettingOutlined /> 异常判定规则
          </div>
          <button type="button" className="ral-config-close" onClick={onClose}>
            <CloseOutlined />
          </button>
        </div>
        <div className="ral-config-body">
          {rules.map(rule => (
            <div key={rule.key} className="ral-config-rule">
              <div className="ral-config-rule-left">
                <Switch
                  size="small"
                  checked={config[rule.key] as boolean}
                  onChange={() => toggle(rule.key)}
                />
                <div className="ral-config-rule-text">
                  <div className="ral-config-rule-label">{rule.label}</div>
                  <div className="ral-config-rule-desc">{rule.desc}</div>
                </div>
              </div>
              {rule.hasThreshold && rule.thresholdKey && (
                <div className={`ral-config-rule-threshold ${!(config[rule.key] as boolean) ? 'ral-config-rule-threshold--disabled' : ''}`}>
                  <InputNumber
                    size="small"
                    min={0}
                    max={999999}
                    value={config[rule.thresholdKey] as number}
                    onChange={v => setThreshold(rule.thresholdKey!, v)}
                    disabled={!(config[rule.key] as boolean)}
                    addonAfter={rule.unit}
                    style={{ width: 130 }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="ral-config-footer">
          <button type="button" className="ral-action-btn" onClick={resetToDefault}>
            <UndoOutlined /> 恢复默认
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 主页面组件 ---------- */

export function RalLogParserPage() {
  const {
    tabs,
    activeId,
    activeTab,
    addTab,
    removeTab,
    activateTab,
    renameTab,
    updateTabInput,
    updateTabResult,
    updateTabAnomalyConfig,
  } = useRalLogTabs();

  const [loading, setLoading] = useState(false);
  const [showOnlyAbnormal, setShowOnlyAbnormal] = useState(false);
  const [expandedRows, setExpandedRows] = useState<number[]>([]);
  const [configVisible, setConfigVisible] = useState(false);

  const logText = activeTab.input;
  const result = activeTab.result;
  const anomalyConfig = activeTab.anomalyConfig;

  const handleParse = useCallback(() => {
    if (!logText.trim()) return;
    setLoading(true);
    setTimeout(() => {
      const parseResult = parseRalLog(logText, anomalyConfig);
      updateTabResult(activeTab.id, parseResult);
      setLoading(false);
    }, 50);
  }, [logText, activeTab.id, updateTabResult, anomalyConfig]);

  const handleClear = useCallback(() => {
    updateTabInput(activeTab.id, '');
    updateTabResult(activeTab.id, null);
    setShowOnlyAbnormal(false);
    setExpandedRows([]);
  }, [activeTab.id, updateTabInput, updateTabResult]);

  const handleLoadSample = useCallback(() => {
    updateTabInput(activeTab.id, SAMPLE_RAL_LOG);
    updateTabResult(activeTab.id, null);
  }, [activeTab.id, updateTabInput, updateTabResult]);

  const handleCopyAll = useCallback(() => {
    if (!result) return;
    const header = '序号\t时间\t类型\t服务\t方法\tURI\t总耗时\t连接\t通信\t读取\terr_no\tcurl_code\tprot_code\t远端IP\t读超时';
    const rows = result.records.map(r =>
      `${r.index}\t${r.timestamp}\t${r.logType}\t${r.service}\t${r.method}\t${r.uri}\t${r.cost}\t${r.connect}\t${r.talk}\t${r.read}\t${r.errNo}\t${r.curlCode}\t${r.protCode}\t${r.remoteIp}\t${r.rtimeout}`
    );
    navigator.clipboard.writeText([header, ...rows].join('\n'));
  }, [result]);

  const handleConfigChange = useCallback((newConfig: RalAnomalyConfig) => {
    updateTabAnomalyConfig(activeTab.id, newConfig);
  }, [activeTab.id, updateTabAnomalyConfig]);

  const displayRecords = useMemo(() => {
    if (!result) return [];
    if (showOnlyAbnormal) return result.records.filter(r => r.isAbnormal);
    return result.records;
  }, [result, showOnlyAbnormal]);

  const abnormalRate = result && result.totalRalLines > 0
    ? ((result.abnormalCount / result.totalRalLines) * 100).toFixed(1)
    : '0';

  // 统计当前启用的规则数
  const enabledRuleCount = [
    anomalyConfig.checkLogLevel,
    anomalyConfig.checkErrNo,
    anomalyConfig.checkCurlCode,
    anomalyConfig.checkProtCode,
    anomalyConfig.checkCostOverRtimeout,
    anomalyConfig.checkCostThreshold,
    anomalyConfig.checkConnectThreshold,
    anomalyConfig.checkReadThreshold,
  ].filter(Boolean).length;

  const columns: ColumnsType<RalCallRecord> = [
    {
      title: '#',
      dataIndex: 'index',
      key: 'index',
      width: 44,
      fixed: 'left',
      render: (v: number) => <span className="ral-cell-idx">{String(v).padStart(2, '0')}</span>,
    },
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 170,
      ellipsis: true,
      render: (v: string) => <span className="ral-cell-mono">{v}</span>,
    },
    {
      title: '类型',
      dataIndex: 'logType',
      key: 'logType',
      width: 68,
      render: (v: string) => (
        <span className={`ral-type-tag ral-type-tag--${v === 'E_SUM' ? 'sum' : 'talk'}`}>{v}</span>
      ),
    },
    {
      title: '服务',
      dataIndex: 'service',
      key: 'service',
      width: 130,
      ellipsis: true,
      render: (v: string) => <span className="ral-cell-service">{v}</span>,
    },
    {
      title: '方法',
      dataIndex: 'method',
      key: 'method',
      width: 64,
      render: (v: string) => <span className="ral-cell-method">{v}</span>,
    },
    {
      title: 'URI',
      dataIndex: 'uri',
      key: 'uri',
      width: 180,
      ellipsis: true,
      render: (v: string) => <span className="ral-cell-mono">{v}</span>,
    },
    {
      title: 'cost',
      dataIndex: 'cost',
      key: 'cost',
      width: 160,
      sorter: (a, b) => a.cost - b.cost,
      render: (cost: number, record) => (
        <div className="ral-cost-cell">
          <span className={`ral-cost-value ${cost > 1000 ? 'ral-cost-value--high' : cost > 500 ? 'ral-cost-value--warn' : ''}`}>
            {cost}<span className="ral-cost-unit">ms</span>
          </span>
          <CostBreakdownBar record={record} />
        </div>
      ),
    },
    {
      title: 'connect',
      dataIndex: 'connect',
      key: 'connect',
      width: 76,
      sorter: (a, b) => a.connect - b.connect,
      render: (v: number) => <span className={`ral-cell-ms ${v > 100 ? 'ral-cell-ms--warn' : ''}`}>{v}ms</span>,
    },
    {
      title: 'talk',
      dataIndex: 'talk',
      key: 'talk',
      width: 76,
      sorter: (a, b) => a.talk - b.talk,
      render: (v: number) => <span className={`ral-cell-ms ${v > 1000 ? 'ral-cell-ms--high' : ''}`}>{v}ms</span>,
    },
    {
      title: 'read',
      dataIndex: 'read',
      key: 'read',
      width: 76,
      sorter: (a, b) => a.read - b.read,
      render: (v: number) => <span className={`ral-cell-ms ${v > 1000 ? 'ral-cell-ms--high' : ''}`}>{v}ms</span>,
    },
    {
      title: 'err_no',
      dataIndex: 'errNo',
      key: 'errNo',
      width: 72,
      sorter: (a, b) => a.errNo - b.errNo,
      render: (v: number) => v !== 0
        ? <span className="ral-cell-error">{v}</span>
        : <span className="ral-cell-muted">0</span>,
    },
    {
      title: 'curl_code',
      dataIndex: 'curlCode',
      key: 'curlCode',
      width: 80,
      sorter: (a, b) => a.curlCode - b.curlCode,
      render: (v: number) => v !== 0
        ? <span className="ral-cell-error">{v}</span>
        : <span className="ral-cell-muted">0</span>,
    },
    {
      title: 'prot_code',
      dataIndex: 'protCode',
      key: 'protCode',
      width: 80,
      sorter: (a, b) => a.protCode - b.protCode,
      render: (v: number) => (v >= 400 || v === 0) && v !== 200
        ? <span className="ral-cell-error">{v}</span>
        : <span className="ral-cell-muted">{v}</span>,
    },
    {
      title: '远端 IP',
      dataIndex: 'remoteIp',
      key: 'remoteIp',
      width: 126,
      render: (v: string) => <span className="ral-cell-mono">{v}</span>,
    },
    {
      title: 'rtimeout',
      dataIndex: 'rtimeout',
      key: 'rtimeout',
      width: 80,
      sorter: (a, b) => a.rtimeout - b.rtimeout,
      render: (v: number) => <span className="ral-cell-muted">{v}ms</span>,
    },
  ];

  return (
    <div className="ral-page">
      {/* ---- 页头 ---- */}
      <header className="ral-header">
        <div className="ral-header-inner">
          <div className="ral-header-icon">
            <BugOutlined />
          </div>
          <div className="ral-header-text">
            <h2>RAL 日志解析器</h2>
            <div className="ral-header-subtitle">
              <span className="ral-dot" />
              RAL 调用追踪 · E_SUM / E_TALK · 异常定位
            </div>
          </div>
          <div className="ral-action-group">
            <button
              type="button"
              className={`ral-action-btn ${configVisible ? 'ral-action-btn--active' : ''}`}
              onClick={() => setConfigVisible(!configVisible)}
              title="异常判定规则配置"
            >
              <SettingOutlined /> 规则
              <span className="ral-rule-badge">{enabledRuleCount}</span>
            </button>
            <button
              type="button"
              className="ral-action-btn"
              onClick={handleLoadSample}
            >
              <ThunderboltOutlined /> 示例
            </button>
            <button
              type="button"
              className="ral-action-btn"
              onClick={handleClear}
            >
              <ClearOutlined /> 清空
            </button>
          </div>
        </div>
      </header>

      {/* ---- 页签栏 ---- */}
      <div className="ral-tabs-bar">
        <div className="ral-tabs-label">
          <span className="ral-tabs-label-dot" />
          <span className="ral-tabs-label-text">SESSION</span>
          <span className="ral-tabs-label-count">{tabs.length}</span>
        </div>
        <div className="ral-tabs-scroll">
          {tabs.map((tab, idx) => {
            const status = getTabStatus(tab);
            return (
              <div
                key={tab.id}
                className={`ral-tab ral-tab--${status} ${tab.id === activeId ? 'ral-tab--active' : ''}`}
                onClick={() => activateTab(tab.id)}
              >
                <span className="ral-tab-status" data-status={status} />
                <span className="ral-tab-idx">{String(idx + 1).padStart(2, '0')}</span>
                <TabName
                  name={tab.name}
                  onRename={(name) => renameTab(tab.id, name)}
                />
                {tabs.length > 1 && (
                  <button
                    type="button"
                    className="ral-tab-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTab(tab.id);
                    }}
                    title="关闭页签"
                  >
                    <CloseOutlined />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className="ral-tab-add"
          onClick={addTab}
          title="新建页签"
        >
          <PlusOutlined />
        </button>
      </div>

      {/* ---- 输入区 ---- */}
      <section className="ral-input-section">
        <div className="ral-section-label">
          日志内容
          {logText && (
            <span className="ral-line-count">
              {logText.split('\n').filter(l => l.trim()).length} 行
            </span>
          )}
        </div>
        <textarea
          className="ral-textarea"
          value={logText}
          onChange={e => updateTabInput(activeTab.id, e.target.value)}
          placeholder="粘贴 RAL 日志内容…&#10;支持 E_SUM / E_TALK 类型，自动识别 log_type=E_SUM caller=RAL 的行"
          spellCheck={false}
          rows={6}
        />
        <div className="ral-actions">
          <button
            type="button"
            className="ral-action-btn ral-action-btn--primary"
            onClick={handleParse}
            disabled={loading || !logText.trim()}
          >
            <PlayCircleOutlined /> 解析
          </button>
        </div>
      </section>

      {/* ---- 结果区 ---- */}
      {result && (
        <>
          {result.totalRalLines === 0 ? (
            <section className="ral-empty-section">
              <div className="ral-empty-icon">
                <WarningOutlined />
              </div>
              <div className="ral-empty-title">未识别到 RAL 日志行</div>
              <div className="ral-empty-desc">
                请确认日志中包含 log_type=E_SUM 或 log_type=E_TALK 且 caller=RAL 的行
              </div>
            </section>
          ) : (
            <section className="ral-result-section">
              {/* 统计卡片 */}
              <div className="ral-stats-grid">
                <StatCard
                  label="总调用"
                  value={result.totalRalLines}
                  icon={<CheckCircleOutlined />}
                />
                <StatCard
                  label="异常"
                  value={result.abnormalCount}
                  icon={<WarningOutlined />}
                  variant={result.abnormalCount > 0 ? 'danger' : 'default'}
                />
                <StatCard
                  label="异常率"
                  value={abnormalRate}
                  suffix="%"
                  icon={<FilterOutlined />}
                  variant={result.abnormalCount > 0 ? 'danger' : 'default'}
                />
                <StatCard
                  label="解析失败"
                  value={result.failedCount}
                  icon={<ClearOutlined />}
                  variant={result.failedCount > 0 ? 'warning' : 'default'}
                />
              </div>

              {/* 表格工具栏 */}
              <div className="ral-table-toolbar">
                <div className="ral-table-toolbar-left">
                  <button
                    type="button"
                    className={`ral-filter-btn ${showOnlyAbnormal ? 'ral-filter-btn--active' : ''}`}
                    onClick={() => setShowOnlyAbnormal(!showOnlyAbnormal)}
                  >
                    <WarningOutlined />
                    {showOnlyAbnormal ? '显示全部' : '仅看异常'}
                    {showOnlyAbnormal && (
                      <span className="ral-filter-count">{result.abnormalCount}</span>
                    )}
                  </button>
                </div>
                <div className="ral-table-toolbar-right">
                  <button
                    type="button"
                    className="ral-action-btn"
                    onClick={handleCopyAll}
                  >
                    <CopyOutlined /> 复制表格
                  </button>
                </div>
              </div>

              {/* 表格 */}
              <div className="ral-table-wrap">
                <Table<RalCallRecord>
                  columns={columns}
                  dataSource={displayRecords}
                  rowKey="index"
                  size="small"
                  scroll={{ x: 1600 }}
                  pagination={displayRecords.length > 50 ? { pageSize: 50 } : false}
                  rowClassName={record =>
                    record.isAbnormal
                      ? 'ral-row-abnormal'
                      : record.parseFailed
                        ? 'ral-row-parse-failed'
                        : ''
                  }
                  expandable={{
                    expandedRowKeys: expandedRows,
                    onExpandedRowsChange: keys => setExpandedRows(keys as number[]),
                    expandIcon: ({ expanded, onExpand, record }) =>
                      expanded ? (
                        <DownOutlined
                          className="ral-expand-icon"
                          onClick={e => onExpand(record, e)}
                        />
                      ) : (
                        <RightOutlined
                          className="ral-expand-icon"
                          onClick={e => onExpand(record, e)}
                        />
                      ),
                    expandedRowRender: record => (
                      <div className="ral-expanded-row">
                        <div className="ral-expanded-section">
                          <div className="ral-expanded-label">原始日志</div>
                          <pre className="ral-raw-log">{record.rawLine}</pre>
                        </div>
                        {record.abnormalReasons.length > 0 && (
                          <div className="ral-expanded-section">
                            <div className="ral-expanded-label">异常原因</div>
                            <div className="ral-reason-tags">
                              {record.abnormalReasons.map((r, i) => (
                                <span key={i} className="ral-reason-tag">{r}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="ral-expanded-section">
                          <div className="ral-expanded-label">全量字段</div>
                          <pre className="ral-all-fields">
                            {Object.entries(record.allFields)
                              .map(([k, v]) => `${k}=${v}`)
                              .join('\n')}
                          </pre>
                        </div>
                      </div>
                    ),
                  }}
                />
              </div>
            </section>
          )}
        </>
      )}

      {/* ---- 异常配置面板 ---- */}
      <AnomalyConfigPanel
        config={anomalyConfig}
        onChange={handleConfigChange}
        visible={configVisible}
        onClose={() => setConfigVisible(false)}
      />
    </div>
  );
}
