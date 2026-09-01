package com.miao.toolbox.admin.service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.time.format.DateTimeFormatter;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.miao.toolbox.admin.dto.MimeTypeDistribution;
import com.miao.toolbox.admin.dto.StorageOverviewResponse;
import com.miao.toolbox.admin.dto.UserStorageInfo;
import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.common.response.PagedResponse;
import com.miao.toolbox.storage.dto.FileInfoDTO;
import com.miao.toolbox.storage.entity.FileEntity;
import com.miao.toolbox.storage.repository.FileRepository;
import com.miao.toolbox.storage.repository.FileShareRepository;
import com.miao.toolbox.storage.service.StorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class AdminStorageService {

    private final FileRepository fileRepository;
    private final FileShareRepository fileShareRepository;
    private final UserRepository userRepository;
    private final StorageService storageService;

    private static final Set<String> KNOWN_PREFIXES = Set.of("image", "text", "video", "audio");
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    @Transactional(readOnly = true)
    public StorageOverviewResponse getOverview() {
        long totalBytes = fileRepository.sumTotalSizeBytes();
        long totalFiles = fileRepository.count();

        // 按用户统计
        List<Object[]> sizeByUser = fileRepository.sumSizeBytesGroupByUserId();
        List<Object[]> countByUser = fileRepository.countGroupByUserId();
        Map<Long, Long> sizeMap = toMap(sizeByUser);
        Map<Long, Long> countMap = toMap(countByUser);

        // 获取所有用户
        List<User> allUsers = userRepository.findAll();
        long userCount = allUsers.size();

        List<UserStorageInfo> users = allUsers.stream()
                .map(u -> {
                    long used = sizeMap.getOrDefault(u.getId(), 0L);
                    long quota = u.getStorageQuotaBytes() != null ? u.getStorageQuotaBytes() : 0L;
                    double pct = quota > 0 ? Math.min((double) used / quota * 100, 100.0) : 0.0;
                    return UserStorageInfo.builder()
                            .userId(u.getId())
                            .username(u.getUsername())
                            .usedBytes(used)
                            .quotaBytes(quota)
                            .percentage(Math.round(pct * 100.0) / 100.0)
                            .build();
                })
                .sorted((a, b) -> Long.compare(b.getUsedBytes(), a.getUsedBytes()))
                .collect(Collectors.toList());

        // 按 MIME 前缀分组
        List<Object[]> mimeStats = fileRepository.statsGroupByMimeType();
        Map<String, Long> mimeCount = new LinkedHashMap<>();
        Map<String, Long> mimeBytes = new LinkedHashMap<>();
        for (Object[] row : mimeStats) {
            String mime = (String) row[0];
            long cnt = ((Number) row[1]).longValue();
            long bytes = ((Number) row[2]).longValue();
            String prefix = extractPrefix(mime);
            mimeCount.merge(prefix, cnt, Long::sum);
            mimeBytes.merge(prefix, bytes, Long::sum);
        }

        List<MimeTypeDistribution> typeDistribution = new ArrayList<>();
        // 按已知前缀顺序输出
        for (String prefix : KNOWN_PREFIXES) {
            if (mimeCount.containsKey(prefix)) {
                typeDistribution.add(MimeTypeDistribution.builder()
                        .type(prefix)
                        .count(mimeCount.get(prefix))
                        .totalBytes(mimeBytes.get(prefix))
                        .build());
            }
        }
        // other 放最后
        if (mimeCount.containsKey("other")) {
            typeDistribution.add(MimeTypeDistribution.builder()
                    .type("other")
                    .count(mimeCount.get("other"))
                    .totalBytes(mimeBytes.get("other"))
                    .build());
        }

        return StorageOverviewResponse.builder()
                .totalBytes(totalBytes)
                .totalFiles(totalFiles)
                .userCount(userCount)
                .users(users)
                .typeDistribution(typeDistribution)
                .build();
    }

    private Map<Long, Long> toMap(List<Object[]> rows) {
        Map<Long, Long> map = new HashMap<>();
        for (Object[] row : rows) {
            Long key = ((Number) row[0]).longValue();
            Long val = ((Number) row[1]).longValue();
            map.put(key, val);
        }
        return map;
    }

    private String extractPrefix(String mimeType) {
        if (mimeType == null || !mimeType.contains("/")) {
            return "other";
        }
        String prefix = mimeType.split("/")[0].toLowerCase();
        return KNOWN_PREFIXES.contains(prefix) ? prefix : "other";
    }

    /**
     * 管理员浏览指定用户的文件列表
     */
    @Transactional(readOnly = true)
    public PagedResponse<FileInfoDTO> listUserFiles(Long userId, String path, int page, int pageSize) {
        findUserOrThrow(userId);
        // 分页统一 0-based（与用户端 listFiles 保持一致）
        int safePage = Math.max(page, 0);
        int safePageSize = Math.min(Math.max(pageSize, 1), 100);

        Page<FileEntity> pageResult;
        if (path != null && !path.isEmpty()) {
            pageResult = fileRepository.findByUserIdAndPath(userId, path,
                    PageRequest.of(safePage, safePageSize, Sort.by(Sort.Direction.DESC, "createdAt")));
        } else {
            pageResult = fileRepository.findByUserId(userId,
                    PageRequest.of(safePage, safePageSize, Sort.by(Sort.Direction.DESC, "createdAt")));
        }

        List<FileInfoDTO> items = pageResult.getContent().stream()
                .map(this::toFileInfoDTO)
                .toList();

        PagedResponse<FileInfoDTO> response = new PagedResponse<>();
        response.setItems(items);
        response.setTotal(pageResult.getTotalElements());
        response.setPage(page);
        response.setPageSize(safePageSize);
        return response;
    }

    /**
     * 管理员删除指定用户的文件
     */
    @Transactional
    public void deleteUserFile(Long userId, Long fileId) {
        findUserOrThrow(userId);
        FileEntity file = fileRepository.findByIdAndUserId(fileId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FILE_NOT_FOUND, "文件不存在"));

        String cosKey = file.getCosKey();

        // 删除共享记录
        fileShareRepository.deleteByFileId(fileId);

        // 先删除数据库记录（顺序要求：先库后 COS，避免事务回滚后记录指向已删除的对象）
        fileRepository.delete(file);

        // 再删除 COS 对象：失败仅残留孤立文件，由 OrphanFileCleanupJob 兜底回收
        try {
            storageService.deleteObject(cosKey);
        } catch (Exception e) {
            log.error("管理员删除文件时 COS 对象删除失败，残留为孤立文件待清理: cosKey={}, error={}", cosKey, e.getMessage());
        }
    }

    private FileInfoDTO toFileInfoDTO(FileEntity f) {
        return FileInfoDTO.builder()
                .id(f.getId())
                .fileName(f.getFileName())
                .path(f.getPath())
                .sizeBytes(f.getSizeBytes())
                .mimeType(f.getMimeType())
                .createdAt(f.getCreatedAt() != null ? f.getCreatedAt().format(DATE_FORMATTER) : null)
                .updatedAt(f.getUpdatedAt() != null ? f.getUpdatedAt().format(DATE_FORMATTER) : null)
                .build();
    }

    private User findUserOrThrow(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND, "用户不存在"));
    }
}
