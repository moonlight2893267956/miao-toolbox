import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Dropdown, Popconfirm, Spin, message } from 'antd';
import type { MenuProps } from 'antd';
import {
  DeleteOutlined,
  ReloadOutlined,
  RestOutlined,
  RollbackOutlined,
  SelectOutlined,
} from '@ant-design/icons';
import { fileStorageApi } from './fileStorageApi';
import { formatSize } from './fileCategory';
import { getFileIcon } from './FileIcon';
import FolderIcon from './FolderIcon';
import { useRubberBandSelection } from './useRubberBandSelection';
import type { TrashItem, TrashItemType, TrashView as TrashViewData } from './types';

// ── 多选 reducer（与「我的文件」同构，废纸篓自管选中态避免互相污染）──

interface SelectionState {
  selectedIds: Set<string>;
  lastSelectedId: string | null;
}

type SelectionAction =
  | { type: 'select'; id: string }
  | { type: 'toggle'; id: string }
  | { type: 'selectRange'; fromId: string; toId: string; allIds: string[] }
  | { type: 'selectAll'; ids: string[] }
  | { type: 'addToSelection'; ids: string[] }
  | { type: 'clear' };

const initialSelection: SelectionState = { selectedIds: new Set(), lastSelectedId: null };

function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  switch (action.type) {
    case 'select':
      return { selectedIds: new Set([action.id]), lastSelectedId: action.id };
    case 'toggle': {
      const next = new Set(state.selectedIds);
      if (next.has(action.id)) next.delete(action.id);
      else next.add(action.id);
      return { selectedIds: next, lastSelectedId: action.id };
    }
    case 'selectRange': {
      const fromIdx = action.allIds.indexOf(action.fromId);
      const toIdx = action.allIds.indexOf(action.toId);
      if (fromIdx === -1 || toIdx === -1) return state;
      const [start, end] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
      return { selectedIds: new Set(action.allIds.slice(start, end + 1)), lastSelectedId: action.toId };
    }
    case 'selectAll':
      return { selectedIds: new Set(action.ids), lastSelectedId: null };
    case 'addToSelection': {
      if (action.ids.length === 0) return state;
      const next = new Set(state.selectedIds);
      for (const id of action.ids) next.add(id);
      return { selectedIds: next, lastSelectedId: state.lastSelectedId };
    }
    case 'clear':
      return initialSelection;
    default:
      return state;
  }
}

// ── 工具函数 ──

function describeDeletedAt(deletedAt: string): string {
  const t = new Date(deletedAt.replace(/-/g, '/'));
  if (Number.isNaN(t.getTime())) return '';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.floor((startOfToday - t.getTime()) / 86400000);
  const hhmm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  if (diffDays <= 0) return `今天 ${hhmm}`;
  if (diffDays === 1) return `昨天 ${hhmm}`;
  return `${t.getMonth() + 1}月${t.getDate()}日 ${hhmm}`;
}

/** TrashItem → sortable id（与「我的文件」格式一致：file-{id} / directory-{id}） */
function trashItemId(item: TrashItem): string {
  return `${item.type}-${item.id}`;
}

// ── 卡片 ──

interface TrashCardProps {
  item: TrashItem;
  itemId: string;
  isSelected: boolean;
  isFocused: boolean;
  operating: boolean;
  onRestore: () => void;
  onPurge: () => void;
  onItemClick: (e: React.MouseEvent) => void;
  contextMenu: MenuProps;
}

const TrashCard = React.memo<TrashCardProps>(({
  item, itemId, isSelected, isFocused, operating, onRestore, onPurge, onItemClick, contextMenu,
}) => {
  const isDir = item.type === 'directory';

  return (
    <Dropdown menu={contextMenu} trigger={['contextMenu']} overlayClassName="fs-grid-dropdown">
      <div
        data-item-id={itemId}
        className={
          'fs-grid-item fs-trash-card'
          + (isDir ? ' fs-grid-item--dir' : '')
          + (isSelected ? ' fs-grid-item--selected' : '')
          + (isFocused ? ' fs-grid-item--focused' : '')
        }
        onClick={onItemClick}
        onContextMenu={(e) => e.stopPropagation()}
      >
        <div className={`fs-grid-thumb${isDir ? ' fs-grid-thumb--dir' : ''}`}>
          {isDir ? (
            <FolderIcon className="fs-grid-thumb-icon" size={76} />
          ) : (
            getFileIcon(item.mimeType, 'fs-grid-thumb-icon', item.name)
          )}

          {/* hover 浮起操作层：一体化玻璃胶囊工具条 */}
          <div className="fs-trash-card-hover" onClick={(e) => e.stopPropagation()}>
            <div className="fs-trash-hover-bar">
              <button
                type="button"
                className="fs-trash-hover-btn"
                disabled={operating}
                onClick={onRestore}
              >
                <RollbackOutlined />
              </button>
              <span className="fs-trash-hover-divider" />
              <Popconfirm
                title="彻底删除"
                description="将立即从服务器删除，无法恢复。"
                okText="彻底删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={onPurge}
              >
                <button
                  type="button"
                  className="fs-trash-hover-btn fs-trash-hover-btn--danger"
                  disabled={operating}
                >
                  <DeleteOutlined />
                </button>
              </Popconfirm>
            </div>
          </div>
        </div>

        <div className="fs-grid-info">
          <div className="fs-grid-name" title={item.name}>{item.name}</div>
          <div className="fs-trash-card-sub">
            {[isDir ? '文件夹' : item.sizeBytes != null ? formatSize(item.sizeBytes) : '', `${describeDeletedAt(item.deletedAt)}删除`]
              .filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>
    </Dropdown>
  );
});
TrashCard.displayName = 'TrashCard';

// ── 视图 ──

interface TrashViewProps {
  onChanged?: () => void;
}

export const TrashView: React.FC<TrashViewProps> = ({ onChanged }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TrashViewData | null>(null);
  const [selection, dispatchSelection] = useReducer(selectionReducer, initialSelection);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [operatingKey, setOperatingKey] = useState<string | null>(null);
  const [emptying, setEmptying] = useState(false);
  const [blankMenuOpen, setBlankMenuOpen] = useState(false);

  // 滚动容器 ref（橡皮筋框选挂载点）
  const listAreaRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fileStorageApi.listTrash());
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(msg || '废纸篓加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const files = useMemo(() => data?.files ?? [], [data]);
  const dirs = useMemo(() => data?.directories ?? [], [data]);
  const total = files.length + dirs.length;

  // 有序 id 列表（文件夹在前，与渲染顺序一致，用于 Shift 范围选中）
  const allRowIds = useMemo(
    () => [...dirs.map(d => trashItemId(d)), ...files.map(f => trashItemId(f))],
    [dirs, files],
  );

  // id → TrashItem 映射
  const itemMap = useMemo(() => {
    const m = new Map<string, TrashItem>();
    for (const d of dirs) m.set(trashItemId(d), d);
    for (const f of files) m.set(trashItemId(f), f);
    return m;
  }, [dirs, files]);

  // ── 单项操作 ──

  const handleRestore = useCallback(async (item: TrashItem) => {
    const key = trashItemId(item);
    setOperatingKey(key);
    try {
      await fileStorageApi.restoreTrashItem(item.type as TrashItemType, item.id);
      message.success(`「${item.name}」已放回原处`);
      dispatchSelection({ type: 'clear' });
      onChanged?.();
      await load();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(msg || '恢复失败');
    } finally {
      setOperatingKey(null);
    }
  }, [load, onChanged]);

  const handlePurge = useCallback(async (item: TrashItem) => {
    const key = trashItemId(item);
    setOperatingKey(key);
    try {
      await fileStorageApi.purgeTrashItem(item.type as TrashItemType, item.id);
      message.success(`「${item.name}」已彻底删除`);
      dispatchSelection({ type: 'clear' });
      onChanged?.();
      await load();
    } catch {
      message.error('删除失败');
    } finally {
      setOperatingKey(null);
    }
  }, [load, onChanged]);

  // ── 批量操作 ──

  const selectedItems = useMemo(
    () => allRowIds.filter(id => selection.selectedIds.has(id)).map(id => itemMap.get(id)!).filter(Boolean),
    [allRowIds, selection.selectedIds, itemMap],
  );

  const handleBatchRestore = useCallback(async () => {
    if (selectedItems.length === 0) return;
    let ok = 0;
    let fail = 0;
    for (const item of selectedItems) {
      try {
        await fileStorageApi.restoreTrashItem(item.type as TrashItemType, item.id);
        ok++;
      } catch {
        fail++;
      }
    }
    if (fail === 0) message.success(`${ok} 项已放回原处`);
    else message.warning(`${ok} 项已恢复，${fail} 项失败（原位置可能已不存在或同名冲突）`);
    dispatchSelection({ type: 'clear' });
    onChanged?.();
    await load();
  }, [selectedItems, load, onChanged]);

  const handleBatchPurge = useCallback(async () => {
    if (selectedItems.length === 0) return;
    let ok = 0;
    let fail = 0;
    for (const item of selectedItems) {
      try {
        await fileStorageApi.purgeTrashItem(item.type as TrashItemType, item.id);
        ok++;
      } catch {
        fail++;
      }
    }
    if (fail === 0) message.success(`${ok} 项已彻底删除`);
    else message.warning(`${ok} 项已删除，${fail} 项失败`);
    dispatchSelection({ type: 'clear' });
    onChanged?.();
    await load();
  }, [selectedItems, load, onChanged]);

  const handleEmpty = useCallback(async () => {
    setEmptying(true);
    try {
      await fileStorageApi.emptyTrash();
      message.success('废纸篓已清空');
      dispatchSelection({ type: 'clear' });
      onChanged?.();
      await load();
    } catch {
      message.error('清空失败');
    } finally {
      setEmptying(false);
    }
  }, [load, onChanged]);

  // ── 选中交互 ──

  const handleItemClick = useCallback((e: React.MouseEvent, id: string) => {
    const isMulti = e.metaKey || e.ctrlKey;
    const isRange = e.shiftKey;
    setFocusedId(id);
    if (isRange && selection.lastSelectedId) {
      dispatchSelection({ type: 'selectRange', fromId: selection.lastSelectedId, toId: id, allIds: allRowIds });
    } else if (isMulti) {
      dispatchSelection({ type: 'toggle', id });
    } else {
      dispatchSelection({ type: 'select', id });
    }
  }, [selection.lastSelectedId, allRowIds]);

  const handleBlankClick = useCallback((e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).closest('.fs-grid-item')) {
      dispatchSelection({ type: 'clear' });
      setFocusedId(null);
    }
  }, []);

  const handleBlankContextMenu = useCallback((e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).closest('.fs-grid-item, .ant-dropdown')) {
      setBlankMenuOpen(true);
    }
  }, []);

  // ── 橡皮筋框选（与「我的文件」同款交互）──

  /** 收集当前渲染的卡片元素（id + DOMRect），供框选命中检测 */
  const getGridItems = useCallback(() => {
    const cards = listAreaRef.current?.querySelectorAll('.fs-grid-item[data-item-id]');
    if (!cards) return [];
    return Array.from(cards).map((el) => ({
      id: (el as HTMLElement).dataset.itemId ?? '',
      rect: el.getBoundingClientRect(),
    }));
  }, []);

  const handleRubberBandSelect = useCallback((ids: string[], additive: boolean) => {
    if (additive) {
      // 追加模式：有交集才追加，无交集不变
      if (ids.length > 0) {
        dispatchSelection({ type: 'addToSelection', ids });
      }
    } else {
      // 替换模式：无交集也清空（与 Finder 行为一致）
      dispatchSelection({ type: 'selectAll', ids });
    }
  }, []);

  const { marqueeRect } = useRubberBandSelection({
    getItems: getGridItems,
    onSelect: handleRubberBandSelect,
    scrollContainerRef: listAreaRef,
  });

  // ── 右键菜单 ──

  const cardMenu = useCallback((item: TrashItem): MenuProps => {
    const id = trashItemId(item);
    // 多选时弹出批量菜单
    if (selection.selectedIds.has(id) && selectedItems.length > 1) {
      return {
        items: [
          { key: 'batch-restore', icon: <RollbackOutlined />, label: `放回 ${selectedItems.length} 项`, onClick: () => void handleBatchRestore() },
          { type: 'divider' as const },
          { key: 'batch-purge', icon: <DeleteOutlined />, label: `彻底删除 ${selectedItems.length} 项`, danger: true, onClick: () => void handleBatchPurge() },
        ],
      };
    }
    return {
      items: [
        { key: 'restore', icon: <RollbackOutlined />, label: '放回原处', onClick: () => void handleRestore(item) },
        { type: 'divider' as const },
        { key: 'purge', icon: <DeleteOutlined />, label: '彻底删除', danger: true, onClick: () => void handlePurge(item) },
      ],
    };
  }, [selection.selectedIds, selectedItems, handleRestore, handlePurge, handleBatchRestore, handleBatchPurge]);

  const blankMenuItems = useMemo<MenuProps['items']>(() => [
    { key: 'select-all', icon: <SelectOutlined />, label: '全选', disabled: total === 0, onClick: () => dispatchSelection({ type: 'selectAll', ids: allRowIds }) },
    { type: 'divider' as const },
    { key: 'refresh', icon: <ReloadOutlined />, label: '刷新', onClick: () => void load() },
    { type: 'divider' as const },
    { key: 'empty', icon: <DeleteOutlined />, label: '清空废纸篓', danger: true, disabled: total === 0, onClick: () => void handleEmpty() },
  ], [allRowIds, total, load, handleEmpty]);

  // ── 键盘快捷键 ──

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd/Ctrl + A：全选
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        // 只在没有输入框聚焦时响应
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
        e.preventDefault();
        dispatchSelection({ type: 'selectAll', ids: allRowIds });
        return;
      }
      // Delete / Backspace：放回原处
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedItems.length > 0) {
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
        e.preventDefault();
        void handleBatchRestore();
        return;
      }
      // Shift + Delete：彻底删除
      if (e.shiftKey && (e.key === 'Delete' || e.key === 'Backspace') && selectedItems.length > 0) {
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
        e.preventDefault();
        void handleBatchPurge();
        return;
      }
      // Escape：清空选中
      if (e.key === 'Escape') {
        dispatchSelection({ type: 'clear' });
        setFocusedId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [allRowIds, selectedItems, handleBatchRestore, handleBatchPurge]);

  return (
    <>
      <div className="fs-pathbar">
        <div className="fs-pathbar-title">
          <RestOutlined style={{ marginRight: 6, color: 'var(--tool-accent)' }} />
          废纸篓
          {total > 0 && <span className="fs-pathbar-count">{total}</span>}
        </div>
        <div className="fs-pathbar-right">
          <button type="button" className="fs-trash-top-btn" onClick={load} disabled={loading}>
            <ReloadOutlined spin={loading} />
            <span>刷新</span>
          </button>
          {total > 0 && (
            <Popconfirm
              title="清空废纸篓"
              description={`将彻底删除全部 ${total} 项，无法恢复。确定继续吗？`}
              okText="全部彻底删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={handleEmpty}
            >
              <button
                type="button"
                className={`fs-trash-top-btn fs-trash-top-btn--danger${emptying ? ' is-busy' : ''}`}
                disabled={emptying}
              >
                <DeleteOutlined />
                <span>清空</span>
              </button>
            </Popconfirm>
          )}
        </div>
      </div>

      <Dropdown
        menu={{ items: blankMenuItems }}
        trigger={['contextMenu']}
        open={blankMenuOpen}
        onOpenChange={setBlankMenuOpen}
      >
        <div className="fs-list-area" ref={listAreaRef} onClick={handleBlankClick} onContextMenu={handleBlankContextMenu}>
          {loading && !data ? (
            <div className="fs-trash-loading"><Spin /></div>
          ) : total === 0 ? (
            <div className="fs-shared-empty">
              <div className="fs-shared-empty-icon"><RestOutlined /></div>
              <div className="fs-shared-empty-title">废纸篓是空的</div>
              <div className="fs-shared-empty-desc">删除的文件和文件夹会先移到这里，保留 30 天后自动清除</div>
            </div>
          ) : (
            <>
              {/* 橡皮筋框选选框 */}
              {marqueeRect && (
                <div
                  className="fs-rubber-band"
                  style={{
                    left: marqueeRect.left,
                    top: marqueeRect.top,
                    width: marqueeRect.width,
                    height: marqueeRect.height,
                  }}
                />
              )}
              <div className="fs-grid">
                {dirs.map(item => {
                  const id = trashItemId(item);
                  return (
                    <TrashCard
                      key={id}
                      item={item}
                      itemId={id}
                      isSelected={selection.selectedIds.has(id)}
                      isFocused={focusedId === id}
                      operating={operatingKey === id}
                      onRestore={() => void handleRestore(item)}
                      onPurge={() => void handlePurge(item)}
                      onItemClick={(e) => handleItemClick(e, id)}
                      contextMenu={cardMenu(item)}
                    />
                  );
                })}
                {files.map(item => {
                  const id = trashItemId(item);
                  return (
                    <TrashCard
                      key={id}
                      item={item}
                      itemId={id}
                      isSelected={selection.selectedIds.has(id)}
                      isFocused={focusedId === id}
                      operating={operatingKey === id}
                      onRestore={() => void handleRestore(item)}
                      onPurge={() => void handlePurge(item)}
                      onItemClick={(e) => handleItemClick(e, id)}
                      contextMenu={cardMenu(item)}
                    />
                  );
                })}
              </div>

              {/* 选中状态条 */}
              {selection.selectedIds.size > 0 && (
                <div className="fs-selection-bar">
                  已选中 {selection.selectedIds.size} 个项目
                  <span className="fs-selection-bar-actions">
                    <button type="button" className="fs-sel-btn fs-sel-btn--restore" onClick={() => void handleBatchRestore()}>
                      <RollbackOutlined />放回原处
                    </button>
                    <Popconfirm
                      title={`彻底删除 ${selection.selectedIds.size} 项`}
                      description="将立即从服务器删除，无法恢复。"
                      okText="彻底删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                      onConfirm={handleBatchPurge}
                    >
                      <button type="button" className="fs-sel-btn fs-sel-btn--purge">
                        <DeleteOutlined />彻底删除
                      </button>
                    </Popconfirm>
                  </span>
                </div>
              )}

              <div className="fs-trash-footnote">
                废纸篓中的项目保留 30 天，超期自动彻底删除；保留期间计入存储配额。
              </div>
            </>
          )}
        </div>
      </Dropdown>
    </>
  );
};
