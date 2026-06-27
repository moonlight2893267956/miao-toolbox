export const SplitViewIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="8" height="18" rx="2" fill="currentColor" fillOpacity="0.2"/>
    <rect x="13" y="3" width="8" height="18" rx="2" fill="currentColor" fillOpacity="0.6"/>
    <path d="M12 3V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

export const CompareIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 7L4 12L9 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M15 7L20 12L15 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const ArrowRightIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 5L19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/** Sparkle / Magic Star — AI 标识 */
export const SparkleIcon: React.FC<{ size?: number; className?: string }> = ({ size = 16, className }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"
      fill="currentColor"
    />
    <path
      d="M19 16L19.7 18.3L22 19L19.7 19.7L19 22L18.3 19.7L16 19L18.3 18.3L19 16Z"
      fill="currentColor"
      opacity="0.7"
    />
    <path
      d="M5 4L5.5 5.5L7 6L5.5 6.5L5 8L4.5 6.5L3 6L4.5 5.5L5 4Z"
      fill="currentColor"
      opacity="0.5"
    />
  </svg>
);

/** Refresh */
export const RefreshIcon: React.FC<{ size?: number; className?: string }> = ({ size = 16, className }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M3 12C3 7.02944 7.02944 3 12 3C15.3019 3 18.1889 4.77814 19.7546 7.42934"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M21 12C21 16.9706 16.9706 21 12 21C8.69814 21 5.81114 19.2219 4.24538 16.5707"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path d="M20 3V8H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 21V16H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Close (X) */
export const CloseIcon: React.FC<{ size?: number; className?: string }> = ({ size = 16, className }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 6L18 18M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/** Trace / Activity */
export const TraceIcon: React.FC<{ size?: number; className?: string }> = ({ size = 12, className }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M3 12H6L9 4L15 20L18 12H21"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Expand / Collapse Arrows (kept for compat) */
export const ExpandIcon: React.FC<{ size?: number; className?: string }> = ({ size = 14, className }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M4 14V18C4 19.1046 4.89543 20 6 20H10M20 10V6C20 4.89543 19.1046 4 18 4H14"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path d="M14 20L10 20M20 14L20 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M10 4L14 4M4 10L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const CollapseIcon: React.FC<{ size?: number; className?: string }> = ({ size = 14, className }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M10 14L6 14C4.89543 14 4 13.1046 4 12L4 8M14 10L18 10C19.1046 10 20 9.10457 20 8L20 4"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path d="M4 4L8 4M20 20L16 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
