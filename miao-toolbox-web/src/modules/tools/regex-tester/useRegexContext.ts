import { useContext } from 'react';
import { RegexContext } from './regexContext';

export const useRegexContext = () => {
  const ctx = useContext(RegexContext);
  if (!ctx) throw new Error('useRegexContext must be used within RegexProvider');
  return ctx;
};
