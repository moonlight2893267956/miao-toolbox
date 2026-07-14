import { createContext } from 'react';
import type { RegexAction, RegexState } from './types';

export interface RegexContextValue {
  state: RegexState;
  dispatch: React.Dispatch<RegexAction>;
  setPattern: (pattern: string) => void;
  setFlags: (flags: string) => void;
  setTestText: (text: string) => void;
  setReplaceText: (text: string) => void;
  setEngine: (engine: import('./types').RegexEngine) => void;
  toggleFlag: (flag: string) => void;
  setActiveMatch: (index: number) => void;
}

export const RegexContext = createContext<RegexContextValue | undefined>(undefined);
