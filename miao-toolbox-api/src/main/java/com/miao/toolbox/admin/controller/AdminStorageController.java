package com.miao.toolbox.admin.controller;

import org.springframework.web.bind.annotation.*;
import com.miao.toolbox.admin.dto.StorageOverviewResponse;
import com.miao.toolbox.admin.service.AdminStorageService;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.common.response.PagedResponse;
import com.miao.toolbox.storage.dto.FileInfoDTO;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/admin/storage")
@RequiredArgsConstructor
public class AdminStorageController {

    private final AdminStorageService adminStorageService;

    @GetMapping("/overview")
    public ApiResponse<StorageOverviewResponse> getOverview() {
        return ApiResponse.success(adminStorageService.getOverview());
    }

    @GetMapping("/users/{userId}/files")
    public ApiResponse<PagedResponse<FileInfoDTO>> listUserFiles(
            @PathVariable Long userId,
            @RequestParam(required = false) String path,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        return ApiResponse.success(adminStorageService.listUserFiles(userId, path, page, pageSize));
    }

    @DeleteMapping("/users/{userId}/files/{fileId}")
    public ApiResponse<Void> deleteUserFile(
            @PathVariable Long userId,
            @PathVariable Long fileId) {
        adminStorageService.deleteUserFile(userId, fileId);
        return ApiResponse.success(null);
    }
}
