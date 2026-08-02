/**
 * PHP 日志提取器 — 顶级工具页面
 *
 * 从含 PHP 序列化数据的日志中提取 inputdata / outputdata / param / result。
 * 纯前端解析，无服务端交互。支持多页签同时打开多份日志，底部概览条对比。
 */
import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CopyOutlined,
  DownloadOutlined,
  PlayCircleOutlined,
  ClearOutlined,
  ThunderboltOutlined,
  FileTextOutlined,
  PlusOutlined,
  CloseOutlined,
  TableOutlined,
  CaretDownOutlined,
  CaretRightOutlined,
  ExportOutlined,
  CodeOutlined,
} from '@ant-design/icons';
import { message, Select, Switch, Tooltip } from 'antd';
import {
  parsePhpLog,
  syntaxHighlightJSON,
  SAMPLE_PHP_LOG,
  type PhpLogExtractResult,
  type SerializeEncoding,
} from './phpLogExtractor';
import { usePhpLogTabs } from './usePhpLogTabs';
import { sendJsonToWorkbench } from '../../../shared/toolBridge';
import './php-log-extractor.css';

/* ---------- 概览条辅助 ---------- */

function countTopKeys(v: unknown): number {
  if (v && typeof v === 'object' && !Array.isArray(v)) return Object.keys(v).length;
  if (Array.isArray(v)) return v.length;
  return 0;
}

function hasValue(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'string' && v.trim() === '') return false;
  return true;
}

/** 单页签状态：'parsed' / 'pending' / 'empty' */
type TabStatus = 'parsed' | 'pending' | 'empty';
function getTabStatus(tab: { input: string; result: PhpLogExtractResult | null }): TabStatus {
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
        className="ple-tab-name-input"
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
    <span
      className="ple-tab-name"
      onDoubleClick={(e) => {
        e.stopPropagation();
        startEdit();
      }}
      title="双击重命名"
    >
      {name}
    </span>
  );
};

/* ---------- 主页面 ---------- */

const PhpLogExtractorPage: React.FC = () => {
  const {
    tabs,
    activeId,
    activeTab,
    addTab,
    removeTab,
    activateTab,
    renameTab,
    updateTabInput,
    updateTabDeepParse,
    updateTabEncoding,
    updateTabResult,
  } = usePhpLogTabs();

  const navigate = useNavigate();

  /* 把指定 JSON 送到 JSON 工作台 */
  const openInWorkbench = (json: unknown) => {
    const text = typeof json === 'string' ? json : JSON.stringify(json, null, 2);
    if (!text) return;
    sendJsonToWorkbench(text);
    navigate('/tools/json-workbench');
  };

  const [loading, setLoading] = useState(false);
  const [showOverview, setShowOverview] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const run = () => {
    if (!activeTab.input.trim()) {
      message.warning('请先粘贴日志内容');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      const parsed = parsePhpLog(activeTab.input, { deepParse: activeTab.deepParse, encoding: activeTab.encoding });
      updateTabResult(activeTab.id, parsed);
      setLoading(false);
      const count = (parsed.input ? 1 : 0) + (parsed.output ? 1 : 0);
      message.success(`解析成功，提取 ${count} 个数据块`);
    }, 30);
  };

  const handleClear = () => {
    updateTabInput(activeTab.id, '');
    updateTabResult(activeTab.id, null);
    inputRef.current?.focus();
  };

  const handleLoadSample = () => {
    updateTabInput(activeTab.id, SAMPLE_PHP_LOG);
  };

  /* --- 复制 & 下载 --- */
  const mergedObj = activeTab.result
    ? { inputdata: activeTab.result.input ?? {}, outputdata: activeTab.result.output ?? {} }
    : null;
  const mergedText = mergedObj ? JSON.stringify(mergedObj, null, 2) : '';

  const handleCopyAll = () => {
    if (!mergedText) return;
    navigator.clipboard?.writeText(mergedText).then(
      () => message.success('已复制到剪贴板'),
      () => message.error('复制失败'),
    );
  };

  const handleDownload = () => {
    if (!mergedText) return;
    const blob = new Blob([mergedText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `log_extracted_${activeTab.name}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const copySection = (json: unknown, label: string) => {
    const text = JSON.stringify(json, null, 2);
    navigator.clipboard?.writeText(text).then(
      () => message.success(`已复制${label}`),
      () => message.error('复制失败'),
    );
  };

  const result = activeTab.result;

  return (
    <div className="ple-page">
      {/* ---- 页头 ---- */}
      <header className="ple-header">
        <div className="ple-header-inner">
          <div className="ple-header-icon">
            <FileTextOutlined />
          </div>
          <div className="ple-header-text">
            <h2>PHP 日志提取器</h2>
            <div className="ple-header-subtitle">
              <span className="ple-dot" />
              PHP 序列化解析 · inputdata / outputdata / param / result
            </div>
          </div>
          <div className="ple-action-group">
            <button
              type="button"
              className="ple-action-btn"
              onClick={handleLoadSample}
            >
              <ThunderboltOutlined /> 示例
            </button>
            <button
              type="button"
              className="ple-action-btn"
              onClick={handleClear}
            >
              <ClearOutlined /> 清空
            </button>
          </div>
        </div>
      </header>

      {/* ---- 页签栏 ---- */}
      <div className="ple-tabs-bar">
        <div className="ple-tabs-label">
          <span className="ple-tabs-label-dot" />
          <span className="ple-tabs-label-text">SESSION</span>
          <span className="ple-tabs-label-count">{tabs.length}</span>
        </div>
        <div className="ple-tabs-scroll">
          {tabs.map((tab, idx) => {
            const status = getTabStatus(tab);
            return (
              <div
                key={tab.id}
                className={`ple-tab ple-tab--${status} ${tab.id === activeId ? 'ple-tab--active' : ''}`}
                onClick={() => activateTab(tab.id)}
              >
                <span className="ple-tab-status" data-status={status} />
                <span className="ple-tab-idx">{String(idx + 1).padStart(2, '0')}</span>
                <TabName
                  name={tab.name}
                  onRename={(name) => renameTab(tab.id, name)}
                />
                {tabs.length > 1 && (
                  <button
                    type="button"
                    className="ple-tab-close"
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
          className="ple-tab-add"
          onClick={addTab}
          title="新建页签"
        >
          <PlusOutlined />
        </button>
      </div>

      {/* ---- 输入区 ---- */}
      <section className="ple-input-section">
        <div className="ple-section-label">
          日志内容
          <span className="ple-options-group">
          <Tooltip title="开启：把嵌套的 JSON 字符串自动解析为对象树；关闭：原样展示字符串（保留转义）">
            <span className="ple-option">
              <ThunderboltOutlined className="ple-option-icon" />
              <Switch
                size="small"
                className={activeTab.deepParse ? 'ple-switch--on' : ''}
                checked={activeTab.deepParse}
                onChange={(v) => updateTabDeepParse(activeTab.id, v)}
              />
              <span className="ple-option-label">自动解析 JSON</span>
            </span>
          </Tooltip>
          <Tooltip title="选择 PHP 序列化字符串的编码切分策略：自动容错（默认，兼容声明长度不符的混合/GBK 日志）、UTF-8、GBK（中文 2 字节）、Latin-1（ISO-8859-1）">
            <span className="ple-option">
              <CodeOutlined className="ple-option-icon" />
              <span className="ple-option-label">编码</span>
              <Select
                size="small"
                className="ple-select"
                value={activeTab.encoding}
                onChange={(v) => updateTabEncoding(activeTab.id, v as SerializeEncoding)}
                style={{ minWidth: 110 }}
                options={[
                  { value: 'auto', label: '自动容错（推荐）' },
                  { value: 'utf-8', label: 'UTF-8' },
                  { value: 'gbk', label: 'GBK' },
                  { value: 'latin1', label: 'Latin-1' },
                ]}
              />
            </span>
          </Tooltip>
          </span>
        </div>
        <textarea
          ref={inputRef}
          className="ple-textarea"
          value={activeTab.input}
          onChange={(e) => updateTabInput(activeTab.id, e.target.value)}
          placeholder="粘贴含 PHP 序列化的日志文本，支持 inputdata / outputdata / param / result 提取…"
          spellCheck={false}
          rows={6}
        />
        <div className="ple-actions">
          <button
            type="button"
            className="ple-action-btn ple-action-btn--primary"
            onClick={run}
            disabled={loading}
          >
            <PlayCircleOutlined /> 解析
          </button>
          <button
            type="button"
            className="ple-action-btn"
            disabled={!mergedText}
            onClick={handleCopyAll}
          >
            <CopyOutlined /> 复制合并 JSON
          </button>
          <button
            type="button"
            className="ple-action-btn"
            disabled={!mergedText}
            onClick={handleDownload}
          >
            <DownloadOutlined /> 下载 JSON
          </button>
        </div>
      </section>

      {/* ---- 结果区 ---- */}
      {result && (
        <section className="ple-result-section">
          <div className="ple-panels">
            {/* 入参 */}
            <div className="ple-panel">
              <div className="ple-panel-head">
                <span className="ple-panel-title">入参（inputdata / param）</span>
                <span className="ple-panel-actions">
                  <button
                    type="button"
                    className="ple-copy-btn"
                    onClick={() => openInWorkbench(result.input)}
                    title="在 JSON 工作台打开入参"
                  >
                    <ExportOutlined />
                  </button>
                  <button
                    type="button"
                    className="ple-copy-btn"
                    onClick={() => copySection(result.input, '入参')}
                    title="复制入参 JSON"
                  >
                    <CopyOutlined />
                  </button>
                </span>
              </div>
              <pre
                className="ple-json"
                dangerouslySetInnerHTML={{
                  __html: result.input
                    ? syntaxHighlightJSON(result.input)
                    : '<span class="ple-null">未提取到入参</span>',
                }}
              />
            </div>

            {/* 出参 */}
            <div className="ple-panel">
              <div className="ple-panel-head">
                <span className="ple-panel-title">出参（outputdata / result）</span>
                <span className="ple-panel-actions">
                  <button
                    type="button"
                    className="ple-copy-btn"
                    onClick={() => openInWorkbench(result.output)}
                    title="在 JSON 工作台打开出参"
                  >
                    <ExportOutlined />
                  </button>
                  <button
                    type="button"
                    className="ple-copy-btn"
                    onClick={() => copySection(result.output, '出参')}
                    title="复制出参 JSON"
                  >
                    <CopyOutlined />
                  </button>
                </span>
              </div>
              <pre
                className="ple-json"
                dangerouslySetInnerHTML={{
                  __html: result.output
                    ? syntaxHighlightJSON(result.output)
                    : '<span class="ple-null">未提取到出参</span>',
                }}
              />
            </div>
          </div>

          {/* 合并 */}
          <div className="ple-merged">
            <div className="ple-panel-head">
              <span className="ple-panel-title">
                合并 JSON（&#123; inputdata, outputdata &#125;）
              </span>
              <span className="ple-panel-actions">
                <button
                  type="button"
                  className="ple-copy-btn"
                  disabled={!mergedText}
                  onClick={() => openInWorkbench(mergedText)}
                  title="在 JSON 工作台打开合并 JSON"
                >
                  <ExportOutlined />
                </button>
                <button
                  type="button"
                  className="ple-copy-btn"
                  disabled={!mergedText}
                  onClick={handleCopyAll}
                  title="复制合并 JSON"
                >
                  <CopyOutlined />
                </button>
              </span>
            </div>
            <pre
              className="ple-json"
              dangerouslySetInnerHTML={{
                __html: mergedObj ? syntaxHighlightJSON(mergedObj) : '',
              }}
            />
          </div>
        </section>
      )}

      {/* ---- 概览对比条 ---- */}
      {tabs.length > 1 && showOverview && (
        <section className="ple-overview-section">
          <div className="ple-overview-head">
            <div className="ple-overview-title">
              <span className="ple-overview-title-dot" />
              <TableOutlined className="ple-overview-title-icon" />
              <span className="ple-overview-title-text">MONITOR</span>
              <span className="ple-overview-title-sub">多日志概览</span>
              <span className="ple-overview-title-stat">
                {tabs.filter((t) => t.result).length}/{tabs.length} PARSED
              </span>
            </div>
            <button
              type="button"
              className="ple-overview-toggle"
              onClick={() => setShowOverview(false)}
            >
              <CaretDownOutlined /> 收起
            </button>
          </div>
          <div className="ple-overview-table-wrap">
            <table className="ple-overview-table">
              <thead>
                <tr>
                  <th className="ple-overview-th-name">名称</th>
                  <th>入参</th>
                  <th className="ple-overview-th-num">字段</th>
                  <th>出参</th>
                  <th className="ple-overview-th-num">字段</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {tabs.map((tab, idx) => {
                  const r = tab.result;
                  const status = getTabStatus(tab);
                  const inputOk = r ? hasValue(r.input) : false;
                  const outputOk = r ? hasValue(r.output) : false;
                  return (
                    <tr
                      key={tab.id}
                      className={`ple-overview-row ${tab.id === activeId ? 'ple-overview-row--active' : ''}`}
                      onClick={() => activateTab(tab.id)}
                    >
                      <td className="ple-overview-name">
                        <span className="ple-overview-name-bar" data-status={status} />
                        <span className="ple-overview-name-idx">{String(idx + 1).padStart(2, '0')}</span>
                        <span className="ple-overview-name-text">{tab.name}</span>
                      </td>
                      <td>
                        <span className={`ple-badge ple-badge--${inputOk ? 'ok' : 'empty'}`}>
                          <span className="ple-badge-dot" />
                          {inputOk ? '有' : '无'}
                        </span>
                      </td>
                      <td className="ple-overview-cell-num">{r ? countTopKeys(r.input) : '—'}</td>
                      <td>
                        <span className={`ple-badge ple-badge--${outputOk ? 'ok' : 'empty'}`}>
                          <span className="ple-badge-dot" />
                          {outputOk ? '有' : '无'}
                        </span>
                      </td>
                      <td className="ple-overview-cell-num">{r ? countTopKeys(r.output) : '—'}</td>
                      <td>
                        {r ? (
                          <span className="ple-badge ple-badge--ok">
                            <span className="ple-badge-dot" />
                            已解析
                          </span>
                        ) : tab.input.trim() ? (
                          <span className="ple-badge ple-badge--pending">
                            <span className="ple-badge-dot" />
                            待解析
                          </span>
                        ) : (
                          <span className="ple-badge ple-badge--empty">
                            <span className="ple-badge-dot" />
                            空
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {tabs.length > 1 && !showOverview && (
        <div className="ple-overview-collapsed">
          <button
            type="button"
            className="ple-overview-toggle ple-overview-toggle--inline"
            onClick={() => setShowOverview(true)}
          >
            <CaretRightOutlined /> 展开概览
          </button>
        </div>
      )}
    </div>
  );
};

export default PhpLogExtractorPage;
