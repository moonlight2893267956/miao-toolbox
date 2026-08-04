package com.miao.toolbox.auth.controller;

import com.miao.toolbox.auth.dto.SendCodeRequest;
import com.miao.toolbox.auth.service.EmailCodeService;
import com.miao.toolbox.common.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 邮箱验证码控制器
 */
@RestController
@RequestMapping("/api/auth/email")
@RequiredArgsConstructor
public class EmailController {

    private final EmailCodeService emailCodeService;

    /**
     * 发送邮箱验证码
     */
    @PostMapping("/send-code")
    public ApiResponse<Void> sendCode(@Valid @RequestBody SendCodeRequest request) {
        emailCodeService.sendCode(request.email(), request.purpose());
        return ApiResponse.success(null);
    }
}
