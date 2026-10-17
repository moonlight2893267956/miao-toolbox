/**
 * 独立 oracle 库（task-6）：与实现无关的 JSON 扫描器与行列计算
 *
 * 由 scripts/verify/jw-locate-oracle.mjs 与 jw-locate-browser.mjs 共用：
 *  - myScan(text)         手写递归下降，记录每个 path 的键/值偏移与解析值（保留重复键的每一次出现）
 *  - lineColBySplit()     按 '\n' 切分 + 前缀累加，独立算 1 起始行列号
 *  - lookupByParse()      用 JSON.parse 结果按 path 取值（用于交叉校验 myScan）
 *  - encodeKeyForPath()   与 parseAndFlatten 的 safeKey 同规则的「路径协议」编码
 */

export function encodeKeyForPath(key) {
  return /[.[\]"']/.test(key) ? `["${key.replace(/"/g, '\\"')}"]` : key;
}

export function myScan(text) {
  let i = 0;
  const entries = new Map();
  const push = (p, e) => { if (!entries.has(p)) entries.set(p, []); entries.get(p).push(e); };

  const ws = () => { while (i < text.length && ' \t\r\n'.includes(text[i])) i++; };
  const fail = (msg) => { throw new Error(`scan error at ${i}: ${msg}`); };

  function readString() {
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
      i++; ws();
      if (text[i] === '}') { i++; return { start: valueStart, end: i, value: {} }; }
      const obj = {};
      for (;;) {
        ws();
        const keyTok = readString();
        ws();
        if (text[i] !== ':') fail('expected :');
        i++; ws();
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
      i++; ws();
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

/** 独立行/列计算：split('\n') + 前缀长度累加 */
export function lineColBySplit(text, offset) {
  const lines = text.split('\n');
  let acc = 0;
  for (let n = 0; n < lines.length; n++) {
    const len = lines[n].length;
    if (offset <= acc + len) return { line: n + 1, column: offset - acc + 1 };
    acc += len + 1;
  }
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

/** 用 JSON.parse 结果按 path 取值 */
export function lookupByParse(obj, p) {
  const segs = pathSegmentsForLookup(p);
  return segs.reduce((acc, s) => (acc == null ? acc : acc[s.v]), obj);
}

export function pathSegmentsForLookup(p) {
  const segs = [];
  let i = 1;
  while (i < p.length) {
    if (p[i] === '.') {
      i++;
      if (p[i] === '[') continue; // 容忍树 id 的 `.["k"]` 形态（点后直接跟方括号，无键名）
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

/** 期望偏移：键结尾段 → 键字面量起点；下标结尾段 → 元素起点 */
export function expectedOffsetFor(entries, p) {
  const occ = entries.get(p);
  if (!occ || !occ.length) return null;
  const first = occ[0];
  return { offset: first.kind === 'key' ? first.keyStart : first.valueStart, kind: first.kind, occ };
}