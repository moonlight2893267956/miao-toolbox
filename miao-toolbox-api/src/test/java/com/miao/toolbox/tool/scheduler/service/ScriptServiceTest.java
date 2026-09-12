package com.miao.toolbox.tool.scheduler.service;

import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.tool.scheduler.dto.CreateScriptRequest;
import com.miao.toolbox.tool.scheduler.dto.ScriptResponse;
import com.miao.toolbox.tool.scheduler.dto.ScriptVersionResponse;
import com.miao.toolbox.tool.scheduler.dto.UpdateScriptRequest;
import com.miao.toolbox.tool.scheduler.entity.Script;
import com.miao.toolbox.tool.scheduler.entity.ScriptType;
import com.miao.toolbox.tool.scheduler.entity.ScriptVersion;
import com.miao.toolbox.tool.scheduler.entity.TaskStatus;
import com.miao.toolbox.tool.scheduler.repository.ScheduledTaskRepository;
import com.miao.toolbox.tool.scheduler.repository.ScriptRepository;
import com.miao.toolbox.tool.scheduler.repository.ScriptVersionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("ScriptService 脚本管理")
class ScriptServiceTest {

    @Mock
    private ScriptRepository scriptRepository;
    @Mock
    private ScriptVersionRepository scriptVersionRepository;
    @Mock
    private ScheduledTaskRepository taskRepository;

    @InjectMocks
    private ScriptService service;

    private Script script;
    private ScriptVersion version;

    @BeforeEach
    void setUp() {
        script = Script.builder()
                .id(1L)
                .name("清理日志")
                .description("清理过期执行日志")
                .scriptType(ScriptType.SHELL)
                .latestVersion(1)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();
        version = ScriptVersion.builder()
                .id(10L)
                .scriptId(1L)
                .version(1)
                .content("echo hello")
                .createdAt(LocalDateTime.now())
                .build();
    }

    // ------------------------------------------------------------
    // 创建
    // ------------------------------------------------------------

    @DisplayName("创建脚本成功 → 生成 v1 版本")
    @Test
    void createScriptSuccess() {
        when(scriptRepository.existsByName("清理日志")).thenReturn(false);
        when(scriptRepository.save(any())).thenAnswer(inv -> {
            Script s = inv.getArgument(0);
            ReflectionTestUtils.setField(s, "id", 1L);
            return s;
        });

        CreateScriptRequest req = CreateScriptRequest.builder()
                .name("清理日志")
                .description("清理过期执行日志")
                .scriptType(ScriptType.SHELL)
                .content("echo hello")
                .build();

        ScriptResponse resp = service.createScript(req);

        assertThat(resp.getId()).isEqualTo(1L);
        assertThat(resp.getLatestVersion()).isEqualTo(1);
        assertThat(resp.getContent()).isEqualTo("echo hello");
        verify(scriptRepository).save(any());
        verify(scriptVersionRepository).save(argThat(v -> v.getVersion() == 1 && v.getContent().equals("echo hello")));
    }

    @DisplayName("创建脚本带参数声明 → paramSchema 一并保存")
    @Test
    void createScriptWithParamSchema() {
        when(scriptRepository.existsByName("清理日志")).thenReturn(false);
        when(scriptRepository.save(any())).thenAnswer(inv -> {
            Script s = inv.getArgument(0);
            ReflectionTestUtils.setField(s, "id", 1L);
            return s;
        });

        String schema = "[{\"name\":\"retentionDays\",\"type\":\"int\",\"default\":\"30\",\"desc\":\"保留天数\"}]";
        CreateScriptRequest req = CreateScriptRequest.builder()
                .name("清理日志")
                .scriptType(ScriptType.SHELL)
                .content("echo hello")
                .paramSchema(schema)
                .build();

        ScriptResponse resp = service.createScript(req);

        assertThat(resp.getParamSchema()).isEqualTo(schema);
        verify(scriptRepository).save(argThat(s -> schema.equals(s.getParamSchema())));
    }

    @DisplayName("名称重复 → SCHEDULER_SCRIPT_NAME_DUPLICATED")
    @Test
    void createScriptNameDuplicated() {
        when(scriptRepository.existsByName("清理日志")).thenReturn(true);

        CreateScriptRequest req = CreateScriptRequest.builder()
                .name("清理日志")
                .scriptType(ScriptType.SHELL)
                .content("echo hello")
                .build();

        assertThatThrownBy(() -> service.createScript(req))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("脚本名称已存在");
        verify(scriptRepository, never()).save(any());
    }

    @DisplayName("内容超过 64KB → SCHEDULER_SCRIPT_CONTENT_TOO_LARGE")
    @Test
    void createScriptContentTooLarge() {
        when(scriptRepository.existsByName(anyString())).thenReturn(false);
        String large = "x".repeat(64 * 1024 + 1);

        CreateScriptRequest req = CreateScriptRequest.builder()
                .name("大脚本")
                .scriptType(ScriptType.PYTHON)
                .content(large)
                .build();

        assertThatThrownBy(() -> service.createScript(req))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("64KB");
    }

    @DisplayName("内容为空 → VALIDATION_FAILED")
    @Test
    void createScriptEmptyContent() {
        when(scriptRepository.existsByName(anyString())).thenReturn(false);

        CreateScriptRequest req = CreateScriptRequest.builder()
                .name("空脚本")
                .scriptType(ScriptType.SHELL)
                .content("")
                .build();

        assertThatThrownBy(() -> service.createScript(req))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("不能为空");
    }

    // ------------------------------------------------------------
    // 编辑
    // ------------------------------------------------------------

    @DisplayName("编辑脚本内容变更 → 生成新版本 v2")
    @Test
    void updateScriptGeneratesNewVersion() {
        when(scriptRepository.findById(1L)).thenReturn(Optional.of(script));
        when(scriptVersionRepository.findByScriptIdAndVersion(1L, 1)).thenReturn(Optional.of(version));
        when(scriptRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        UpdateScriptRequest req = UpdateScriptRequest.builder()
                .name("清理日志")
                .description("更新描述")
                .content("echo updated")
                .build();

        ScriptResponse resp = service.updateScript(1L, req);

        assertThat(resp.getLatestVersion()).isEqualTo(2);
        verify(scriptVersionRepository).save(argThat(v -> v.getVersion() == 2 && v.getContent().equals("echo updated")));
    }

    @DisplayName("编辑脚本内容未变 → 不生成新版本")
    @Test
    void updateScriptSameContentNoNewVersion() {
        when(scriptRepository.findById(1L)).thenReturn(Optional.of(script));
        when(scriptVersionRepository.findByScriptIdAndVersion(1L, 1)).thenReturn(Optional.of(version));
        when(scriptRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        UpdateScriptRequest req = UpdateScriptRequest.builder()
                .name("清理日志")
                .description("仅更新描述")
                .content("echo hello")
                .build();

        ScriptResponse resp = service.updateScript(1L, req);

        assertThat(resp.getLatestVersion()).isEqualTo(1);
        verify(scriptVersionRepository, never()).save(any());
    }

    @DisplayName("仅更新参数声明（内容未变）→ 不生成新版本，paramSchema 生效")
    @Test
    void updateScriptParamSchemaOnly() {
        when(scriptRepository.findById(1L)).thenReturn(Optional.of(script));
        when(scriptVersionRepository.findByScriptIdAndVersion(1L, 1)).thenReturn(Optional.of(version));
        when(scriptRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        String schema = "[{\"name\":\"retentionDays\",\"type\":\"int\",\"default\":\"30\"}]";
        UpdateScriptRequest req = UpdateScriptRequest.builder()
                .name("清理日志")
                .description("描述")
                .content("echo hello")
                .paramSchema(schema)
                .build();

        ScriptResponse resp = service.updateScript(1L, req);

        assertThat(resp.getLatestVersion()).isEqualTo(1);
        assertThat(resp.getParamSchema()).isEqualTo(schema);
        verify(scriptVersionRepository, never()).save(any());
    }

    @DisplayName("编辑脚本内容仅行尾不同(\\r\\n vs \\n) → 不生成新版本")
    @Test
    void updateScriptCrlfNormalizedNoNewVersion() {
        // 数据库存的是 \n，前端 CodeMirror 回传 \r\n
        ScriptVersion stored = ScriptVersion.builder()
                .id(10L)
                .scriptId(1L)
                .version(1)
                .content("echo hello\nworld\n")
                .createdAt(LocalDateTime.now())
                .build();
        when(scriptRepository.findById(1L)).thenReturn(Optional.of(script));
        when(scriptVersionRepository.findByScriptIdAndVersion(1L, 1)).thenReturn(Optional.of(stored));
        when(scriptRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        UpdateScriptRequest req = UpdateScriptRequest.builder()
                .name("清理日志")
                .description("描述")
                .content("echo hello\r\nworld\r\n")
                .build();

        ScriptResponse resp = service.updateScript(1L, req);

        assertThat(resp.getLatestVersion()).isEqualTo(1);
        verify(scriptVersionRepository, never()).save(any());
    }

    @DisplayName("编辑脚本内容仅尾部多空行 → 不生成新版本")
    @Test
    void updateScriptTrailingNewlinesNoNewVersion() {
        ScriptVersion stored = ScriptVersion.builder()
                .id(10L)
                .scriptId(1L)
                .version(1)
                .content("echo hello")
                .createdAt(LocalDateTime.now())
                .build();
        when(scriptRepository.findById(1L)).thenReturn(Optional.of(script));
        when(scriptVersionRepository.findByScriptIdAndVersion(1L, 1)).thenReturn(Optional.of(stored));
        when(scriptRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        UpdateScriptRequest req = UpdateScriptRequest.builder()
                .name("清理日志")
                .description("描述")
                .content("echo hello\n\n\n")
                .build();

        ScriptResponse resp = service.updateScript(1L, req);

        assertThat(resp.getLatestVersion()).isEqualTo(1);
        verify(scriptVersionRepository, never()).save(any());
    }

    // ------------------------------------------------------------
    // 删除保护
    // ------------------------------------------------------------

    @DisplayName("删除脚本被启用任务引用 → SCHEDULER_SCRIPT_IN_USE")
    @Test
    void deleteScriptInUse() {
        when(scriptRepository.findById(1L)).thenReturn(Optional.of(script));
        when(taskRepository.countByScriptIdAndStatus(1L, TaskStatus.ENABLED)).thenReturn(2L);

        assertThatThrownBy(() -> service.deleteScript(1L))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("2 个启用任务引用");
        verify(scriptRepository, never()).delete(any());
    }

    @DisplayName("删除脚本无引用 → 成功")
    @Test
    void deleteScriptSuccess() {
        when(scriptRepository.findById(1L)).thenReturn(Optional.of(script));
        when(taskRepository.countByScriptIdAndStatus(1L, TaskStatus.ENABLED)).thenReturn(0L);

        service.deleteScript(1L);

        verify(scriptRepository).delete(script);
    }

    @DisplayName("删除不存在的脚本 → SCHEDULER_SCRIPT_NOT_FOUND")
    @Test
    void deleteScriptNotFound() {
        when(scriptRepository.findById(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.deleteScript(999L))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("脚本不存在");
    }

    // ------------------------------------------------------------
    // 查询
    // ------------------------------------------------------------

    @DisplayName("获取脚本详情 → 含最新版本内容")
    @Test
    void getScriptSuccess() {
        when(scriptRepository.findById(1L)).thenReturn(Optional.of(script));
        when(scriptVersionRepository.findByScriptIdAndVersion(1L, 1)).thenReturn(Optional.of(version));

        ScriptResponse resp = service.getScript(1L);

        assertThat(resp.getName()).isEqualTo("清理日志");
        assertThat(resp.getContent()).isEqualTo("echo hello");
    }

    @DisplayName("版本列表 → 按版本号倒序")
    @Test
    void listVersionsOrdered() {
        when(scriptRepository.findById(1L)).thenReturn(Optional.of(script));
        ScriptVersion v2 = ScriptVersion.builder().version(2).content("v2").build();
        ScriptVersion v1 = ScriptVersion.builder().version(1).content("v1").build();
        when(scriptVersionRepository.findByScriptIdOrderByVersionDesc(1L)).thenReturn(List.of(v2, v1));

        List<ScriptVersionResponse> versions = service.listVersions(1L);

        assertThat(versions).hasSize(2);
        assertThat(versions.get(0).getVersion()).isEqualTo(2);
        assertThat(versions.get(1).getVersion()).isEqualTo(1);
    }

    @DisplayName("查询指定版本不存在 → SCHEDULER_SCRIPT_VERSION_NOT_FOUND")
    @Test
    void getVersionNotFound() {
        when(scriptRepository.findById(1L)).thenReturn(Optional.of(script));
        when(scriptVersionRepository.findByScriptIdAndVersion(1L, 99)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getVersion(1L, 99))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("版本不存在");
    }

    // ------------------------------------------------------------
    // 删除版本（FR-1）
    // ------------------------------------------------------------

    @DisplayName("删除非最新版本 → 删除成功且 latest_version 不变")
    @Test
    void deleteVersionSuccess() {
        script.setLatestVersion(2);
        when(scriptRepository.findById(1L)).thenReturn(Optional.of(script));
        when(scriptVersionRepository.findByScriptIdAndVersion(1L, 1)).thenReturn(Optional.of(version));
        when(scriptVersionRepository.countByScriptId(1L)).thenReturn(2L);
        when(taskRepository.countByScriptIdAndScriptVersion(1L, 1)).thenReturn(0L);

        service.deleteVersion(1L, 1);

        verify(scriptVersionRepository).delete(version);
        // 删的不是最新版本，无需回退 latest_version
        verify(scriptRepository, never()).save(any());
    }

    @DisplayName("删除最新版本 → latest_version 回退到剩余最大版本")
    @Test
    void deleteLatestVersionRollsBackLatestVersion() {
        script.setLatestVersion(2);
        ScriptVersion v2 = ScriptVersion.builder().id(11L).scriptId(1L).version(2).content("v2").build();
        when(scriptRepository.findById(1L)).thenReturn(Optional.of(script));
        when(scriptVersionRepository.findByScriptIdAndVersion(1L, 2)).thenReturn(Optional.of(v2));
        when(scriptVersionRepository.countByScriptId(1L)).thenReturn(2L);
        when(taskRepository.countByScriptIdAndScriptVersion(1L, 2)).thenReturn(0L);
        when(scriptVersionRepository.findByScriptIdOrderByVersionDesc(1L)).thenReturn(List.of(version));

        service.deleteVersion(1L, 2);

        assertThat(script.getLatestVersion()).isEqualTo(1);
        verify(scriptRepository).save(script);
    }

    @DisplayName("仅剩一个版本时删除 → 拒绝（脚本至少保留一个版本）")
    @Test
    void deleteVersionRejectedWhenLastOne() {
        when(scriptRepository.findById(1L)).thenReturn(Optional.of(script));
        when(scriptVersionRepository.findByScriptIdAndVersion(1L, 1)).thenReturn(Optional.of(version));
        when(scriptVersionRepository.countByScriptId(1L)).thenReturn(1L);

        assertThatThrownBy(() -> service.deleteVersion(1L, 1))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("至少保留一个版本");
        verify(scriptVersionRepository, never()).delete(any());
    }

    @DisplayName("版本被任务引用时删除 → 拒绝（含 PAUSED，恢复后仍需该版本）")
    @Test
    void deleteVersionRejectedWhenReferenced() {
        script.setLatestVersion(2);
        when(scriptRepository.findById(1L)).thenReturn(Optional.of(script));
        when(scriptVersionRepository.findByScriptIdAndVersion(1L, 1)).thenReturn(Optional.of(version));
        when(scriptVersionRepository.countByScriptId(1L)).thenReturn(2L);
        when(taskRepository.countByScriptIdAndScriptVersion(1L, 1)).thenReturn(2L);

        assertThatThrownBy(() -> service.deleteVersion(1L, 1))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("被 2 个任务引用");
        verify(scriptVersionRepository, never()).delete(any());
    }
}
