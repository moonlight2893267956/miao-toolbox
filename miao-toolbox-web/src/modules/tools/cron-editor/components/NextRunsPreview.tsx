// Cron 执行时间预览（Story 1.4 / FR-13 下 N 次 / FR-14 空结果 / FR-15 时区）
// 仅在校验通过时展示；未来 1 年内无匹配显示提示。
import React, { useMemo, useState } from 'react';
import { CalendarOutlined, GlobalOutlined } from '@ant-design/icons';
import { Select, Typography } from 'antd';
import { useCronContext } from '../useCronContext';
import { nextRuns } from '../utils/cronNextRuns';

const { Text } = Typography;

/** 浏览器支持的时区列表（降级到常用子集） */
function getTimeZones(): string[] {
  const common = [
    'Asia/Shanghai',
    'Asia/Tokyo',
    'Asia/Singapore',
    'Asia/Kolkata',
    'Europe/London',
    'Europe/Paris',
    'Europe/Moscow',
    'America/New_York',
    'America/Chicago',
    'America/Los_Angeles',
    'UTC',
  ];
  try {
    const all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.(
      'timeZone',
    );
    if (all && all.length > 0) return all;
  } catch {
    /* 忽略，使用降级列表 */
  }
  return common;
}

function formatRun(date: Date, tz: string): string {
  const fmt = new Intl.DateTimeFormat('zh-CN', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(date).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const wd = (() => {
    const w = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' })
      .formatToParts(date)
      .find((p) => p.type === 'weekday')?.value;
    return { Sun: '周日', Mon: '周一', Tue: '周二', Wed: '周三', Thu: '周四', Fri: '周五', Sat: '周六' }[w ?? ''] ?? '';
  })();
  return `${parts.year}-${parts.month}-${parts.day}（${wd}） ${parts.hour}:${parts.minute}:${parts.second}`;
}

/** 同一时刻在 UTC 下的显示（用于直观展示「切换时区 → 绝对时刻变化」） */
function formatUtc(date: Date): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const p = fmt.formatToParts(date).reduce<Record<string, string>>((a, x) => {
    a[x.type] = x.value;
    return a;
  }, {});
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/** 取某时区相对 UTC 的偏移分钟数（含 DST，以 ref 为参照） */
function getTzOffsetMinutes(tz: string, ref: Date = new Date()): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(ref).reduce<Record<string, string>>((a, p) => {
    a[p.type] = p.value;
    return a;
  }, {});
  const hour = parts.hour === '24' ? 0 : parseInt(parts.hour, 10);
  const asUTC = Date.UTC(
    parseInt(parts.year, 10),
    parseInt(parts.month, 10) - 1,
    parseInt(parts.day, 10),
    hour,
    parseInt(parts.minute, 10),
    parseInt(parts.second, 10),
  );
  return Math.round((asUTC - ref.getTime()) / 60000);
}

/** UTC 偏移格式化：+8 / -4 / +5:30 / -9:30 */
function formatOffset(min: number): string {
  const sign = min >= 0 ? '+' : '-';
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
}

/** 常见时区中文名（覆盖用户最可能选的区域；未列出的回退英文城市名） */
const TZ_CN: Record<string, string> = {
  UTC: '协调世界时',
  'Asia/Shanghai': '中国·上海',
  'Asia/Hong_Kong': '中国·香港',
  'Asia/Taipei': '中国·台北',
  'Asia/Macau': '中国·澳门',
  'Asia/Tokyo': '日本·东京',
  'Asia/Seoul': '韩国·首尔',
  'Asia/Singapore': '新加坡',
  'Asia/Kolkata': '印度·加尔各答',
  'Asia/Bangkok': '泰国·曼谷',
  'Asia/Dubai': '阿联酋·迪拜',
  'Asia/Jakarta': '印尼·雅加达',
  'Europe/London': '英国·伦敦',
  'Europe/Paris': '法国·巴黎',
  'Europe/Berlin': '德国·柏林',
  'Europe/Moscow': '俄罗斯·莫斯科',
  'America/New_York': '美国·纽约',
  'America/Chicago': '美国·芝加哥',
  'America/Denver': '美国·丹佛',
  'America/Los_Angeles': '美国·洛杉矶',
  'America/Sao_Paulo': '巴西·圣保罗',
  'Australia/Sydney': '澳大利亚·悉尼',
  'Pacific/Auckland': '新西兰·奥克兰',
};

/** 下拉项 / 选中态显示：「中国·上海 (UTC+8)」；无中文映射时回退英文城市名 */
function tzCnLabel(tz: string, ref?: Date): string {
  const cn = TZ_CN[tz];
  const city = cn ?? tz.split('/').pop()?.replace(/_/g, ' ') ?? tz;
  return `${city} (${formatOffset(getTzOffsetMinutes(tz, ref))})`;
}

/** 搜索：匹配英文名（如 Asia/Shanghai）或中文名（如 上海） */
function filterTz(input: string, option?: { value: string; label?: unknown }): boolean {
  if (!option) return false;
  const kw = input.trim().toLowerCase();
  if (!kw) return true;
  const cn = TZ_CN[option.value]?.toLowerCase() ?? '';
  const labelTxt = typeof option.label === 'string' ? option.label.toLowerCase() : '';
  return option.value.toLowerCase().includes(kw) || labelTxt.includes(kw) || cn.includes(kw);
}

const NextRunsPreview: React.FC = () => {
  const { state, validation } = useCronContext();
  const { expression, dialect } = state;

  const [tz, setTz] = useState<string>(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
  );
  const timeZones = useMemo(() => getTimeZones(), []);
  const tzOptions = useMemo(
    () => timeZones.map((z) => ({ value: z, label: tzCnLabel(z) })),
    [timeZones],
  );

  const runs = useMemo(() => {
    if (!validation.valid || expression.trim() === '') return null;
    return nextRuns(expression, dialect, tz, 10);
  }, [expression, dialect, tz, validation.valid]);

  if (runs === null) return null;

  const offsetText = formatOffset(getTzOffsetMinutes(tz));

  return (
    <div className="ce-next-runs" aria-label="执行时间预览">
      <div className="ce-next-runs-head">
        <span className="ce-next-runs-title">
          <CalendarOutlined /> 未来执行时间
        </span>
        <span className="ce-tz-select" title="时区">
          <GlobalOutlined />
          <Select
            size="small"
            value={tz}
            onChange={setTz}
            options={tzOptions}
            showSearch
            filterOption={filterTz}
            virtual={false}
            popupMatchSelectWidth={false}
            listHeight={280}
            popupClassName="ce-tz-popup"
          />
        </span>
      </div>

      {runs.length === 0 ? (
        <div className="ce-next-runs-empty">
          <Text type="secondary">该表达式在未来 1 年内无执行时间</Text>
        </div>
      ) : (
        <ol className="ce-runs-list">
          {runs.map((r, i) => (
            <li key={i} className="ce-run-item">
              <span className="ce-run-index">{i + 1}</span>
              <span className="ce-run-body">
                <span className="ce-run-time">
                  {formatRun(r, tz)}
                  <span className="ce-run-offset">{offsetText}</span>
                </span>
                <span className="ce-run-utc">UTC {formatUtc(r)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

export default NextRunsPreview;
