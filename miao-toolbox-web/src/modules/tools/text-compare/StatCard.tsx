import React from 'react';
import { Card, Space, Statistic, Empty, Spin } from 'antd';
import { PlusOutlined, MinusOutlined, EditOutlined } from '@ant-design/icons';
import { useDiffContext } from './DiffProvider';

const StatCard: React.FC = () => {
  const { state } = useDiffContext();

  if (state.loading) {
    return (
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space><Spin size="small" /> 正在对比...</Space>
      </Card>
    );
  }

  if (state.error) {
    return (
      <Card size="small" style={{ marginBottom: 12, borderColor: '#ff7875' }}>
        <span style={{ color: '#cf1322' }}>{state.error}</span>
      </Card>
    );
  }

  if (!state.diffResult || !state.diffResult.hunks || state.diffResult.hunks.length === 0) {
    if (state.leftText || state.rightText) {
      return (
        <Card size="small" style={{ marginBottom: 12 }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无差异" />
        </Card>
      );
    }
    return null;
  }

  const stats = state.diffResult.statistics;

  return (
    <Card
      size="small"
      style={{ marginBottom: 12 }}
      title="差异统计"
    >
      <Space size="large" wrap>
        <Statistic
          title="新增"
          value={stats.additions}
          prefix={<PlusOutlined style={{ color: '#52c41a' }} />}
          valueStyle={{ color: '#52c41a', fontSize: 20 }}
        />
        <Statistic
          title="删除"
          value={stats.deletions}
          prefix={<MinusOutlined style={{ color: '#ff4d4f' }} />}
          valueStyle={{ color: '#ff4d4f', fontSize: 20 }}
        />
        <Statistic
          title="修改块"
          value={stats.modifications}
          prefix={<EditOutlined style={{ color: '#faad14' }} />}
          valueStyle={{ color: '#faad14', fontSize: 20 }}
        />
      </Space>
    </Card>
  );
};

export default StatCard;
