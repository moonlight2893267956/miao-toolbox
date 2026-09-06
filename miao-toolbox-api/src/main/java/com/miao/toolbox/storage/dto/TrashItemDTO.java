package com.miao.toolbox.storage.dto;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 废纸篓条目（V32）：文件或目录的已删除视图
 *
 * @param id           文件/目录 ID
 * @param type         类型：file / directory
 * @param name         名称
 * @param originalPath 删除前所在目录路径（目录为其原路径；文件为其原父目录路径）
 * @param sizeBytes    大小（目录为其删除时子树文件总大小，当前未统计则为 null）
 * @param mimeType     MIME 类型（目录为 null）
 * @param deletedAt    删除时间
 */
public record TrashItemDTO(
        Long id,
        String type,
        String name,
        String originalPath,
        Long sizeBytes,
        String mimeType,
        LocalDateTime deletedAt
) {
    /** 废纸篓列表视图：顶层文件 + 顶层目录（子孙随顶层展示/恢复，不在列表单列） */
    public record TrashViewDTO(List<TrashItemDTO> files, List<TrashItemDTO> directories) {
    }
}
