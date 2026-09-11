import React from 'react';
import { Form, Input, Select } from 'antd';
import { validateEmails, validateUrl } from '../format';

const TRIGGER_OPTIONS = [
  { value: 'ALWAYS', label: '每次执行' },
  { value: 'ON_FAILURE', label: '仅失败时（含超时）' },
  { value: 'ON_SUCCESS', label: '仅成功时' },
];

/**
 * 通知配置表单（FR-10/FR-11）。
 *
 * 两个通道均可留空 = 不启用；URL/邮箱在保存时由后端二次校验
 * （Webhook URL 做 SSRF 拦截、邮箱做格式校验）。
 */
const NotifyConfigForm: React.FC = () => (
  <>
    <Form.Item
      name={['notifyConfig', 'webhook', 'url']}
      label="Webhook URL"
      rules={[{ validator: validateUrl }]}
      extra="留空表示不启用；执行完成后 POST JSON（超时 10s），支持企业微信/飞书等机器人"
    >
      <Input placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…" allowClear />
    </Form.Item>

    <Form.Item name={['notifyConfig', 'webhook', 'trigger']} label="Webhook 触发条件">
      <Select options={TRIGGER_OPTIONS} style={{ maxWidth: 260 }} />
    </Form.Item>

    <Form.Item
      name={['notifyConfig', 'email', 'recipients']}
      label="通知邮箱"
      rules={[{ validator: validateEmails }]}
      extra="留空表示不启用；多个邮箱用逗号或回车分隔"
    >
      <Select
        mode="tags"
        open={false}
        tokenSeparators={[',', '，', ' ', ';']}
        placeholder="ops@example.com, dev@example.com"
        style={{ maxWidth: 480 }}
      />
    </Form.Item>

    <Form.Item name={['notifyConfig', 'email', 'trigger']} label="邮件触发条件">
      <Select options={TRIGGER_OPTIONS} style={{ maxWidth: 260 }} />
    </Form.Item>
  </>
);

export default NotifyConfigForm;
