import React, { useCallback, useState } from 'react';
import { Input } from 'antd';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import { formatHttpStatusText, searchHttpStatus } from '../../utils/httpStatus';
import { resolveNetworkIcon } from '../../utils/iconMap';
import { useTabPageStore } from '../../../../../hooks/useTabPageState';
import '../../network.css';
import '../../components/NetworkToolLayout.css';

const PAGE_KEY = 'tools-network-http-status';

const HttpStatusTool: React.FC = () => {
  const { state, setField, setState } = useTabPageStore(PAGE_KEY, {
    query: '429',
    output: formatHttpStatusText(searchHttpStatus('429')),
  });
  const { query, output } = state;
  const [loading, setLoading] = useState(false);

  const run = useCallback(() => {
    setLoading(true);
    window.setTimeout(() => {
      const items = searchHttpStatus(query);
      setState((prev) => ({
        ...prev,
        output: formatHttpStatusText(items),
      }));
      setLoading(false);
    }, 40);
  }, [query, setState]);

  return (
    <NetworkToolLayout
      title="HTTP 状态码参考"
      icon={resolveNetworkIcon('NumberOutlined')}
      description="搜索状态码 · 中文含义 · 原因与建议"
      submitText="查询"
      loading={loading}
      onSubmit={run}
      resultText={output}
    >
      <div data-testid="network-tool-input-slot">
        <Input
          value={query}
          onChange={(e) => setField('query', e.target.value)}
          onPressEnter={run}
          placeholder="输入 429 / Too Many / 限流 …"
          data-testid="http-status-input"
          allowClear
        />
      </div>
    </NetworkToolLayout>
  );
};

export default HttpStatusTool;
