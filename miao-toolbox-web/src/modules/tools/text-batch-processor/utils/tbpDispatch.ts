/**
 * dispatch 适配器 — 将旧 TbpAction 路由到当前激活页签的对应字段。
 *
 * 现有 tab 组件（DedupTab / SortTab / …）仍接收 dispatch: React.Dispatch<TbpAction>，
 * 此函数把每个 action 映射为 updateActiveTab 调用。
 *
 * 注意：所有字段更新必须用「函数式」写法 (prev) => ({ ...prev, ... })，
 * 不能基于 api.activeTab.xxx 展开 —— 后者捕获的是本次渲染的旧快照，
 * 同一 tick 内连续 dispatch 多个 action 时会互相覆盖（表现为输入框无法输入）。
 */
import type { Dispatch } from 'react';
import type { TbpAction } from '../types';
import type { useTbpTabs } from '../hooks/useTbpTabs';

type TbpTabsApi = ReturnType<typeof useTbpTabs>;

export function createTbpDispatch(api: TbpTabsApi): Dispatch<TbpAction> {
  return (action: TbpAction) => {
    switch (action.type) {
      case 'TBP_SET_INPUT':
        api.setInput(action.payload);
        break;
      case 'TBP_SET_TAB':
        api.toggleOp(action.payload);
        break;
      case 'TBP_BACKFILL':
        api.backfill(action.payload);
        break;
      case 'TBP_UNDO_BACKFILL':
        api.undoBackfill();
        break;
      case 'TBP_SET_DEDUP_OPTIONS':
        api.updateActiveTab('dedup', (prev) => ({
          ...prev,
          options: action.payload,
        }));
        break;
      case 'TBP_SET_SORT_OPTIONS':
        api.updateActiveTab('sort', (prev) => ({
          ...prev,
          options: action.payload,
        }));
        break;
      case 'TBP_SET_EXTRACT_PATTERN':
        api.updateActiveTab('extract', (prev) => ({
          ...prev,
          pattern: action.payload,
        }));
        break;
      case 'TBP_SET_EXTRACT_FLAGS':
        api.updateActiveTab('extract', (prev) => ({
          ...prev,
          flags: action.payload,
        }));
        break;
      case 'TBP_SET_EXTRACT_KEYWORD':
        api.updateActiveTab('extract', (prev) => ({
          ...prev,
          keyword: action.payload,
        }));
        break;
      case 'TBP_SET_EXTRACT_FORMAT':
        api.updateActiveTab('extract', (prev) => ({
          ...prev,
          format: action.payload,
        }));
        break;
      case 'TBP_SET_EXTRACT_RESULT':
        api.updateActiveTab('extract', (prev) => ({
          ...prev,
          result: action.payload.result,
          count: action.payload.count,
          error: null,
        }));
        break;
      case 'TBP_SET_EXTRACT_ERROR':
        api.updateActiveTab('extract', (prev) => ({
          ...prev,
          error: action.payload,
        }));
        break;
      case 'TBP_SET_REPLACE_PATTERN':
        api.updateActiveTab('replace', (prev) => ({
          ...prev,
          findPattern: action.payload,
        }));
        break;
      case 'TBP_SET_REPLACE_FLAGS':
        api.updateActiveTab('replace', (prev) => ({
          ...prev,
          flags: action.payload,
        }));
        break;
      case 'TBP_SET_REPLACE_TEXT':
        api.updateActiveTab('replace', (prev) => ({
          ...prev,
          replaceText: action.payload,
        }));
        break;
      case 'TBP_SET_REPLACE_USE_REGEX':
        api.updateActiveTab('replace', (prev) => ({
          ...prev,
          useRegex: action.payload,
        }));
        break;
      case 'TBP_SET_REPLACE_PREVIEW':
        api.updateActiveTab('replace', (prev) => ({
          ...prev,
          count: action.payload.count,
          error: null,
        }));
        break;
      case 'TBP_SET_REPLACE_EXECUTED':
        api.updateActiveTab('replace', (prev) => ({
          ...prev,
          result: action.payload.result,
          count: action.payload.count,
          executed: true,
          error: null,
        }));
        break;
      case 'TBP_RESET_REPLACE':
        api.updateActiveTab('replace', (prev) => ({
          ...prev,
          result: null,
          count: 0,
          executed: false,
          error: null,
        }));
        break;
      case 'TBP_SET_REPLACE_ERROR':
        api.updateActiveTab('replace', (prev) => ({
          ...prev,
          error: action.payload,
        }));
        break;
      case 'TBP_SET_FREQ_SPLIT_MODE':
        api.updateActiveTab('freq', (prev) => ({
          ...prev,
          splitMode: action.payload,
        }));
        break;
      case 'TBP_SET_FREQ_TOP_N':
        api.updateActiveTab('freq', (prev) => ({
          ...prev,
          topN: action.payload,
        }));
        break;
      case 'TBP_SET_FREQ_STOP_WORDS':
        api.updateActiveTab('freq', (prev) => ({
          ...prev,
          useStopWords: action.payload,
        }));
        break;
      case 'TBP_CLEAR_ALL':
        api.clearAll();
        break;
      default:
        break;
    }
  };
}
