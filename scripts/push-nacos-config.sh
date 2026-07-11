#!/usr/bin/env bash
# ===================================================================
# story-n3: 将 nacos-config/{dev,prod} 下的配置推送到 Nacos 配置中心
# 双 Namespace 模型：miao-toolbox-dev（开发）+ miao-toolbox-prod（生产）
# 每环境 7 个 dataId：DEFAULT_GROUP/application.yaml + 6 个 SECRET_GROUP
# 凭据从仓库根目录 .env 读取：NACOS_ADDR / NACOS_USERNAME / NACOS_PASSWORD
# 注意：NACOS_ADDR 必须是 HTTP 端口（UI + OpenAPI 同在 :38848）；
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
NACOS_USERNAME="${NACOS_USERNAME:?NACOS_USERNAME 未设置}"
NACOS_PASSWORD="${NACOS_PASSWORD:?NACOS_PASSWORD 未设置}"

# 双 Namespace（环境隔离由 Namespace 完成，不再用 Profile 覆盖）
DEV_NS="miao-toolbox-dev"
PROD_NS="miao-toolbox-prod"

BASE="http://${NACOS_ADDR}/nacos"

echo "==> 登录 Nacos (${NACOS_ADDR})"
LOGIN_RESP="$(curl -s --connect-timeout 10 --max-time 20 -X POST "${BASE}/v1/auth/login" \
  --data-urlencode "username=${NACOS_USERNAME}" \
  --data-urlencode "password=${NACOS_PASSWORD}")"
TOKEN="$(printf '%s' "$LOGIN_RESP" | sed -E 's/.*"accessToken":"([^"]+)".*/\1/')"
[ -n "$TOKEN" ] || { echo "登录失败：未获取到 accessToken。响应=${LOGIN_RESP}"; exit 1; }

ensure_namespace() {
  local ns="$1"
  echo "==> 确保 Namespace=${ns} 存在（已存在则忽略）"
  curl -s --connect-timeout 10 --max-time 20 -o /dev/null -w "  namespace ${ns}: %{http_code}\n" -X POST \
    "${BASE}/v1/console/namespaces?accessToken=${TOKEN}" \
    --data-urlencode "namespaceId=${ns}" \
    --data-urlencode "namespaceName=${ns}" \
    --data-urlencode "namespaceDesc=miao-toolbox config" || true
}

push() {
  local file="$1" group="$2" ns="$3"
  local dataId
  dataId="$(basename "$file")"
  echo "==> 推送 ${ns}/${group}/${dataId}"
  curl -s --connect-timeout 10 --max-time 20 -X POST "${BASE}/v1/cs/configs?accessToken=${TOKEN}" \
    --data-urlencode "dataId=${dataId}" \
    --data-urlencode "group=${group}" \
    --data-urlencode "tenant=${ns}" \
    --data-urlencode "type=yaml" \
    --data-urlencode "content@${file}"
  echo
}

ensure_namespace "$DEV_NS"
ensure_namespace "$PROD_NS"

# DEFAULT_GROUP（公共 / 非敏感）
for env in dev prod; do
  ns="$DEV_NS"; [ "$env" = "prod" ] && ns="$PROD_NS"
  push "${CONFIG_DIR}/${env}/application.yaml" "DEFAULT_GROUP" "$ns"
done

# SECRET_GROUP（密钥类）
for env in dev prod; do
  ns="$DEV_NS"; [ "$env" = "prod" ] && ns="$PROD_NS"
  for f in db-and-cache.yaml jwt.yaml oauth.yaml cos.yaml miao-ai.yaml baidu-translate.yaml; do
    push "${CONFIG_DIR}/${env}/$f" "SECRET_GROUP" "$ns"
  done
done

echo "==> 完成：共推送 14 个 dataId（dev 7 + prod 7）到两个 Namespace。"
echo "==> 注意：旧的单 Namespace 'miao-toolbox'（story-n3 初版误建）已成孤儿，可手动删除或执行下方清理："
echo "    curl -X DELETE \"${BASE}/v1/console/namespaces?namespaceId=miao-toolbox&accessToken=${TOKEN}\""
