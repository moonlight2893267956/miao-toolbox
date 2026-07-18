// Cron 中文可读描述（Story 1.4 / FR-12）
// 仅在校验通过（valid=true，含仅语义警告）时展示；语法错误不展示。
import React, { useMemo } from 'react';
import { TranslationOutlined } from '@ant-design/icons';
import { Typography } from 'antd';
import { useCronContext } from '../useCronContext';
import { humanizeCron } from '../utils/cronHumanizer';

const { Text } = Typography;

const HumanReadable: React.FC = () => {
  const { state, validation } = useCronContext();
  const { expression, dialect } = state;

  const text = useMemo(() => {
    if (!validation.valid || expression.trim() === '') return '';
    return humanizeCron(expression, dialect);
  }, [expression, dialect, validation.valid]);

  if (!text) return null;

  return (
    <div className="ce-human" aria-live="polite">
      <span className="ce-human-icon">
        <TranslationOutlined />
      </span>
      <span className="ce-human-label">中文描述</span>
      <Text strong className="ce-human-text">
        {text}
      </Text>
      {validation.warnings.length > 0 && (
        <Text type="warning" className="ce-human-warning">
          {validation.warnings[0].message}
        </Text>
      )}
    </div>
  );
};

export default HumanReadable;
