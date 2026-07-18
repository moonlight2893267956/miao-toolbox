// Cron 编辑器 — Context 消费 Hook
import { useContext } from 'react';
import { CronContext } from './cronContext';

export const useCronContext = () => {
  const ctx = useContext(CronContext);
  if (!ctx) throw new Error('useCronContext must be used within CronProvider');
  return ctx;
};
