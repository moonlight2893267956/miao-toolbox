package com.miao.toolbox.admin.service;

import com.miao.toolbox.admin.dto.AdminRoleResponse;
import com.miao.toolbox.admin.dto.CreateRoleRequest;
import com.miao.toolbox.admin.dto.UpdateRoleRequest;
import com.miao.toolbox.auth.entity.Role;
import com.miao.toolbox.auth.repository.RoleRepository;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.common.response.PagedResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Locale;

@Slf4j
@Service
public class AdminRoleService {

    private final RoleRepository roleRepository;

    public AdminRoleService(RoleRepository roleRepository) {
        this.roleRepository = roleRepository;
    }

    /**
     * 分页查询角色列表，支持按名称模糊搜索。
     */
    @Transactional(readOnly = true)
    public PagedResponse<AdminRoleResponse> listRoles(int page, int pageSize, String search) {
        int safePage = Math.max(page, 1) - 1;
        int safePageSize = Math.min(Math.max(pageSize, 1), 100);

        Page<Role> pageResult;
        if (search != null && !search.isBlank()) {
            pageResult = roleRepository.findByNameContaining(search,
                    PageRequest.of(safePage, safePageSize, Sort.by(Sort.Direction.ASC, "id")));
        } else {
            pageResult = roleRepository.findAll(
                    PageRequest.of(safePage, safePageSize, Sort.by(Sort.Direction.ASC, "id")));
        }

        var items = pageResult.getContent().stream().map(this::toResponse).toList();

        PagedResponse<AdminRoleResponse> response = new PagedResponse<>();
        response.setItems(items);
        response.setTotal(pageResult.getTotalElements());
        response.setPage(page);
        response.setPageSize(safePageSize);
        return response;
    }

    /**
     * 创建自定义角色。角色码由名称自动生成（例："VIP用户" → "VIP_USER"）。
     * 校验角色名称唯一性。
     */
    @Transactional
    public AdminRoleResponse createRole(CreateRoleRequest request) {
        // 检查名称唯一性
        if (roleRepository.existsByName(request.getName())) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "角色名称已存在", 409);
        }

        // 生成角色码: 中文→拼音映射简化版，仅处理中文转拼音
        String code = generateRoleCode(request.getName());

        if (roleRepository.findByCode(code).isPresent()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "角色码 " + code + " 已存在，请更换角色名称", 409);
        }

        Role role = Role.builder()
                .code(code)
                .name(request.getName())
                .description(request.getDescription())
                .isSystem(false)
                .build();

        role = roleRepository.save(role);
        log.info("管理员创建角色: code={}, name={}", role.getCode(), role.getName());
        return toResponse(role);
    }

    /**
     * 编辑角色名称或描述。角色码不可变更。
     * 系统内置角色仅允许编辑描述，名称不可修改。
     */
    @Transactional
    public AdminRoleResponse updateRole(Long id, UpdateRoleRequest request) {
        Role role = roleRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.ROLE_NOT_FOUND, "角色不存在", 404));

        boolean isSystem = Boolean.TRUE.equals(role.getIsSystem());

        if (request.getDescription() != null) {
            role.setDescription(request.getDescription());
        }

        // 系统内置角色：只允许编辑描述，阻止修改名称
        if (isSystem && request.getName() != null && !request.getName().isBlank()
                && !request.getName().equals(role.getName())) {
            throw new BusinessException(ErrorCode.ROLE_SYSTEM_PROTECTED,
                    "系统内置角色的名称不可修改", 422);
        }

        if (!isSystem && request.getName() != null && !request.getName().isBlank()) {
            // 检查新名称是否已被其他角色占用
            if (!request.getName().equals(role.getName()) && roleRepository.existsByName(request.getName())) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED, "角色名称已存在", 409);
            }
            role.setName(request.getName());
        }

        role = roleRepository.save(role);
        log.info("管理员编辑角色: id={}, name={}", role.getId(), role.getName());
        return toResponse(role);
    }

    /**
     * 删除角色。
     * - 内置角色不可删除
     * - 有关联用户的角色不可删除（DB 层 RESTRICT + 应用层友好提示）
     */
    @Transactional
    public void deleteRole(Long id) {
        Role role = roleRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.ROLE_NOT_FOUND, "角色不存在", 404));

        if (Boolean.TRUE.equals(role.getIsSystem())) {
            throw new BusinessException(ErrorCode.ROLE_SYSTEM_PROTECTED, "系统内置角色不可删除", 422);
        }

        long userCount = roleRepository.countUsersByRoleId(id);
        if (userCount > 0) {
            throw new BusinessException(ErrorCode.ROLE_HAS_USERS,
                    "请先将关联用户重新分配角色后再删除", 422);
        }

        roleRepository.delete(role);
        log.info("管理员删除角色: id={}, code={}", id, role.getCode());
    }

    // ── 工具方法 ──

    private AdminRoleResponse toResponse(Role role) {
        AdminRoleResponse resp = new AdminRoleResponse();
        resp.setId(role.getId());
        resp.setCode(role.getCode());
        resp.setName(role.getName());
        resp.setDescription(role.getDescription());
        resp.setIsSystem(role.getIsSystem());
        resp.setUserCount(roleRepository.countUsersByRoleId(role.getId()));
        resp.setCreatedAt(role.getCreatedAt());
        resp.setUpdatedAt(role.getUpdatedAt());
        return resp;
    }

    /**
     * 将角色名转换为英文大写下划线格式的角色码。
     * 例: "VIP用户" → "VIP_YONG_HU", "普通用户" → "PU_TONG_YONG_HU"
     */
    static String generateRoleCode(String name) {
        if (name == null || name.isBlank()) return "UNKNOWN";

        String cleaned = name.replaceAll("[^a-zA-Z0-9\\u4e00-\\u9fff_]", "_");

        // 纯英文/数字 → 直接转大写
        if (cleaned.matches("^[a-zA-Z0-9_]+$")) {
            return cleaned.toUpperCase(Locale.ROOT).replaceAll("_+", "_");
        }

        // 混合/中文：按相邻同类字符分组（Latin+数字一组，CJK一组）
        StringBuilder sb = new StringBuilder();
        int i = 0;
        while (i < cleaned.length()) {
            boolean isLatin = isLatinOrDigit(cleaned.charAt(i));
            StringBuilder group = new StringBuilder();
            while (i < cleaned.length() && isLatinOrDigit(cleaned.charAt(i)) == isLatin) {
                group.append(cleaned.charAt(i));
                i++;
            }
            if (isLatin) {
                if (!sb.isEmpty()) sb.append('_');
                sb.append(group.toString().toUpperCase(Locale.ROOT));
            } else {
                for (int j = 0; j < group.length(); j++) {
                    String py = PINYIN_MAP.get(group.charAt(j));
                    if (py != null) {
                        if (!sb.isEmpty()) sb.append('_');
                        sb.append(py.toUpperCase(Locale.ROOT));
                    }
                }
            }
        }

        String result = sb.toString().replaceAll("[^A-Z0-9_]", "")
                .replaceAll("_+", "_")
                .replaceAll("^_|_$", "");
        return result.isEmpty() ? "UNKNOWN" : result;
    }

    private static boolean isLatinOrDigit(char c) {
        return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_';
    }

    /** 简化常用中文→拼音映射（覆盖角色命名常用字，v2 建议引入 pinyin4j） */
    private static final java.util.Map<Character, String> PINYIN_MAP = new java.util.HashMap<>();
    static {
        String[][] map = {
            {"超","Chao"},{"级","Ji"},{"管","Guan"},{"理","Li"},{"员","Yuan"},
            {"普","Pu"},{"通","Tong"},{"用","Yong"},{"户","Hu"},
            {"设","She"},{"置","Zhi"},{"编","Bian"},{"辑","Ji"},
            {"查","Cha"},{"看","Kan"},{"访","Fang"},{"问","Wen"},
            {"测","Ce"},{"试","Shi"},{"开","Kai"},{"发","Fa"},
            {"运","Yun"},{"维","Wei"},{"审","Shen"},{"计","Ji"},
            {"财","Cai"},{"务","Wu"},{"人","Ren"},{"事","Shi"},
            {"销","Xiao"},{"售","Shou"},{"客","Ke"},{"服","Fu"},
            {"内","Nei"},{"外","Wai"},{"高","Gao"},{"中","Zhong"},
            {"临","Lin"},{"时","Shi"},{"实","Shi"},{"习","Xi"},
            {"见","Jian"},{"助","Zhu"},{"专","Zhuan"},{"家","Jia"},
            {"项","Xiang"},{"目","Mu"},{"产","Chan"},{"品","Pin"},
            {"市","Shi"},{"场","Chang"},{"研","Yan"},{"新","Xin"},
            {"岗","Gang"},{"组","Zu"},{"团","Tuan"},{"队","Dui"},
            {"安","An"},{"全","Quan"},{"风","Feng"},{"控","Kong"},
            {"质","Zhi"},{"检","Jian"},{"培","Pei"},{"训","Xun"},
            {"数","Shu"},{"据","Ju"},{"分","Fen"},{"析","Xi"},
            {"工","Gong"},{"程","Cheng"},{"师","Shi"},{"设","She"},
            {"支","Zhi"},{"持","Chi"},{"总","Zong"},{"监","Jian"},
            {"文","Wen"},{"档","Dang"},{"翻","Fan"},{"译","Yi"},
            {"部","Bu"},{"主","Zhu"},{"任","Ren"},{"经","Jing"},
        };
        for (String[] entry : map) {
            PINYIN_MAP.put(entry[0].charAt(0), entry[1]);
        }
    }
}
