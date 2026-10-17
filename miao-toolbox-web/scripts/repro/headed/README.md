# JSON 工作台树行重叠 — headed(真实 GPU) 复现脚本与结论

任务：task-1（headed-repro）。目标是在 **headless:false + 真实 GPU 合成** 下复现用户截图的
「父行与子行完全重叠（约一个行高 28px）+ 右侧类型徽标重叠」。

## 运行方式（必须在 miao-toolbox-web 下执行；Playwright 只装在这里）

```bash
cd miao-toolbox-web

# 主脚本：默认 headless:false（真实 GPU），收银台日志提取器 → 在 JSON 工作台打开出参 → 展开 → 滚轮
node scripts/repro/headed/headed-overlap.mjs

# 关键变量（环境变量）
HEADLESS=1                     # 1=headless(SwiftShader) 对照
FLOW=cashier|direct|keepalive|hide-show|hide-show-scroll
VIEW=tree|split                # 点「树形」/「分栏」
W=1234 H=776                   # 视口
DPR=2                          # 强制设备像素比（不设=Playwright 默认 1）
REALVP=1                       # viewport:null，用真实窗口与真实屏幕 DPR（Retina=2）
PRELOAD=1                      # keepalive 流程：先在可见状态注入数据并展开
OPEN_FROM_EXTRACTOR=1          # keepalive 流程：隐藏状态下从提取器「打开出参」
WHEEL=12                       # 滚轮步数
TAG=xxx                        # 产物目录名

# 例：真实 DPR/真实窗口 + KeepAlive 隐藏/恢复路径
FLOW=keepalive PRELOAD=1 OPEN_FROM_EXTRACTOR=1 VIEW=tree REALVP=1 WHEEL=12 TAG=postfix node scripts/repro/headed/headed-overlap.mjs
```

产物：`/tmp/jw-repro/headed/<TAG>/step-*.json` + `step-*.png`（几何、itemSizeCache、measurementsCache、重叠对）。
退出码：0=有异常，2=无异常，1=脚本错误，4=90s 超时保护。

判定：任一两行 rect 纵向重叠 > 3px、或渲染行高 < 1px、或两行 translateY 相同 → 复现。

辅助诊断脚本：
- `diag-keepalive.mjs`：确认 KeepAlive 下树组件是否保持挂载、隐藏期间测量缓存是否被写成 0。
- `diag-mount.mjs`：确认「首屏深链」与「首页→侧栏」两种进入方式下组件是否被重挂载（状态是否丢失）。

## 结论：未复现「两行重叠」（0 异常 / 全部步骤）

已尝试变量：headless(SwiftShader) 与 headed(真实 GPU/Metal)、树形与分栏视图、
1234x776 / 1234x779(真实窗口) / 900x600、DPR 强制 1 / 强制 2 / 真实 Retina 2、
深链注入 / 真实提取器流程 / KeepAlive 切 Tab 隐藏恢复 / 隐藏状态下注入 /
滚轮 3~12 步往返。所有运行 `重叠>3px = 0`，无零高行，无重复 translateY。

最有价值的机制证据（原版代码，/tmp/jw-repro/headed/dry-ka/step-02-hidden.json）：
KeepAlive 用 `display:none` 隐藏非激活工具页（AppLayout.tsx），此时 ResizeObserver 交付 0，
**整个 itemSizeCache 被写成 0（14 个 key 全 0，getTotalSize 426 → 30）**、隐藏期间渲染行数=0。
这正是「尺寸缓存为 0 → 该行与下一行完全重叠」的前置条件；但在所有已测流程里，
恢复可见后 ~1 帧内即被重新测量纠正，未能留下持久重叠。

未测到的最后一个候选：行选中时 `virtualizer.scrollToIndex(..., {behavior:'smooth'})` 会让
`shouldMeasureDuringScroll()` 在平滑滚动窗口内**丢弃**远处行的测量；若「0 尺寸污染」与
该窗口叠加（隐藏期间清零 → 恢复瞬间选中某行触发平滑滚动 → 同时展开远处节点），
0 可能永久留在缓存里。建议作为后续验证方向。