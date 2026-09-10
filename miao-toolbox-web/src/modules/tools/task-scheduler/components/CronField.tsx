import React from 'react';
import type { CronDialect } from '../../cron-editor/types';
import { CronProvider } from '../../cron-editor/CronProvider';
import ExpressionInput from '../../cron-editor/components/ExpressionInput';
import NextRunsPreview from '../../cron-editor/components/NextRunsPreview';
// cron-editor.css 只被 CronEditorPage 引用，直接复用其组件时需显式引入，
// 否则 .ce-* 样式缺失（高亮层与输入框会错位重叠）。所有选择器均为 .ce-* / :has(.ce-page) 作用域，无全局污染。
import '../../cron-editor/cron-editor.css';

interface CronFieldProps {
  /** 受控值（由 antd Form.Item name="cronExpression" 注入） */
  value?: string;
  onChange?: (value: string) => void;
  /** 表单时区（唯一真源），作为预览时区 */
  timezone?: string;
  /** 初始方言：编辑态后端已把表达式规范化为 6 位，新建态默认 5 位 Unix 方言 */
  dialect?: CronDialect;
}

/**
 * cron 表达式输入区（FR-2）——复用 cron-editor 的 `ExpressionInput` + `NextRunsPreview`。
 *
 * 以 `persist={false}` 嵌入：不读写 Cron 编辑器工具页的页面存储，避免两边互相污染；
 * 预览条数与后端 validate-cron 对齐（5 条），时区跟随表单字段。
 */
const CronField: React.FC<CronFieldProps> = ({ value, onChange, timezone, dialect = 'linux5' }) => (
  <CronProvider
    persist={false}
    initialExpression={value ?? ''}
    initialDialect={dialect}
    onExpressionChange={onChange}
  >
    <ExpressionInput />
    <NextRunsPreview timezone={timezone} count={5} />
  </CronProvider>
);

export default CronField;
