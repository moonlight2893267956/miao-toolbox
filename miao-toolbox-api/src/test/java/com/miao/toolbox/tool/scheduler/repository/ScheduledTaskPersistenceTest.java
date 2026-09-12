package com.miao.toolbox.tool.scheduler.repository;

import com.miao.toolbox.tool.scheduler.entity.ScheduledTask;
import com.miao.toolbox.tool.scheduler.entity.Script;
import com.miao.toolbox.tool.scheduler.entity.ScriptType;
import com.miao.toolbox.tool.scheduler.entity.TaskStatus;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 定时任务持久化测试。
 *
 * <p>重点验证 {@code params} 列：实体是 {@code String} + {@code @JdbcTypeCode(SqlTypes.JSON)}，
 * 必须按「原始 JSON 文本」存取。若被序列化成 JSON 字符串字面量（外层多一层引号），
 * 执行器解析参数就会失败或读不到值——这正是「脚本里 $SCRIPT_PARAM_XXX 为空」的典型成因。
 */
@DataJpaTest
@ActiveProfiles("test")
@DisplayName("定时任务持久化")
class ScheduledTaskPersistenceTest {

    @Autowired
    private ScheduledTaskRepository taskRepository;

    @Autowired
    private ScriptRepository scriptRepository;

    @DisplayName("params 按原始 JSON 文本往返，不被二次转义")
    @Test
    void paramsRoundTripAsRawJson() {
        Script script = scriptRepository.save(Script.builder()
                .name("测试脚本")
                .scriptType(ScriptType.SHELL)
                .latestVersion(1)
                .build());

        ScheduledTask saved = taskRepository.save(ScheduledTask.builder()
                .name("测试任务")
                .scriptId(script.getId())
                .scriptVersion(1)
                .params("{\"data\":\"hello\"}")
                .cronExpression("0 0 3 * * *")
                .timezone("Asia/Shanghai")
                .status(TaskStatus.ENABLED)
                .retryCount(0)
                .retryInterval(60)
                .timeoutSeconds(60)
                .build());

        ScheduledTask reloaded = taskRepository.findById(saved.getId()).orElseThrow();
        assertThat(reloaded.getParams()).isEqualTo("{\"data\":\"hello\"}");
        assertThat(reloaded.getScriptId()).isEqualTo(script.getId());
        assertThat(reloaded.getScriptVersion()).isEqualTo(1);
    }
}
