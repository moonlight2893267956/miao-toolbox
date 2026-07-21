#!/usr/bin/env bash
# Story nt-3-1: SSRF 防护与网络客户端工厂 — 验收
# 前置: 在仓库根目录执行，需 JDK 21 + Maven Wrapper
# 用法: bash scripts/check-nt-3-1-ssrf-and-network-client-factory.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/miao-toolbox-api"

echo ">>> 运行 nt-3-1 相关单元测试"
./mvnw -q test \
  -Dtest=SsrfProtectorTest,NetworkClientFactoryTest,NetworkTimeoutConfigTest

echo ""
echo ">>> 验收汇总"
echo "  ✅ SsrfProtectorTest（内网拦截 / DNS 重绑定 / 公网放行）"
echo "  ✅ NetworkClientFactoryTest（连接工厂 / 超时常量 / 非法端口）"
echo "  ✅ NetworkTimeoutConfigTest（5s/10s/15s/30s）"
echo ""
echo "全部通过。后续 Story（nt-3-2 TCP Ping 等）可注入 SsrfProtector + NetworkClientFactory。"
