import { createContext } from 'react';
import type { DiffAction, DiffState, LayoutMode } from './types';

export interface DiffContextValue {
  state: DiffState;
  dispatch: React.Dispatch<DiffAction>;
  setLeft: (text: string) => void;
  setRight: (text: string) => void;
  setLayout: (mode: LayoutMode) => void;
  setIgnoreWhitespace: (v: boolean) => void;
  setStructuredDiff: (v: boolean) => void;
  setShowLineNumbers: (v: boolean) => void;
  setWordWrap: (v: boolean) => void;
  runCompare: () => void;
}

export const DiffContext = createContext<DiffContextValue | undefined>(undefined);
