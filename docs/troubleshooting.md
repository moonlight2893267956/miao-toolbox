# 阿渺工具箱 — 故障排查手册

> 按"症状 → 原因 → 修复"组织。遇到报错先 ctrl+F 关键字。
>
> 部署见 [deployment.md](deployment.md)，日常运维见 [operations.md](operations.md)。

---

## 目录

- 部署类
  - [1. Flyway checksum 不匹配，启动失败](#1-flyway-checksum-不匹配启动失败)
  - [2. SSL 申请后反代被冲掉，404](#2-ssl-申请后反代被冲掉404)
  - [3. cookie-secure: true 后 refresh token 丢失，登录态立即断](#3-cookie-secure-true-后-refresh-token-丢失登录态立即断)
  - [4. 改了 .env 重启后容器内环境变量还是旧值](#4-改了-env-重启后容器内环境变量还是旧值)
- 数据类
  - [5. 用户列表"最后登录"全是"从未登录"](#5-用户列表最后登录全是从未登录)
  - [6. AI 调用日志没数据 / model 和 token 是空的](#6-ai-调用日志没数据--model-和-token-是空的)
  - [7. 仪表盘"异常请求数"永远是 0](#7-仪表盘异常请求数永远是-0)
- 后端开发类
  - [8. `user_id` 不能为 null（ai_invocations 写入失败）](#8-user_id-不能为-nullai_invocations-写入失败)
  - [9. IDEA 改了代码但 server 跑的还是旧 class](#9-idea-改了代码但-server-跑的还是旧-class)
  - [10. 前端调 API 报 CORS / 401 / 403](#10-前端调-api-报-cors--401--403)
- 前端类
  - [11. 限流设置不显示（已设置但回显空）](#11-限流设置不显示已设置但回显空)
  - [12. Trace ID 列只显示前 8 位](#12-trace-id-列只显示前-8-位)
- 未来工作

---

## 部署类

### 1. Flyway checksum 不匹配，启动失败

**症状**：

```
BeanCreationException: Error creating bean 'flywayInitializer'
Migration checksum mismatch for migration version 10
-> Applied to database : 484208359
-> Resolved locally    : 933960358
```

或：

```
Migration description mismatch for migration version 10
-> Applied to database : create tools table
-> Resolved locally    : create ai invocations table
```

**原因**：数据库已经执行过的 Flyway 迁移脚本**不能在本地被覆盖或改名**。本地改了 V10 之后，Flyway 校验本地 checksum/description 与数据库记录不匹配。

**修复**：

| 情况 | 修复方式 |
|---|---|
| 想改脚本逻辑 | **不能改**。要么新建 V11 写补丁，要么 git revert 后新建 V11 |
| 误改了 description 字段 | 在 docker 内手动 UPDATE：<br>`UPDATE flyway_schema_history SET checksum = 933960358, description = 'create ai invocations table' WHERE version = '10';` |
| 故意要覆盖（很危险） | `mvnw flyway:repair`（开发期可以，生产禁用） |

**预防**：

- 迁移脚本一旦提交到 main 并执行过，**永远只追加不修改**
- 任何"修改"用新版本号（V11 / V12）写补丁脚本
- 本地开发期发现脚本错了直接 `rm` 重写，但要 `mvnw flyway:clean` 清掉历史

---

### 2. SSL 申请后反代被冲掉，404

**症状**：申请 Let's Encrypt 成功后，访问 `https://tools.yunmiao.site/api/...` 返回 404 或 502。

**原因**：宝塔申请 SSL 时会**重写主 vhost**，把我们之前在 `tools.yunmiao.site.conf` 里加的反代 `location` 全部冲掉。

**修复**：把反代写在宝塔的 `extension` 目录，宝塔改主 vhost 不会影响：

```bash
# 路径（deployment.md §4.4）
/www/server/panel/vhost/nginx/extension/tools.yunmiao.site/00-miao-toolbox.conf
```

**反代 location 必须用 `^~` 前缀**，否则宝塔主 vhost 里的正则 location（`location ~ .*\.js$`）会抢走 `/assets/*.js` 等静态资源。

---

### 3. cookie-secure: true 后 refresh token 丢失，登录态立即断

**症状**：登录成功跳转首页后，刷新页面就掉登录态，F12 看到 `refresh_token` cookie 没设置。

**原因**：Spring 看不到反向代理的 `X-Forwarded-Proto: https` 头，以为是 HTTP，cookie 不带 Secure 标志，浏览器在 HTTPS 下不发送。

**修复**：`application.yml` 必须有：

```yaml
server:
  forward-headers-strategy: framework
```

否则再改 `cookie-secure: true` 也无效。

---

### 4. 改了 .env 重启后容器内环境变量还是旧值

**症状**：改了 `.env` 里 `GITHUB_CLIENT_ID`，`docker compose restart api` 后 `docker exec miao-toolbox-api-1 printenv | grep GITHUB` 还是旧值。

**原因**：`restart` 只发 SIGHUP，**不重新解析 docker-compose 配置**。`up -d` 才会重读。

**修复**：

```bash
docker compose -f docker-compose.prod.yml up -d api    # 用 up -d，不要用 restart
```

详见 [operations.md §3](operations.md#3-修改-env最容易踩的坑)。

---

## 数据类

### 5. 用户列表"最后登录"全是"从未登录"

**症状**：admin 已经登录过，但 admin 列表页显示"最后登录 · 从未登录"。

**原因 1（最常见）**：`AuthService.login()` 没写 `lastLoginAt` 字段，或**代码修改了但 server 没重启**（IDEA Run 模式不自动重载，见 [§9](#9-idea-改了代码但-server-跑的还是旧-class)）。

**原因 2**：DB 字段不存在。看 V9 迁移是否执行：

```sql
DESC users;  -- 应有 last_login_at 列
```

**修复**：

1. 确认 `AuthService.java:login()` 有 `user.setLastLoginAt(LocalDateTime.now(ZoneOffset.UTC));`
2. IDEA 改完代码后**点 Restart 按钮**重启 server
3. 重新登录一次，DB 就有值

**手动验证**：

```sql
UPDATE users SET last_login_at = NOW() WHERE id = 1;  -- 临时
SELECT id, username, last_login_at FROM users;
```

如果这样能显示 → 后端读取链路 OK，问题在登录逻辑没写；如果还显示 NULL → DTO 映射或前端问题。

---

### 6. AI 调用日志没数据 / model 和 token 是空的

**症状**：`/admin/invocations` 列表空，或者有记录但 model 列是 `-`、tokens 是 0。

**原因**：

- **列表空** = 还没人调过 AI 工具；或 miao-ai 服务（`http://localhost:8000`）没启动，请求失败但没记录
- **model / token 是 0** = miao-ai 响应里没带这些字段（当前 miao-ai 没启动时 fallback 空值）

**修复**：

1. 确认 miao-ai 服务在跑：`curl http://localhost:8000/health`（或对应地址）
2. 确认 `MiaoAiClient` 已重构（调 miao-ai 的代码都走 `MiaoAiClient.invoke()`，自动记录）
3. 确认调用方带了 JWT token（没 token 时 `userId` 为 null，写入会失败）
4. **临时绕过**：手动写一条 `ai_invocations` 记录看仪表盘能否聚合：

```sql
INSERT INTO ai_invocations (request_id, user_id, agent_name, status, latency_ms, created_at, model, prompt_tokens, completion_tokens)
VALUES ('test-001', 1, 'diff-explainer', 'SUCCESS', 1000, NOW(), 'gpt-4', 100, 200);
```

---

### 7. 仪表盘"异常请求数"永远是 0

**症状**：仪表盘上"异常请求数"卡片永远是 0。

**原因**：早期版本用 `audit_logs` 表统计，但 `audit_logs` 表 0 数据（已废弃）。现在用 `ai_invocations` 统计，但 `ai_invocations` 里也几乎没有 `FAILURE` 记录（miao-ai 真实没启动时是连接失败，记为 `SUCCESS` 而不是 `FAILURE`）。

**修复**：

- 这是历史包袱，需要重新设计"失败判定"语义（HTTP 5xx 才算 FAILURE，连接失败归为"未送达"）
- 临时方案：手动写一条 `status='FAILURE'` 的记录看仪表盘能否聚合

---

## 后端开发类

### 8. `user_id` 不能为 null（ai_invocations 写入失败）

**症状**：

```
ERROR c.m.t.o.AiInvocationRecorder - Failed to persist ai_invocation
org.springframework.dao.DataIntegrityViolationException: Column 'user_id' cannot be null
```

**原因**：`MiaoAiClient.getCurrentUserId()` 从 `request.getAttribute("userId")` 取值，但**这个属性不存在**。JwtAuthFilter 把 userId 放在 `SecurityContextHolder.getContext().getAuthentication().getPrincipal()`（即 `User` 实体对象）里。

**修复**：`getCurrentUserId()` 改为优先从 `SecurityContextHolder` 取：

```java
private Long getCurrentUserId() {
    try {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof User user) {
            return user.getId();
        }
        // 兜底：从 request attribute 取
        var attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attrs != null) {
            Object userIdAttr = attrs.getRequest().getAttribute("userId");
            if (userIdAttr instanceof Long l) return l;
        }
        return null;
    } catch (Exception e) {
        return null;
    }
}
```

注意要 import：`org.springframework.security.core.Authentication`、`org.springframework.security.core.context.SecurityContextHolder`、`com.miao.toolbox.auth.entity.User`。

---

### 9. IDEA 改了代码但 server 跑的还是旧 class

**症状**：改了 `*.java` 文件，浏览器访问时表现是旧行为。`mvnw compile` 后 `target/classes` 里的 class 文件已经更新，但 server 还在用内存里的旧版本。

**原因**：IDEA Run 模式启动的 Spring Boot 进程**不会自动重载新 class**。`mvnw compile` 只更新磁盘文件，不重启 JVM。

**修复**：

1. **点 IDEA 的 Restart 按钮**（绿色循环箭头），或在 Run 工具栏选 Rerun
2. 不要相信 `mvnw compile` 后立即刷新浏览器就有效果
3. 如果用 `mvnw spring-boot:run` 在终端启动，杀掉进程再重启

**检查 server 加载的 class 时间**：

```bash
lsof -p <PID> | grep AuthService.class
# 或
ps -p <PID> -o etime,command   # 看启动时长
```

如果 etime > 你最后一次代码改动的时间 = server 跑的是旧代码。

---

### 10. 前端调 API 报 CORS / 401 / 403

| 状态 | 原因 | 修复 |
|---|---|---|
| CORS 拒绝 | `CORS_ALLOWED_ORIGINS` 没包含前端域名 | `.env` 加 `CORS_ALLOWED_ORIGINS=http://localhost:5173`（dev） |
| 401 Unauthorized | JWT 缺失 / 过期 | F12 看 Network 是否有 `Authorization: Bearer ...` 头 |
| 401 持续刷新失败 | refresh token 也失效 | 清浏览器 cookie 重新登录 |
| 403 Forbidden | 角色不够 | 当前用户是 USER 但调 `/api/admin/**` |
| 401 + X-Sign 相关 | HMAC 签名头缺失/错误 | 看 axiosInstance.ts 的拦截器，确认带 X-Request-Timestamp/Nonce/Signature |

---

## 前端类

### 11. 限流设置不显示（已设置但回显空）

**症状**：在 admin 用户管理里给某用户设了"自定义限流 50/分钟"，保存后再次打开用户列表，限流值还是显示"默认"。

**原因**（4 处缺失）：

1. `AdminUserResponse` DTO 没有 `rateLimit` 字段
2. `UserManageService.toResponse()` 没从 Redis 读限流值
3. 前端 `AdminUser` 接口没声明
4. 前端 Stepper 用本地 state，没显示后端返回值

**修复**：4 个文件改，详见 git history "fix: 限流设置回显"。

**手动验证**：

```bash
# Redis 里设值(miao-redis 在 miao-infra compose 里)
docker exec miao-redis redis-cli -a "$REDIS_PASSWORD" SET miao:ratelimit:custom:2 "50"

# 调用 admin 用户列表 API
GET /api/admin/users?page=1&pageSize=20
# 应在响应中看到该用户的 rateLimit 字段
```

---

### 12. Trace ID 列只显示前 8 位

**症状**：`/admin/invocations` 表格的 Trace ID 列显示 `2eba4396...` 截断。

**原因**：旧版本用 `v.slice(0, 8) + '...'` 截断显示。

**修复**：

- 去掉 slice 截断，完整展示
- 加点击复制按钮（`navigator.clipboard.writeText`）
- 见 git history "fix: Trace ID 完整展示 + 一键复制"

**附加**：顺手补了 Trace ID 模糊搜索（`?traceId=...` 走 `LIKE %:traceId%`）。

---

## 未来工作

- [ ] **数据备份自动化**（目前手动 mysqldump）
- [ ] **监控/告警**（Prometheus + Grafana，可选）
- [ ] **CI/CD**（GitHub Actions 自动构建推送，目前手动）
- [ ] **资源限制更精细**（目前只设内存上限，没设 CPU）
- [ ] **日志收集**（目前 `docker logs`，无集中）
- [ ] **失败判定语义重做**（HTTP 5xx / 连接失败 / SSE 断开 三态区分）
- [ ] **"活跃用户" 改成真实在线**（Redis SET 跟踪 JwtAuthFilter 通过的 userId，30min TTL）
