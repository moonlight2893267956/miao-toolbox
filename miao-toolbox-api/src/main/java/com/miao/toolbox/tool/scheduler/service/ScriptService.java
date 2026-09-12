package com.miao.toolbox.tool.scheduler.service;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.common.response.PagedResponse;
import com.miao.toolbox.tool.scheduler.dto.CreateScriptRequest;
import com.miao.toolbox.tool.scheduler.dto.ScriptListItemResponse;
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
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/**
 * 脚本 CRUD、版本管理与删除保护（FR-1/FR-2）。
 *
 * <p>版本管理：每次内容变更生成新版本（自增版本号，从 1 开始）；版本不可修改（只新增不覆盖）。
 * 删除保护：脚本被 ENABLED 状态任务引用时拒绝删除（FR-1）。
 *
 * <p>脚本内容上限 64KB（应用层校验，FR-1 assumption）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ScriptService {

    private static final int MAX_CONTENT_BYTES = 64 * 1024;
    private static final int DEFAULT_PAGE_SIZE = 20;
    private static final int MAX_PAGE_SIZE = 100;

    private final ScriptRepository scriptRepository;
    private final ScriptVersionRepository scriptVersionRepository;
    private final ScheduledTaskRepository taskRepository;

    // ------------------------------------------------------------
    // 创建（FR-1）
    // ------------------------------------------------------------

    @Transactional
    public ScriptResponse createScript(CreateScriptRequest req) {
        String name = req.getName().trim();
        if (scriptRepository.existsByName(name)) {
            throw new BusinessException(ErrorCode.SCHEDULER_SCRIPT_NAME_DUPLICATED,
                    "脚本名称已存在：" + name, 400);
        }
        String content = normalizeContent(req.getContent());
        validateContent(content);
        validateScriptType(req.getScriptType());

        Script script = Script.builder()
                .name(name)
                .description(req.getDescription())
                .scriptType(req.getScriptType())
                .latestVersion(1)
                .paramSchema(req.getParamSchema())
                .build();
        Script saved = scriptRepository.save(script);

        ScriptVersion version = ScriptVersion.builder()
                .scriptId(saved.getId())
                .version(1)
                .content(content)
                .build();
        scriptVersionRepository.save(version);

        log.info("[script:{}] action=CREATE name={} type={} v1", saved.getId(), saved.getName(), saved.getScriptType());
        return toResponse(saved, req.getContent());
    }

    // ------------------------------------------------------------
    // 编辑（FR-1：内容变更生成新版本）
    // ------------------------------------------------------------

    @Transactional
    public ScriptResponse updateScript(Long id, UpdateScriptRequest req) {
        Script script = requireScript(id);
        String name = req.getName().trim();

        if (!script.getName().equals(name) && scriptRepository.existsByName(name)) {
            throw new BusinessException(ErrorCode.SCHEDULER_SCRIPT_NAME_DUPLICATED,
                    "脚本名称已存在：" + name, 400);
        }

        script.setName(name);
        script.setDescription(req.getDescription());
        script.setParamSchema(req.getParamSchema());

        // 内容变更 → 生成新版本（归一化后比较，避免行尾差异导致误判）
        String newContent = normalizeContent(req.getContent());
        if (newContent != null && !newContent.isBlank()) {
            validateContent(newContent);
            ScriptVersion latestVersion = scriptVersionRepository
                    .findByScriptIdAndVersion(id, script.getLatestVersion())
                    .orElse(null);
            String storedContent = latestVersion != null ? normalizeContent(latestVersion.getContent()) : null;
            if (storedContent == null || !newContent.equals(storedContent)) {
                int nextVersion = script.getLatestVersion() + 1;
                ScriptVersion version = ScriptVersion.builder()
                        .scriptId(id)
                        .version(nextVersion)
                        .content(newContent)
                        .build();
                scriptVersionRepository.save(version);
                script.setLatestVersion(nextVersion);
                log.info("[script:{}] action=UPDATE new_version={}", id, nextVersion);
            } else {
                log.debug("[script:{}] action=UPDATE content_unchanged skip_version", id);
            }
        }

        Script saved = scriptRepository.save(script);
        String content = scriptVersionRepository
                .findByScriptIdAndVersion(saved.getId(), saved.getLatestVersion())
                .map(ScriptVersion::getContent)
                .orElse(null);
        return toResponse(saved, content);
    }

    // ------------------------------------------------------------
    // 删除（FR-1：删除保护）
    // ------------------------------------------------------------

    @Transactional
    public void deleteScript(Long id) {
        Script script = requireScript(id);
        long activeRefs = taskRepository.countByScriptIdAndStatus(id, TaskStatus.ENABLED);
        if (activeRefs > 0) {
            throw new BusinessException(ErrorCode.SCHEDULER_SCRIPT_IN_USE,
                    "脚本被 " + activeRefs + " 个启用任务引用，不可删除", 400);
        }
        scriptRepository.delete(script);
        log.info("[script:{}] action=DELETE name={}", id, script.getName());
    }

    // ------------------------------------------------------------
    // 查询
    // ------------------------------------------------------------

    public ScriptResponse getScript(Long id) {
        Script script = requireScript(id);
        ScriptVersion latest = scriptVersionRepository
                .findByScriptIdAndVersion(id, script.getLatestVersion())
                .orElse(null);
        return toResponse(script, latest != null ? latest.getContent() : null);
    }

    public PagedResponse<ScriptListItemResponse> listScripts(int page, int pageSize, String search) {
        int normalizedPageSize = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);
        PageRequest pageRequest = PageRequest.of(Math.max(page - 1, 0), normalizedPageSize,
                Sort.by(Sort.Direction.DESC, "id"));
        String keyword = (search == null || search.isBlank()) ? null : search.trim();
        Page<Script> result = keyword != null
                ? scriptRepository.findByNameContainingIgnoreCase(keyword, pageRequest)
                : scriptRepository.findAll(pageRequest);

        List<ScriptListItemResponse> items = result.getContent().stream()
                .map(this::toListItem)
                .toList();
        return new PagedResponse<>(items, result.getTotalElements(), page, normalizedPageSize);
    }

    public List<ScriptVersionResponse> listVersions(Long scriptId) {
        requireScript(scriptId);
        return scriptVersionRepository.findByScriptIdOrderByVersionDesc(scriptId).stream()
                .map(this::toVersionResponse)
                .toList();
    }

    public ScriptVersionResponse getVersion(Long scriptId, Integer version) {
        requireScript(scriptId);
        ScriptVersion sv = scriptVersionRepository.findByScriptIdAndVersion(scriptId, version)
                .orElseThrow(() -> new BusinessException(ErrorCode.SCHEDULER_SCRIPT_VERSION_NOT_FOUND,
                        "脚本版本不存在：" + scriptId + " v" + version, 404));
        return toVersionResponse(sv);
    }

    /**
     * 删除单个历史版本（FR-1）。
     *
     * <p>约束（PRD FR-1）：
     * <ul>
     *   <li>脚本至少保留一个版本——否则脚本将无内容可执行</li>
     *   <li>版本被任意任务引用时不可删除（含 PAUSED：任务恢复后仍需该版本内容）</li>
     * </ul>
     *
     * <p>删除的是最新版本时，把 {@code latest_version} 回退到剩余最大版本号，
     * 保持与版本表一致（此时已确认无任务引用，回退不会让绑定任务悬空）。
     */
    @Transactional
    public void deleteVersion(Long scriptId, Integer version) {
        Script script = requireScript(scriptId);
        ScriptVersion target = scriptVersionRepository.findByScriptIdAndVersion(scriptId, version)
                .orElseThrow(() -> new BusinessException(ErrorCode.SCHEDULER_SCRIPT_VERSION_NOT_FOUND,
                        "脚本版本不存在：" + scriptId + " v" + version, 404));

        if (scriptVersionRepository.countByScriptId(scriptId) <= 1) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "脚本至少保留一个版本", 400);
        }

        long refs = taskRepository.countByScriptIdAndScriptVersion(scriptId, version);
        if (refs > 0) {
            throw new BusinessException(ErrorCode.SCHEDULER_SCRIPT_IN_USE,
                    "版本 v" + version + " 被 " + refs + " 个任务引用，不可删除", 400);
        }

        scriptVersionRepository.delete(target);
        if (script.getLatestVersion().equals(version)) {
            int remainingLatest = scriptVersionRepository.findByScriptIdOrderByVersionDesc(scriptId).stream()
                    .mapToInt(ScriptVersion::getVersion)
                    .max()
                    .orElse(1);
            script.setLatestVersion(remainingLatest);
            scriptRepository.save(script);
        }
        log.info("[script:{}] action=DELETE_VERSION version={}", scriptId, version);
    }

    // ------------------------------------------------------------
    // 校验与归一化
    // ------------------------------------------------------------

    /**
     * 归一化脚本内容：统一行尾为 \n、去除尾部空白。
     *
     * <p>前端 CodeMirror 编辑器与数据库 LONGTEXT 之间可能存在行尾差异
     *（{\r\n} vs {\n}）或尾部多余换行，导致 {@code equals} 比较始终不等、
     * 版本每次误增。归一化后比较可消除此类假阳性。
     *
     * @param content 原始内容（可为 null）
     * @return 归一化后的内容，null 原样返回
     */
    static String normalizeContent(String content) {
        if (content == null) {
            return null;
        }
        return content
                .replace("\r\n", "\n")
                .replace("\r", "\n")
                .stripTrailing();
    }

    private void validateContent(String content) {
        if (content == null || content.isBlank()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "脚本内容不能为空", 400);
        }
        if (content.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > MAX_CONTENT_BYTES) {
            throw new BusinessException(ErrorCode.SCHEDULER_SCRIPT_CONTENT_TOO_LARGE,
                    "脚本内容超过 64KB 限制", 400);
        }
    }

    private void validateScriptType(ScriptType type) {
        if (type == null) {
            throw new BusinessException(ErrorCode.SCHEDULER_SCRIPT_TYPE_INVALID, "脚本类型不支持", 400);
        }
    }

    // ------------------------------------------------------------
    // 映射
    // ------------------------------------------------------------

    private ScriptResponse toResponse(Script script, String content) {
        return ScriptResponse.builder()
                .id(script.getId())
                .name(script.getName())
                .description(script.getDescription())
                .scriptType(script.getScriptType())
                .latestVersion(script.getLatestVersion())
                .content(content)
                .paramSchema(script.getParamSchema())
                .createdAt(script.getCreatedAt())
                .updatedAt(script.getUpdatedAt())
                .build();
    }

    private ScriptListItemResponse toListItem(Script script) {
        return ScriptListItemResponse.builder()
                .id(script.getId())
                .name(script.getName())
                .description(script.getDescription())
                .scriptType(script.getScriptType())
                .latestVersion(script.getLatestVersion())
                .createdAt(script.getCreatedAt())
                .updatedAt(script.getUpdatedAt())
                .build();
    }

    private ScriptVersionResponse toVersionResponse(ScriptVersion sv) {
        return ScriptVersionResponse.builder()
                .id(sv.getId())
                .scriptId(sv.getScriptId())
                .version(sv.getVersion())
                .content(sv.getContent())
                .createdAt(sv.getCreatedAt())
                .build();
    }

    // ------------------------------------------------------------
    // 私有辅助
    // ------------------------------------------------------------

    private Script requireScript(Long id) {
        return scriptRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.SCHEDULER_SCRIPT_NOT_FOUND,
                        "脚本不存在：" + id, 404));
    }
}
