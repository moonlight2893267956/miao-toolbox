import React from 'react';
import { CodeOutlined, ColumnHeightOutlined, EyeOutlined, AlignLeftOutlined, ApartmentOutlined } from '@ant-design/icons';
import { useDiffContext } from './useDiffContext';
import type { LayoutMode } from './types';

const LANGUAGE_LABEL: Record<string, string> = {
  json: 'JSON', yaml: 'YAML', java: 'Java', python: 'Python',
  javascript: 'JavaScript', typescript: 'TypeScript', css: 'CSS',
  html: 'HTML', xml: 'XML', markdown: 'Markdown', sql: 'SQL', bash: 'Bash',
};

interface ChipProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  ariaLabel: string;
}

/** IDEA 风格 chip：非激活态图标 + 文字，激活态高亮 */
const Chip: React.FC<ChipProps> = ({ icon, label, active, onClick, ariaLabel }) => (
  <button
    type="button"
    className={`dt-pill${active ? ' is-active' : ''}`}
    onClick={onClick}
    role="switch"
    aria-checked={active ?? undefined}
    aria-label={ariaLabel}
  >
    {icon}
    <span className="dt-pill-label">{label}</span>
  </button>
);

interface ToolbarProps {
  rightSlot?: React.ReactNode;
}

const Toolbar: React.FC<ToolbarProps> = ({ rightSlot }) => {
  const {
    state, setLayout, setIgnoreWhitespace, setStructuredDiff, setShowLineNumbers,
  } = useDiffContext();
  const isJsonYaml = state.language === 'json' || state.language === 'yaml' || state.language === 'yml';
  const layoutOptions: Array<{ value: LayoutMode; label: string; icon: React.ReactNode }> = [
    { value: 'split', label: '分栏', icon: <ColumnHeightOutlined /> },
    { value: 'stacked', label: '堆叠', icon: <ApartmentOutlined /> },
  ];

  return (
    <div className="dt-toolbar">
      <div className="dt-toolbar-group">
        <span className="dt-toolbar-label">布局</span>
        <div className="dt-pill-group" role="radiogroup" aria-label="展示布局">
          {layoutOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`dt-pill${state.layout === opt.value ? ' is-active' : ' is-icon-only'}`}
              onClick={() => setLayout(opt.value)}
              role="radio"
              aria-checked={state.layout === opt.value}
              aria-label={opt.label}
            >
              {opt.icon}
              <span className="dt-pill-label">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      <Chip
        icon={<EyeOutlined />}
        label="行号"
        active={state.showLineNumbers}
        onClick={() => setShowLineNumbers(!state.showLineNumbers)}
        ariaLabel="切换行号显示"
      />

      <Chip
        icon={<AlignLeftOutlined />}
        label="忽略空白"
        active={state.ignoreWhitespace}
        onClick={() => setIgnoreWhitespace(!state.ignoreWhitespace)}
        ariaLabel="切换忽略空白"
      />

      {isJsonYaml && (
        <Chip
          icon={<CodeOutlined />}
          label="结构化"
          active={state.structuredDiff}
          onClick={() => setStructuredDiff(!state.structuredDiff)}
          ariaLabel="切换结构化对比"
        />
      )}

      <div className="dt-toolbar-group dt-toolbar-tail">
        {state.language && (
          <span className="dt-lang-tag">
            <CodeOutlined /> {LANGUAGE_LABEL[state.language] ?? state.language.toUpperCase()}
          </span>
        )}
        {rightSlot}
      </div>
    </div>
  );
};

export default Toolbar;
