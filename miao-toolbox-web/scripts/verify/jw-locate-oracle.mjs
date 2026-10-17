/**
 * task-6 独立验证（verify-tree）：locateJsonPath 的「独立 oracle」校验
 *
 * 与实现无关的参照链（三层，互相独立）：
 *   L1 自研扫描器 myScan(text)：手写递归下降，记录每个 path 的「键起始偏移 / 值起始偏移 / 值结束偏移 / 解析出的值」，
 *      并显式保留重复键的每一次出现（实现里 JSON.parse 语义看不见这一点）。
 *   L2 JSON.parse 参照：用 JSON.parse(text) 建立 path → 值 映射，与 L1 扫描出的值做深比较，
 *      用来证明「我的扫描器本身是对的」。
 *   L3 行号/列号参照：把原文按 '\n' 切分 + 前缀长度累加，独立算出 offset 对应的 1 起始行号与列号。
 *
 * 然后断言真实产物 locateJsonPath(text, path) 的返回值：
 *   - offset 必须等于 L1 给出的该 path 的期望偏移（键结尾段→键起始；下标结尾段→元素起始）；
 *   - offset 处截取的文本必须确实属于该 path（独立读串函数：键段读出的字符串 === 期望键；
 *     下标段 offset 必须落在该元素的 [start,end) 区间内且等于 start）；
 *   - line/column 必须等于 L3 的独立计算结果；
 *   - 数组同名 key：不同下标的偏移必须严格递增且互不相同，且都落在各自元素区间内。
 *
 * 真实产物通过 TypeScript 的 transpileModule 现场转译后 import（与 Vite 的 TS 处理同类，不改 src/）。
 *
 * 用法：cd miao-toolbox-web && node scripts/verify/jw-locate-oracle.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(__dirname, '..', '..');
const OUT = process.env.OUT_DIR ?? '/tmp/jw-repro';
const SRC = path.join(WEB, 'src/modules/tools/json-workbench/utils/jsonPathLocator.ts');
const PAYLOAD = fs.readFileSync(path.join(__dirname, '..', 'repro', 'payload-cashier.json'), 'utf8');
fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const results = [];
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} :: ${JSON.stringify(detail)?.slice(0, 600)}`); }
  results.push({ name, ok: !!cond, detail });
};

// ─── 加载真实产物（TS → ESM，现场转译） ────────────────
const srcText = fs.readFileSync(SRC, 'utf8');
const js = ts.transpileModule(srcText, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  fileName: 'jsonPathLocator.ts',
}).outputText;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jw-locator-'));
const tmpFile = path.join(tmpDir, 'jsonPathLocator.mjs');
const tempDirs = [tmpDir]; // 只清理自己创建的临时目录（切勿对 os.tmpdir() 本身做递归删除）
fs.writeFileSync(tmpFile, js);
const impl = await import(pathToFileURL(tmpFile).href);
const { locateJsonPath, parseJsonPathSegments, resolveLocatorPath } = impl;

// ─── L1 自研扫描器 ─────────────────────────────────────
/**
 * 手写扫描器：返回 { entries, root }。
 * entries: Map<path, Array<{ keyStart, keyEnd, valueStart, valueEnd, value, kind }>>
 *  - 对象成员：kind='key'，keyStart/keyEnd 为该键字符串字面量（含引号）的范围，valueStart 为值起始
 *  - 数组元素：kind='index'，keyStart=null，valueStart 为元素起始
 * 重复键会在同一 path 下追加多个条目（JSON.parse 语义下只会保留最后一个）。
 */
function myScan(text) {
  let i = 0;
  const entries = new Map();
  const push = (p, e) => { if (!entries.has(p)) entries.set(p, []); entries.get(p).push(e); };

  const ws = () => { while (i < text.length && ' \t\r\n'.includes(text[i])) i++; };
  const fail = (msg) => { throw new Error(`scan error at ${i}: ${msg}`); };

  function readString() {
    // 假定 text[i] === '"'
    const start = i;
    i++;
    let out = '';
    while (i < text.length) {
      const c = text[i];
      if (c === '"') { i++; return { value: out, start, end: i }; }
      if (c === '\\') {
        const e = text[i + 1];
        i += 2;
        if (e === 'u') { out += String.fromCharCode(parseInt(text.slice(i, i + 4), 16)); i += 4; }
        else out += ({ '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' })[e] ?? fail('bad escape');
        continue;
      }
      out += c; i++;
    }
    return fail('unterminated string');
  }

  function readNumberOrLiteral() {
    const start = i;
    while (i < text.length && !',}] \t\r\n'.includes(text[i])) i++;
    const raw = text.slice(start, i);
    if (raw === 'true') return { value: true, start, end: i };
    if (raw === 'false') return { value: false, start, end: i };
    if (raw === 'null') return { value: null, start, end: i };
    const n = Number(raw);
    if (raw === '' || Number.isNaN(n)) fail(`bad token ${raw}`);
    return { value: n, start, end: i };
  }

  function parseValue(p) {
    ws();
    const c = text[i];
    if (c === '{') {
      const valueStart = i;
      i++;
      ws();
      if (text[i] === '}') { i++; return { start: valueStart, end: i, value: {} }; }
      const obj = {};
      for (;;) {
        ws();
        const keyTok = readString();
        ws();
        if (text[i] !== ':') fail('expected :');
        i++;
        ws();
        const vStart = i;
        const child = parseValue(`${p}.${encodeKeyForPath(keyTok.value)}`);
        obj[keyTok.value] = child.value;
        push(`${p}.${encodeKeyForPath(keyTok.value)}`, {
          kind: 'key', keyStart: keyTok.start, keyEnd: keyTok.end, valueStart: vStart, valueEnd: child.end, value: child.value,
        });
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === '}') { i++; break; }
        fail('expected , or }');
      }
      return { start: valueStart, end: i, value: obj };
    }
    if (c === '[') {
      const valueStart = i;
      i++;
      ws();
      if (text[i] === ']') { i++; return { start: valueStart, end: i, value: [] }; }
      const arr = [];
      let idx = 0;
      for (;;) {
        ws();
        const eStart = i;
        const child = parseValue(`${p}[${idx}]`);
        arr.push(child.value);
        push(`${p}[${idx}]`, { kind: 'index', keyStart: null, keyEnd: null, valueStart: eStart, valueEnd: child.end, value: child.value });
        idx++;
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === ']') { i++; break; }
        fail('expected , or ]');
      }
      return { start: valueStart, end: i, value: arr };
    }
    if (c === '"') { const s = readString(); return { start: s.start, end: s.end, value: s.value }; }
    return readNumberOrLiteral();
  }

  ws();
  const root = parseValue('$');
  ws();
  if (i !== text.length) fail(`trailing content at ${i}`);
  return { entries, root: root.value };
}

/** 与实现同规则的路径键编码（含特殊字符时用 ["..."]）——这是「协议」，不是实现逻辑 */
function encodeKeyForPath(key) {
  return /[.[\]"']/.test(key) ? `["${key.replace(/"/g, '\\"')}"]` : key;
}

/** L3：按 '\n' 切分独立算行号/列号 */
function lineColBySplit(text, offset) {
  const lines = text.split('\n');
  let acc = 0;
  for (let n = 0; n < lines.length; n++) {
    const len = lines[n].length;
    if (offset <= acc + len) return { line: n + 1, column: offset - acc + 1 };
    acc += len + 1;
  }
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

/** L2：JSON.parse 参照 path → 值（'.' 段 + '[i]' / ["k"] 段） */
function pathSegmentsForLookup(p) {
  const segs = [];
  let i = 1;
  while (i < p.length) {
    if (p[i] === '.') {
      i++;
      if (p[i] === '[') continue; // 容忍树 id 的 `.["k"]` 形态
      const s = i;
      while (i < p.length && p[i] !== '.' && p[i] !== '[') i++;
      segs.push({ k: 'key', v: p.slice(s, i) });
    } else if (p[i] === '[') {
      if (p[i + 1] === '"') {
        i += 2;
        let v = '';
        while (i < p.length && p[i] !== '"') { if (p[i] === '\\') { v += p[i + 1]; i += 2; } else { v += p[i]; i++; } }
        i += 2;
        segs.push({ k: 'key', v });
      } else {
        const close = p.indexOf(']', i);
        segs.push({ k: 'idx', v: Number(p.slice(i + 1, close)) });
        i = close + 1;
      }
    } else break;
  }
  return segs;
}
const lookupByParse = (obj, p) => pathSegmentsForLookup(p).reduce((acc, s) => (acc == null ? acc : (s.k === 'idx' ? acc[s.v] : acc[s.v])), obj);

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ─── 测试文档 ──────────────────────────────────────────
const docs = {
  '真实载荷 payload-cashier.json': PAYLOAD,
  '数组同名 key（2 空格缩进）': `{
  "list": [
    { "id": 1, "name": "A", "nested": { "x": 1 } },
    { "id": 2, "name": "B", "nested": { "x": 2 } },
    { "id": 3, "name": "C", "nested": { "x": 3 } }
  ]
}`,
  '深层嵌套（数组套对象套数组）': `{
  "a": { "b": [ { "c": [ { "d": "target-1" }, { "d": "target-2" } ] }, { "c": [ { "d": "target-3" } ] } ] }
}`,
  '键含点与引号': `{
  "a.b": { "say \\"hi\\"": 42, "x": 1 },
  "plain": 0
}`,
  '紧凑单行': `{"list":[{"id":1,"name":"A"},{"id":2,"name":"B"}],"tail":{"deep":{"v":9}}}`,
  'CRLF 换行': '{\r\n  "list": [\r\n    { "id": 1, "name": "A" },\r\n    { "id": 2, "name": "B" }\r\n  ]\r\n}\r\n',
  'Tab 缩进': '{\n\t"list": [\n\t\t{ "id": 1, "name": "A" },\n\t\t{ "id": 2, "name": "B" }\n\t]\n}\n',
  'unicode 转义': `{
  "\\u4e2d\\u6587": [ { "k": "\\u4e2d" }, { "k": "\\ud83d\\ude00" } ]
}`,
  '字面反斜杠键': `{
  "\\\\u4e2d": 1,
  "x": 2
}`,
  '重复 key': `{
  "dup": 1,
  "dup": 2,
  "other": { "dup": 3, "dup": 4 }
}`,
  '空对象与空数组': `{
  "eo": {},
  "ea": [],
  "list": [ {}, [], { "k": 1 } ]
}`,
  '字符串里含括号与逗号': `{
  "s": "}],\\"fake\\":{",
  "list": [ { "v": "a{b}c[d]" }, { "v": "x,y" } ]
}`,
};

// 每份文档要检查的路径（含数组同名 key 的下标区分）
const pathMatrix = {
  '真实载荷 payload-cashier.json': [
    '$.errno', '$.errmsg', '$.data',
    '$.data.content.one_key_bind_card_bank_list',
    '$.data.content.one_key_bind_card_bank_list[0]',
    '$.data.content.one_key_bind_card_bank_list[1]',
    '$.data.content.one_key_bind_card_bank_list[2]',
    '$.data.content.one_key_bind_card_bank_list[1].bank_uniq_code',
    '$.data.content.one_key_bind_card_bank_list[2].bank_uniq_code',
    '$.data.content.one_key_bind_card_bank_list[1].bank_name',
    '$.data.content.one_key_bind_card_bank_list[2].bank_name',
    '$.data.content.one_key_bind_card_bank_list[1].card_type[0].type',
    '$.data.content.one_key_bind_card_bank_list[1].card_type[1].bank_code',
    '$.data.content.one_key_bind_card_bank_list[38].bank_uniq_code',
  ],
  '数组同名 key（2 空格缩进）': ['$.list', '$.list[0]', '$.list[1]', '$.list[2]', '$.list[0].name', '$.list[1].name', '$.list[2].name', '$.list[2].nested.x', '$.list[1].id'],
  '深层嵌套（数组套对象套数组）': ['$.a.b[0].c[0].d', '$.a.b[0].c[1].d', '$.a.b[1].c[0].d', '$.a.b[1]', '$.a.b[1].c[0]'],
  '键含点与引号': ['$["a.b"]', '$["a.b"]["say \\"hi\\""]', '$["a.b"].x', '$.plain'],
  '紧凑单行': ['$.list[0].name', '$.list[1].name', '$.list[1]', '$.tail.deep.v'],
  'CRLF 换行': ['$.list[1].name', '$.list[0].name', '$.list[1]'],
  'Tab 缩进': ['$.list[1].name', '$.list[0].name', '$.list'],
  'unicode 转义': ['$.中文', '$.中文[0].k', '$.中文[1].k'],
  '字面反斜杠键': ['$.\\u4e2d', '$.x'],
  '重复 key': ['$.dup', '$.other.dup'],
  '空对象与空数组': ['$.eo', '$.ea', '$.list[0]', '$.list[1]', '$.list[2].k'],
  '字符串里含括号与逗号': ['$.s', '$.list[0].v', '$.list[1].v'],
};

// ─── 执行 L1/L2/L3 与真实产物比对 ──────────────────────
console.log(`>>> 独立 oracle 校验（真实产物：${path.relative(WEB, SRC)}）`);
console.log(`    三层参照：L1 自研扫描器 / L2 JSON.parse 值映射 / L3 split('\\n') 行列\n`);

let compared = 0;
const docSummaries = {};
for (const [docName, text] of Object.entries(docs)) {
  let scan;
  try { scan = myScan(text); } catch (e) { check(`[${docName}] L1 扫描器可解析该文档`, false, String(e)); continue; }
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) { check(`[${docName}] 文档本身是合法 JSON（参照前提）`, false, String(e)); continue; }

  const paths = [...scan.entries.keys()]; // 遍历文档里的**每一个** path（pathMatrix 仅作人工清单参考）
  const rows = [];
  let l1l2Mismatch = [], offsetMismatch = [], textMismatch = [], lineMismatch = [], spanViolation = [];
  let dupNote = null;

  for (const p of paths) {
    const occ = scan.entries.get(p);
    if (!occ || !occ.length) { offsetMismatch.push({ path: p, why: 'L1 未扫到该 path' }); continue; }
    const first = occ[0];
    if (occ.length > 1 && !dupNote) dupNote = { path: p, occurrences: occ.length, l1Offsets: occ.map((o) => o.keyStart ?? o.valueStart) };
    // L2 交叉校验 L1 的值（重复键场景 JSON.parse 只保留最后一个，跳过值比较）
    const parseVal = lookupByParse(parsed, p);
    if (occ.length === 1 && !eq(first.value, parseVal)) l1l2Mismatch.push({ path: p, scanner: first.value, parse: parseVal });

    const expectedOffset = first.kind === 'key' ? first.keyStart : first.valueStart;
    const got = locateJsonPath(text, p);
    compared++;
    if (!got) { offsetMismatch.push({ path: p, got: null, expectedOffset }); continue; }
    if (got.offset !== expectedOffset) offsetMismatch.push({ path: p, got: got.offset, expectedOffset, kind: first.kind });
    // 独立读串/区间校验：偏移处文本必须属于该 path
    if (first.kind === 'key') {
      const lit = text.slice(first.keyStart, first.keyEnd);
      let decoded = null;
      try { decoded = JSON.parse(lit); } catch { /* ignore */ }
      const segs = parseJsonPathSegments(p);
      const last = segs[segs.length - 1];
      if (got.offset < first.keyStart || got.offset > first.keyEnd) textMismatch.push({ path: p, slice: text.slice(got.offset, got.offset + 20), why: 'offset 不在该键字面量范围内' });
      else if (decoded !== last.key) textMismatch.push({ path: p, decoded, expectedKey: last.key });
    } else {
      const within = got.offset >= first.valueStart && got.offset < first.valueEnd;
      if (!within || got.offset !== first.valueStart) spanViolation.push({ path: p, got: got.offset, span: [first.valueStart, first.valueEnd] });
    }
    const lc = lineColBySplit(text, got.offset);
    if (got.line !== lc.line || got.column !== lc.column) lineMismatch.push({ path: p, got: [got.line, got.column], expect: [lc.line, lc.column] });
    rows.push({ path: p, kind: first.kind, offset: got.offset, line: got.line, column: got.column, expectOffset: expectedOffset, slice: JSON.stringify(text.slice(got.offset, got.offset + 24)) });
  }

  docSummaries[docName] = {
    bytes: text.length, lines: text.split('\n').length, pathsChecked: paths.length,
    scanEntries: scan.entries.size,
    samples: rows.slice(0, 6),
    dupNote,
  };
  check(`[${docName}] L1 扫描器与 JSON.parse 的 path→值 一致（${paths.length} 个 path）`, l1l2Mismatch.length === 0, l1l2Mismatch.slice(0, 3));
  check(`[${docName}] 真实产物 offset 与 L1 期望偏移一致`, offsetMismatch.length === 0, offsetMismatch.slice(0, 3));
  check(`[${docName}] 偏移处截取的文本确实属于该 path（键串解码 / 元素区间）`, textMismatch.length === 0 && spanViolation.length === 0, { textMismatch: textMismatch.slice(0, 2), spanViolation: spanViolation.slice(0, 2) });
  check(`[${docName}] line/column 与 split('\\n') 独立计算一致`, lineMismatch.length === 0, lineMismatch.slice(0, 2));
}

// ─── 数组同名 key：不同下标必须落在各自元素区间且互不相同 ────
console.log('\n>>> 数组同名 key 的「串号」专项（本次缺陷的核心）');
for (const [docName, key] of [['真实载荷 payload-cashier.json', 'bank_uniq_code'], ['数组同名 key（2 空格缩进）', 'name'], ['深层嵌套（数组套对象套数组）', 'd']]) {
  const text = docs[docName];
  const scan = myScan(text);
  const base = docName.startsWith('真实') ? '$.data.content.one_key_bind_card_bank_list' : docName.startsWith('数组') ? '$.list' : '$.a.b';
  const count = docName === '深层嵌套（数组套对象套数组）' ? 2 : (base === '$.list' ? 3 : 39);
  const picked = [];
  for (let i = 0; i < count; i++) {
    const p = docName === '深层嵌套（数组套对象套数组）' ? `$.a.b[${i}].c[0].d` : `${base}[${i}].${key}`;
    const occ = scan.entries.get(p);
    if (!occ) continue;
    const elOcc = scan.entries.get(`${base}[${i}]`);
    const got = locateJsonPath(text, p);
    picked.push({ path: p, line: got?.line ?? null, offset: got?.offset ?? null, elemSpan: elOcc ? [elOcc[0].valueStart, elOcc[0].valueEnd] : null, inOwnElement: !!(got && elOcc && got.offset >= elOcc[0].valueStart && got.offset < elOcc[0].valueEnd) });
  }
  const offsets = picked.map((x) => x.offset);
  const lines = picked.map((x) => x.line);
  const strictlyIncreasing = offsets.every((v, i) => i === 0 || (v !== null && offsets[i - 1] !== null && v > offsets[i - 1]));
  const allDistinct = new Set(offsets).size === offsets.length;
  const allInOwnElement = picked.every((x) => x.inOwnElement);
  // 缺陷判据（与文档排版无关）：旧实现 indexOf(`"key"`) 恒等于首次出现偏移；新实现必须不落在它上面
  const oldOffset = text.indexOf(`"${key}"`);
  const oldLine = lineColBySplit(text, oldOffset).line;
  const notOldOffset = picked.slice(1).every((x) => x.offset !== null && x.offset > oldOffset);
  const notOldLine = picked.slice(1).every((x) => x.line === null || x.line >= oldLine);
  console.log(`  ▸ ${docName} / "${key}"：${picked.length} 个下标 → 行号 ${JSON.stringify(lines.slice(0, 6))}${lines.length > 6 ? '…' : ''}，偏移严格递增=${strictlyIncreasing}，互不相同=${allDistinct}，均落在各自元素区间=${allInOwnElement}`);
  console.log(`     旧实现 indexOf("${key}") = offset ${oldOffset}（第 ${oldLine} 行）；新实现第 2..N 个元素偏移均大于它=${notOldOffset}`);
  check(`[${docName}] 第 2..N 个元素不再落在旧实现的首个出现位置（indexOf 缺陷的直接判据）`, notOldOffset && notOldLine, { oldOffset, oldLine, picked: picked.slice(0, 4) });
  check(`[${docName}] 各下标偏移严格递增、互不相同、落在各自元素区间内`, strictlyIncreasing && allDistinct && allInOwnElement, picked.slice(0, 4));
  results.push({ name: `[${docName}] 数组同名 key 明细`, detail: { key, oldOffset, oldLine, picked: picked.slice(0, 8) } });
}

// ─── 边界 / 反例 / 耗时 ───────────────────────────────
console.log('\n>>> 边界与反例');
const bigArray = '{\n  "big": [' + Array.from({ length: 5000 }, (_, i) => `{ "id": ${i}, "name": "n${i}" }`).join(',\n    ') + ']\n}';
const deepObj = '{"a":'.repeat(600) + '1' + '}'.repeat(600);
const deepArray = '['.repeat(600) + '1' + ']'.repeat(600);

const t0 = performance.now();
const bigLast = locateJsonPath(bigArray, '$.big[4999].name');
const tBig = performance.now() - t0;
const t1 = performance.now();
const bigFirst = locateJsonPath(bigArray, '$.big[0].name');
const tBigFirst = performance.now() - t1;
const t2 = performance.now();
const deepRes = locateJsonPath(deepObj, '$.a.a.a.a.a');
const tDeep = performance.now() - t2;
const t3 = performance.now();
const deepOver = locateJsonPath(deepObj, '$' + '.a'.repeat(600));
const tDeepOver = performance.now() - t3;
const t4 = performance.now();
const payloadLoc = locateJsonPath(PAYLOAD, '$.data.content.one_key_bind_card_bank_list[38].bank_uniq_code');
const tPayload = performance.now() - t4;

console.log(`  ▸ 5000 元素数组：首发 ${tBigFirst.toFixed(2)}ms(行${bigFirst?.line})，末尾 [4999].name ${tBig.toFixed(2)}ms(行${bigLast?.line})`);
console.log(`  ▸ 600 层深嵌套：浅路径 ${tDeep.toFixed(2)}ms → ${JSON.stringify(deepRes)}；600 段深路径 ${tDeepOver.toFixed(2)}ms → ${JSON.stringify(deepOver)}`);
console.log(`  ▸ 真实载荷 [38] 字段：${tPayload.toFixed(2)}ms 行=${payloadLoc?.line}`);
check('边界 5000 元素数组取最后一个元素能定位且不卡死（<500ms）', !!bigLast && tBig < 500, { tBig, line: bigLast?.line });
check('边界 5000 元素数组：末尾元素行号 > 首个元素行号（未回退到第一个）', !!bigLast && !!bigFirst && bigLast.line > bigFirst.line && bigLast.offset > bigFirst.offset, { first: bigFirst, last: bigLast });
check('超深路径（600 段 > MAX_LOCATE_DEPTH=512）返回 null 且耗时可控（<500ms）', deepOver === null && tDeepOver < 500, { deepOver, tDeepOver });
check('超深文档上的浅路径仍可定位（<500ms）', !!deepRes && tDeep < 500, { deepRes, tDeep });

// expect: 'null' → 必须 null；'keyPos' → 允许「键存在即定位到键」（实现与单测明确约定的降级策略）
const edgeCases = [
  ['非法 JSON（截断，但目标键存在）', '{"a": 1, "b": [1, 2', '$.a', 'keyPos'],
  ['非法 JSON（结构错，但目标键存在）', '{"a": }', '$.a', 'keyPos'],
  ['非法 JSON（截断，目标键不存在）', '{"b": 1', '$.a', 'null'],
  ['非法 JSON（顶层是数组）', '[1, 2', '$.a', 'null'],
  ['非 JSON 文本', 'not json at all', '$.a', 'null'],
  ['路径不存在', docs['数组同名 key（2 空格缩进）'], '$.list[9].name', 'null'],
  ['下标越界', docs['数组同名 key（2 空格缩进）'], '$.list[99]', 'null'],
  ['类型不符（对数组取键）', docs['数组同名 key（2 空格缩进）'], '$.list.id', 'null'],
  ['类型不符（对对象取下标）', docs['数组同名 key（2 空格缩进）'], '$.list[0][0]', 'null'],
  ['空文本', '', '$.a', 'null'],
  ['空路径', '{"a":1}', '', 'null'],
  ['路径不以 $ 开头', '{"a":1}', 'a.b', 'null'],
  ['路径以点结尾', '{"a":1}', '$.', 'null'],
  ['方括号未闭合', '{"a":1}', '$.a[0', 'null'],
  ['根路径 $', '{"a":1}', '$', 'root'],
  ['非字符串路径（undefined）', '{"a":1}', undefined, 'null'],
];
const edgeOut = [];
for (const [name, text, p, expect] of edgeCases) {
  let out;
  try { out = locateJsonPath(text, p); } catch (e) { out = { threw: String(e) }; }
  let verdict;
  if (out?.threw) verdict = false;
  else if (expect === 'null') verdict = out === null;
  else if (expect === 'root') verdict = out?.offset === 0;
  // keyPos：允许「键存在即定位到键」（截断文本的降级策略），但偏移必须正好指向该键字面量
  else verdict = out !== null && out.offset === text.indexOf('"a"');
  edgeOut.push({ name, path: String(p), expect, out, ok: verdict });
}
for (const e of edgeOut) console.log(`  ${e.ok ? '✅' : '❌'} ${e.name}: ${JSON.stringify(e.out)}${e.expect === 'keyPos' ? `（允许键位置 ${'"a"@' + String(e.out?.offset)}，约定为「键存在即可跳行」）` : ''}`);
check('边界：实现与单测约定的降级语义成立（键存在→键位置；键不存在/非法/空输入→null；不抛异常、不瞎跳）',
  edgeOut.every((e) => e.ok), edgeOut.filter((e) => !e.ok));
check('边界：所有非法/缺失输入均未抛异常', edgeOut.every((e) => !e.out?.threw), edgeOut.filter((e) => e.out?.threw));
check('边界：根路径 $ 定位到全文第一个字符（offset=0）', edgeOut.find((e) => e.name === '根路径 $')?.out?.offset === 0, edgeOut.find((e) => e.name === '根路径 $'));

// 非树可达形态（记录，不计入失败）：占位节点 __ellipsis__、转义字面量路径
const escapedLiteral = locateJsonPath(docs['unicode 转义'], '$["\\u4e2d\\u6587"]');
const escapedRealistic = locateJsonPath(docs['unicode 转义'], '$.中文');
console.log(`  ▸ unicode 键：树可达形态 '$.中文' → ${JSON.stringify(escapedRealistic)}；转义字面量形态 '$["\\\\u4e2d\\\\u6587"]' → ${JSON.stringify(escapedLiteral)}（parseAndFlatten 不会产生该形态）`);
check('unicode 键：树可达形态（解码后的 $.中文）可精确定位到该键字面量', !!escapedRealistic && docs['unicode 转义'].startsWith('"', escapedRealistic.offset), { escapedRealistic });

// 折叠占位节点回退
const ell = locateJsonPath(PAYLOAD, '$.data.content.one_key_bind_card_bank_list.__ellipsis__');
const arr = locateJsonPath(PAYLOAD, '$.data.content.one_key_bind_card_bank_list');
console.log(`  ▸ 省略占位：.__ellipsis__ → ${JSON.stringify(ell)}；父数组 → ${JSON.stringify(arr)}`);
check('折叠占位节点 .__ellipsis__ 回退到父数组位置', !!ell && !!arr && ell.offset === arr.offset && ell.line === arr.line, { ell, arr });

// 重复 key 行为记录
const dupText = docs['重复 key'];
console.log(`  ▸ 重复 key：$.dup → ${JSON.stringify(locateJsonPath(dupText, '$.dup'))}；$.other.dup → ${JSON.stringify(locateJsonPath(dupText, '$.other.dup'))}`);
console.log(`     （JSON.parse 语义保留最后一个：dup=${JSON.parse(dupText).dup}，other.dup=${JSON.parse(dupText).other.dup}）`);

// ─── 集成校验：真实 parseAndFlatten 生成 node id → 真实 locateJsonPath 定位 ───
console.log('\n>>> 树真实 node id 形态（用真实 parseAndFlatten 生成，再交给真实 locateJsonPath）');

/** 把 src 下的 TS 模块（含本地相对依赖）现场转译到临时目录后 import */
async function loadTsModule(relPath) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jw-tsmod-'));
  tempDirs.push(dir);
  const seen = new Map();
  const load = (rel) => {
    const abs = path.join(WEB, rel);
    const outName = path.basename(rel).replace(/\.tsx?$/, '.mjs');
    if (seen.has(abs)) return outName;
    seen.set(abs, outName);
    let code = fs.readFileSync(abs, 'utf8');
    code = code.replace(/from\s+'(\.[^']+)'/g, (m, spec) => {
      const depAbs = path.resolve(path.dirname(abs), spec);
      const cand = [depAbs + '.ts', depAbs + '.tsx', path.join(depAbs, 'index.ts'), path.join(depAbs, 'index.tsx')].find((c) => fs.existsSync(c));
      if (!cand) return m;
      return `from './${load(path.relative(WEB, cand))}'`;
    });
    const jsOut = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 }, fileName: path.basename(abs) }).outputText;
    fs.writeFileSync(path.join(dir, outName), jsOut);
    return outName;
  };
  const entry = load(relPath);
  return import(pathToFileURL(path.join(dir, entry)).href);
}

const pf = await loadTsModule('src/modules/tools/json-workbench/utils/parseAndFlatten.ts');
const idDocs = {
  '键含点与引号': '{\n  "a.b": 1,\n  "he said \\"hi\\"": 2,\n  "normal": 3\n}',
  '键含方括号': '{\n  "arr[0]": 1,\n  "x": 2\n}',
  '键含单引号': '{\n  "it\'s": 1,\n  "y": 2\n}',
};
const idRows = [];
const idFails = [];
for (const [name, text] of Object.entries(idDocs)) {
  const res = pf.parseAndFlatten(text, 3);
  const nodes = res?.flatNodes ?? [];
  const scanId = myScan(text);
  for (const n of nodes) {
    if (n.id === '$') continue;
    // 期望行号完全来自我自己的扫描器（按树真实 id 查同一条 path），不使用被测实现
    const occ = scanId.entries.get(n.id);
    const expectedLine = occ ? lineColBySplit(text, occ[0].kind === 'key' ? occ[0].keyStart : occ[0].valueStart).line : null;
    const trueKey = occ ? text.slice(occ[0].keyStart, occ[0].keyEnd) : null;
    const got = locateJsonPath(text, n.id);
    const ok = got !== null && expectedLine !== null && got.line === expectedLine;
    const row = { doc: name, nodeId: n.id, treeKeyField: n.key, trueKeyLiteral: trueKey, expectedLine, got: got ? { offset: got.offset, line: got.line } : null, ok };
    idRows.push(row);
    if (!ok) idFails.push(row);
  }
}
for (const r of idRows) console.log(`  ${r.ok ? '✅' : '❌'} [${r.doc}] id=${JSON.stringify(r.nodeId)} 树 key 字段=${JSON.stringify(r.treeKeyField)} 真实键字面量=${JSON.stringify(r.trueKeyLiteral)} → 期望行 ${r.expectedLine}，实际 ${JSON.stringify(r.got)}`);
const simpleRows = idRows.filter((r) => !/[.[\]"']/.test(r.trueKeyLiteral ? JSON.parse(r.trueKeyLiteral) : ''));
const quotedRows = idRows.filter((r) => /[.[\]"']/.test(r.trueKeyLiteral ? JSON.parse(r.trueKeyLiteral) : ''));
check('集成：树真实 id（普通键）可被 locateJsonPath 正确定位', simpleRows.length > 0 && simpleRows.every((r) => r.ok), simpleRows);
check('集成：树真实 id（含 . / [ ] / 单引号 等需 safeKey 引号包裹的键）可被 locateJsonPath 正确定位',
  quotedRows.length > 0 && quotedRows.every((r) => r.ok), { quotedRows, note: 'id 形如 $.["a.b"]（parseAndFlatten 用 `.` + safeKey 拼接）' });
results.push({ name: '集成：树真实 id → locateJsonPath', detail: idRows });

// ─── task-7 追加：D1 复验 + 其它「树真实 id 形态」探测（穷举 parseAndFlatten 能产出的 id 形态）───
console.log('\n>>> task-7：D1 复验 + 其它 id 形态探测（全部用真实 parseAndFlatten 生成 id）');
const edgeIdDocs = {
  '方括号键 + 数组下标': '{\n  "a.b": [\n    1,\n    2\n  ]\n}',
  '方括号键（数组元素内）': '{\n  "list": [\n    {\n      "a.b": 1\n    }\n  ]\n}',
  '方括号键（多层嵌套）': '{\n  "a.b": {\n    "c.d": 1\n  }\n}',
  '含引号的键（转义）': '{\n  "he said \\"hi\\"": 1,\n  "x": 2\n}',
  '空字符串键（顶层）': '{\n  "": 1,\n  "x": 2\n}',
  '空字符串键（嵌套在对象里）': '{\n  "a": {\n    "": 1\n  }\n}',
  '空字符串键（再嵌一层）': '{\n  "a": {\n    "": {\n      "b": 1\n    }\n  }\n}',
  '真实键名就是 __ellipsis__': '{\n  "__ellipsis__": 1,\n  "x": 2\n}',
};
const edgeRows = [];
for (const [name, text] of Object.entries(edgeIdDocs)) {
  const res = pf.parseAndFlatten(text, 3);
  const nodes = res?.flatNodes ?? [];
  const scanE = myScan(text);
  for (const n of nodes) {
    if (n.id === '$') continue;
    const occ = scanE.entries.get(n.id);
    const expectedLine = occ ? lineColBySplit(text, occ[0].kind === 'key' ? occ[0].keyStart : occ[0].valueStart).line : null;
    const trueKey = occ ? text.slice(occ[0].keyStart, occ[0].keyEnd) : null;
    const got = locateJsonPath(text, n.id);
    const ok = got !== null && expectedLine !== null && got.line === expectedLine;
    edgeRows.push({ doc: name, nodeId: n.id, nodeType: n.type, treeKeyField: n.key, trueKeyLiteral: trueKey, expectedLine, got: got ? { offset: got.offset, line: got.line } : null, ok });
  }
}
for (const r of edgeRows) console.log(`  ${r.ok ? '✅' : '❌'} [${r.doc}] id=${JSON.stringify(r.nodeId)} type=${r.nodeType} 真实键=${JSON.stringify(r.trueKeyLiteral)} → 期望行 ${r.expectedLine}，实际 ${JSON.stringify(r.got)}`);
const d1Rows = edgeRows.filter((r) => r.doc.includes('方括号键') || r.doc.includes('含引号的键'));
const emptyKeyRows = edgeRows.filter((r) => r.doc.includes('空字符串键'));
const ellipsisKeyRows = edgeRows.filter((r) => r.doc.includes('__ellipsis__'));
check('D1 复验：方括号键 / 含引号键的真实树 id 现在都能正确定位',
  d1Rows.length > 0 && d1Rows.every((r) => r.ok), d1Rows);
check('探测：空字符串键（真实 JSON 合法）的真实树 id 可正确定位',
  emptyKeyRows.length > 0 && emptyKeyRows.every((r) => r.ok), emptyKeyRows);
check('探测：真实键名恰为 __ellipsis__ 时不会被误当折叠占位回退到父级',
  ellipsisKeyRows.length > 0 && ellipsisKeyRows.every((r) => r.ok), ellipsisKeyRows);
results.push({ name: 'task-7：id 形态探测明细', detail: edgeRows });

// ─── task-8 追加：D3/D4 判别力专项（真实 __ellipsis__ 键 与 折叠占位 共存于同一文档）───
console.log('\n>>> task-8：D3/D4 判别力专项');
const mixedDoc = '{\n  "__ellipsis__": 1,\n  "list": [\n'
  + Array.from({ length: 12 }, (_, i) => `    { "__ellipsis__": ${100 + i}, "id": ${i} }`).join(',\n')
  + '\n  ]\n}\n';
const scanM = myScan(mixedDoc);
const lineOfPathM = (p) => { const o = scanM.entries.get(p); return o ? lineColBySplit(mixedDoc, o[0].kind === 'key' ? o[0].keyStart : o[0].valueStart).line : null; };
const mixedCases = [
  { id: '$.__ellipsis__', expect: lineOfPathM('$.__ellipsis__'), desc: '根上的真实 __ellipsis__ 键（字面命中）' },
  { id: '$.list[0].__ellipsis__', expect: lineOfPathM('$.list[0].__ellipsis__'), desc: '数组元素内的真实 __ellipsis__ 键（字面命中）' },
  { id: '$.list.__ellipsis__', expect: lineOfPathM('$.list'), desc: '折叠占位 $.list.__ellipsis__（应回退父数组 $.list）' },
  { id: '$.list', expect: lineOfPathM('$.list'), desc: '父数组本身（对照）' },
];
const mixedRows = mixedCases.map((c) => {
  const got = locateJsonPath(mixedDoc, c.id);
  return { ...c, got: got ? { offset: got.offset, line: got.line } : null, ok: got !== null && c.expect !== null && got.line === c.expect };
});
for (const r of mixedRows) console.log(`  ${r.ok ? '✅' : '❌'} ${r.desc}：id=${JSON.stringify(r.id)} → 期望行 ${r.expect}，实际 ${JSON.stringify(r.got)}`);
check('D4 复验：真实键名 __ellipsis__（根 / 数组元素内）按字面命中，不再回退到父级',
  mixedRows.filter((r) => r.desc.includes('字面命中')).every((r) => r.ok), mixedRows.filter((r) => r.desc.includes('字面命中')));
check('占位回退行为不变：折叠占位 $.list.__ellipsis__ 仍回退到父数组行',
  mixedRows.filter((r) => r.desc.includes('折叠占位')).every((r) => r.ok), mixedRows.filter((r) => r.desc.includes('折叠占位')));
results.push({ name: 'task-8：D3/D4 判别力专项', detail: mixedRows });
// D3 边界对照：文档里不存在空字符串键 → 必须仍是 null（解析放宽但不得瞎跳）
const noEmptyKey = locateJsonPath('{"a":1}', '$.');
check('D3 边界：文档中不存在空字符串键时 $. 仍返回 null（解析放宽但不瞎跳）', noEmptyKey === null, { noEmptyKey });

for (const d of tempDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } }

const ev = {
  implFile: path.relative(WEB, SRC), implBytes: srcText.length,
  pass, fail,
  docs: Object.fromEntries(Object.entries(docSummaries).map(([k, v]) => [k, { bytes: v.bytes, lines: v.lines, pathsChecked: v.pathsChecked, scanEntries: v.scanEntries, samples: v.samples, dupNote: v.dupNote }])),
  timings: { big5000_last_ms: +tBig.toFixed(3), big5000_first_ms: +tBigFirst.toFixed(3), deep600_shallow_ms: +tDeep.toFixed(3), deep600_over512_ms: +tDeepOver.toFixed(3), payload_ms: +tPayload.toFixed(3) },
  edgeOut, ellipsis: { ell, arr },
  compared,
  results,
};
fs.writeFileSync(path.join(OUT, 'verify-locate-oracle-evidence.json'), JSON.stringify(ev, null, 2));
console.log(`\n===== 独立 oracle 校验：通过 ${pass} / 失败 ${fail}（共比对 ${compared} 个 path 调用）=====`);
console.log(`证据：${path.join(OUT, 'verify-locate-oracle-evidence.json')}`);
try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
process.exit(fail > 0 ? 1 : 0);