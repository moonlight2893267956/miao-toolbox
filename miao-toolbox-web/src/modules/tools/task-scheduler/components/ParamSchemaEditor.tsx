/**
 * 脚本参数声明编辑器 ——「参数契约面板」
 *
 * 让脚本作者以结构化表单声明脚本入参（名称/类型/默认值/描述），
 * 而不是手写 JSON。声明保存在 Script.paramSchema，任务表单会
 * 据此渲染参数填写引导（TaskFormPage 的 ? 帮助气泡）。
 *
 * 设计语言延续 Scheduling Console：每条参数一行卡片，
 * 字段用小号紧凑控件，类型用琥珀 Tag 提示，环境变量名实时预览。
 */
import React from 'react';
import { Button, Input, Select, Tooltip } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { ScriptParam } from '../types';
import { paramEnvName } from '../format';

export interface ParamSchemaEditorProps {
  /** 参数声明列表（由父组件管理，受控） */
  value?: ScriptParam[];
  onChange?: (value: ScriptParam[]) => void;
}

const TYPE_OPTIONS = [
  { value: 'string', label: 'string' },
  { value: 'int', label: 'int' },
  { value: 'bool', label: 'bool' },
];

const ParamSchemaEditor: React.FC<ParamSchemaEditorProps> = ({ value = [], onChange }) => {
  const emit = (next: ScriptParam[]) => onChange?.(next);

  const update = (index: number, patch: Partial<ScriptParam>) => {
    emit(value.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  const remove = (index: number) => {
    emit(value.filter((_, i) => i !== index));
  };

  const add = () => {
    emit([...value, { name: '', type: 'string', default: '', desc: '' }]);
  };

  return (
    <div className="ts-pse">
      {value.length === 0 && (
        <p className="ts-pse-empty">
          无参数脚本可留空。若脚本通过环境变量 <code>SCRIPT_PARAM_{'{NAME}'}</code> 读取入参，
          在此声明参数，任务配置时将获得填写引导与默认值填充。
        </p>
      )}

      {value.map((param, index) => (
        <div className="ts-pse-row" key={index}>
          <div className="ts-pse-fields">
            <Input
              className="ts-pse-name"
              placeholder="参数名（如 retentionDays）"
              value={param.name}
              maxLength={50}
              onChange={(e) => update(index, { name: e.target.value })}
            />
            <Select
              className="ts-pse-type"
              value={param.type}
              options={TYPE_OPTIONS}
              onChange={(type) => update(index, { type })}
            />
            <Input
              className="ts-pse-default"
              placeholder="默认值（可空）"
              value={param.default ?? ''}
              maxLength={100}
              onChange={(e) => update(index, { default: e.target.value })}
            />
            <Input
              className="ts-pse-desc"
              placeholder="参数说明（可空）"
              value={param.desc ?? ''}
              maxLength={200}
              onChange={(e) => update(index, { desc: e.target.value })}
            />
          </div>
          <div className="ts-pse-foot">
            {param.name.trim() ? (
              <Tooltip title="脚本内通过该环境变量读取此参数">
                <code className="ts-pse-env">{paramEnvName(param.name.trim())}</code>
              </Tooltip>
            ) : (
              <span className="ts-pse-env ts-pse-env--placeholder">填写参数名后预览环境变量</span>
            )}
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => remove(index)}
              aria-label="删除参数"
            />
          </div>
        </div>
      ))}

      <Button
        className="ts-pse-add"
        type="dashed"
        icon={<PlusOutlined />}
        onClick={add}
      >
        添加参数
      </Button>
    </div>
  );
};

export default ParamSchemaEditor;
