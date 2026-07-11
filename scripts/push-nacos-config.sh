#!/usr/bin/env bash
# ===================================================================
# story-n5: 将 nacos-config/{dev,prod} 下的配置【渲染真实值后】推送到 Nacos 配置中心
#
# 渐进式迁移（架构 Decision 4）：
#   - 仓库内的 nacos-config/{dev,prod}/*.yaml 是「模板」，敏感值用 ${ENV_VAR} 占位符，
#     不写明文（符合敏感信息红线，可进 git）。
#   - 部署时本脚本从「值文件」（部署机的 .env，gitignored）读取真实值，把占位符渲染为
#     真实值后再推送，使 Nacos 真正持有配置，docker-compose 仅需 4 个 NACOS_* 连接变量。
#
# 双 Namespace 模型：miao-toolbox-dev（开发）+ miao-toolbox-prod（生产）
# 每环境 7 个 dataId：DEFAULT_GROUP/application.yaml + 6 个 SECRET_GROUP
#   (db-and-cache / jwt / oauth / cos / miao-ai / baidu-translate)
#
# 用法：
#   # 本地开发：把 dev 命名空间推送（dev 模板多为直接写值，渲染为 no-op）
#   bash scripts/push-nacos-config.sh                 # 默认 TARGET=dev
#   TARGET=dev  bash scripts/push-nacos-config.sh
#
#   # 生产部署（只能在部署机上执行，值文件含生产真实值）：
#   TARGET=prod VALUES_FILE=/opt/miao-toolbox/.env bash scripts/push-nacos-config.sh
#
# 安全护栏：
#   - TARGET=prod 时，值文件必须显式提供（VALUES_FILE），且其中的 NACOS_NAMESPACE
#     必须为 miao-toolbox-prod，否则中止，避免把 dev 值误推到 prod。
#   - 渲染时若占位符 ${VAR} 无默认值且值文件未提供，则报错中止，避免推送空密钥。
# ===================================================================
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
TARGET="${TARGET:-dev}"
VALUES_FILE="${VALUES_FILE:-${REPO_ROOT}/.env}"
CONFIG_DIR="${CONFIG_DIR:-${REPO_ROOT}/nacos-config}"

# ---- 加载值文件（真实环境变量的来源，gitignored）----
if [ -f "$VALUES_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; source "$VALUES_FILE"; set +a
else
  echo "警告：值文件 $VALUES_FILE 不存在，渲染占位符将只能使用模板内的默认值。" >&2
fi

NACOS_ADDR="${NACOS_ADDR:-nacos.yunmiao.site:38848}"
NACOS_USERNAME="${NACOS_USERNAME:?NACOS_USERNAME 未设置（应在值文件中提供）}"
NACOS_PASSWORD="${NACOS_PASSWORD:?NACOS_PASSWORD 未设置（应在值文件中提供）}"

# ---- 目标 Namespace 选择 + 护栏 ----
if [ "$TARGET" = "prod" ]; then
  NS="${NACOS_NAMESPACE:-miao-toolbox-prod}"
  if [ "$NS" != "miao-toolbox-prod" ]; then
    echo "错误：TARGET=prod 但 NACOS_NAMESPACE=$NS（应为 miao-toolbox-prod），已中止以防误推。" >&2
    exit 1
  fi
  echo "==> 目标：生产 Namespace=$NS（值文件: $VALUES_FILE）"
elif [ "$TARGET" = "dev" ]; then
  NS="${NACOS_NAMESPACE:-miao-toolbox-dev}"
  echo "==> 目标：开发 Namespace=$NS（值文件: $VALUES_FILE）"
else
  echo "错误：TARGET 仅支持 dev | prod，收到 '$TARGET'" >&2
  exit 1
fi

BASE="http://${NACOS_ADDR}/nacos"

# ---- 渲染：${VAR} / ${VAR:default} -> 值文件中的真实值 ----
render() {
  local file="$1"
  python3 - "$file" <<'PY'
import os, re, sys
path = sys.argv[1]
missing = []
def repl(m):
    inner = m.group(1)
    if ':' in inner:
        name, default = inner.split(':', 1)
    else:
        name, default = inner, None
    if name in os.environ:
        return os.environ[name]
    if default is not None:
        return default
    missing.append(name)
    return ''
out_lines = []
for line in open(path, encoding='utf-8').read().splitlines():
    # 跳过整行注释，避免注释中的 ${...} 被误当作占位符
    if line.lstrip().startswith('#'):
        out_lines.append(line)
        continue
    out_lines.append(re.sub(r'\$\{([^}]+)\}', repl, line))
if missing:
    sys.stderr.write("ERROR: 以下占位符在值文件中缺失且无默认值（文件 %s）: %s\n"
                     % (path, ", ".join(missing)))
    sys.exit(2)
sys.stdout.write("\n".join(out_lines) + "\n")
PY
}

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

push_rendered() {
  local file="$1" group="$2"
  local dataId
  dataId="$(basename "$file")"
  local tmp
  tmp="$(mktemp)"
  render "$file" > "$tmp"
  # 渲染后不应残留未解析的占位符
  if grep -q '\${' "$tmp"; then
    echo "错误：渲染后 $ns/$group/$dataId 仍含未解析占位符，已中止。" >&2
    cat "$tmp" >&2
    rm -f "$tmp"
    exit 1
  fi
  echo "==> 推送 ${NS}/${group}/${dataId}"
  curl -s --connect-timeout 10 --max-time 20 -X POST "${BASE}/v1/cs/configs?accessToken=${TOKEN}" \
    --data-urlencode "dataId=${dataId}" \
    --data-urlencode "group=${group}" \
    --data-urlencode "tenant=${NS}" \
    --data-urlencode "type=yaml" \
    --data-urlencode "content@${tmp}"
  echo
  rm -f "$tmp"
}

ensure_namespace "$NS"

echo "==> 推送 DEFAULT_GROUP/application.yaml"
push_rendered "${CONFIG_DIR}/${TARGET}/application.yaml" "DEFAULT_GROUP"

echo "==> 推送 SECRET_GROUP（密钥类，渲染真实值）"
for f in db-and-cache.yaml jwt.yaml oauth.yaml cos.yaml miao-ai.yaml baidu-translate.yaml; do
  push_rendered "${CONFIG_DIR}/${TARGET}/$f" "SECRET_GROUP"
done

echo "==> 完成：已推送 ${TARGET} 命名空间（7 个 dataId）到 Nacos ${NACOS_ADDR}。"
