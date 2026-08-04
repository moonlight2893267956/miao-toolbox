package com.miao.toolbox.auth.service;

import com.miao.toolbox.auth.enums.EmailCodePurpose;
import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.constant.RedisKey;
import com.miao.toolbox.common.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.concurrent.TimeUnit;

/**
 * 邮箱验证码服务：生成、存储、校验、限流
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EmailCodeService {

    private final StringRedisTemplate redisTemplate;
    private final EmailSendService emailSendService;
    private final UserRepository userRepository;

    @Value("${app.mail.code.expire-minutes:5}")
    private int expireMinutes;

    @Value("${app.mail.code.max-send-per-hour:5}")
    private int maxSendPerHour;

    @Value("${app.mail.code.max-verify-per-day:10}")
    private int maxVerifyPerDay;

    @Value("${app.mail.code.length:6}")
    private int codeLength;

    private static final SecureRandom RANDOM = new SecureRandom();

    /**
     * 发送验证码
     */
    public void sendCode(String email, EmailCodePurpose purpose) {
        // 1. 限流检查：每小时发送次数
        String sendCountKey = RedisKey.EMAIL_SEND_COUNT_PREFIX + email;
        String sendCountStr = redisTemplate.opsForValue().get(sendCountKey);
        int sendCount = sendCountStr == null ? 0 : Integer.parseInt(sendCountStr);
        if (sendCount >= maxSendPerHour) {
            throw new BusinessException(ErrorCode.EMAIL_CODE_RATE_LIMIT, "发送过于频繁，请稍后再试");
        }

        // 2. 业务校验
        validateBeforeSend(email, purpose);

        // 3. 生成验证码
        String code = generateCode();

        // 4. 存储到 Redis（code:purpose 格式，方便校验时比对 purpose）
        String codeKey = RedisKey.EMAIL_CODE_PREFIX + email;
        redisTemplate.opsForValue().set(codeKey, code + ":" + purpose.name(), expireMinutes, TimeUnit.MINUTES);

        // 5. 递增发送计数
        if (sendCountStr == null) {
            redisTemplate.opsForValue().set(sendCountKey, "1", 1, TimeUnit.HOURS);
        } else {
            redisTemplate.opsForValue().increment(sendCountKey);
        }

        // 6. 异步发送邮件
        String purposeDesc = getPurposeDescription(purpose);
        emailSendService.sendVerificationCode(email, code, purposeDesc);

        log.info("验证码已生成: email={}, purpose={}", email, purpose);
    }

    /**
     * 校验验证码
     *
     * @return true 如果验证码正确
     */
    public boolean verifyCode(String email, String code, EmailCodePurpose purpose) {
        // 1. 限流检查：每日验证次数
        String verifyCountKey = RedisKey.EMAIL_VERIFY_COUNT_PREFIX + email;
        String verifyCountStr = redisTemplate.opsForValue().get(verifyCountKey);
        int verifyCount = verifyCountStr == null ? 0 : Integer.parseInt(verifyCountStr);
        if (verifyCount >= maxVerifyPerDay) {
            throw new BusinessException(ErrorCode.EMAIL_VERIFY_RATE_LIMIT, "验证次数过多，请明天再试");
        }

        // 2. 递增验证计数
        if (verifyCountStr == null) {
            redisTemplate.opsForValue().set(verifyCountKey, "1", 1, TimeUnit.DAYS);
        } else {
            redisTemplate.opsForValue().increment(verifyCountKey);
        }

        // 3. 取出验证码
        String codeKey = RedisKey.EMAIL_CODE_PREFIX + email;
        String stored = redisTemplate.opsForValue().get(codeKey);

        if (stored == null) {
            throw new BusinessException(ErrorCode.EMAIL_CODE_EXPIRED, "验证码已过期，请重新获取");
        }

        String[] parts = stored.split(":", 2);
        String storedCode = parts[0];
        String storedPurpose = parts.length > 1 ? parts[1] : "";

        // 4. 用途校验
        if (!storedPurpose.equals(purpose.name())) {
            throw new BusinessException(ErrorCode.EMAIL_CODE_PURPOSE_MISMATCH, "验证码用途不匹配");
        }

        // 5. 验证码比对
        if (!storedCode.equals(code)) {
            return false;
        }

        // 6. 验证成功，删除验证码（一次性使用）
        redisTemplate.delete(codeKey);
        return true;
    }

    /**
     * 发送前的业务校验
     */
    private void validateBeforeSend(String email, EmailCodePurpose purpose) {
        boolean emailExists = userRepository.findByEmailAndEmailVerifiedTrue(email).isPresent();

        switch (purpose) {
            case REGISTER -> {
                if (emailExists) {
                    throw new BusinessException(ErrorCode.USER_ALREADY_EXISTS, "该邮箱已被注册");
                }
            }
            case BIND_EMAIL -> {
                if (emailExists) {
                    throw new BusinessException(ErrorCode.USER_ALREADY_EXISTS, "该邮箱已被其他账号绑定");
                }
            }
            case RESET_PASSWORD -> {
                if (!emailExists) {
                    throw new BusinessException(ErrorCode.USER_NOT_FOUND, "该邮箱未注册");
                }
            }
        }
    }

    private String generateCode() {
        StringBuilder sb = new StringBuilder(codeLength);
        for (int i = 0; i < codeLength; i++) {
            sb.append(RANDOM.nextInt(10));
        }
        return sb.toString();
    }

    private String getPurposeDescription(EmailCodePurpose purpose) {
        return switch (purpose) {
            case REGISTER -> "注册验证";
            case BIND_EMAIL -> "绑定邮箱";
            case RESET_PASSWORD -> "找回密码";
        };
    }
}
