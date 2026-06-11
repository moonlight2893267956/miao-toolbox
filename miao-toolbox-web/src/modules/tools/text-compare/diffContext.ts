import { createContext } from 'react';
import type { DiffAction, DiffState, Granularity } from './types';

export interface DiffContextValue {
  state: DiffState;
  dispatch: React.Dispatch<DiffAction>;
  setLeft: (text: string) => void;
  setRight: (text: string) => void;
  setGranularity: (g: Granularity) => void;
  setIgnoreWhitespace: (v: boolean) => void;
  setShowLineNumbers: (v: boolean) => void;
}

export const DiffContext = createContext<DiffContextValue | undefined>(undefined);
