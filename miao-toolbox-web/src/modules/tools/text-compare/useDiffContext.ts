import { useContext } from 'react';
import { DiffContext } from './diffContext';

export const useDiffContext = () => {
  const ctx = useContext(DiffContext);
  if (!ctx) throw new Error('useDiffContext must be used within DiffProvider');
  return ctx;
};
