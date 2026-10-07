#!/usr/bin/env node
/**
 * fetch-wubi-dict.mjs
 *
 * 可选脚本：从上游项目重新拉取五笔 86 版码表并生成归一化快照。
 *
 * 默认不运行；仅在需要更新数据时显式调用：
 *   node scripts/fetch-wubi-dict.mjs --fetch
 *
 * 拉取后写入 scripts/data-sources/wubi86/ 下的 TSV 快照文件。
 * 之后执行 build-wubi-tables.mjs 即可从快照生成前端 JSON。
 *
 * 数据来源：
 *   - 主选：RIME rime-wubi (https://github.com/rime/rime-wubi)
 *     核心文件：wubi86.dict.yaml
 *     许可证：GPL-3.0
 *   - 备选：fcitx5-table-extra
 *
 * 注意：本脚本仅在显式 --fetch 时联网；默认构建路径（build-wubi-tables.mjs）不联网。
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const SNAPSHOT_DIR = join(ROOT, 'scripts/data-sources/wubi86');
const CHARS_TSV = join(SNAPSHOT_DIR, 'wubi86.chars.tsv');
const PHRASES_TSV = join(SNAPSHOT_DIR, 'wubi86.phrases.tsv');

// RIME wubi86.dict.yaml 的 raw URL
const RIME_WUBI_URL = 'https://raw.githubusercontent.com/rime/rime-wubi/master/wubi86.dict.yaml';

/**
 * 解析 RIME dict.yaml 格式。
 *
 * 文件结构：
 *   1. 注释（# 开头）
 *   2. YAML front matter：由 `---` 开始、`...` 结束（含 columns/encoder 配置）
 *   3. 词条正文（在 `...` 之后）：text \t code \t weight \t [stem]
 *
 * 词条示例：
 *   工	a	99454797	aa   ← 一级简码 a，第 4 列 aa 是二级简码
 *   工	aaa	551000000         ← 三级简码
 *   工	aaaa	551000000        ← 全码
 *   中国	khlg	1220000000    ← 词组
 *
 * 注意：同一字有多条不同长度的编码（最短=简码，最长=全码）。
 */
function parseRimeDict(yamlContent) {
  const lines = yamlContent.split('\n');
  const chars = [];
  const phrases = [];
  let sawFrontMatter = false;
  let inBody = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // 空行与注释行：跳过
    if (!trimmed || trimmed.startsWith('#')) continue;

    // YAML front matter 边界
    if (trimmed === '---') { sawFrontMatter = true; continue; }
    if (trimmed === '...') { inBody = true; continue; }

    // 若存在 front matter 且尚未结束，跳过头部配置行
    if (sawFrontMatter && !inBody) continue;

    // 词条行：text \t code \t weight \t [stem]
    const parts = line.split('\t');
    if (parts.length < 2) continue;

    const word = parts[0].trim();
    const code = parts[1].trim();
    const weight = Number(parts[2]?.trim() ?? 0) || 0;
    const stem = parts[3]?.trim();

    if (!word || !code) continue;
    if (!/^[a-y]{1,4}$/.test(code)) continue;

    // 按「字符数」而非字节数判断单字/词组
    const charLen = Array.from(word).length;

    if (charLen === 1) {
      chars.push([word, code, weight]);
      // 第 4 列 stem 是下一级短码，一并收录（供全码/简码推导）
      if (stem && /^[a-y]{1,4}$/.test(stem)) {
        chars.push([word, stem, weight]);
      }
    } else if (charLen >= 2) {
      phrases.push([word, code, weight]);
    }
  }

  return { chars, phrases };
}

async function fetchFromRime() {
  console.log(`正在从 RIME 拉取: ${RIME_WUBI_URL}`);

  const yaml = await downloadAsText(RIME_WUBI_URL);
  console.log(`下载完成: ${yaml.length} 字节`);

  const { chars, phrases } = parseRimeDict(yaml);
  console.log(`解析结果: 单字 ${chars.length} 条, 词组 ${phrases.length} 条`);

  return { chars, phrases };
}

/**
 * 下载文本。
 *
 * 优先用 curl（自动读取 HTTPS_PROXY / ALL_PROXY 等环境变量，
 * 兼容需要代理的网络环境）；curl 不可用时回退到 Node 内置 fetch。
 */
async function downloadAsText(url) {
  // 1) 尝试 curl
  try {
    const { execFileSync } = await import('child_process');
    const buf = execFileSync(
      'curl',
      ['-sSL', '--max-time', '120', '--retry', '2', url],
      { maxBuffer: 64 * 1024 * 1024, encoding: 'utf-8' },
    );
    if (buf && buf.length > 0) {
      return buf;
    }
    console.warn('  ⚠ curl 返回空内容，尝试 fetch 回退…');
  } catch (err) {
    console.warn(`  ⚠ curl 失败（${err.message}），尝试 fetch 回退…`);
  }

  // 2) 回退到 fetch
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return await response.text();
}

function writeTsv(filePath, entries) {
  const content = entries
    .map(([word, code, weight]) => `${word}\t${code}\t${weight ?? 0}`)
    .join('\n') + '\n';
  writeFileSync(filePath, content, 'utf-8');
  console.log(`  写入: ${filePath} (${entries.length} 条)`);
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.includes('--fetch')) {
    console.log('用法: node scripts/fetch-wubi-dict.mjs --fetch');
    console.log('本脚本仅在 --fetch 时联网拉取上游码表并重建快照。');
    console.log('默认构建路径（build-wubi-tables.mjs）不联网，直接从入库快照读取。');
    process.exit(0);
  }

  console.log('五笔码表 — 上游数据拉取\n');

  if (!existsSync(SNAPSHOT_DIR)) {
    mkdirSync(SNAPSHOT_DIR, { recursive: true });
  }

  try {
    const { chars, phrases } = await fetchFromRime();

    console.log('\n写入快照:');
    writeTsv(CHARS_TSV, chars);
    writeTsv(PHRASES_TSV, phrases);

    console.log('\n✓ 快照重建完成');
    console.log('  下一步: node scripts/build-wubi-tables.mjs');
  } catch (err) {
    console.error(`\n✗ 拉取失败: ${err.message}`);
    console.error('  可手动下载 wubi86.dict.yaml 并放入快照目录');
    process.exit(1);
  }
}

main();
