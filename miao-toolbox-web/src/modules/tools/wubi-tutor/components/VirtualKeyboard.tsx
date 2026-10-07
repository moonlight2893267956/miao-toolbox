/**
 * 虚拟键盘组件
 *
 * 高亮当前目标键、已按键置灰、错误键红色闪动。
 * 显示手指提示色块（取 radicals.ts 的 finger）。
 *
 * 模式：interactive（练习时）/ readonly（展示用）
 */

import React from 'react';
import { getKeyMeta, radicalsLabel, type WubiKey, type WubiFinger } from '../data/radicals';

export type KeyboardMode = 'interactive' | 'heatmap' | 'readonly';

export interface KeyState {
  /** 是否为当前目标键 */
  isTarget?: boolean;
  /** 是否已按下（正确） */
  isPressed?: boolean;
  /** 是否错误按下 */
  isError?: boolean;
}

interface VirtualKeyboardProps {
  /** 当前各键的状态 */
  keyStates?: Record<string, KeyState>;
  /** 模式 */
  mode?: KeyboardMode;
  /** 点击键位回调（interactive 模式） */
  onKeyClick?: (key: WubiKey) => void;
  /**
   * 热力图数据（heatmap 模式）：键位 → 热力等级 0~4。
   * 等级由 errorAnalysis.buildHeatmap 计算，此处只负责渲染。
   */
  heatmap?: Record<string, number>;
  /** 热力图数值（键位 → 原始错误次数），用于键位下方显示 */
  heatCounts?: Record<string, number>;
}

// 键盘布局（5 行）
const KEYBOARD_ROWS: (WubiKey | 'z')[][] = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

// 手指颜色映射
const FINGER_COLORS: Record<WubiFinger, string> = {
  'l-pinky': '#ef4444',
  'l-ring': '#f59e0b',
  'l-middle': '#22c55e',
  'l-index': '#3b82f6',
  'r-index': '#3b82f6',
  'r-middle': '#22c55e',
  'r-ring': '#f59e0b',
  'r-pinky': '#ef4444',
};

const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({
  keyStates = {},
  mode = 'readonly',
  onKeyClick,
  heatmap,
  heatCounts,
}) => {
  const isHeatmap = mode === 'heatmap';

  return (
    <div className={`wt-vkeyboard${isHeatmap ? ' wt-vkeyboard--heatmap' : ''}`}>
      {KEYBOARD_ROWS.map((row, rowIdx) => (
        <div key={rowIdx} className="wt-vkeyboard__row">
          {row.map((key) => {
            const isZ = key === 'z';
            const meta = isZ ? null : getKeyMeta(key as WubiKey);
            if (!meta && !isZ) return null;

            const state = keyStates[key] ?? {};
            const fingerColor = meta ? FINGER_COLORS[meta.finger] : '#666';
            const heatLevel = isHeatmap ? (heatmap?.[key] ?? 0) : 0;
            const heatCount = heatCounts?.[key] ?? 0;

            const classes = [
              'wt-vkeyboard__key',
              isZ ? 'wt-vkeyboard__key--z' : '',
              state.isTarget ? 'wt-vkeyboard__key--target' : '',
              state.isPressed ? 'wt-vkeyboard__key--pressed' : '',
              state.isError ? 'wt-vkeyboard__key--error' : '',
              mode === 'interactive' ? 'wt-vkeyboard__key--interactive' : '',
              isHeatmap ? `wt-vkeyboard__key--heat-${heatLevel}` : '',
            ].filter(Boolean).join(' ');

            return (
              <button
                key={key}
                className={classes}
                onClick={() => !isZ && mode === 'interactive' && onKeyClick?.(key as WubiKey)}
                disabled={isZ || mode !== 'interactive'}
                style={{
                  '--finger-color': fingerColor,
                } as React.CSSProperties}
                title={isHeatmap && heatCount > 0 ? `错误 ${heatCount} 次` : undefined}
              >
                <span className="wt-vkeyboard__key-letter">
                  {key.toUpperCase()}
                </span>
                {meta && (
                  <>
                    <span className="wt-vkeyboard__key-name">{meta.keyNameChar}</span>
                    {/* 热力图模式：字根位置让给错误次数，避免信息过载 */}
                    {isHeatmap ? (
                      heatCount > 0 && (
                        <span className="wt-vkeyboard__heat-count">{heatCount}</span>
                      )
                    ) : (
                      mode !== 'interactive' && (
                        /*
                         * !! 不得对字根做 slice 截断 !!
                         *
                         * 每键最多 7 个字根（F/D/Q/N），此处曾写死
                         * `slice(0, 5)` —— 练习页键盘上用户看到的字根表
                         * 本身就是残缺的，且因为还叠加了 CSS 的
                         * `nowrap + ellipsis`，看起来像是「设计如此」。
                         *
                         * 格子放不下时一律换行（见 `.wt-vkeyboard__key-radicals`）。
                         */
                        <span className="wt-vkeyboard__key-radicals">
                          {radicalsLabel(meta.radicals)}
                        </span>
                      )
                    )}
                  </>
                )}
                {isZ && (
                  <span className="wt-vkeyboard__key-hint">学习键</span>
                )}
                {/* 手指色条（热力图模式下隐藏，避免与热力色冲突） */}
                {!isZ && !isHeatmap && (
                  <span className="wt-vkeyboard__finger-bar" style={{ background: fingerColor }} />
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default VirtualKeyboard;
