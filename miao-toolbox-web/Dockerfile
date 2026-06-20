# === Build 阶段 ===
FROM node:20-alpine AS builder
WORKDIR /build

# 单独 COPY package.json 充分利用 Docker 缓存
COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# === Runtime 阶段 ===
FROM nginx:1.28-alpine
LABEL maintainer="miao-toolbox"

# 复制构建产物
COPY --from=builder /build/dist /usr/share/nginx/html

# 复制 nginx 配置(把 /api/ 反代到 miao-api:8080)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
    CMD wget -qO- http://127.0.0.1/ | grep -q "<!DOCTYPE\|<html" || exit 1

EXPOSE 80

# nginx 镜像默认以 root 启动 daemon off,无需调整
CMD ["nginx", "-g", "daemon off;"]
