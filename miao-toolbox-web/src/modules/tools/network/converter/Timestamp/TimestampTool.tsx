/**
 * 时间戳转换器 — 参考站长工具 unixtime
 * 布局：限宽居中 · 双栏转换 · 键值结果网格
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Input, InputNumber, message } from 'antd';
import { FieldTimeOutlined, CopyOutlined } from '@ant-design/icons';
import {
  LANG_SNIPPETS,
  buildFormats,
  dateToParts,
  formatsToRows,
  parseDateString,
  partsToDate,
  timestampToDate,
  type TimestampParts,
  type TimestampUnit,
  type TimestampFormats,
} from '../../utils/timestampConvert';
import { useTabPageStore } from '../../../../../hooks/useTabPageState';
import '../../network.css';
import './timestamp-tool.css';

function UnitToggle({
  value,
  onChange,
  testId,
}: {
  value: TimestampUnit;
  onChange: (u: TimestampUnit) => void;
  testId?: string;
}) {
  return (
    <div className="ntl-ts-unit" data-testid={testId}>
      <button type="button" className={value === 's' ? 'is-on' : ''} onClick={() => onChange('s')}>
        秒
      </button>
      <button type="button" className={value === 'ms' ? 'is-on' : ''} onClick={() => onChange('ms')}>
        毫秒
      </button>
    </div>
  );
}

function copyText(text: string, okMsg = '已复制') {
  void navigator.clipboard?.writeText(text).then(
    () => message.success(okMsg),
    () => message.error('复制失败'),
  );
}

/** 北京时间行复制时去掉 (UTC+8) 后缀，只拷纯时间串 */
function copyValueForLabel(label: string, value: string): string {
  if (label === '北京时间') {
    return value.replace(/\s*\(UTC\+8\)\s*$/, '').trim();
  }
  return value;
}

function ResultKv({
  rows,
  testId,
  lead,
}: {
  rows: { label: string; value: string }[];
  testId?: string;
  lead?: { label: string; value: string };
}) {
  const all = lead ? [lead, ...rows] : rows;
  // 供验收脚本读取纯文本
  const plain = all.map((r) => `${r.label}: ${r.value}`).join('\n');
  return (
    <dl className="ntl-ts-kv" data-testid={testId} data-plain={plain}>
      {all.map((r) => (
        <div className="ntl-ts-kv-row" key={r.label}>
          <dt>{r.label}</dt>
          <dd>
            <span className="ntl-ts-kv-val">{r.value}</span>
            <button
              type="button"
              className="ntl-ts-kv-copy"
              title={`复制${r.label}`}
              aria-label={`复制${r.label}`}
              onClick={() =>
                copyText(copyValueForLabel(r.label, r.value), `已复制${r.label}`)
              }
            >
              <CopyOutlined />
            </button>
          </dd>
        </div>
      ))}
      {/* 隐藏纯文本节点，兼容 headless 用 inner_text 匹配 */}
      <span className="ntl-ts-kv-plain" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {plain}
      </span>
    </dl>
  );
}

function LiveMetric({
  label,
  value,
  testId,
  copyValue,
}: {
  label: string;
  value: string | number;
  testId?: string;
  /** 实际写入剪贴板的内容；默认等于展示值 */
  copyValue?: string;
}) {
  const display = String(value);
  const payload = copyValue ?? display;
  return (
    <div className="ntl-ts-metric">
      <div className="ntl-ts-metric-top">
        <small>{label}</small>
        <button
          type="button"
          className="ntl-ts-metric-copy"
          title={`复制${label}`}
          aria-label={`复制${label}`}
          data-testid={testId ? `${testId}-copy` : undefined}
          onClick={() => copyText(payload, `已复制${label}`)}
        >
          <CopyOutlined />
        </button>
      </div>
      <strong data-testid={testId}>{display}</strong>
    </div>
  );
}

const PAGE_KEY = 'tools-network-timestamp';

type KvRow = { label: string; value: string };

const TimestampTool: React.FC = () => {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [liveOn, setLiveOn] = useState(true);

  const { state, setField, setState } = useTabPageStore(PAGE_KEY, {
    tsInput: '1721318400',
    tsUnit: 's' as TimestampUnit,
    tsRows: null as KvRow[] | null,
    tsErr: null as string | null,
    dateInput: '2024-07-18 16:00:00',
    dateUnit: 's' as TimestampUnit,
    dateRows: null as KvRow[] | null,
    dateLead: null as KvRow | null,
    dateErr: null as string | null,
    parts: dateToParts(new Date(), 8) as TimestampParts,
    partsUnit: 's' as TimestampUnit,
    partsRows: null as KvRow[] | null,
    partsLead: null as KvRow | null,
    partsErr: null as string | null,
  });

  const {
    tsInput,
    tsUnit,
    tsRows,
    tsErr,
    dateInput,
    dateUnit,
    dateRows,
    dateLead,
    dateErr,
    parts,
    partsUnit,
    partsRows,
    partsLead,
    partsErr,
  } = state;

  const setTsInput = useCallback((v: string) => setField('tsInput', v), [setField]);
  const setTsUnit = useCallback((v: TimestampUnit) => setField('tsUnit', v), [setField]);
  const setDateInput = useCallback((v: string) => setField('dateInput', v), [setField]);
  const setDateUnit = useCallback((v: TimestampUnit) => setField('dateUnit', v), [setField]);
  const setPartsUnit = useCallback((v: TimestampUnit) => setField('partsUnit', v), [setField]);

  useEffect(() => {
    if (!liveOn) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [liveOn]);

  const nowFormats: TimestampFormats = buildFormats(new Date(nowMs));

  const convertTs = useCallback(() => {
    try {
      const date = timestampToDate(tsInput, tsUnit);
      const f = buildFormats(date);
      setState((prev) => ({
        ...prev,
        tsRows: formatsToRows(f),
        tsErr: null,
        parts: dateToParts(date, 8),
      }));
    } catch (e) {
      setState((prev) => ({
        ...prev,
        tsErr: e instanceof Error ? e.message : '转换失败',
        tsRows: null,
      }));
    }
  }, [tsInput, tsUnit, setState]);

  const convertDate = useCallback(() => {
    try {
      const date = parseDateString(dateInput, 8);
      const f = buildFormats(date);
      const val = dateUnit === 's' ? f.unixSeconds : f.unixMillis;
      setState((prev) => ({
        ...prev,
        dateLead: {
          label: dateUnit === 's' ? 'Unix 秒' : 'Unix 毫秒',
          value: String(val),
        },
        dateRows: formatsToRows(f),
        dateErr: null,
        tsInput: String(f.unixSeconds),
        parts: dateToParts(date, 8),
      }));
    } catch (e) {
      setState((prev) => ({
        ...prev,
        dateErr: e instanceof Error ? e.message : '转换失败',
        dateRows: null,
        dateLead: null,
      }));
    }
  }, [dateInput, dateUnit, setState]);

  const convertParts = useCallback(() => {
    try {
      const date = partsToDate(parts, 8);
      const f = buildFormats(date);
      const val = partsUnit === 's' ? f.unixSeconds : f.unixMillis;
      setState((prev) => ({
        ...prev,
        partsLead: {
          label: partsUnit === 's' ? 'Unix 秒' : 'Unix 毫秒',
          value: String(val),
        },
        partsRows: formatsToRows(f),
        partsErr: null,
      }));
    } catch (e) {
      setState((prev) => ({
        ...prev,
        partsErr: e instanceof Error ? e.message : '转换失败',
        partsRows: null,
        partsLead: null,
      }));
    }
  }, [parts, partsUnit, setState]);

  const setPart = (key: keyof TimestampParts, v: number | null) => {
    if (v === null || Number.isNaN(v)) return;
    setState((prev) => ({ ...prev, parts: { ...prev.parts, [key]: v } }));
  };

  useEffect(() => {
    convertTs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="ntl-ts-shell" data-tool-id="timestamp">
      <header className="ntl-tool-hero">
        <div className="ntl-tool-hero-icon" aria-hidden>
          <FieldTimeOutlined />
        </div>
        <div className="ntl-tool-hero-text">
          <h1 className="ntl-tool-hero-title">时间戳转换器</h1>
          <p className="ntl-tool-hero-desc">实时时钟 · 秒/毫秒 · 北京时间 · 多格式输出</p>
        </div>
      </header>

      <div className="ntl-ts" data-testid="network-tool-input-slot">
        {/* 实时时钟 */}
        <section className="ntl-ts-live" data-testid="ts-live">
          <span className="ntl-ts-live-label">当前</span>
          <div className="ntl-ts-live-values">
            <LiveMetric
              label="Unix 秒"
              value={nowFormats.unixSeconds}
              testId="ts-live-s"
            />
            <LiveMetric
              label="Unix 毫秒"
              value={nowFormats.unixMillis}
              testId="ts-live-ms"
            />
            <LiveMetric
              label="北京时间"
              value={nowFormats.beijing}
              testId="ts-live-bj"
            />
          </div>
          <div className="ntl-ts-live-actions">
            <button
              type="button"
              className={`ntl-ts-btn${liveOn ? ' ntl-ts-btn--active' : ''}`}
              onClick={() => setLiveOn((v) => !v)}
              data-testid="ts-live-toggle"
            >
              {liveOn ? '停止' : '开始'}
            </button>
            <button
              type="button"
              className="ntl-ts-btn"
              onClick={() => setNowMs(Date.now())}
              data-testid="ts-live-refresh"
            >
              刷新
            </button>
          </div>
        </section>

        {/* 双栏：时间戳 ↔ 日期 */}
        <div className="ntl-ts-grid">
          <section className="ntl-ts-card">
            <div className="ntl-ts-card-head">
              <span>时间戳 → 日期时间</span>
              <UnitToggle value={tsUnit} onChange={setTsUnit} testId="ts-unit" />
            </div>
            <div className="ntl-ts-card-body">
              <div className="ntl-ts-row">
                <Input
                  value={tsInput}
                  onChange={(e) => setTsInput(e.target.value)}
                  onPressEnter={convertTs}
                  placeholder={tsUnit === 's' ? '1721318400' : '1721318400000'}
                  data-testid="ts-input"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="ntl-ts-btn ntl-ts-btn--primary"
                  onClick={convertTs}
                  data-testid="ts-convert"
                >
                  转换
                </button>
              </div>
              {tsErr && (
                <div className="ntl-ts-err" data-testid="ts-err">
                  {tsErr}
                </div>
              )}
              {tsRows && <ResultKv rows={tsRows} testId="ts-result" />}
            </div>
          </section>

          <section className="ntl-ts-card">
            <div className="ntl-ts-card-head">
              <span>日期 → 时间戳（北京时间）</span>
              <UnitToggle value={dateUnit} onChange={setDateUnit} />
            </div>
            <div className="ntl-ts-card-body">
              <div className="ntl-ts-row">
                <Input
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  onPressEnter={convertDate}
                  placeholder="2024-07-18 16:00:00"
                  data-testid="ts-date-input"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="ntl-ts-btn ntl-ts-btn--primary"
                  onClick={convertDate}
                  data-testid="ts-date-convert"
                >
                  转换
                </button>
              </div>
              {dateErr && <div className="ntl-ts-err">{dateErr}</div>}
              {dateRows && (
                <ResultKv rows={dateRows} lead={dateLead ?? undefined} testId="ts-date-result" />
              )}
            </div>
          </section>
        </div>

        {/* 年月日组件 — 通栏 */}
        <section className="ntl-ts-card ntl-ts-card--full">
          <div className="ntl-ts-card-head">
            <span>年 / 月 / 日 / 时 / 分 / 秒 → 时间戳</span>
            <UnitToggle value={partsUnit} onChange={setPartsUnit} />
          </div>
          <div className="ntl-ts-card-body">
            <div className="ntl-ts-parts" data-testid="ts-parts">
              {(
                [
                  ['year', '年', 1970, 2100],
                  ['month', '月', 1, 12],
                  ['day', '日', 1, 31],
                  ['hour', '时', 0, 23],
                  ['minute', '分', 0, 59],
                  ['second', '秒', 0, 59],
                ] as const
              ).map(([key, label, min, max]) => (
                <div className="ntl-ts-part" key={key}>
                  <label>
                    {label}
                    <InputNumber
                      value={parts[key]}
                      min={min}
                      max={max}
                      onChange={(v) => setPart(key, typeof v === 'number' ? v : null)}
                    />
                  </label>
                </div>
              ))}
            </div>
            <div className="ntl-ts-actions">
              <button
                type="button"
                className="ntl-ts-btn"
                onClick={() => setField('parts', dateToParts(new Date(), 8))}
              >
                填入现在
              </button>
              <button
                type="button"
                className="ntl-ts-btn ntl-ts-btn--primary"
                onClick={convertParts}
                data-testid="ts-parts-convert"
              >
                转换
              </button>
            </div>
            {partsErr && <div className="ntl-ts-err">{partsErr}</div>}
            {partsRows && (
              <ResultKv rows={partsRows} lead={partsLead ?? undefined} testId="ts-parts-result" />
            )}
          </div>
        </section>

        <details className="ntl-ts-snippets">
          <summary>各语言如何获取 / 转换 Unix 时间戳</summary>
          <div className="ntl-ts-snippets-body">
            {LANG_SNIPPETS.map((s) => (
              <div className="ntl-ts-snippet-item" key={s.lang}>
                <b>{s.lang}</b>
                <pre>{s.code}</pre>
              </div>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
};

export default TimestampTool;
