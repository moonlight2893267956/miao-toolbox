import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Col, Form, Input, Popover, Radio, Row, Spin, message } from 'antd';
import { ArrowLeftOutlined, CodeOutlined, QuestionCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import PageFadeIn from '../../../components/shared/PageFadeIn';
import { schedulerApi } from './schedulerApi';
import type { ScriptDetail, ScriptParam, ScriptType } from './types';
import { extractErrorMessage } from './format';
import SchedulerHeader from './components/SchedulerHeader';
import SchedulerPanel from './components/SchedulerPanel';
import ScriptEditor from './components/ScriptEditor';
import ParamSchemaEditor from './components/ParamSchemaEditor';
import './task-scheduler.css';

interface ScriptFormValues {
  name: string;
  description?: string;
  scriptType: ScriptType;
  content: string;
}

const DEFAULT_VALUES: ScriptFormValues = {
  name: '',
  description: '',
  scriptType: 'SHELL',
  content: '',
};

/** 过滤无效行（名称为空）并序列化为 paramSchema JSON 文本；无有效参数返回 null */
function serializeParamSchema(params: ScriptParam[]): string | null {
  const valid = params.filter((p) => p.name && p.name.trim());
  if (valid.length === 0) return null;
  return JSON.stringify(valid.map((p) => ({
    name: p.name.trim(),
    type: p.type,
    default: p.default?.trim() || null,
    desc: p.desc?.trim() || null,
  })));
}

/** 脚本创建/编辑页（FR-1） */
const ScriptFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const scriptId = Number(id);

  const [form] = Form.useForm<ScriptFormValues>();
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initialValues, setInitialValues] = useState<ScriptFormValues>(DEFAULT_VALUES);
  const [scriptType, setScriptType] = useState<ScriptType>('SHELL');
  const [content, setContent] = useState('');
  /** 参数声明（结构化，提交时序列化为 JSON 文本） */
  const [paramSchema, setParamSchema] = useState<ScriptParam[]>([]);

  useEffect(() => {
    if (!isEdit) {
      setInitialValues(DEFAULT_VALUES);
      setScriptType('SHELL');
      setContent('');
      setParamSchema([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    schedulerApi
      .getScript(scriptId)
      .then((script: ScriptDetail) => {
        if (cancelled) return;
        const values: ScriptFormValues = {
          name: script.name,
          description: script.description ?? '',
          scriptType: script.scriptType,
          content: script.content ?? '',
        };
        setInitialValues(values);
        setScriptType(script.scriptType);
        setContent(script.content ?? '');
        setParamSchema(script.paramSchema ?? []);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(extractErrorMessage(err, '脚本详情加载失败'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isEdit, scriptId]);

  const handleSubmit = useCallback(
    async (values: ScriptFormValues) => {
      if (!content || !content.trim()) {
        message.error('脚本内容不能为空');
        return;
      }
      setSubmitting(true);
      try {
        const paramSchemaJson = serializeParamSchema(paramSchema);
        const payload = {
          name: values.name.trim(),
          description: values.description?.trim() || null,
          scriptType: values.scriptType,
          content,
          paramSchema: paramSchemaJson,
        };
        if (isEdit) {
          await schedulerApi.updateScript(scriptId, {
            name: payload.name,
            description: payload.description ?? '',
            content,
            paramSchema: paramSchemaJson,
          });
          message.success('脚本已更新');
        } else {
          await schedulerApi.createScript(payload);
          message.success('脚本已创建');
          // KeepAlive 下本页不会卸载：创建后重置，避免下次「新建脚本」残留上次内容
          form.resetFields();
          setContent('');
          setScriptType('SHELL');
          setParamSchema([]);
        }
        navigate('/tools/task-scheduler/scripts');
      } catch (err) {
        message.error(extractErrorMessage(err, '保存失败'));
      } finally {
        setSubmitting(false);
      }
    },
    [content, paramSchema, isEdit, navigate, scriptId],
  );

  const header = (
    <SchedulerHeader
      icon={<CodeOutlined />}
      title={isEdit ? '编辑脚本' : '新建脚本'}
      subtitle="Shell / Python · 版本管理 · 上限 64KB"
      actions={
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/tools/task-scheduler/scripts')}>
          返回列表
        </Button>
      }
    />
  );

  if (loading) {
    return (
      <PageFadeIn>
        <div className="ts-page">
          {header}
          <div className="ts-loading">
            <Spin />
          </div>
        </div>
      </PageFadeIn>
    );
  }

  return (
    <PageFadeIn>
      <div className="ts-page">
        {header}

        {loadError ? (
          <Alert
            type="error"
            showIcon
            message={loadError}
            action={<Button onClick={() => navigate('/tools/task-scheduler/scripts')}>返回列表</Button>}
          />
        ) : (
          <Form<ScriptFormValues>
            form={form}
            layout="vertical"
            className="ts-form"
            initialValues={initialValues}
            onFinish={(values) => void handleSubmit(values)}
            scrollToFirstError
          >
            <div className="ts-form-stack">
              <SchedulerPanel label="基本信息" meta="名称与类型" index={0}>
                <Row gutter={12}>
                  <Col xs={24} md={10}>
                    <Form.Item
                      name="name"
                      label="脚本名称"
                      rules={[
                        { required: true, message: '请输入脚本名称' },
                        { min: 2, max: 50, message: '脚本名称长度须为 2-50 字', transform: (v?: string) => v?.trim() },
                      ]}
                    >
                      <Input placeholder="如：清理过期日志" maxLength={50} showCount />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={14}>
                    <Form.Item name="description" label="描述" rules={[{ max: 200, message: '描述最长 200 字' }]}>
                      <Input placeholder="可选，说明该脚本的用途" maxLength={200} />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item
                  name="scriptType"
                  label="脚本类型"
                  rules={[{ required: true, message: '请选择脚本类型' }]}
                >
                  <Radio.Group
                    onChange={(e) => setScriptType(e.target.value)}
                    disabled={isEdit}
                  >
                    <Radio.Button value="SHELL">Shell</Radio.Button>
                    <Radio.Button value="PYTHON">Python</Radio.Button>
                  </Radio.Group>
                </Form.Item>
                {isEdit && (
                  <Form.Item>
                    <span className="ts-muted">脚本类型创建后不可修改</span>
                  </Form.Item>
                )}
              </SchedulerPanel>

              <SchedulerPanel label="脚本内容" meta="代码编辑器 · 粘贴或上传" tone="target" index={1}>
                <ScriptEditor
                  value={content}
                  onChange={setContent}
                  scriptType={scriptType}
                  height="460px"
                  paramSchema={paramSchema}
                />
              </SchedulerPanel>

              <SchedulerPanel
                label="参数声明"
                meta={paramSchema.length > 0 ? `${paramSchema.length} 个参数` : '可选 · 无参数脚本留空'}
                tone="notify"
                index={2}
              >
                <div className="ts-pse-panel-head">
                  <Popover
                    trigger="hover"
                    placement="right"
                    overlayClassName="ts-param-popover"
                    content={
                      <div className="ts-param-help">
                        <div className="ts-param-help-title">
                          <ThunderboltOutlined />
                          <span>参数如何注入脚本</span>
                        </div>
                        <p className="ts-param-help-desc">
                          执行时每个参数以环境变量形式注入子进程：
                          camelCase 参数名自动转为大写下划线，
                          如 <code>retentionDays</code> → <code>SCRIPT_PARAM_RETENTION_DAYS</code>。
                          Shell 用 <code>$SCRIPT_PARAM_RETENTION_DAYS</code>，Python 用
                          <code>os.environ['SCRIPT_PARAM_RETENTION_DAYS']</code> 读取。
                        </p>
                        <p className="ts-param-help-desc">
                          声明保存在脚本级别（所有版本共享），任务配置页会据此展示填写引导与默认值填充。
                        </p>
                      </div>
                    }
                  >
                    <span className="ts-pse-hint">
                      <QuestionCircleOutlined /> 参数如何注入脚本
                    </span>
                  </Popover>
                </div>
                <ParamSchemaEditor value={paramSchema} onChange={setParamSchema} />
              </SchedulerPanel>
            </div>

            <div className="ts-form-actions">
              <Button onClick={() => navigate('/tools/task-scheduler/scripts')}>取消</Button>
              <Button type="primary" htmlType="submit" loading={submitting}>
                保存
              </Button>
            </div>
          </Form>
        )}
      </div>
    </PageFadeIn>
  );
};

export default ScriptFormPage;
