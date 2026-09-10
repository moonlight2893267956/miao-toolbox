import React from 'react';
import { Button, Checkbox, Form, Input, Tooltip } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';

interface HeaderEditorProps {
  /** Form.List 路径，例如 ['targetConfig', 'headers'] */
  name: (string | number)[];
  /** 编辑态：敏感值留空提交即"不修改"，由后端按同名保留原密文 */
  isEdit?: boolean;
}

const EMPTY_HEADER = { name: '', value: '', sensitive: false };

/**
 * HTTP 请求头编辑器（FR-3/FR-14）。
 *
 * 敏感 header 的值用密码型输入框；编辑回填时后端返回 `****`，
 * 用户不改动即原样提交（后端识别占位符并保留原密文）。
 */
const HeaderEditor: React.FC<HeaderEditorProps> = ({ name, isEdit = false }) => (
  <Form.List name={name}>
    {(fields, { add, remove }) => (
      <div className="ts-header-editor">
        {fields.length === 0 && (
          <div className="ts-header-empty">暂无请求头，可按需添加（如 Authorization、X-Api-Key）</div>
        )}

        {fields.map((field) => (
          <div className="ts-header-row" key={field.key}>
            <Form.Item
              name={[field.name, 'name']}
              className="ts-header-name"
              rules={[{ required: true, message: '请输入 Header 名称' }]}
            >
              <Input placeholder="Header 名称" autoComplete="off" />
            </Form.Item>

            <Form.Item noStyle shouldUpdate>
              {({ getFieldValue }) => {
                const sensitive = Boolean(getFieldValue([...name, field.name, 'sensitive']));
                return (
                  <Form.Item
                    name={[field.name, 'value']}
                    className="ts-header-value"
                    rules={[
                      {
                        required: sensitive ? !isEdit : true,
                        message: sensitive ? '敏感 Header 需要填写实际值' : '请输入 Header 值',
                      },
                    ]}
                  >
                    <Input.Password
                      placeholder={sensitive ? '敏感值（留空表示不修改）' : 'Header 值'}
                      autoComplete="new-password"
                    />
                  </Form.Item>
                );
              }}
            </Form.Item>

            <Form.Item name={[field.name, 'sensitive']} valuePropName="checked" className="ts-header-sensitive">
              <Checkbox>
                <Tooltip title="标记后该值由服务端加密存储，接口与页面仅显示 ****">敏感</Tooltip>
              </Checkbox>
            </Form.Item>

            <Button
              type="text"
              danger
              aria-label="删除该 Header"
              icon={<DeleteOutlined />}
              onClick={() => remove(field.name)}
            />
          </div>
        ))}

        <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ ...EMPTY_HEADER })}>
          添加 Header
        </Button>
      </div>
    )}
  </Form.List>
);

export default HeaderEditor;
