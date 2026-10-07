# 五笔 86 版码表 — 归一化源数据快照

## 数据来源

**主选**：RIME `rime-wubi`
- 仓库：https://github.com/rime/rime-wubi
- 文件：`wubi86.dict.yaml`（1.85 MB）
- 许可证：GPL-3.0

## 工作流

```bash
cd <项目根>

# 1) 从上游拉取并归一化为 TSV 快照（唯一联网步骤）
node scripts/fetch-wubi-dict.mjs --fetch

# 2) 从快照生成前端 JSON chunk（离线，可复现）
node scripts/build-wubi-tables.mjs

# 3) 校验拆字覆盖率
node scripts/verify-wubi-split.mjs

# 开发调试可用样本数据（不联网）
node scripts/build-wubi-tables.mjs --sample
```

`npm run build` 永不联网，只读已入库快照。

## 上游文件格式（易踩坑）

```
# 注释行
---                          ← YAML front matter 开始
name: wubi86
columns: [text, code, weight, stem]
encoder: { ... }
...                          ← front matter 结束
                             ← 以下才是词条正文！
工	a	99454797	aa        ← 一级简码 a；第 4 列 aa 是二级简码
工	aaa	551000000         ← 三级简码
工	aaaa	551000000         ← 全码
中国	khlg	1220000000     ← 词组
```

**关键点**：
1. 词条在 `...` **之后**（不是 `---` 和 `...` 之间）
2. 同一字有多条**不同长度**的编码：最短 = 简码，最长 = 全码
3. 第 4 列 `stem` 是下一级短码，需一并收录
4. 判断单字/词组要按**字符数**（`Array.from(word).length`），不能用 `.length`（UTF-8 字节数）

## 快照格式

`wubi86.chars.tsv` / `wubi86.phrases.tsv`，三列 TSV：

```
<字或词>\t<编码>\t<词频权重>
```

## 生成物格式

`data/generated/chars.json`：

```json
{ "v": "86-1", "count": 13000,
  "entries": [["的", "rqyy", 1, "r"], ["啊", "kbsk", 0]] }
```

条目为 `[字, 全码, 简码等级, 简码?]`（简码为空时省略第 4 列以省体积）。
简码等级：`0`=无简码 `1`/`2`/`3`=一/二/三级。

`data/generated/phrases.json`：`[["中国", "khlg"], ...]`

## 体积预算与裁剪

| 表 | 上限 | 实测 gzip | 预算 |
|----|------|-----------|------|
| 单字 | 13000 条 | 99.2 KB | ≤ 100 KB |
| 词组 | 35000 条 | 260.7 KB | ≤ 300 KB |

上游含 7.5 万单字（覆盖全部 CJK 扩展），练习场景只需常用字。
构建脚本按 **「简码字优先 + 词频降序」** 裁剪（简化字权重加 `1e12` 保证 25 个一级简码不被裁掉）。
调整上限改 `scripts/build-wubi-tables.mjs` 顶部的 `CHARS_MAX_ENTRIES` / `PHRASES_MAX_ENTRIES`。

## 网络注意事项

若环境走代理（如 `HTTPS_PROXY=http://127.0.0.1:7890`）：

- **Node 内置 `fetch` 不读取代理环境变量**，会直接超时
- 拉取脚本已优先调用 `curl`（自动读取 `HTTPS_PROXY`/`ALL_PROXY`），失败才回退 `fetch`

## 注意事项

- 生成物 `data/generated/*.json` **禁止手改**（改数据 = 改快照 + 重跑脚本）
- 项目自托管自用、不分发，GPL 无传染性风险
- 许可证副本见同目录 `LICENSE`
