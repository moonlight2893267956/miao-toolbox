package com.miao.toolbox.tool.scheduler.repository;

import com.miao.toolbox.tool.scheduler.entity.HttpTargetConfig;
import com.miao.toolbox.tool.scheduler.entity.NotifyConfig;
import com.miao.toolbox.tool.scheduler.entity.NotifyTrigger;
import com.miao.toolbox.tool.scheduler.entity.PresetTargetConfig;
import com.miao.toolbox.tool.scheduler.entity.ScheduledTask;
import com.miao.toolbox.tool.scheduler.entity.TargetHeader;
import com.miao.toolbox.tool.scheduler.entity.TargetType;
import com.miao.toolbox.tool.scheduler.entity.TaskStatus;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ScheduledTaskRepository JPA 切片测试（FR-14 数据基础 / AC1/AC2）。
 *
 * <p>验证 JSON 列（@JdbcTypeCode + AttributeConverter）与枚举在 H2 上的持久化往返。
 * 使用 test profile 的 H2 (MODE=MySQL)，Flyway 关闭、ddl-auto=create-drop。
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
@DisplayName("ScheduledTaskRepository JSON 列持久化")
class ScheduledTaskRepositoryTest {

    @Autowired
    private ScheduledTaskRepository repository;

    @DisplayName("AC2: HTTP 目标 JSON 往返（含敏感 header）")
    @Test
    void httpTargetConfigRoundTrip() {
        HttpTargetConfig config = HttpTargetConfig.builder()
                .method("POST")
                .url("https://example.com/api/notify")
                .headers(List.of(
                        TargetHeader.builder().name("Authorization").value("Bearer plain-secret").sensitive(true).build(),
                        TargetHeader.builder().name("X-Trace-Id").value("trace-001").sensitive(false).build()))
                .body("{\"time\":\"{{now}}\",\"task\":\"{{taskName}}\"}")
                .timeoutSeconds(30)
                .build();
        ScheduledTask task = ScheduledTask.builder()
                .name("健康检查任务")
                .description("每 5 分钟探针")
                .targetType(TargetType.HTTP)
                .targetConfig(config)
                .cronExpression("*/5 * * * *")
                .timezone("Asia/Shanghai")
                .status(TaskStatus.ENABLED)
                .retryCount(3)
                .retryInterval(60)
                .timeoutSeconds(30)
                .build();

        ScheduledTask saved = repository.saveAndFlush(task);

        ScheduledTask loaded = repository.findById(saved.getId()).orElseThrow();

        assertThat(loaded.getTargetType()).isEqualTo(TargetType.HTTP);
        assertThat(loaded.getStatus()).isEqualTo(TaskStatus.ENABLED);
        assertThat(loaded.getTargetConfig()).isInstanceOf(HttpTargetConfig.class);
        HttpTargetConfig loadedConfig = (HttpTargetConfig) loaded.getTargetConfig();
        assertThat(loadedConfig.getMethod()).isEqualTo("POST");
        assertThat(loadedConfig.getUrl()).isEqualTo("https://example.com/api/notify");
        assertThat(loadedConfig.getTimeoutSeconds()).isEqualTo(30);
        assertThat(loadedConfig.getHeaders()).hasSize(2);
        assertThat(loadedConfig.getHeaders().get(0).getName()).isEqualTo("Authorization");
        assertThat(loadedConfig.getHeaders().get(0).isSensitive()).isTrue();
        assertThat(loadedConfig.getHeaders().get(0).getValue()).isEqualTo("Bearer plain-secret");
        assertThat(loadedConfig.getBody()).contains("{{now}}").contains("{{taskName}}");
    }

    @DisplayName("AC2: PRESET 目标 JSON 往返（多态反序列化为正确子类型）")
    @Test
    void presetTargetConfigRoundTrip() {
        PresetTargetConfig config = PresetTargetConfig.builder()
                .template("CLEAN_EXECUTION_LOGS")
                .params(Map.of("retentionDays", 30))
                .build();
        ScheduledTask task = ScheduledTask.builder()
                .name("日志清理任务")
                .targetType(TargetType.PRESET)
                .targetConfig(config)
                .cronExpression("0 3 * * *")
                .timezone("Asia/Shanghai")
                .status(TaskStatus.ENABLED)
                .retryCount(0)
                .retryInterval(60)
                .timeoutSeconds(60)
                .build();

        ScheduledTask saved = repository.saveAndFlush(task);
        ScheduledTask loaded = repository.findById(saved.getId()).orElseThrow();

        assertThat(loaded.getTargetConfig()).isInstanceOf(PresetTargetConfig.class);
        PresetTargetConfig loadedConfig = (PresetTargetConfig) loaded.getTargetConfig();
        assertThat(loadedConfig.getTemplate()).isEqualTo("CLEAN_EXECUTION_LOGS");
        assertThat(loadedConfig.getParams()).containsEntry("retentionDays", 30);
    }

    @DisplayName("AC2: notify_config JSON 往返（可空列 null 语义）")
    @Test
    void notifyConfigRoundTrip() {
        NotifyConfig notify = NotifyConfig.builder()
                .webhook(NotifyConfig.WebhookNotify.builder()
                        .url("https://open.feishu.cn/hook/xxx")
                        .trigger(NotifyTrigger.ON_FAILURE)
                        .build())
                .email(NotifyConfig.EmailNotify.builder()
                        .recipients(List.of("admin@example.com", "ops@example.com"))
                        .trigger(NotifyTrigger.ALWAYS)
                        .build())
                .build();
        ScheduledTask withNotify = ScheduledTask.builder()
                .name("带通知任务")
                .targetType(TargetType.HTTP)
                .targetConfig(HttpTargetConfig.builder().method("GET").url("https://a.com").build())
                .cronExpression("* * * * *")
                .timezone("Asia/Shanghai")
                .status(TaskStatus.ENABLED)
                .retryCount(0)
                .retryInterval(60)
                .timeoutSeconds(30)
                .notifyConfig(notify)
                .build();
        ScheduledTask withoutNotify = ScheduledTask.builder()
                .name("无通知任务")
                .targetType(TargetType.HTTP)
                .targetConfig(HttpTargetConfig.builder().method("GET").url("https://b.com").build())
                .cronExpression("* * * * *")
                .timezone("Asia/Shanghai")
                .status(TaskStatus.PAUSED)
                .retryCount(0)
                .retryInterval(60)
                .timeoutSeconds(30)
                .build();

        ScheduledTask savedWith = repository.saveAndFlush(withNotify);
        ScheduledTask savedWithout = repository.saveAndFlush(withoutNotify);

        NotifyConfig loadedNotify = repository.findById(savedWith.getId()).orElseThrow().getNotifyConfig();
        assertThat(loadedNotify).isNotNull();
        assertThat(loadedNotify.getWebhook().getUrl()).isEqualTo("https://open.feishu.cn/hook/xxx");
        assertThat(loadedNotify.getWebhook().getTrigger()).isEqualTo(NotifyTrigger.ON_FAILURE);
        assertThat(loadedNotify.getEmail().getRecipients()).containsExactly("admin@example.com", "ops@example.com");
        assertThat(loadedNotify.getEmail().getTrigger()).isEqualTo(NotifyTrigger.ALWAYS);

        assertThat(repository.findById(savedWithout.getId()).orElseThrow().getNotifyConfig()).isNull();
    }

    @DisplayName("AC1/FR-1: 任务名称唯一性校验 existsByName")
    @Test
    void existsByName() {
        ScheduledTask task = ScheduledTask.builder()
                .name("唯一名称任务")
                .targetType(TargetType.HTTP)
                .targetConfig(HttpTargetConfig.builder().method("GET").url("https://c.com").build())
                .cronExpression("* * * * *")
                .timezone("Asia/Shanghai")
                .status(TaskStatus.ENABLED)
                .retryCount(0)
                .retryInterval(60)
                .timeoutSeconds(30)
                .build();
        repository.saveAndFlush(task);

        assertThat(repository.existsByName("唯一名称任务")).isTrue();
        assertThat(repository.existsByName("不存在的名称")).isFalse();
    }

    @DisplayName("NFR-2: findByStatus 加载启用任务（重启恢复数据源）")
    @Test
    void findByStatus() {
        repository.saveAndFlush(ScheduledTask.builder()
                .name("启用任务A").targetType(TargetType.HTTP)
                .targetConfig(HttpTargetConfig.builder().method("GET").url("https://d.com").build())
                .cronExpression("* * * * *").timezone("Asia/Shanghai")
                .status(TaskStatus.ENABLED).retryCount(0).retryInterval(60).timeoutSeconds(30)
                .build());
        repository.saveAndFlush(ScheduledTask.builder()
                .name("暂停任务B").targetType(TargetType.HTTP)
                .targetConfig(HttpTargetConfig.builder().method("GET").url("https://e.com").build())
                .cronExpression("* * * * *").timezone("Asia/Shanghai")
                .status(TaskStatus.PAUSED).retryCount(0).retryInterval(60).timeoutSeconds(30)
                .build());

        List<ScheduledTask> enabled = repository.findByStatus(TaskStatus.ENABLED);
        List<ScheduledTask> paused = repository.findByStatus(TaskStatus.PAUSED);

        assertThat(enabled).hasSize(1).allSatisfy(t -> assertThat(t.getStatus()).isEqualTo(TaskStatus.ENABLED));
        assertThat(paused).hasSize(1).allSatisfy(t -> assertThat(t.getStatus()).isEqualTo(TaskStatus.PAUSED));
    }
}
