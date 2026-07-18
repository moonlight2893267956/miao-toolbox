// Cron 中文可读翻译（Story 1.4 / FR-12）
// 将解析后的 Cron 表达式翻译为自然语言中文描述。纯函数，无 React 依赖。
// 句式：<日期约束> <星期约束> <时间约束> 执行
//   - 日期约束：月 + 日（如「每年2月31日」「每月1日」）
//   - 星期约束：如「工作日」「周一」「周末」
//   - 时间约束：时 + 分 + 秒（如「9点 每隔5分钟」）
import type { CronDialect, CronField } from '../types';
import { FIELD_DEFS } from '../types';
import { parseExpression } from './cronParser';

/** 取某类型字段（不存在返回 null） */
function fieldOf(fields: CronField[], type: string): CronField | null {
  return fields.find((f) => f.type === type) ?? null;
}

function joinValues(values: number[], unit: string): string {
  if (values.length === 0) return '';
  if (values.length === 1) return `${values[0]}${unit}`;
  // 连续区间显示为 a-b
  const min = values[0];
  const max = values[values.length - 1];
  if (values.length === max - min + 1) return `${min}-${max}${unit}`;
  return values.map((v) => `${v}${unit}`).join('、');
}

function humanizeMonth(f: { values: number[]; special?: string } | null): string {
  if (!f || f.special === '*' || f.special === '?' || f.values.length === 0) return '';
  return joinValues(f.values, '月');
}

function humanizeDay(
  f: { values: number[]; special?: string; specialValue?: number } | null,
): string {
  if (!f) return '';
  if (f.special === '*' || f.special === '?' || f.values.length === 0) return '';
  if (f.special === 'L') return '最后一天';
  if (f.special === 'LW') return '最后一个工作日';
  if (f.special === 'W' && f.specialValue != null) return `${f.specialValue}日最近工作日`;
  if (f.special === 'L' && f.specialValue != null) return `最后一个${f.specialValue}日`;
  return joinValues(f.values, '日');
}

const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const WEEKDAY_SHORT = ['日', '一', '二', '三', '四', '五', '六'];

function humanizeWeekday(
  f: { values: number[]; special?: string; specialValue?: number; nth?: number } | null,
): string {
  if (!f || f.special === '*' || f.special === '?' || f.values.length === 0) return '';
  if (f.special === '#' && f.specialValue != null && f.nth != null) {
    return `${WEEKDAY_CN[f.specialValue] ?? ''}第${f.nth}个`;
  }
  if (f.special === 'L' && f.specialValue != null) {
    return `最后一个${WEEKDAY_CN[f.specialValue] ?? ''}`;
  }
  // 1-5 → 工作日；0,6 → 周末；其余单值/列表
  const set = f.values;
  if (set.length === 5 && set.includes(1) && set.includes(5) && !set.includes(0) && !set.includes(6)) {
    return '工作日';
  }
  if (set.length === 2 && set.includes(0) && set.includes(6)) return '周末';
  if (set.length === 1) return `每周${WEEKDAY_SHORT[set[0]] ?? set[0]}`;
  return set.map((v) => WEEKDAY_CN[v] ?? `${v}`).join('、');
}

/** 小时/分钟/秒的单独中文短语（不含"点/分/秒"后缀的合并逻辑） */
/** 识别「等步长且从 min 覆盖至 max」的值集合（如步长写法 5 展开为 0,5,...,55）→ 每隔N */
function humanizeStep(f: CronField | null, unit: string): string | null {
  if (!f || f.values.length < 2) return null;
  const def = FIELD_DEFS[f.type];
  if (!def) return null;
  const { min, max } = def;
  const step = f.values[1] - f.values[0];
  if (step <= 1) return null;
  if (f.values[0] !== min) return null;
  if (!f.values.every((v, i) => v === min + step * i)) return null;
  if ((max - min + 1) % step !== 0) return null;
  return `每隔${step}${unit}`;
}

function humanizeHour(f: CronField | null): string {
  if (!f || f.special === '*' || f.values.length === 0) return '';
  const stepped = humanizeStep(f, '小时');
  if (stepped) return stepped;
  if (f.values.length === 1) return f.values[0] === 0 ? '零点' : `${f.values[0]}点`;
  if (f.values[0] === 0 && f.values[f.values.length - 1] === 23 && f.values.length === 24) {
    return ''; // 全天
  }
  return `${joinValues(f.values, '点')}`;
}

function humanizeMinute(f: CronField | null): string {
  if (!f) return '';
  if (f.special === '*') return '每分钟';
  const stepped = humanizeStep(f, '分钟');
  if (stepped) return stepped;
  if (f.values.length === 1 && f.values[0] === 0) return '0分'; // 整分（由组装逻辑按需吸收）
  if (f.values.length === 1) return `${f.values[0]}分`;
  return `${joinValues(f.values, '分')}`;
}

function humanizeSecond(f: CronField | null): string {
  if (!f) return '';
  if (f.special === '*') return '';
  const stepped = humanizeStep(f, '秒');
  if (stepped) return stepped;
  if (f.values.length === 1 && f.values[0] === 0) return '';
  if (f.values.length === 1) return `${f.values[0]}秒`;
  return `${joinValues(f.values, '秒')}`;
}

/** 将表达式翻译为中文描述；解析失败返回空串（调用方仅在校验通过时使用） */
export function humanizeCron(expression: string, dialect: CronDialect): string {
  const parsed = parseExpression(expression, dialect);
  if (!parsed.ok) return '';

  const fields = parsed.expr.fields;
  const month = fieldOf(fields, 'month');
  const day = fieldOf(fields, 'day');
  const weekday = fieldOf(fields, 'weekday');
  const hour = fieldOf(fields, 'hour');
  const minute = fieldOf(fields, 'minute');
  const second = fieldOf(fields, 'second');

  // 1) 日期约束（月 + 日）
  const monthText = humanizeMonth(month);
  const dayText = humanizeDay(day);
  let datePart = '';
  if (monthText) {
    datePart = `每年${monthText}`;
    if (dayText) datePart += dayText;
  } else if (dayText) {
    datePart = `每月${dayText}`;
  }

  // 2) 星期约束
  const weekPart = humanizeWeekday(weekday);

  // 3) 时间约束（时 + 分 + 秒）
  const hourText = humanizeHour(hour);
  const minuteText = humanizeMinute(minute);
  const secondText = humanizeSecond(second);

  const timeSegs: string[] = [];
  if (hourText) {
    timeSegs.push(hourText);
    // 整分（0分）在已有小时约束时被吸收（如「零点」已含 :00）
    if (minuteText && minuteText !== '0分') timeSegs.push(minuteText);
    if (secondText) timeSegs.push(secondText);
  } else {
    // 小时通配：整分 → 每小时；否则用分钟描述
    if (minuteText === '0分') timeSegs.push('每小时');
    else if (minuteText) timeSegs.push(minuteText);
    if (secondText) timeSegs.push(secondText);
  }
  let timePart = timeSegs.join(' ');
  if (!timePart) timePart = '每分钟';

  // 组装：
  // - 有日期约束：与星期/时间连续衔接（如「每年2月31日零点」）
  // - 无日期约束：星期作为独立修饰（如「工作日 9点 每隔5分钟」）；纯时间默认「每天」
  let prefix: string;
  if (datePart) {
    prefix = datePart + weekPart;
  } else if (weekPart) {
    prefix = weekPart;
  } else {
    // 无日/星期约束：小时为具体值时默认「每天」；小时通配（每小时）不加
    prefix = hourText ? '每天' : '';
  }

  let sentence: string;
  if (timePart.includes(' ')) {
    // 多时间单元（时+分等）用空格分隔
    sentence = (prefix ? `${prefix} ` : '') + timePart;
  } else {
    // 单个时间词（如「零点」「9点」）紧贴修饰语
    sentence = prefix + timePart;
  }
  return sentence ? `${sentence}执行` : '每分钟执行';
}
