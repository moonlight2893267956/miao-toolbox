import React from 'react';
import { Form, Select } from 'antd';
import HttpTargetForm from './HttpTargetForm';
import PresetTargetForm from './PresetTargetForm';

const TARGET_TYPE_OPTIONS = [
  { value: 'HTTP', label: 'HTTP 请求' },
  { value: 'PRESET', label: '预置运维模板' },
];

/** 目标配置表单（FR-3/FR-5）：HTTP 请求或预置运维模板 */
const TargetConfigForm: React.FC<{ isEdit?: boolean }> = ({ isEdit = false }) => (
  <>
    <Form.Item name="targetType" label="目标类型" rules={[{ required: true, message: '请选择目标类型' }]}>
      <Select options={TARGET_TYPE_OPTIONS} style={{ maxWidth: 320 }} />
    </Form.Item>

    <Form.Item noStyle shouldUpdate>
      {({ getFieldValue }) =>
        getFieldValue('targetType') === 'PRESET' ? (
          <PresetTargetForm />
        ) : (
          <HttpTargetForm isEdit={isEdit} />
        )
      }
    </Form.Item>
  </>
);

export default TargetConfigForm;
