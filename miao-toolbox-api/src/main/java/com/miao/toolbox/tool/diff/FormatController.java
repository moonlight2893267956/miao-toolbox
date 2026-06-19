package com.miao.toolbox.tool.diff;

import com.miao.toolbox.common.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Slf4j
@RestController
@RequestMapping("/api/diff/format")
@RequiredArgsConstructor
public class FormatController {

    private final FormatService formatService;

    /**
     * POST /api/diff/format — 代码格式化
     */
    @PostMapping
    public ResponseEntity<ApiResponse<FormatResponse>> format(@Valid @RequestBody FormatRequest request) {
        log.debug("Format request: language={}, textLength={}",
                request.getLanguage(),
                request.getText() == null ? 0 : request.getText().length());
        FormatResponse response = formatService.format(request);
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
