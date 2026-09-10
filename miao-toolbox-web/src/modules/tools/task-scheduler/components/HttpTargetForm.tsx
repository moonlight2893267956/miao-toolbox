import React from 'react';
import { Col, Form, Input, InputNumber, Row, Select } from 'antd';
import HeaderEditor from './HeaderEditor';
import { validateUrl } from '../format';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'].map((method) => ({
  value: method,
  label: method,
}));

/** HTTP 目标配置表单（FR-3/FR-4） */
const HttpTargetForm: React.FC<{ isEdit?: boolean }> = ({ isEdit = false }) => (
  <>
    <Row gutter={12}>
      <Col xs={24} md={6}>
        <Form.Item
          name={['targetConfig', 'method']}
          label="请求方法"
          rules={[{ required: true, message: '请选择请求方法' }]}
        >
          <Select options={HTTP_METHODS} />
        </Form.Item>
      </Col>
      <Col xs={24} md={18}>
        <Form.Item
          name={['targetConfig', 'url']}
          label="目标 URL"
          rules={[{ required: true, message: '请输入目标 URL' }, { validator: validateUrl }]}
          extra="内网 / 环回地址会被服务端 SSRF 防护拦截"
        >
          <Input placeholder="https://example.com/health" allowClear />
        </Form.Item>
      </Col>
    </Row>

    <Form.Item label="请求头">
      <HeaderEditor name={['targetConfig', 'headers']} isEdit={isEdit} />
    </Form.Item>

    <Form.Item
      name={['targetConfig', 'body']}
      label="请求体"
      extra="支持变量：{{now}} / {{taskName}} / {{taskId}}；JSON 形态会自动带 application/json"
    >
      <Input.TextArea rows={4} placeholder='{"task": "{{taskName}}", "at": "{{now}}"}' />
    </Form.Item>

    <Form.Item
      name={['targetConfig', 'timeoutSeconds']}
      label="超时（秒）"
      rules={[{ type: 'number', min: 1, max: 120, message: '超时范围 1-120 秒' }]}
    >
      <InputNumber min={1} max={120} style={{ width: 160 }} />
    </Form.Item>
  </>
);

export default HttpTargetForm;
