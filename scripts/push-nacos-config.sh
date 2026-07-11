#!/usr/bin/env bash
# ===================================================================
# story-n3: 将 nacos-config/ 下的 9 个 dataId 推送到 Nacos 配置中心
# 凭据从仓库根目录 .env 读取：NACOS_ADDR / NACOS_NAMESPACE / NACOS_USERNAME / NACOS_PASSWORD
# 注意：NACOS_ADDR 必须是 HTTP 端口（控制台 UI + OpenAPI 同在 :38848）；
#       :39848 是 Nacos 2.x 的 gRPC 端口（= HTTP 端口 + 1000，由客户端自动派生），不提供 HTTP 接口。
# 用法：bash scripts/push-nacos-config.sh
# ===================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"
CONFIG_DIR="${REPO_ROOT}/nacos-config"

# 加载 .env（若存在）
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

NACOS_ADDR="${NACOS_ADDR:-nacos.yunmiao.site:38848}"
NACOS_NAMESPACE="${NACOS_NAMESPACE:-miao-toolbox}"
NACOS_USERNAME="${NACOS_USERNAME:?NACOS_USERNAME 未设置}"
NACOS_PASSWORD="${NACOS_PASSWORD:?NACOS_PASSWORD 未设置}"

BASE="http://${NACOS_ADDR}/nacos"

echo "==> 登录 Nacos (${NACOS_ADDR})"
LOGIN_RESP="$(curl -s --connect-timeout 10 --max-time 20 -X POST "${BASE}/v1/auth/login" \
  --data-urlencode "username=${NACOS_USERNAME}" \
  --data-urlencode "password=${NACOS_PASSWORD}")"
TOKEN="$(printf '%s' "$LOGIN_RESP" | sed -E 's/.*"accessToken":"([^"]+)".*/\1/')"
[ -n "$TOKEN" ] || { echo "登录失败：未获取到 accessToken。响应=${LOGIN_RESP}"; exit 1; }

echo "==> 确保 Namespace=${NACOS_NAMESPACE} 存在（已存在则忽略）"
curl -s --connect-timeout 10 --max-time 20 -o /dev/null -w "namespace create: %{http_code}\n" -X POST \
  "${BASE}/v1/console/namespaces?accessToken=${TOKEN}" \
  --data-urlencode "namespaceId=${NACOS_NAMESPACE}" \
  --data-urlencode "namespaceName=${NACOS_NAMESPACE}" \
  --data-urlencode "namespaceDesc=miao-toolbox config" || true

# push <file> <group>
push() {
  local file="$1" group="$2"
  local dataId
  dataId="$(basename "$file")"
  echo "==> 推送 ${dataId} -> group=${group}"
  curl -s --connect-timeout 10 --max-time 20 -X POST "${BASE}/v1/cs/configs?accessToken=${TOKEN}" \
    --data-urlencode "dataId=${dataId}" \
    --data-urlencode "group=${group}" \
    --data-urlencode "tenant=${NACOS_NAMESPACE}" \
    --data-urlencode "type=yaml" \
    --data-urlencode "content@${file}"
  echo
}

# DEFAULT_GROUP（公共 / 非敏感）
for f in application.yaml application-dev.yaml application-prod.yaml; do
  push "${CONFIG_DIR}/$f" "DEFAULT_GROUP"
done

# SECRET_GROUP（密钥类）
for f in db-and-cache.yaml jwt.yaml oauth.yaml cos.yaml miao-ai.yaml baidu-translate.yaml; do
  push "${CONFIG_DIR}/$f" "SECRET_GROUP"
done

echo "==> 完成：请到 Nacos 控制台 (UI 端口) 核对 8 个 dataId 与分组"
