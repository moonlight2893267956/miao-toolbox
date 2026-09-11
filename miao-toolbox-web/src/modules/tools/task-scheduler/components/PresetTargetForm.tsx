import React from 'react';
import { Form, InputNumber, Select } from 'antd';

const TEMPLATE_OPTIONS = [
  { value: 'CLEAN_EXECUTION_LOGS', label: '清理过期执行日志' },
];

/** 预置运维模板目标表单（FR-5） */
const PresetTargetForm: React.FC = () => (
  <>
    <Form.Item
      name={['targetConfig', 'template']}
      label="运维模板"
      rules={[{ required: true, message: '请选择运维模板' }]}
      extra="预置模板为内部操作，不发起外部请求"
    >
      <Select options={TEMPLATE_OPTIONS} style={{ maxWidth: 320 }} />
    </Form.Item>

    <Form.Item
      name={['targetConfig', 'params', 'retentionDays']}
      label="留存天数"
      rules={[{ type: 'number', min: 1, max: 365, message: '留存天数范围 1-365' }]}
      extra="删除此天数之前的执行记录（默认 30 天）"
    >
      <InputNumber min={1} max={365} style={{ width: 160 }} />
    </Form.Item>
  </>
);

export default PresetTargetForm;
