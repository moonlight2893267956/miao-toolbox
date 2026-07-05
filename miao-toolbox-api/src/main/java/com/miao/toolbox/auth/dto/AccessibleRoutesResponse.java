package com.miao.toolbox.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;

@Data
@AllArgsConstructor
public class AccessibleRoutesResponse {
    private List<String> routes;
}
