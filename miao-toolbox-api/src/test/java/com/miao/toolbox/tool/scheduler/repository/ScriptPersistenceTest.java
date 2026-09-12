package com.miao.toolbox.tool.scheduler.repository;

import com.miao.toolbox.tool.scheduler.entity.Script;
import com.miao.toolbox.tool.scheduler.entity.ScriptType;
import com.miao.toolbox.tool.scheduler.entity.ScriptVersion;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 脚本持久化测试：验证 NOT NULL 审计字段由实体回调（{@code @PrePersist}）填充。
 *
 * <p>回归背景：{@code ScriptVersion.createdAt} 曾缺失 {@code @PrePersist}，
 * 列虽有 DB 默认值，但 Hibernate 会显式写入 NULL，导致落库报
 * {@code Column 'created_at' cannot be null}。此测试用 H2 按实体
 * {@code nullable=false} 建表（NOT NULL），能真实拦住该类问题。
 */
@DataJpaTest
@ActiveProfiles("test")
@DisplayName("脚本持久化")
class ScriptPersistenceTest {

    @Autowired
    private ScriptRepository scriptRepository;

    @Autowired
    private ScriptVersionRepository scriptVersionRepository;

    @DisplayName("保存版本：created_at 由 @PrePersist 填充，可正常落库并回读")
    @Test
    void savesVersionWithCreatedAt() {
        Script script = scriptRepository.save(Script.builder()
                .name("清理过期日志")
                .scriptType(ScriptType.SHELL)
                .latestVersion(1)
                .build());
        assertThat(script.getId()).isNotNull();
        assertThat(script.getCreatedAt()).isNotNull();
        assertThat(script.getUpdatedAt()).isNotNull();

        ScriptVersion version = scriptVersionRepository.save(ScriptVersion.builder()
                .scriptId(script.getId())
                .version(1)
                .content("echo hello")
                .build());

        assertThat(version.getId()).isNotNull();
        assertThat(version.getCreatedAt()).isNotNull();

        ScriptVersion reloaded = scriptVersionRepository
                .findByScriptIdAndVersion(script.getId(), 1)
                .orElseThrow();
        assertThat(reloaded.getCreatedAt()).isNotNull();
        assertThat(reloaded.getContent()).isEqualTo("echo hello");
    }
}
