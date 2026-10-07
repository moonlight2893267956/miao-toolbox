/**
 * 交互式五笔字根键盘图
 *
 * 职责：
 * - 渲染 25 键键盘布局，按横/竖/撇/捺/折五区分色
 * - 每键展示：键位字母、助记口诀、全部字根字形
 * - 点击键位 → 侧栏展示该键字根详情卡片
 * - 点击字根 → 展示含该字根的例字（后续可跳转练习）
 * - 支持总览/单键详情两种模式
 * - 支持一键复制 SVG 源码与下载 .svg
 *
 * 实现：HTML+CSS 手绘（非位图），缩放不失真、可主题化。
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  WUBI_KEYS,
  ZONE_LABELS,
  getKeyMeta,
  radicalsLabel,
  type WubiKey,
  type WubiZone,
  type Radical,
} from '../data/radicals';

interface RadicalChartProps {
  onRadicalClick: (radical: string) => void;
  onCharClick: (char: string) => void;
}

// 五区颜色（CSS 变量驱动，自动适配暗色模式）
const ZONE_COLORS: Record<WubiZone, { bg: string; border: string; text: string }> = {
  heng: { bg: 'var(--wt-zone-heng-bg)', border: 'var(--wt-zone-heng-border)', text: 'var(--wt-zone-heng-text)' },
  shu:  { bg: 'var(--wt-zone-shu-bg)', border: 'var(--wt-zone-shu-border)', text: 'var(--wt-zone-shu-text)' },
  pie:  { bg: 'var(--wt-zone-pie-bg)', border: 'var(--wt-zone-pie-border)', text: 'var(--wt-zone-pie-text)' },
  na:   { bg: 'var(--wt-zone-na-bg)', border: 'var(--wt-zone-na-border)', text: 'var(--wt-zone-na-text)' },
  zhe:  { bg: 'var(--wt-zone-zhe-bg)', border: 'var(--wt-zone-zhe-border)', text: 'var(--wt-zone-zhe-text)' },
};

// 键盘布局（5 行）
// 'z' 不参与编码，但键盘图要展示它（学习键），因此类型需放宽
const KEYBOARD_ROWS: (WubiKey | 'z')[][] = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

// Z 键不用于编码，但键盘图需要展示
const Z_KEY = 'z';

/** 单个汉字（用于判断是否为成字字根） */
const SINGLE_HAN_RE = /^\p{Script=Han}$/u;

const RadicalChart: React.FC<RadicalChartProps> = ({ onRadicalClick, onCharClick }) => {
  const [selectedKey, setSelectedKey] = useState<WubiKey | null>(null);
  const [selectedRadical, setSelectedRadical] = useState<Radical | null>(null);
  /**
   * 三种视图：
   * - `overview` 键盘总览（位置记忆）
   * - `detail`   单键详情（某键的全部字根 + 名称）
   * - `table`    字根总表（25 键的全部字根一次列完，带名称）
   *
   * 为什么需要 `table`：键盘格子最宽也只能容纳 7 个小字形，
   * 且没有字根名称。要「一次看全所有字根」必须有一张表。
   */
  const [mode, setMode] = useState<'overview' | 'detail' | 'table'>('overview');
  const chartRef = useRef<HTMLDivElement>(null);

  const handleKeyClick = useCallback((key: WubiKey) => {
    setSelectedKey(key);
    setSelectedRadical(null);
    setMode('detail');
  }, []);

  const handleRadicalClick = useCallback((radical: Radical) => {
    setSelectedRadical(radical);
    onRadicalClick(radical.glyph);
  }, [onRadicalClick]);

  const handleBackToOverview = useCallback(() => {
    setMode('overview');
    setSelectedKey(null);
    setSelectedRadical(null);
  }, []);

  // 复制 SVG 源码
  const handleCopySvg = useCallback(() => {
    const svgEl = chartRef.current?.querySelector('svg');
    if (!svgEl) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgEl);
    navigator.clipboard.writeText(svgStr).then(() => {
      console.log('[RadicalChart] SVG 源码已复制到剪贴板');
    });
  }, []);

  // 下载 SVG 文件
  const handleDownloadSvg = useCallback(() => {
    const svgEl = chartRef.current?.querySelector('svg');
    if (!svgEl) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgEl);
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wubi86-radicals.svg';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const selectedKeyMeta = selectedKey ? getKeyMeta(selectedKey) : null;

  return (
    <div
      className={`wt-radical-chart${mode === 'table' ? ' wt-radical-chart--table' : ''}`}
      ref={chartRef}
    >
      {/* 工具栏 */}
      <div className="wt-radical-chart__toolbar">
        <div className="wt-radical-chart__mode-switch">
          <button
            className={`wt-radical-chart__mode-btn${mode === 'overview' ? ' wt-radical-chart__mode-btn--active' : ''}`}
            onClick={handleBackToOverview}
          >
            总览
          </button>
          <button
            className={`wt-radical-chart__mode-btn${mode === 'detail' ? ' wt-radical-chart__mode-btn--active' : ''}`}
            onClick={() => selectedKey && setMode('detail')}
            disabled={!selectedKey}
          >
            单键详情
          </button>
          <button
            className={`wt-radical-chart__mode-btn${mode === 'table' ? ' wt-radical-chart__mode-btn--active' : ''}`}
            onClick={() => setMode('table')}
          >
            字根总表
          </button>
        </div>
        <div className="wt-radical-chart__actions">
          <button onClick={handleCopySvg} title="复制 SVG 源码">
            复制 SVG
          </button>
          <button onClick={handleDownloadSvg} title="下载 .svg 文件">
            下载 SVG
          </button>
        </div>
      </div>

      {/* 图例 */}
      <div className="wt-radical-chart__legend">
        {(Object.keys(ZONE_LABELS) as WubiZone[]).map((zone) => (
          <span
            key={zone}
            className="wt-radical-chart__legend-item"
            style={{
              backgroundColor: ZONE_COLORS[zone].bg,
              borderColor: ZONE_COLORS[zone].border,
              color: ZONE_COLORS[zone].text,
            }}
          >
            {ZONE_LABELS[zone]}
          </span>
        ))}
      </div>

      {/* 键盘图 */}
      <div className="wt-radical-chart__keyboard">
        <svg
          className="wt-radical-chart__svg"
          viewBox="0 0 1000 320"
          xmlns="http://www.w3.org/2000/svg"
          style={{ display: 'none' }}
        >
          {/* SVG 源码用于复制/下载，可见键盘用 HTML+CSS 渲染 */}
          {WUBI_KEYS.map((meta) => {
            const colors = ZONE_COLORS[meta.zone];
            // 简化的 SVG 键位表示
            return (
              <g key={meta.key}>
                <rect
                  x={0} y={0} width={60} height={60}
                  fill={colors.bg} stroke={colors.border} strokeWidth={1.5}
                />
                <text x={30} y={35} textAnchor="middle" fontSize={20} fill={colors.text}>
                  {meta.key.toUpperCase()}
                </text>
              </g>
            );
          })}
        </svg>

        {/* HTML+CSS 键盘 */}
        <div className="wt-radical-chart__keys">
          {KEYBOARD_ROWS.map((row, rowIdx) => (
            <div key={rowIdx} className="wt-radical-chart__row">
              {row.map((key) => {
                const isZ = key === Z_KEY;
                const meta = isZ ? null : getKeyMeta(key as WubiKey);
                if (!meta && !isZ) return null;

                if (isZ) {
                  return (
                    <div key={key} className="wt-radical-chart__key wt-radical-chart__key--z">
                      <span className="wt-radical-chart__key-letter">Z</span>
                      <span className="wt-radical-chart__key-hint">万能学习键</span>
                    </div>
                  );
                }

                const colors = ZONE_COLORS[meta!.zone];
                const isSelected = selectedKey === key;

                return (
                  <button
                    key={key}
                    className={`wt-radical-chart__key${isSelected ? ' wt-radical-chart__key--selected' : ''}`}
                    style={{
                      backgroundColor: colors.bg,
                      borderColor: colors.border,
                      color: colors.text,
                    }}
                    onClick={() => handleKeyClick(key as WubiKey)}
                    title={meta!.mnemonic}
                  >
                    <span className="wt-radical-chart__key-letter">
                      {key.toUpperCase()}
                    </span>
                    <span className="wt-radical-chart__key-name">
                      {meta!.keyNameChar}
                    </span>
                    {/*
                      !! 不要对字根做 slice / ellipsis !!
                      每键最多 7 个字根（F/D/Q/N），格子放不下时应当**换行**而不是
                      截断。此前 `slice(0, 6)` + `nowrap + ellipsis` 双截断，
                      F 键的「雨」、Q 键的第 7 个字根根本显示不出来，
                      用户看到的就是「这个图看不到全部字根」。
                    */}
                    <span className="wt-radical-chart__key-radicals">
                      {radicalsLabel(meta!.radicals)}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/*
        字根总表：25 键的全部字根一次列完，**不截断且带名称**。
        键盘图负责「位置记忆」，这张表负责「完整查阅」—— 两者缺一不可：
        格子最宽也只能放下 7 个小字形，且没有名称。
      */}
      {mode === 'table' && (
        <div className="wt-radical-chart__table-wrap">
          <table className="wt-radical-chart__table">
            <thead>
              <tr>
                <th className="wt-radical-chart__col-key">键</th>
                <th className="wt-radical-chart__col-name">键名字</th>
                <th className="wt-radical-chart__col-mnemonic">助记口诀</th>
                <th>全部字根（点击进入该键详情）</th>
              </tr>
            </thead>
            <tbody>
              {WUBI_KEYS.map((meta) => {
                const colors = ZONE_COLORS[meta.zone];
                return (
                  <tr key={meta.key}>
                    <td>
                      <span
                        className="wt-radical-chart__table-key"
                        style={{
                          backgroundColor: colors.bg,
                          borderColor: colors.border,
                          color: colors.text,
                        }}
                      >
                        {meta.key.toUpperCase()}
                      </span>
                    </td>
                    <td className="wt-radical-chart__table-name">
                      {meta.keyNameChar}
                    </td>
                    <td className="wt-radical-chart__table-mnemonic">
                      {meta.mnemonic}
                    </td>
                    <td>
                      <div className="wt-radical-chart__table-radicals">
                        {meta.radicals.map((radical) => (
                          <button
                            key={radical.glyph}
                            className={`wt-radical-chart__table-chip${
                              selectedRadical?.glyph === radical.glyph
                                ? ' wt-radical-chart__table-chip--selected'
                                : ''
                            }`}
                            onClick={() => {
                              // 先切到该键详情，再选中这个字根，形成连贯的钻取路径
                              handleKeyClick(meta.key);
                              handleRadicalClick(radical);
                            }}
                            title={`${radical.name}${radical.keyName ? '（键名字）' : ''}`}
                          >
                            <span className="wt-radical-chart__table-chip-glyph">
                              {radical.glyph}
                            </span>
                            <span className="wt-radical-chart__table-chip-name">
                              {radical.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="wt-radical-chart__table-note">
            共 {WUBI_KEYS.reduce((sum, m) => sum + m.radicals.length, 0)} 个字根，
            分布在 25 个键上（每键 2~7 个）。
          </p>
        </div>
      )}

      {/* 详情面板 */}
      {mode === 'detail' && selectedKeyMeta && (
        <div className="wt-radical-chart__detail">
          <div className="wt-radical-chart__detail-header">
            <h3>
              {selectedKeyMeta.key.toUpperCase()} 键 — {selectedKeyMeta.keyNameChar}
            </h3>
            <span className="wt-radical-chart__detail-zone">
              {ZONE_LABELS[selectedKeyMeta.zone]}
            </span>
          </div>

          <div className="wt-radical-chart__mnemonic">
            <span className="wt-radical-chart__mnemonic-label">助记口诀：</span>
            <span className="wt-radical-chart__mnemonic-text">{selectedKeyMeta.mnemonic}</span>
          </div>

          <div className="wt-radical-chart__radical-cards">
            {selectedKeyMeta.radicals.map((radical) => (
              <button
                key={radical.glyph}
                className={`wt-radical-chart__radical-card${
                  selectedRadical?.glyph === radical.glyph ? ' wt-radical-chart__radical-card--selected' : ''
                }`}
                onClick={() => handleRadicalClick(radical)}
              >
                <span className="wt-radical-chart__radical-glyph">{radical.glyph}</span>
                <span className="wt-radical-chart__radical-name">{radical.name}</span>
                {radical.keyName && (
                  <span className="wt-radical-chart__radical-badge">键名字</span>
                )}
              </button>
            ))}
          </div>

          {selectedRadical && (
            <div className="wt-radical-chart__radical-detail">
              <h4>字根：{selectedRadical.glyph}</h4>
              <p>{selectedRadical.name}</p>

              {/*
                只有「成字字根」（本身就是独立汉字，如 王/土/大）才有拆分演示；
                偏旁形态（亻/氵/艹）不是独立汉字，拆不出来。
              */}
              {SINGLE_HAN_RE.test(selectedRadical.glyph) && (
                <button
                  className="wt-radical-chart__radical-action"
                  onClick={() => onCharClick(selectedRadical.glyph)}
                >
                  查看拆分演示
                </button>
              )}

              <p className="wt-radical-chart__radical-hint">
                {SINGLE_HAN_RE.test(selectedRadical.glyph)
                  ? '这是成字字根，本身也是汉字 —— 点上方按钮看它的拆分与编码。'
                  : '这是偏旁形态，需按所属键位记忆（五笔中偏旁与对应成字字根同键）。'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RadicalChart;
