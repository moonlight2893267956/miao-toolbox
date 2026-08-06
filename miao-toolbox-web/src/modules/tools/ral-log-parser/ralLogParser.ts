/**
 * RAL 日志解析器 — 从 RAL 框架产出的结构化日志中解析核心指标
 *
 * 纯前端解析，无服务端交互。支持 E_SUM 和 E_TALK 两种日志类型。
 */

/* ---------- 类型定义 ---------- */

/** RAL 日志类型 */
export type RalLogType = 'E_SUM' | 'E_TALK' | 'RAL_OTHER';

/** 单条 RAL 调用的核心指标 */
export interface RalCallRecord {
  /** 序号（解析后赋值） */
  index: number;
  /** 日志时间戳 */
  timestamp: string;
  /** 日志级别 */
  logLevel: string;
  /** 日志类型 E_SUM / E_TALK */
  logType: RalLogType;
  /** 服务名 */
  service: string;
  /** 请求方法 */
  method: string;
  /** 请求 URI */
  uri: string;
  /** 总耗时 ms */
  cost: number;
  /** 连接耗时 ms */
  connect: number;
  /** 通信耗时 ms */
  talk: number;
  /** 读耗时 ms */
  read: number;
  /** 写耗时 ms */
  write: number;
  /** 打包耗时 ms */
  pack: number;
  /** 解包耗时 ms */
  unpack: number;
  /** 错误码 */
  errNo: number;
  /** curl 错误码 */
  curlCode: number;
  /** curl 错误描述（URL 解码后） */
  curlErrmsg: string;
  /** 协议返回码 */
  protCode: number;
  /** 错误信息 */
  errInfo: string;
  /** 远端 IP */
  remoteIp: string;
  /** 读超时配置 ms */
  rtimeout: number;
  /** 本地 IP */
  localIp: string;
  /** 请求长度 */
  reqLen: number;
  /** 响应长度 */
  resLen: number;
  /** 重试信息（原始格式如 0/2） */
  retry: string;
  /** 是否为异常调用 */
  isAbnormal: boolean;
  /** 异常原因列表 */
  abnormalReasons: string[];
  /** 解析是否失败 */
  parseFailed: boolean;
  /** 原始日志行 */
  rawLine: string;
  /** 全量字段（用于悬停展开） */
  allFields: Record<string, string>;
}

/** 解析结果 */
export interface RalParseResult {
  /** 成功解析的记录 */
  records: RalCallRecord[];
  /** 解析失败的行数 */
  failedCount: number;
  /** 总 RAL 行数（含失败） */
  totalRalLines: number;
  /** 异常数 */
  abnormalCount: number;
}

/* ---------- 异常判定配置 ---------- */

/** 异常判定规则配置 — 每个 tab 独立持有 */
export interface RalAnomalyConfig {
  /** 是否启用：日志级别为 WARNING/ERROR 时标记异常 */
  checkLogLevel: boolean;
  /** 是否启用：err_no !== 0 时标记异常 */
  checkErrNo: boolean;
  /** 是否启用：curl_code !== 0 时标记异常 */
  checkCurlCode: boolean;
  /** 是否启用：prot_code === 0 或 >= 500 时标记异常 */
  checkProtCode: boolean;
  /** 是否启用：cost > rtimeout 时标记异常 */
  checkCostOverRtimeout: boolean;
  /** 是否启用：cost 超过阈值时标记异常 */
  checkCostThreshold: boolean;
  /** cost 阈值（ms），超过则标记异常 */
  costThreshold: number;
  /** 是否启用：connect 超过阈值时标记异常 */
  checkConnectThreshold: boolean;
  /** connect 阈值（ms） */
  connectThreshold: number;
  /** 是否启用：read 超过阈值时标记异常 */
  checkReadThreshold: boolean;
  /** read 阈值（ms） */
  readThreshold: number;
}

/** 默认异常配置 */
export const DEFAULT_ANOMALY_CONFIG: RalAnomalyConfig = {
  checkLogLevel: true,
  checkErrNo: true,
  checkCurlCode: true,
  checkProtCode: false,
  checkCostOverRtimeout: true,
  checkCostThreshold: false,
  costThreshold: 3000,
  checkConnectThreshold: false,
  connectThreshold: 100,
  checkReadThreshold: false,
  readThreshold: 1000,
};

/* ---------- 异常判定 ---------- */

function checkAbnormal(
  rec: Partial<RalCallRecord>,
  config: RalAnomalyConfig,
): { isAbnormal: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (config.checkLogLevel && (rec.logLevel === 'WARNING' || rec.logLevel === 'ERROR')) {
    reasons.push(`日志级别 ${rec.logLevel}`);
  }
  if (config.checkErrNo && rec.errNo !== undefined && rec.errNo !== 0) {
    reasons.push(`err_no=${rec.errNo}`);
  }
  if (config.checkCurlCode && rec.curlCode !== undefined && rec.curlCode !== 0) {
    reasons.push(`curl_code=${rec.curlCode}`);
  }
  if (config.checkProtCode && rec.protCode !== undefined && (rec.protCode === 0 || rec.protCode >= 500)) {
    reasons.push(`prot_code=${rec.protCode}`);
  }
  if (config.checkCostOverRtimeout && rec.cost !== undefined && rec.rtimeout !== undefined && rec.rtimeout > 0 && rec.cost > rec.rtimeout) {
    reasons.push(`cost=${rec.cost}ms 超过 rtimeout=${rec.rtimeout}ms`);
  }
  if (config.checkCostThreshold && rec.cost !== undefined && rec.cost > config.costThreshold) {
    reasons.push(`cost=${rec.cost}ms 超过阈值 ${config.costThreshold}ms`);
  }
  if (config.checkConnectThreshold && rec.connect !== undefined && rec.connect > config.connectThreshold) {
    reasons.push(`connect=${rec.connect}ms 超过阈值 ${config.connectThreshold}ms`);
  }
  if (config.checkReadThreshold && rec.read !== undefined && rec.read > config.readThreshold) {
    reasons.push(`read=${rec.read}ms 超过阈值 ${config.readThreshold}ms`);
  }

  return { isAbnormal: reasons.length > 0, reasons };
}

/* ---------- 字段提取 ---------- */

/** 从 key=value 格式的日志行中提取所有字段 */
function extractFields(line: string): Record<string, string> {
  const fields: Record<string, string> = {};

  // RAL 日志格式：key1=value1 key2=value2 ...
  // 值可能包含空格（如 URI），所以用更精细的匹配
  // 匹配模式：word=非空格序列 或 word="带引号的值"
  // 注意：值里不应包含日志行结尾的 `]`，所以排除它
  const regex = /(\w+)=(?:"([^"]*)"|(\S+?))(?=\s|$|\])/g;
  let match;
  while ((match = regex.exec(line)) !== null) {
    const key = match[1];
    const value = match[2] !== undefined ? match[2] : match[3];
    fields[key] = value;
  }

  return fields;
}

/** 安全地 URL 解码（容错处理） */
function safeDecode(s: string): string {
  if (!s) return s;
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s.replace(/\+/g, ' ');
  }
}

/** 提取时间戳：支持多种 RAL 日志时间格式 */
function extractTimestamp(line: string): string {
  // 格式1: [2026-08-01 10:00:01.123] 或 2026-08-01 10:00:01.123（带年份）
  const fullMatch = line.match(/\[?(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)\]?/);
  if (fullMatch) return fullMatch[1];

  // 格式2: NOTICE: 07-31 17:36:48: 或 07-31 17:36:48（无年份，MM-DD HH:mm:ss）
  const shortMatch = line.match(/(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
  if (shortMatch) {
    const year = new Date().getFullYear();
    return `${year}-${shortMatch[1]}`;
  }

  return '';
}

/** 提取日志级别 */
function extractLogLevel(line: string): string {
  const levelMatch = line.match(/\b(INFO|WARNING|WARN|ERROR|DEBUG|NOTICE|TRACE)\b/i);
  if (!levelMatch) return '';
  const level = levelMatch[1].toUpperCase();
  return level === 'WARN' ? 'WARNING' : level;
}

/** 安全解析数字（支持小数，如 cost=2.643） */
function parseNum(val: string | undefined, defaultVal = 0): number {
  if (val === undefined || val === '') return defaultVal;
  const n = parseFloat(val);
  return isNaN(n) ? defaultVal : n;
}

/** 根据日志来源推断日志类型（无 log_type 字段时使用） */
function inferLogType(): RalLogType {
  // 无 log_type 的 RAL 中间阶段日志（balance.cpp / rpc.cpp / http.cpp 等）
  return 'RAL_OTHER';
}

/* ---------- RAL 日志行识别 ---------- */

/**
 * 判断一行日志是否为 RAL 日志行
 * 识别规则（宽松匹配）：
 * 1. 包含 caller=RAL 且包含 log_type=E_SUM/E_TALK（标准 E_SUM/E_TALK 行）
 * 2. 包含 caller=RAL 且包含 service= 字段（balance/rpc/http 等中间阶段日志，无 log_type）
 */
export function isRalLogLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  const hasCaller = /caller=RAL\b/.test(trimmed);
  if (!hasCaller) return false;
  const hasLogType = /log_type=E_(SUM|TALK)\b/.test(trimmed);
  if (hasLogType) return true;
  // 无 log_type 但有 service= 的 RAL 中间阶段日志（balance.cpp / rpc.cpp / http.cpp 等）
  return /\bservice=\S+/.test(trimmed);
}

/* ---------- 主解析函数 ---------- */

export function parseRalLog(text: string, config: RalAnomalyConfig = DEFAULT_ANOMALY_CONFIG): RalParseResult {
  const lines = text.split('\n');
  const records: RalCallRecord[] = [];
  let failedCount = 0;
  let totalRalLines = 0;
  let index = 0;

  for (const line of lines) {
    if (!isRalLogLine(line)) continue;
    totalRalLines++;

    try {
      const fields = extractFields(line);
      const timestamp = extractTimestamp(line);
      const logLevel = extractLogLevel(line);
      const logType = (fields.log_type as RalLogType) || inferLogType();

      const rec: Partial<RalCallRecord> = {
        timestamp,
        logLevel,
        logType,
        service: fields.service || '',
        method: fields.method || '',
        uri: fields.uri || '',
        cost: parseNum(fields.cost),
        connect: parseNum(fields.connect),
        talk: parseNum(fields.talk),
        read: parseNum(fields.read),
        write: parseNum(fields.write),
        pack: parseNum(fields.pack),
        unpack: parseNum(fields.unpack),
        errNo: parseNum(fields.err_no),
        curlCode: parseNum(fields.curl_code),
        curlErrmsg: safeDecode(fields.curl_errmsg || ''),
        protCode: parseNum(fields.prot_code),
        errInfo: safeDecode(fields.err_info || ''),
        remoteIp: fields.remote_ip || '',
        rtimeout: parseNum(fields.rtimeout),
        localIp: fields.local_ip || '',
        reqLen: parseNum(fields.req_len),
        resLen: parseNum(fields.res_len),
        retry: fields.retry || '',
        rawLine: line.trim(),
        allFields: fields,
        parseFailed: false,
      };

      const { isAbnormal, reasons } = checkAbnormal(rec, config);
      rec.isAbnormal = isAbnormal;
      rec.abnormalReasons = reasons;

      // 基本校验：至少有 service 或 cost 字段
      if (!rec.service && rec.cost === 0 && !rec.uri) {
        failedCount++;
        rec.parseFailed = true;
      }

      index++;
      rec.index = index;
      records.push(rec as RalCallRecord);
    } catch {
      failedCount++;
      index++;
      records.push({
        index,
        timestamp: '',
        logLevel: '',
        logType: 'E_SUM',
        service: '',
        method: '',
        uri: '',
        cost: 0,
        connect: 0,
        talk: 0,
        read: 0,
        write: 0,
        pack: 0,
        unpack: 0,
        errNo: 0,
        curlCode: 0,
        curlErrmsg: '',
        protCode: 0,
        errInfo: '',
        remoteIp: '',
        rtimeout: 0,
        localIp: '',
        reqLen: 0,
        resLen: 0,
        retry: '',
        isAbnormal: false,
        abnormalReasons: [],
        parseFailed: true,
        rawLine: line.trim(),
        allFields: {},
      } as RalCallRecord);
    }
  }

  const abnormalCount = records.filter(r => r.isAbnormal).length;

  return {
    records,
    failedCount,
    totalRalLines,
    abnormalCount,
  };
}

/* ---------- 示例日志 ---------- */

export const SAMPLE_RAL_LOG = `NOTICE: 07-31 17:36:48:  ral-worker * 50445 [/home/work/ral/rpc.cpp:385][logid=3208470061 log_type=E_SUM caller=RAL service=feature_genmap method=get cost=2.643 talk=2.577 connect=0.730 write=0.022 read=1.821 pack=0.025 unpack=0.022 err_no=0 prot_code=0 remote_ip=10.106.70.5:5000 rtimeout=2000 local_ip=10.107.71.81 req_len=278 res_len=391 retry=0]
NOTICE: 07-31 17:36:48:  ral-worker * 50445 [/home/work/ral/rpc.cpp:385][logid=3208470061 log_type=E_SUM caller=RAL service=payserverquery method=query_receive_info cost=8.371 talk=8.306 connect=0.722 write=0.015 read=7.566 pack=0.016 unpack=0.035 err_no=0 prot_code=0 remote_ip=10.106.70.5:8004 rtimeout=2000 local_ip=10.107.71.81 req_len=332 res_len=1985 retry=0]
NOTICE: 07-31 17:36:48:  ral-worker * 50445 [/home/work/ral/rpc.cpp:385][logid=3208470061 log_type=E_SUM caller=RAL service=dxm-session method=POST conv=string prot=http cost=24.757 talk=24.745 connect=1.490 write=0.000 read=24.725 pack=0.001 unpack=0.001 err_no=0 curl_code=0 prot_code=200 remote_ip=30.32.0.70:8033 rtimeout=2000 local_ip=10.107.71.81 uri=/api/session req_len=591 res_len=626 retry=0]
WARNING: 07-31 17:36:49:  ral-worker * 50445 [/home/work/ral/rpc.cpp:385][logid=3208470062 log_type=E_SUM caller=RAL service=usercenter method=POST conv=string prot=http cost=3024.5 talk=3018.2 connect=1.2 write=0.0 read=3016.8 pack=0.1 unpack=0.1 err_no=0 curl_code=0 prot_code=200 remote_ip=10.106.70.5:8212 rtimeout=2000 local_ip=10.107.71.81 uri=/usercenter/format/user req_len=153 res_len=121 retry=0]
ERROR: 07-31 17:36:50:  ral-worker * 50445 [/home/work/ral/rpc.cpp:385][logid=3208470063 log_type=E_SUM caller=RAL service=risk-control method=POST conv=string prot=http cost=50.3 talk=45.1 connect=3.0 write=0.4 read=40.2 pack=1.0 unpack=1.0 err_no=1001 curl_code=0 prot_code=503 remote_ip=10.106.70.5:8215 rtimeout=1000 local_ip=10.107.71.81 uri=/api/risk/check req_len=256 res_len=128 retry=0]
NOTICE: 07-31 17:36:50:  ral-worker * 50445 [/home/work/ral/rpc.cpp:385][logid=3208470064 log_type=E_SUM caller=RAL service=payapi method=POST conv=form prot=http cost=7.627 talk=7.611 connect=0.677 write=0.000 read=7.606 pack=0.005 unpack=0.000 err_no=0 curl_code=0 prot_code=200 remote_ip=10.106.70.5:8211 rtimeout=5000 local_ip=10.107.71.81 uri=/payapi/discountserver/marketwords req_len=113 res_len=84 retry=0]`;
