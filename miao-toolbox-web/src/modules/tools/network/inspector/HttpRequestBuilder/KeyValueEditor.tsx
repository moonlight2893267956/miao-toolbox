import { Button, Input, Switch, Tooltip } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';

export interface KeyValueRow {
  id: string;
  key: string;
  value: string;
  enabled?: boolean;
}

interface KeyValueChip {
  label: string;
  key: string;
  value: string;
}

interface Props {
  rows: KeyValueRow[];
  onChange: (rows: KeyValueRow[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  showEnabled?: boolean;
  chips?: KeyValueChip[];
  emptyHint?: string;
}

let idCounter = 0;
const makeId = () => {
  idCounter += 1;
  return `kv_${idCounter}`;
};

export default function KeyValueEditor({
  rows,
  onChange,
  keyPlaceholder = '名称',
  valuePlaceholder = '值',
  showEnabled = false,
  chips,
  emptyHint,
}: Props) {
  const updateRow = (id: string, patch: Partial<KeyValueRow>) => {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const addRow = (key = '', value = '', enabled = true) => {
    onChange([...rows, { id: makeId(), key, value, enabled }]);
  };

  const removeRow = (id: string) => {
    if (rows.length === 1) {
      onChange([{ ...rows[0], key: '', value: '', enabled: true }]);
      return;
    }
    onChange(rows.filter((r) => r.id !== id));
  };

  const activeCount = rows.filter((r) => r.key.trim() && r.enabled !== false).length;

  return (
    <div
      className={`hrb-kv-editor ${showEnabled ? 'hrb-kv-editor--with-enabled' : 'hrb-kv-editor--no-enabled'}`}
    >
      {chips && chips.length > 0 && (
        <div className="hrb-kv-chips">
          <span className="hrb-kv-chips-label">快速添加</span>
          <div className="hrb-kv-chips-list">
            {chips.map((chip) => (
              <button
                key={chip.label}
                type="button"
                className="hrb-kv-chip"
                onClick={() => addRow(chip.key, chip.value)}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="hrb-kv-rows">
        <div className="hrb-kv-row hrb-kv-row--head">
          {showEnabled && <span className="hrb-kv-col hrb-kv-col--enabled" />}
          <span className="hrb-kv-col hrb-kv-col--key">{keyPlaceholder}</span>
          <span className="hrb-kv-col hrb-kv-col--value">{valuePlaceholder}</span>
          <span className="hrb-kv-col hrb-kv-col--action" />
        </div>

        {rows.map((row) => {
          const disabled = row.enabled === false;
          return (
            <div
              key={row.id}
              className={`hrb-kv-row ${disabled ? 'hrb-kv-row--disabled' : ''}`}
            >
              {showEnabled && (
                <div className="hrb-kv-col hrb-kv-col--enabled">
                  <Tooltip title={disabled ? '已禁用' : '启用中'}>
                    <Switch
                      size="small"
                      checked={row.enabled !== false}
                      onChange={(checked) => updateRow(row.id, { enabled: checked })}
                    />
                  </Tooltip>
                </div>
              )}
              <div className="hrb-kv-col hrb-kv-col--key">
                <Input
                  value={row.key}
                  onChange={(e) => updateRow(row.id, { key: e.target.value })}
                  placeholder={keyPlaceholder}
                  spellCheck={false}
                  disabled={disabled}
                />
              </div>
              <div className="hrb-kv-col hrb-kv-col--value">
                <Input
                  value={row.value}
                  onChange={(e) => updateRow(row.id, { value: e.target.value })}
                  placeholder={valuePlaceholder}
                  spellCheck={false}
                  disabled={disabled}
                />
              </div>
              <div className="hrb-kv-col hrb-kv-col--action">
                <Tooltip title="删除">
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => removeRow(row.id)}
                  />
                </Tooltip>
              </div>
            </div>
          );
        })}
      </div>

      <div className="hrb-kv-footer">
        <Button
          type="dashed"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => addRow()}
        >
          添加一行
        </Button>
        {activeCount > 0 && (
          <span className="hrb-kv-count">{activeCount} 项生效</span>
        )}
        {emptyHint && activeCount === 0 && (
          <span className="hrb-kv-empty-hint">{emptyHint}</span>
        )}
      </div>
    </div>
  );
}
