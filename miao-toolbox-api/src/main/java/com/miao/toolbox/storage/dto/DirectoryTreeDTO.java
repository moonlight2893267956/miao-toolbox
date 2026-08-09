package com.miao.toolbox.storage.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/**
 * 目录树节点 DTO — 用于前端左侧目录树展示
 */
@Data
@Builder
public class DirectoryTreeDTO {

    private Long id;
    private String name;
    private String path;
    private List<DirectoryTreeDTO> children;
}
