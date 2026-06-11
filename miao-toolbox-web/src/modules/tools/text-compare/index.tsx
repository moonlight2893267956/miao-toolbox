import React, { useEffect, useRef } from 'react';
import { Row, Col } from 'antd';
import { DiffProvider, useDiffContext } from './DiffProvider';
import Toolbar from './Toolbar';
import DiffPanel from './DiffPanel';
import StatCard from './StatCard';
import DiffViewer from './DiffViewer';
import DiffNavigator from './DiffNavigator';
import { useDiffApi } from './useDiffApi';

/**
 * 文本对照工具 — 内部内容组件（在 DiffProvider 作用域内）
 */
const DiffContent: React.FC = () => {
  const { state, dispatch } = useDiffContext();
  const { compare } = useDiffApi();
  const debounceRef = useRef<number | null>(null);
  const hunkRefs = useRef<(HTMLDivElement | null)[]>([]);

  // 500ms 防抖自动对比
  useEffect(() => {
    const hasContent = state.leftText || state.rightText;
    if (!hasContent) {
      dispatch({ type: 'SET_DIFF_RESULT', payload: null });
      return;
    }

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(async () => {
      try {
        dispatch({ type: 'SET_LOADING', payload: true });
        const result = await compare({
          left: state.leftText,
          right: state.rightText,
          granularity: state.granularity,
          ignoreWhitespace: state.ignoreWhitespace,
        });
        dispatch({ type: 'SET_DIFF_RESULT', payload: result });
      } catch (e: unknown) {
        const err = e as { response?: { data?: { message?: string } } };
        dispatch({ type: 'SET_ERROR', payload: err.response?.data?.message || '对比失败' });
      }
    }, 500);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [state.leftText, state.rightText, state.granularity, state.ignoreWhitespace, compare, dispatch]);

  const isSplitLayout = state.layout === 'split';

  return (
    <>
      <Toolbar />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <StatCard />
        </div>
        <DiffNavigator hunkRefs={hunkRefs} />
      </div>

      {isSplitLayout ? (
        <Row gutter={12}>
          <Col xs={24} md={12}>
            <DiffPanel side="left" />
          </Col>
          <Col xs={24} md={12}>
            <DiffPanel side="right" />
          </Col>
        </Row>
      ) : (
        <>
          <DiffPanel side="left" />
          <div style={{ marginTop: 12 }}>
            <DiffPanel side="right" />
          </div>
        </>
      )}

      <DiffViewer hunkRefs={hunkRefs} />
    </>
  );
};

/**
 * 文本对照工具页面入口
 */
const TextComparePage: React.FC = () => {
  return (
    <DiffProvider>
      <div className="miao-page">
        <header className="miao-page-header">
          <div>
            <div className="miao-page-eyebrow">工具</div>
            <h1 className="miao-page-title">文本对照</h1>
            <p className="miao-page-description">
              粘贴或上传两段文本，支持字符级、词级、行级粒度对比，自动识别语言类型。
            </p>
          </div>
        </header>
        <DiffContent />
      </div>
    </DiffProvider>
  );
};

export default TextComparePage;
