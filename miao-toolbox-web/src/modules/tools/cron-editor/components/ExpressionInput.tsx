// Cron 表达式输入组件（FR-1 / FR-2 / FR-9 / FR-10 / FR-11 的编辑与校验 UI）
// 透明 <input> 叠加逐字段着色高亮层；方言切换；语法错误标红 + 语义警告。
import React, { useMemo } from 'react';
import { Segmented, Modal } from 'antd';
import { useCronContext } from '../useCronContext';
import { tokenize } from '../utils/cronTokenizer';
import { transformDialect } from '../utils/cronDialect';
import type { CronDialect } from '../types';

// 按字段位置着色（秒/分/时/日/月/周），与 cron-editor.css 中 ce-field--N 对应
const FIELD_COLOR_CLASSES = [
  'ce-field--0',
  'ce-field--1',
  'ce-field--2',
  'ce-field--3',
  'ce-field--4',
  'ce-field--5',
];

const CronExpressionInput: React.FC = () => {
  const { state, setExpression, setDialect, validation } = useCronContext();
  const { expression, dialect } = state;

  const fieldTokens = useMemo(() => tokenize(expression, dialect).tokens, [expression, dialect]);

  // 首个语法错误定位到的字段下标（-1 表示结构错误/无错误）
  const errorFieldIndex = validation.errors.length > 0 ? validation.errors[0].fieldIndex : -1;
  const hasError = validation.errors.length > 0;

  // 方言切换：先转换表达式字段数，再切换方言状态（保持 expression 与 dialect 同步）
  const applyDialectChange = (next: CronDialect) => {
    if (next === dialect) return;
    const transformed = transformDialect(expression, dialect, next);
    setExpression(transformed);
    setDialect(next);
  };

  // 方言切换：6→5 且秒字段非 0 时弹确认
  const handleDialectChange = (val: CronDialect | number | string) => {
    const next = val as CronDialect;
    if (next === dialect) return;

    if (dialect === 'spring6' && next === 'linux5') {
      const firstField = tokenize(expression, dialect).tokens[0];
      if (firstField && firstField.trim() !== '' && firstField.trim() !== '0') {
        Modal.confirm({
          title: '切换为 5 位模式',
          content: `秒字段为 ${firstField}，切换为 5 位将丢失该设置，确定继续？`,
          okText: '继续',
          cancelText: '取消',
          onOk: () => applyDialectChange('linux5'),
        });
        return;
      }
    }
    applyDialectChange(next);
  };

  return (
    <div className="ce-input-inner">
      <div className="ce-input-row">
        <div className="ce-expression-wrap">
          <div className="ce-expression-highlight" aria-hidden="true">
            {fieldTokens.length === 0 ? (
              <span className="ce-expression-placeholder">如 */5 9 * * 1-5</span>
            ) : (
              fieldTokens.map((tok, i) => (
                <span
                  key={i}
                  className={`ce-field ${FIELD_COLOR_CLASSES[i] ?? ''} ${i === errorFieldIndex ? 'is-invalid' : ''}`}
                >
                  {tok}
                  {i < fieldTokens.length - 1 ? ' ' : ''}
                </span>
              ))
            )}
          </div>
          <input
            className={`ce-expression-input ${hasError ? 'has-error' : ''}`}
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            placeholder=""
            spellCheck={false}
            autoComplete="off"
            aria-label="Cron 表达式"
            aria-invalid={hasError}
          />
        </div>

        <Segmented
          className="ce-dialect-switch"
          value={dialect}
          onChange={handleDialectChange}
          options={[
            { label: '5 位 (Linux)', value: 'linux5' },
            { label: '6 位 (含秒)', value: 'spring6' },
          ]}
        />
      </div>

      {hasError && (
        <div className="ce-validation ce-validation--error" role="alert">
          {validation.errors.map((e, i) => (
            <div key={i} className="ce-validation-item">
              {e.message}
            </div>
          ))}
        </div>
      )}

      {validation.warnings.length > 0 && (
        <div className="ce-validation ce-validation--warning" role="alert">
          {validation.warnings.map((w, i) => (
            <div key={i} className="ce-validation-item">
              <span className="ce-warn-icon">⚠</span>
              {w.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CronExpressionInput;
