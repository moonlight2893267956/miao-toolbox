import React, { useCallback, useState } from 'react';
import { Input } from 'antd';
import NetworkToolLayout from '../../components/NetworkToolLayout';
import { analyzeIp, formatIpResultText } from '../../utils/ipFormat';
import { resolveNetworkIcon } from '../../utils/iconMap';
import { useTabPageStore } from '../../../../../hooks/useTabPageState';
import '../../network.css';
import '../../components/NetworkToolLayout.css';

const PAGE_KEY = 'tools-network-ip-format';

const IpFormatTool: React.FC = () => {
  const { state, setField, setState } = useTabPageStore(PAGE_KEY, {
    input: '192.168.1.0/24',
    output: '',
    error: null as string | null,
  });
  const { input, output, error } = state;
  const [loading, setLoading] = useState(false);

  const run = useCallback(() => {
    setLoading(true);
    window.setTimeout(() => {
      const r = analyzeIp(input);
      if (r.error) {
        setState((prev) => ({ ...prev, error: r.error ?? '解析失败', output: '' }));
      } else {
        setState((prev) => ({
          ...prev,
          error: null,
          output: formatIpResultText(r),
        }));
      }
      setLoading(false);
    }, 50);
  }, [input, setState]);

  return (
    <NetworkToolLayout
      title="IP 格式转换器"
      icon={resolveNetworkIcon('GlobalOutlined')}
      description="IPv4 / CIDR · 二进制 · 十进制 · 地址范围"
      submitText="转换"
      loading={loading}
      onSubmit={run}
      resultText={output}
      error={error}
    >
      <div data-testid="network-tool-input-slot">
        <Input
          value={input}
          onChange={(e) => setField('input', e.target.value)}
          onPressEnter={run}
          placeholder="192.168.1.0/24 或 3232235776 或 0xc0a80100"
          data-testid="ip-input"
          spellCheck={false}
        />
      </div>
    </NetworkToolLayout>
  );
};

export default IpFormatTool;
