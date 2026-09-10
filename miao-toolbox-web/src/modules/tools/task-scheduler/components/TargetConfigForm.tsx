import React from 'react';
import { Alert, Form, Select } from 'antd';
import HttpTargetForm from './HttpTargetForm';

const TARGET_TYPE_OPTIONS = [
  { value: 'HTTP', label: 'HTTP 请求' },
  { value: 'PRESET', label: '预置运维模板（Epic 3 交付）', disabled: true },
];

/** 目标配置表单（FR-3）：v1 仅 HTTP，PRESET 由 Epic 3 交付 */
const TargetConfigForm: React.FC<{ isEdit?: boolean }> = ({ isEdit = false }) => (
  <>
    <Form.Item name="targetType" label="目标类型" rules={[{ required: true, message: '请选择目标类型' }]}>
      <Select options={TARGET_TYPE_OPTIONS} style={{ maxWidth: 320 }} />
    </Form.Item>

    <Form.Item noStyle shouldUpdate>
      {({ getFieldValue }) =>
        getFieldValue('targetType') === 'PRESET' ? (
          <Alert type="info" showIcon message="预置运维模板目标将在 Epic 3 交付" />
        ) : (
          <HttpTargetForm isEdit={isEdit} />
        )
      }
    </Form.Item>
  </>
);

export default TargetConfigForm;
