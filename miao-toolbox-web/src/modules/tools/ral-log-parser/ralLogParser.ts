/**
 * RAL 日志解析器 — 从 RAL 框架产出的结构化日志中解析核心指标
 *
 * 纯前端解析，无服务端交互。支持 E_SUM 和 E_TALK 两种日志类型。
 */

/* ---------- 类型定义 ---------- */

/** RAL 日志类型 */
export type RalLogType = 'E_SUM' | 'E_TALK';

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
  /** 协议返回码 */
  protCode: number;
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
  /** 重试次数 */
  retry: number;
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
  checkProtCode: true,
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
  const regex = /(\w+)=(?:"([^"]*)"|(\S+))/g;
  let match;
  while ((match = regex.exec(line)) !== null) {
    const key = match[1];
    const value = match[2] !== undefined ? match[2] : match[3];
    fields[key] = value;
  }

  return fields;
}

/** 提取时间戳：行首的 [timestamp] 或 YYYY-MM-DD HH:mm:ss 格式 */
function extractTimestamp(line: string): string {
  // 匹配 [2026-08-01 10:00:01.123] 或 2026-08-01 10:00:01.123
  const tsMatch = line.match(/\[?(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)\]?/);
  return tsMatch ? tsMatch[1] : '';
}

/** 提取日志级别 */
function extractLogLevel(line: string): string {
  const levelMatch = line.match(/\b(INFO|WARNING|WARN|ERROR|DEBUG|NOTICE|TRACE)\b/i);
  if (!levelMatch) return '';
  const level = levelMatch[1].toUpperCase();
  return level === 'WARN' ? 'WARNING' : level;
}

/** 安全解析数字 */
function parseNum(val: string | undefined, defaultVal = 0): number {
  if (val === undefined || val === '') return defaultVal;
  const n = parseInt(val, 10);
  return isNaN(n) ? defaultVal : n;
}

/* ---------- RAL 日志行识别 ---------- */

/**
 * 判断一行日志是否为 RAL 日志行
 * 识别规则：行中包含 log_type=E_SUM 或 log_type=E_TALK 且包含 caller=RAL
 */
export function isRalLogLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  const hasLogType = /log_type=E_(SUM|TALK)\b/.test(trimmed);
  const hasCaller = /caller=RAL\b/.test(trimmed);
  return hasLogType && hasCaller;
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
      const logType = (fields.log_type as RalLogType) || 'E_SUM';

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
        protCode: parseNum(fields.prot_code),
        remoteIp: fields.remote_ip || '',
        rtimeout: parseNum(fields.rtimeout),
        localIp: fields.local_ip || '',
        reqLen: parseNum(fields.req_len),
        resLen: parseNum(fields.res_len),
        retry: parseNum(fields.retry),
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
        protCode: 0,
        remoteIp: '',
        rtimeout: 0,
        localIp: '',
        reqLen: 0,
        resLen: 0,
        retry: 0,
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

export const SAMPLE_RAL_LOG = `[2026-08-01 10:00:01.123] WARNING log_type=E_SUM caller=RAL service=ris-variable method=POST uri=/api/variable/get cost=6002 connect=3 talk=6000 read=5998 write=1 pack=0 unpack=1 err_no=8 curl_code=28 prot_code=0 remote_ip=10.0.1.100 rtimeout=2000 local_ip=10.0.0.5 req_len=256 res_len=0 retry=0
[2026-08-01 10:00:01.456] INFO log_type=E_SUM caller=RAL service=pay-core method=POST uri=/api/pay/create cost=45 connect=2 talk=42 read=38 write=3 pack=1 unpack=1 err_no=0 curl_code=0 prot_code=200 remote_ip=10.0.2.50 rtimeout=3000 local_ip=10.0.0.5 req_len=512 res_len=1024 retry=0
[2026-08-01 10:00:02.789] WARNING log_type=E_SUM caller=RAL service=pay-core method=POST uri=/api/pay/query cost=3502 connect=5 talk=3490 read=3480 write=8 pack=2 unpack=5 err_no=0 curl_code=0 prot_code=200 remote_ip=10.0.2.50 rtimeout=3000 local_ip=10.0.0.5 req_len=128 res_len=2048 retry=1
[2026-08-01 10:00:03.012] INFO log_type=E_SUM caller=RAL service=user-center method=GET uri=/api/user/info cost=12 connect=1 talk=10 read=8 write=1 pack=0 unpack=1 err_no=0 curl_code=0 prot_code=200 remote_ip=10.0.3.20 rtimeout=5000 local_ip=10.0.0.5 req_len=64 res_len=512 retry=0
[2026-08-01 10:00:03.345] ERROR log_type=E_SUM caller=RAL service=risk-control method=POST uri=/api/risk/check cost=50 connect=3 talk=45 read=40 write=4 pack=1 unpack=1 err_no=1001 curl_code=0 prot_code=503 remote_ip=10.0.4.10 rtimeout=1000 local_ip=10.0.0.5 req_len=256 res_len=128 retry=0
[2026-08-01 10:00:04.567] INFO log_type=E_SUM caller=RAL service=pay-core method=POST uri=/api/pay/create cost=38 connect=2 talk=35 read=30 write=3 pack=1 unpack=1 err_no=0 curl_code=0 prot_code=200 remote_ip=10.0.2.50 rtimeout=3000 local_ip=10.0.0.5 req_len=512 res_len=1024 retry=0`;
