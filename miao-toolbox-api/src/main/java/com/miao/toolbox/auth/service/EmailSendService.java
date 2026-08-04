package com.miao.toolbox.auth.service;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import jakarta.mail.internet.MimeMessage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

/**
 * 邮件发送服务
 */
@Slf4j
@Service
public class EmailSendService {

    @Autowired(required = false)
    private JavaMailSender mailSender;

    @Value("${app.mail.from:noreply@example.com}")
    private String from;

    /**
     * 异步发送验证码邮件
     *
     * @param to   收件人邮箱
     * @param code 验证码
     * @param purpose 用途描述（如"注册验证"）
     */
    @Async
    public void sendVerificationCode(String to, String code, String purpose) {
        if (mailSender == null) {
            log.error("邮件发送失败: JavaMailSender 未配置，请检查 SMTP 相关配置");
            throw new BusinessException(ErrorCode.EMAIL_SEND_FAILED, "邮件服务未配置，请联系管理员");
        }
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(from);
            helper.setTo(to);
            helper.setSubject("【阿渺工具箱】" + purpose + "验证码");
            helper.setText(buildHtmlContent(code, purpose), true);
            mailSender.send(message);
            log.info("验证码邮件发送成功: to={}, purpose={}", to, purpose);
        } catch (Exception e) {
            log.error("验证码邮件发送失败: to={}, purpose={}", to, purpose, e);
            throw new BusinessException(ErrorCode.EMAIL_SEND_FAILED, "邮件发送失败，请稍后重试");
        }
    }

    private String buildHtmlContent(String code, String purpose) {
        return """
                <div style="max-width:480px;margin:0 auto;font-family:sans-serif;padding:24px;">
                    <h2 style="color:#333;">阿渺工具箱</h2>
                    <p>您正在进行<strong>%s</strong>操作，验证码为：</p>
                    <div style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#1890ff;margin:16px 0;">%s</div>
                    <p style="color:#999;font-size:14px;">验证码5分钟内有效，请勿泄露给他人。</p>
                    <p style="color:#999;font-size:14px;">如非本人操作，请忽略此邮件。</p>
                </div>
                """.formatted(purpose, code);
    }
}
