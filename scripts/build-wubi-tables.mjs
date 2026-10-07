#!/usr/bin/env node
/**
 * build-wubi-tables.mjs
 *
 * 从入库快照（scripts/data-sources/wubi86/）离线生成前端 JSON chunk。
 * 默认不联网；若快照不存在则报错退出。
 *
 * 生成物：
 *   miao-toolbox-web/src/modules/tools/wubi-tutor/data/generated/chars.json
 *   miao-toolbox-web/src/modules/tools/wubi-tutor/data/generated/phrases.json
 *
 * 生成物格式：
 *   chars.json:   { v: '86-1', source: '...', entries: [["啊","kbsk",0], ...] }
 *                 三元组 [字, 全码, 简码等级]（0=无 1/2/3=一/二/三级简码）
 *   phrases.json: { v: '86-1', source: '...', entries: [["中国","khlg"], ...] }
 *
 * 用法：
 *   node scripts/build-wubi-tables.mjs           # 从快照生成
 *   node scripts/build-wubi-tables.mjs --sample   # 生成少量样本数据（开发调试用）
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { gzipSync } from 'zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const SNAPSHOT_DIR = join(ROOT, 'scripts/data-sources/wubi86');
const CHARS_TSV = join(SNAPSHOT_DIR, 'wubi86.chars.tsv');
const PHRASES_TSV = join(SNAPSHOT_DIR, 'wubi86.phrases.tsv');

const OUTPUT_DIR = join(ROOT, 'miao-toolbox-web/src/modules/tools/wubi-tutor/data/generated');
const CHARS_JSON = join(OUTPUT_DIR, 'chars.json');
/**
 * 词组按长度拆分为独立 chunk，文件名由长度档决定。
 * `4plus` = 4 字及以上（四字成语与多字词，量小）。
 */
const PHRASE_BUCKETS = ['2', '3', '4plus'];
const phraseChunkPath = (bucket) => join(OUTPUT_DIR, `phrases-${bucket}.json`);

const VERSION = '86-1';
const SOURCE_NAME = 'rime-wubi (GPL-3.0)';

/**
 * 体积预算控制的裁剪上限。
 *
 * 上游 RIME 码表含 7 万+ 字（覆盖全部 CJK 扩展），但练习场景只需常用字。
 * 按「简码字优先 + 词频降序」裁剪，使 gzip 体积落入预算：
 * - 单字：13000 条 ≈ 96 KB gzip（预算 ≤ 100 KB）
 * - 词组：35000 条 ≈ 261 KB gzip（预算 ≤ 300 KB）
 */
/** 单字表条数上限（还需同时满足下面的 gzip 预算） */
const CHARS_MAX_ENTRIES = 13000;

/** 单字表 gzip 预算（KB）—— Story 5.3 的验收口径（针对 dist 产物） */
const CHARS_BUDGET_KB = 100;

/**
 * 原始 JSON gzip ≠ 产物 chunk gzip。
 *
 * 本脚本用 gzipSync 压的是 `JSON.stringify(payload)`，而浏览器实际下载的是
 * rollup 产出的 ESM 模块（多了 `var e={...};export{e as default}` 包装、
 * 重序列化与转义）。实测产物比原始 JSON 大 3~5%。
 *
 * 曾经因此出现「脚本报 98.4KB 通过、构建报 101.95KB 超预算」的分裂。
 * 这里留 5% 折扣让脚本的判断偏保守。
 *
 * !! 权威校验在 scripts/check-wubi-tutor.sh：它直接量 dist/assets/*.js !!
 */
const EMITTED_OVERHEAD_RATIO = 0.95;

/** 把验收预算折算成「原始 JSON 预算」 */
const rawBudgetKB = (emittedBudgetKB) => emittedBudgetKB * EMITTED_OVERHEAD_RATIO;
/**
 * 各长度档的 gzip 预算（KB）。
 *
 * 二字词必须按词频裁剪：源词典收了 30600 条二字组合，占词组总量 87%、
 * 体积 84%，但其中绝大多数是学习者一辈子不会打的组合。
 * 用二分查找确定「最大的前 N 条」而不是写死条数 ——
 * 换词典或调整编码规则后预算依然成立。
 */
const PHRASE_BUCKET_BUDGET_KB = { 2: 90, 3: 32, '4plus': 28 };

/** 词组总体积上限（gzip KB）—— Story 5.3 的验收口径 */
const PHRASES_TOTAL_BUDGET_KB = 300;

// ─── 工具函数 ────────────────────────────────────────────

/**
 * 从编码推导简码等级。
 * 五笔简码规则：一级简码 = 单键 + 空格；二级 = 前两码；三级 = 前三码。
 *
 * 本函数不判定「这个字是否真有一级简码」（那需要码表本身的标记），
 * 而是按编码长度推断：
 * - 长度 1 → 可能是一级简码（等级 1）
 * - 长度 2 → 可能是二级简码（等级 2）
 * - 长度 3 → 可能是三级简码（等级 3）
 * - 长度 4 → 全码（等级 0）
 *
 * 注意：实际简码信息应由源数据提供。当源数据只给单一编码时，
 * 本函数按长度做初步标注；后续若源数据包含多编码条目，
 * 应改为「取最长编码为全码、最短为简码」的合并逻辑。
 */
function inferSimplifiedLevel(code) {
  if (code.length === 1) return 1;
  if (code.length === 2) return 2;
  if (code.length === 3) return 3;
  return 0;
}

/**
 * 校验编码格式：必须匹配 [a-y]{1,4}（不含 z/Z）。
 */
function isValidCode(code) {
  return /^[a-y]{1,4}$/.test(code);
}

/**
 * 估算 gzip 压缩后体积（KB）。
 */
function estimateGzipKB(jsonString) {
  const gzipped = gzipSync(Buffer.from(jsonString, 'utf-8'));
  return (gzipped.length / 1024).toFixed(1);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

// ─── TSV 解析 ────────────────────────────────────────────

/**
 * 解析 TSV 文件，返回 [key, value][] 二元组列表。
 * 跳过空行、注释行（# 开头）、格式不合法的行。
 */
function parseTsv(filePath, expectedCols = 2) {
  if (!existsSync(filePath)) {
    return null;
  }

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const entries = [];
  let skipped = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      skipped++;
      continue;
    }

    const cols = trimmed.split('\t');
    if (cols.length < expectedCols) {
      skipped++;
      continue;
    }

    entries.push(cols);
  }

  return { entries, skipped };
}

// ─── 主逻辑 ──────────────────────────────────────────────

function buildChars() {
  console.log('\n━━━ 单字表 ━━━');

  const result = parseTsv(CHARS_TSV);
  if (!result) {
    console.error(`✗ 快照不存在: ${CHARS_TSV}`);
    console.error('  请先运行: node scripts/fetch-wubi-dict.mjs --fetch');
    process.exit(1);
  }

  const { entries: rawEntries, skipped } = result;
  console.log(`  原始条目: ${rawEntries.length}，跳过: ${skipped}`);

  // 合并同一字的多条编码：最长者为全码，最短且 <4 者为简码
  const charMap = new Map(); // char → { fullCode, simplifiedCode, weight }

  let invalidCodeCount = 0;
  for (const [char, code, weightStr] of rawEntries) {
    if (!char || char.length === 0) continue;
    if (!isValidCode(code)) {
      invalidCodeCount++;
      continue;
    }
    const weight = Number(weightStr ?? 0) || 0;

    const existing = charMap.get(char);
    if (!existing) {
      charMap.set(char, {
        fullCode: code,
        simplifiedCode: code.length < 4 ? code : null,
        weight,
      });
    } else {
      if (code.length > existing.fullCode.length) existing.fullCode = code;
      if (code.length < 4) {
        if (!existing.simplifiedCode || code.length < existing.simplifiedCode.length) {
          existing.simplifiedCode = code;
        }
      }
      if (weight > existing.weight) existing.weight = weight;
    }
  }

  if (invalidCodeCount > 0) {
    console.warn(`  ⚠ ${invalidCodeCount} 条编码格式不合法（已跳过）`);
  }

  // 精简码字优先保留
  const SIMPLIFIED_BONUS = 1e12;

  // 转为条目并按「简码优先 + 词频」排序
  // 无简码时省略第 4 列（节省体积）
  const allEntries = [];
  for (const [char, { fullCode, simplifiedCode, weight }] of charMap) {
    const level = simplifiedCode
      ? (simplifiedCode.length === 1 ? 1 : simplifiedCode.length === 2 ? 2 : 3)
      : 0;
    const entry = simplifiedCode
      ? [char, fullCode, level, simplifiedCode]
      : [char, fullCode, level];
    allEntries.push({
      entry,
      rank: (level > 0 ? SIMPLIFIED_BONUS : 0) + weight,
    });
  }

  allEntries.sort((a, b) => b.rank - a.rank);

  /*
   * 裁剪：在「条数上限」与「gzip 预算」之间取交集。
   *
   * 只按条数裁剪不够 —— 实测 13000 条为 101.95KB，略超 100KB 预算，
   * 而这类「差一点点」最容易长期漏掉。用二分查找确定最大的前 N 条，
   * 换词典或改字段结构后预算依然成立。
   */
  const generatedDate = new Date().toISOString().split('T')[0];
  const buildPayloadForChars = (n) => ({
    v: VERSION,
    source: SOURCE_NAME,
    generated: generatedDate,
    generator: 'scripts/build-wubi-tables.mjs',
    count: n,
    entries: allEntries.slice(0, n).map((e) => e.entry),
  });

  const charUpperBound = Math.min(CHARS_MAX_ENTRIES, allEntries.length);
  const fitsChars = (n) =>
    Number(estimateGzipKB(JSON.stringify(buildPayloadForChars(n))))
      <= rawBudgetKB(CHARS_BUDGET_KB);

  let charKeep = 0;
  let lo = 0;
  let hi = charUpperBound;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (fitsChars(mid)) lo = mid;
    else hi = mid - 1;
  }
  charKeep = lo;

  const entries = allEntries.slice(0, charKeep).map((e) => e.entry);
  const dropped = allEntries.length - charKeep;
  const withSimplified = entries.filter((e) => e[2] > 0).length;

  /*
   * !! 不要在此按字排序 !!
   * entries 的数组顺序承载了「常用度降序」这一语义：
   * 反查重码时按数组顺序输出即为常用字优先（见 lookup.ts）。
   * 按拼音排序会静默丢掉这个信息，让重码列表变成无意义顺序。
   * 输出依然是确定性的（rank 由码表权重决定），diff 同样稳定。
   */

  /*
   * 复用与二分查找**同一个**载荷构造函数，而不在这里另写一份同构对象。
   * 否则将来改字段时容易只改一边，出现「预算检查通过、写出的文件却超预算」
   * —— 这正是这套检查要防的事。
   */
  const json = buildPayloadForChars(charKeep);

  const jsonString = JSON.stringify(json);
  const gzipKB = Number(estimateGzipKB(jsonString));

  writeFileSync(CHARS_JSON, jsonString, 'utf-8');

  console.log(`  去重后条目: ${json.count}（含简码 ${withSimplified}）`);
  if (dropped > 0) console.log(`  按词频裁剪: 丢弃 ${dropped} 条生僻字`);
  console.log(`  原始体积: ${formatBytes(Buffer.byteLength(jsonString, 'utf-8'))}`);
  console.log(
    `  原始 JSON gzip: ${gzipKB} KB（产物约 ${(gzipKB / EMITTED_OVERHEAD_RATIO).toFixed(1)} KB）`,
  );
  console.log(
    `  预算 (产物 ≤ ${CHARS_BUDGET_KB} KB): ` +
      `${gzipKB <= rawBudgetKB(CHARS_BUDGET_KB) ? '✓ 通过' : '✗ 超预算'}`,
  );
  console.log(`  输出: ${CHARS_JSON}`);

  return { count: json.count, gzipKB };
}

function buildPhrases() {
  console.log('\n━━━ 词组表 ━━━');

  const result = parseTsv(PHRASES_TSV);
  if (!result) {
    console.error(`✗ 快照不存在: ${PHRASES_TSV}`);
    console.error('  请先运行: node scripts/fetch-wubi-dict.mjs --fetch');
    process.exit(1);
  }

  const { entries: rawEntries, skipped } = result;
  console.log(`  原始条目: ${rawEntries.length}，跳过: ${skipped}`);

  const phraseMap = new Map();
  let invalidCodeCount = 0;

  for (const [phrase, code, weightStr] of rawEntries) {
    if (!phrase || Array.from(phrase).length < 2) continue;
    if (!isValidCode(code)) {
      invalidCodeCount++;
      continue;
    }
    const weight = Number(weightStr ?? 0) || 0;
    const existing = phraseMap.get(phrase);
    if (!existing) {
      phraseMap.set(phrase, { code, weight });
    } else if (weight > existing.weight) {
      existing.weight = weight;
    }
  }

  if (invalidCodeCount > 0) {
    console.warn(`  ⚠ ${invalidCodeCount} 条编码格式不合法（已跳过）`);
  }

  // 按词频降序排列：数组顺序即常用度序（反查重码排序依赖它）
  const allEntries = [];
  for (const [phrase, { code, weight }] of phraseMap) {
    allEntries.push({ phrase, code, weight });
  }
  allEntries.sort((a, b) => b.weight - a.weight);

  // 按词组长度分档
  const buckets = new Map(PHRASE_BUCKETS.map((b) => [b, []]));
  for (const entry of allEntries) {
    const len = Array.from(entry.phrase).length;
    const bucket = len <= 2 ? '2' : len === 3 ? '3' : '4plus';
    buckets.get(bucket).push(entry);
  }

  const buildPayload = (bucket, kept) => ({
    v: VERSION,
    source: SOURCE_NAME,
    generated: new Date().toISOString().split('T')[0],
    generator: 'scripts/build-wubi-tables.mjs',
    bucket,
    count: kept.length,
    entries: kept.map((e) => [e.phrase, e.code]),
  });

  /** 二分查找最大的前 N 条，使该 chunk 的 gzip ≤ budgetKB */
  const trimToBudget = (bucket, sorted, budgetKB) => {
    const fits = (n) =>
      Number(estimateGzipKB(JSON.stringify(buildPayload(bucket, sorted.slice(0, n)))))
        <= rawBudgetKB(budgetKB);

    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      if (fits(mid)) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  let totalGzipKB = 0;

  for (const bucket of PHRASE_BUCKETS) {
    const sorted = buckets.get(bucket);
    const budgetKB = PHRASE_BUCKET_BUDGET_KB[bucket];
    const keep = trimToBudget(bucket, sorted, budgetKB);
    const dropped = sorted.length - keep;

    const jsonString = JSON.stringify(buildPayload(bucket, sorted.slice(0, keep)));
    const gzipKB = Number(estimateGzipKB(jsonString));
    totalGzipKB += gzipKB;

    writeFileSync(phraseChunkPath(bucket), jsonString, 'utf-8');

    console.log(
      `  phrases-${bucket}: ${keep} 条` +
        (dropped > 0 ? `（按词频裁剪 ${dropped} 条低频词）` : '') +
        `, 原始 gzip ${gzipKB} KB / 预算 ${rawBudgetKB(budgetKB).toFixed(1)} KB`,
    );
  }

  console.log(`  词组合计（原始 JSON）gzip: ${totalGzipKB.toFixed(1)} KB`);
  console.log(
    `  预算 (产物 ≤ ${PHRASES_TOTAL_BUDGET_KB} KB): ` +
      `${totalGzipKB <= rawBudgetKB(PHRASES_TOTAL_BUDGET_KB) ? '✓ 通过' : '✗ 超预算'}`,
  );
  console.log(`  输出: ${PHRASE_BUCKETS.map((b) => `phrases-${b}.json`).join(', ')}`);

  return { count: allEntries.length, gzipKB: totalGzipKB, chunks: PHRASE_BUCKETS.length };
}

// ─── 样本数据生成（--sample 模式） ──────────────────────────

function generateSample() {
  console.log('\n⚠ --sample 模式：生成少量样本数据（仅供开发调试）\n');

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 一级简码 25 个
  const level1Chars = [
    ['一', 'g', 1], ['地', 'f', 1], ['在', 'd', 1], ['要', 's', 1], ['工', 'a', 1],
    ['上', 'h', 1], ['是', 'j', 1], ['中', 'k', 1], ['国', 'l', 1], ['同', 'm', 1],
    ['和', 't', 1], ['的', 'r', 1], ['有', 'e', 1], ['人', 'w', 1], ['我', 'q', 1],
    ['主', 'y', 1], ['产', 'u', 1], ['不', 'i', 1], ['为', 'o', 1], ['这', 'p', 1],
    ['民', 'n', 1], ['了', 'b', 1], ['发', 'v', 1], ['以', 'c', 1], ['经', 'x', 1],
  ];

  // 常用字（含简码）
  const commonChars = [
    ['啊', 'kbsk', 0], ['的', 'r', 1], ['是', 'j', 1], ['了', 'b', 1],
    ['不', 'i', 1], ['大', 'dd', 2], ['这', 'p', 1], ['中', 'k', 1],
    ['为', 'o', 1], ['上', 'h', 1], ['国', 'l', 1], ['人', 'w', 1],
    ['我', 'q', 1], ['以', 'c', 1], ['到', 'gc', 2], ['他', 'wb', 2],
    ['会', 'wfc', 3], ['来', 'go', 2], ['说', 'yu', 2], ['生', 'tg', 2],
    ['下', 'gh', 2], ['出', 'bm', 2], ['能', 'ce', 2], ['对', 'cf', 2],
    ['学', 'ipb', 3], ['好', 'vb', 2], ['它', 'px', 2], ['她', 'vba', 3],
    ['你', 'wq', 2], ['们', 'wu', 2], ['个', 'wh', 2], ['用', 'et', 2],
    ['时', 'jf', 2], ['就', 'yi', 2], ['要', 's', 1], ['也', 'bn', 2],
    ['去', 'fcu', 3], ['把', 'rcn', 3], ['给', 'xwg', 3], ['做', 'wdt', 3],
    ['看', 'rhf', 3], ['说', 'yuk', 3], ['想', 'shn', 3], ['知', 'td', 2],
    ['道', 'ut', 2], ['过', 'fp', 2], ['里', 'jf', 2], ['面', 'dm', 2],
    ['前', 'ue', 2], ['后', 'rg', 2], ['现', 'gm', 2], ['在', 'd', 1],
    ['和', 't', 1], ['工', 'a', 1], ['地', 'f', 1], ['一', 'g', 1],
    ['经', 'x', 1], ['发', 'v', 1], ['了', 'b', 1], ['民', 'n', 1],
    ['主', 'y', 1], ['产', 'u', 1], ['不', 'i', 1], ['同', 'm', 1],
  ];

  // 合并去重
  const charMap = new Map();
  for (const [char, code, level] of [...level1Chars, ...commonChars]) {
    const existing = charMap.get(char);
    if (existing) {
      if (code.length > existing.code.length) {
        existing.code = code;
        existing.simplifiedLevel = level;
      }
    } else {
      charMap.set(char, { code, simplifiedLevel: level });
    }
  }

  const charEntries = [];
  for (const [char, { code, simplifiedLevel }] of charMap) {
    charEntries.push([char, code, simplifiedLevel]);
  }
  charEntries.sort((a, b) => a[0].localeCompare(b[0], 'zh'));

  const charsJson = {
    v: VERSION,
    source: 'sample data (for development only)',
    generated: new Date().toISOString().split('T')[0],
    generator: 'scripts/build-wubi-tables.mjs --sample',
    count: charEntries.length,
    entries: charEntries,
  };

  const charsString = JSON.stringify(charsJson);
  const charsGzip = estimateGzipKB(charsString);
  writeFileSync(CHARS_JSON, charsString, 'utf-8');

  console.log(`━━━ 单字表（样本）━━━`);
  console.log(`  条目: ${charEntries.length}`);
  console.log(`  原始: ${formatBytes(Buffer.byteLength(charsString, 'utf-8'))}`);
  console.log(`  gzip: ${charsGzip} KB`);
  console.log(`  输出: ${CHARS_JSON}`);

  // 样本词组
  const samplePhrases = [
    ['中国', 'khlg'], ['我们', 'trwh'], ['他们', 'wbwu'],
    ['你好', 'wqvb'], ['什么', 'wstc'], ['时候', 'jfyw'],
    ['因为', 'ldlw'], ['所以', 'rnto'], ['但是', 'wjvg'],
    ['如果', 'vkjs'], ['现在', 'gmjf'], ['可以', 'skny'],
    ['这个', 'ypwh'], ['那个', 'tfwh'], ['一些', 'ghgg'],
    ['很多', 'tqve'], ['非常', 'djip'], ['觉得', 'uptf'],
    ['知道', 'tdut'], ['应该', 'yipy'], ['可能', 'scee'],
    ['需要', 'fsvr'], ['已经', 'nnnn'], ['还是', 'gijg'],
    ['或者', 'akft'], ['虽然', 'kkgw'], ['然后', 'qtrg'],
    ['不过', 'gifi'], ['只有', 'kwde'], ['不能', 'gice'],
    ['没有', 'imde'], ['一样', 'ggsu'], ['这样', 'ypsu'],
    ['那样', 'tfsu'], ['怎样', 'thsu'], ['怎么样', 'tcsu'],
    ['为什么', 'wstc'], ['不得了', 'gntj'], ['不好意思', 'dgvu'],
  ];

  /*
   * 样本也走同一分档规则（只写 phrases-<bucket>.json，不写 phrases.json）。
   * 否则开发者用样本跑通、切到真实数据才发现路径不一致。
   * 同理不再按拼音排序 —— 数组顺序承载常用度语义。
   */
  const buckets = new Map(PHRASE_BUCKETS.map((b) => [b, []]));
  for (const entry of samplePhrases) {
    const len = Array.from(entry[0]).length;
    const bucket = len <= 2 ? '2' : len === 3 ? '3' : '4plus';
    buckets.get(bucket).push(entry);
  }

  console.log(`\n━━━ 词组表（样本）━━━`);
  let sampleTotal = 0;

  for (const bucket of PHRASE_BUCKETS) {
    const entries = buckets.get(bucket);
    const jsonString = JSON.stringify({
      v: VERSION,
      source: 'sample data (for development only)',
      generated: new Date().toISOString().split('T')[0],
      generator: 'scripts/build-wubi-tables.mjs --sample',
      bucket,
      count: entries.length,
      entries,
    });
    writeFileSync(phraseChunkPath(bucket), jsonString, 'utf-8');

    const gzip = Number(estimateGzipKB(jsonString));
    sampleTotal += gzip;
    console.log(`  phrases-${bucket}: ${entries.length} 条, gzip ${gzip} KB`);
  }

  console.log(`  合计 gzip: ${sampleTotal.toFixed(1)} KB`);
}

// ─── 入口 ────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const isSample = args.includes('--sample');

  console.log('五笔码表构建脚本');
  console.log(`模式: ${isSample ? '样本数据' : '从快照生成'}`);
  console.log(`快照目录: ${SNAPSHOT_DIR}`);

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  if (isSample) {
    generateSample();
    console.log('\n✓ 样本数据生成完成\n');
    return;
  }

  const charsResult = buildChars();
  const phrasesResult = buildPhrases();

  console.log('\n━━━ 总结 ━━━');
  console.log(
    `  单字: ${charsResult.count} 条, gzip ${charsResult.gzipKB} KB (预算 ≤ ${CHARS_BUDGET_KB} KB)`,
  );
  console.log(
    `  词组: ${phrasesResult.count} 条 / ${phrasesResult.chunks} 个 chunk, ` +
      `gzip 合计 ${phrasesResult.gzipKB.toFixed(1)} KB (预算 ≤ ${PHRASES_TOTAL_BUDGET_KB} KB)`,
  );
  console.log(`  GB2312 覆盖: ${charsResult.count >= 6763 ? '✓' : `⚠ 仅 ${charsResult.count} 字（需 ${6763}）`}`);

  if (charsResult.gzipKB > CHARS_BUDGET_KB) {
    console.warn(
      `  ⚠ 单字表超体积预算（${charsResult.gzipKB} > ${CHARS_BUDGET_KB} KB），` +
        '请下调 CHARS_MAX_ENTRIES',
    );
  }
  if (phrasesResult.gzipKB > PHRASES_TOTAL_BUDGET_KB) {
    console.warn(
      `  ⚠ 词组表超体积预算（${phrasesResult.gzipKB.toFixed(1)} > ${PHRASES_TOTAL_BUDGET_KB} KB），` +
        '请下调 PHRASE_BUCKET_BUDGET_KB 或改用更小的高频子集',
    );
  }

  console.log('\n✓ 构建完成\n');
}

main();
