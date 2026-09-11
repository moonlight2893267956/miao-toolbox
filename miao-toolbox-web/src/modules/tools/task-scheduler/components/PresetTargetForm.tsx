import React, { useEffect, useState } from 'react';
import { Form, InputNumber, Select } from 'antd';
import type { PresetTemplateInfo } from '../types';
import { schedulerApi } from '../schedulerApi';

/** 静态兜底选项：模板列表接口失败时仍可提交（后端校验最终把关） */
const FALLBACK_TEMPLATES: PresetTemplateInfo[] = [
  { code: 'CLEAN_EXECUTION_LOGS', name: '清理过期执行日志', description: '删除指定天数之前的任务执行记录', params: { retentionDays: 'int: 留存天数（1-365，默认 30）' } },
];

/**
 * 预置运维模板目标表单（FR-5）。
 *
 * 模板选项来自 GET /api/scheduler/preset-templates 动态拉取
 * （新增模板无需前端发版）；接口失败回退静态选项。
 */
const PresetTargetForm: React.FC = () => {
  const [templates, setTemplates] = useState<PresetTemplateInfo[]>(FALLBACK_TEMPLATES);

  useEffect(() => {
    let cancelled = false;
    schedulerApi
      .listPresetTemplates()
      .then((list) => {
        if (!cancelled && list.length > 0) {
          setTemplates(list);
        }
      })
      .catch(() => {
        // 静默回退：保留 FALLBACK_TEMPLATES，提交时后端校验兜底
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const options = templates.map((t) => ({
    value: t.code,
    label: t.name,
  }));

  return (
    <>
      <Form.Item
        name={['targetConfig', 'template']}
        label="运维模板"
        rules={[{ required: true, message: '请选择运维模板' }]}
        extra="预置模板为内部操作，不发起外部请求"
      >
        <Select options={options} style={{ maxWidth: 320 }} placeholder="请选择" />
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
};

export default PresetTargetForm;
