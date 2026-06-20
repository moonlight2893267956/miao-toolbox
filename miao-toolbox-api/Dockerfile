# === Build 阶段 ===
FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /build

# 单独 COPY pom.xml 充分利用 Docker 缓存:依赖未变时不重跑 go-offline
COPY pom.xml ./
RUN mvn -B -q dependency:go-offline

COPY src ./src
RUN mvn -B -q clean package -DskipTests \
    && cp target/miao-toolbox-api-*.jar /build/app.jar

# === Runtime 阶段 ===
FROM eclipse-temurin:21-jre-alpine
LABEL maintainer="miao-toolbox"

# 添加非 root 用户
RUN addgroup -S miao && adduser -S miao -G miao

WORKDIR /app
COPY --from=builder /build/app.jar /app/app.jar

# 健康检查(容器内直连 8080)
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=60s \
    CMD wget -qO- http://127.0.0.1:8080/actuator/health | grep -q '"status":"UP"' || exit 1

USER miao
EXPOSE 8080

# 默认 JVM 参数,可通过环境变量覆盖
ENV JAVA_OPTS="-Xms256m -Xmx384m -XX:+UseG1GC"

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
