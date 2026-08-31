package com.miao.toolbox.storage.service;

import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.constant.RedisKey;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.storage.config.StorageProperties;
import com.miao.toolbox.storage.dto.CreateShareLinkRequest;
import com.miao.toolbox.storage.dto.ShareInfoDTO;
import com.miao.toolbox.storage.dto.ShareLinkDTO;
import com.miao.toolbox.storage.entity.FileEntity;
import com.miao.toolbox.storage.entity.FileShareLinkEntity;
import com.miao.toolbox.storage.repository.FileRepository;
import com.miao.toolbox.storage.repository.FileShareLinkRepository;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * 文件外链分享业务层（PRD §4.12 / Epic 4）
 * <p>
 * 与站内用户间共享（{@code file_shares}）完全隔离：
 * 本服务处理「链接码 + 提取码」的对外公开分享，访客无需登录即可只读访问。
 * <p>
 * 安全约束：
 * <ul>
 *   <li>提取码以 BCrypt 哈希存储，明文仅在创建响应中返回一次，日志中严禁打印</li>
 *   <li>校验通过后签发短期票据（Redis），提取码不出现在后续资源请求 URL 中</li>
 *   <li>所有访客侧失败响应为 403/404，绝不返回 401（前端 401 拦截器会把访客弹到登录页）</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FileShareLinkService {

    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /**
     * 链接码字符集：排除 0/O/1/I/l 等易混淆字符
     */
    private static final String SHARE_CODE_ALPHABET =
            "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

    /**
     * 提取码字符集：大写 + 数字，排除 0/O/1/I，便于口头传达
     */
    private static final String ACCESS_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    private static final int MAX_UNIQUE_CODE_ATTEMPTS = 8;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final FileShareLinkRepository shareLinkRepository;
    private final FileRepository fileRepository;
    private final UserRepository userRepository;
    private final StorageProperties storageProperties;
    private final RedisTemplate<String, Object> redisTemplate;

    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    // ==================== 管理侧（需登录） ====================

    /**
     * 创建外链分享
     *
     * @param userId 分享者 ID
     * @param req    创建请求
     * @return 分享记录，其中 accessCode 为明文提取码（仅此一次返回）
     */
    @Transactional
    public ShareLinkDTO createShareLink(Long userId, CreateShareLinkRequest req) {
        if (req == null || req.getFileId() == null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "文件 ID 不能为空", 400);
        }

        StorageProperties.Share shareProps = storageProperties.getShare();

        // 1. 校验文件归属（非本人文件按不存在处理，避免 ID 探测）
        FileEntity file = fileRepository.findById(req.getFileId())
                .filter(f -> f.getUserId().equals(userId))
                .orElseThrow(() -> new BusinessException(ErrorCode.FILE_NOT_FOUND, "文件不存在", 404));

        // 2. 校验可分享范围：体积
        if (file.getSizeBytes() > shareProps.getMaxFileSize()) {
            throw new BusinessException(ErrorCode.SHARE_FILE_TOO_LARGE,
                    "文件大小超出可分享上限（最大 " + (shareProps.getMaxFileSize() / 1024 / 1024) + "MB）", 400);
        }

        // 3. 校验可分享范围：类型
        if (isForbiddenMimeType(file.getMimeType(), shareProps.getForbiddenMimeTypes())) {
            throw new BusinessException(ErrorCode.SHARE_FILE_TYPE_FORBIDDEN,
                    "该文件类型不允许分享", 400);
        }

        // 4. 解析有效期与次数上限
        LocalDateTime expiresAt = resolveExpiresAt(req.getExpireDays());
        Integer maxVisits = resolveMaxVisits(req.getMaxVisits(), shareProps.getMaxVisitsLimit());

        // 5. 生成双码（提取码明文仅在此处出现，随后立即哈希）
        String shareCode = generateUniqueShareCode(shareProps.getShareCodeLength());
        String accessCode = generateAccessCode(shareProps.getAccessCodeLength());

        FileShareLinkEntity link = FileShareLinkEntity.builder()
                .shareCode(shareCode)
                .fileId(file.getId())
                .userId(userId)
                .accessCodeHash(passwordEncoder.encode(accessCode))
                .expiresAt(expiresAt)
                .maxVisits(maxVisits)
                .visitCount(0)
                .revoked(false)
                .build();

        FileShareLinkEntity saved = shareLinkRepository.save(link);
        log.info("Share link created: shareCode={}, fileId={}, userId={}, expiresAt={}, maxVisits={}",
                saved.getShareCode(), saved.getFileId(), userId, expiresAt, maxVisits);

        return toDto(saved, file, accessCode);
    }

    /**
     * 列出我创建的外链分享
     */
    @Transactional(readOnly = true)
    public List<ShareLinkDTO> listMyShareLinks(Long userId) {
        List<FileShareLinkEntity> links = shareLinkRepository.findByUserIdOrderByIdDesc(userId);
        if (links.isEmpty()) {
            return List.of();
        }

        List<Long> fileIds = links.stream().map(FileShareLinkEntity::getFileId).distinct().toList();
        var files = fileRepository.findAllById(fileIds);
        java.util.Map<Long, FileEntity> fileMap = new java.util.HashMap<>();
        files.forEach(f -> fileMap.put(f.getId(), f));

        List<ShareLinkDTO> result = new ArrayList<>(links.size());
        for (FileShareLinkEntity link : links) {
            // 文件已被删除但分享记录残留时（外键级联兜底），以占位信息展示
            FileEntity file = fileMap.get(link.getFileId());
            result.add(toDto(link, file, null));
        }
        return result;
    }

    /**
     * 取消分享（软删除：标记 revoked，链接立即失效）
     */
    @Transactional
    public void revokeShareLink(Long userId, Long linkId) {
        FileShareLinkEntity link = shareLinkRepository.findById(linkId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SHARE_LINK_NOT_FOUND, "分享记录不存在", 404));

        if (!link.getUserId().equals(userId)) {
            throw new BusinessException(ErrorCode.SHARE_LINK_NOT_FOUND, "分享记录不存在", 404);
        }

        link.setRevoked(true);
        shareLinkRepository.save(link);
        log.info("Share link revoked: shareCode={}, linkId={}, userId={}", link.getShareCode(), linkId, userId);
    }

    /**
     * 清理某文件的全部分享记录（文件删除时调用）
     */
    @Transactional
    public void cleanupByFileId(Long fileId) {
        shareLinkRepository.deleteByFileId(fileId);
    }

    // ==================== 访客侧（免登） ====================

    /**
     * 获取分享公开信息（免登）
     * <p>
     * 设计说明：此处对「已过期/已取消/已用尽」不做拒绝，而是返回 status 由前端展示对应的空状态文案，
     * 这样访客仍能看到文件名，体验优于直接抛错。只有链接不存在才返回 404。
     */
    @Transactional(readOnly = true)
    public ShareInfoDTO getShareInfo(String shareCode) {
        FileShareLinkEntity link = requireLink(shareCode);
        FileEntity file = fileRepository.findById(link.getFileId()).orElse(null);

        return ShareInfoDTO.builder()
                .shareCode(link.getShareCode())
                .fileName(file != null ? file.getFileName() : null)
                .sizeBytes(file != null ? file.getSizeBytes() : null)
                .mimeType(file != null ? file.getMimeType() : null)
                .ownerName(resolveOwnerName(link.getUserId()))
                .expiresAt(link.getExpiresAt() != null ? link.getExpiresAt().format(DATE_FORMATTER) : null)
                .status(link.resolveStatus().name())
                .build();
    }

    /**
     * 校验提取码并签发短期访问票据
     *
     * @param shareCode  链接码
     * @param accessCode 访客输入的提取码明文
     * @param clientIp   访客 IP（用于防爆破计数）
     * @return 访问票据
     */
    @Transactional
    public String unlockShare(String shareCode, String accessCode, String clientIp) {
        FileShareLinkEntity link = requireLink(shareCode);
        StorageProperties.Share shareProps = storageProperties.getShare();

        // 1. 状态校验：取消 → 过期 → 次数用尽（过期链接不消耗防爆破额度）
        assertActive(link);

        // 2. 防爆破：同 shareCode + IP 维度失败次数
        assertNotLockedOut(shareCode, clientIp, shareProps);

        // 3. 提取码校验
        if (accessCode == null || accessCode.isBlank()
                || !passwordEncoder.matches(accessCode.trim().toUpperCase(), link.getAccessCodeHash())) {
            int failures = recordUnlockFailure(shareCode, clientIp, shareProps);
            int remaining = Math.max(shareProps.getMaxUnlockFailAttempts() - failures, 0);
            log.info("Share unlock failed: shareCode={}, ip={}, failures={}", shareCode, clientIp, failures);
            throw new BusinessException(ErrorCode.SHARE_ACCESS_CODE_INVALID,
                    remaining > 0 ? "提取码错误，还可尝试 " + remaining + " 次" : "提取码错误次数过多，请稍后再试", 403);
        }

        // 4. 原子递增访问次数（返回 0 表示并发下已被抢完）
        if (shareLinkRepository.incrementVisitCount(link.getId()) == 0) {
            throw new BusinessException(ErrorCode.SHARE_LINK_EXHAUSTED, "分享访问次数已用尽", 403);
        }

        // 5. 签发票据并清除失败计数
        String ticket = issueTicket(link, shareProps);
        clearUnlockFailures(shareCode, clientIp);
        log.info("Share unlocked: shareCode={}, fileId={}, ip={}", shareCode, link.getFileId(), clientIp);
        return ticket;
    }

    /**
     * 解析访问票据，返回可访问的文件上下文（预览/下载前调用）
     *
     * @throws BusinessException 票据无效、链接失效或文件不存在
     */
    @Transactional(readOnly = true)
    public ShareAccessContext resolveShareAccess(String shareCode, String ticket) {
        if (ticket == null || ticket.isBlank()) {
            throw new BusinessException(ErrorCode.SHARE_ACCESS_TICKET_INVALID, "缺少访问凭证", 403);
        }

        Object cached = redisTemplate.opsForValue().get(RedisKey.SHARE_TICKET_PREFIX + ticket);
        if (cached == null) {
            throw new BusinessException(ErrorCode.SHARE_ACCESS_TICKET_INVALID, "访问凭证已失效，请重新输入提取码", 403);
        }
        if (!shareCode.equals(cached.toString())) {
            log.warn("Share ticket mismatch: shareCode={}, ticketScope={}", shareCode, cached);
            throw new BusinessException(ErrorCode.SHARE_ACCESS_TICKET_INVALID, "访问凭证无效", 403);
        }

        FileShareLinkEntity link = requireLink(shareCode);
        assertActive(link);

        FileEntity file = fileRepository.findById(link.getFileId())
                .orElseThrow(() -> new BusinessException(ErrorCode.FILE_NOT_FOUND, "文件不存在", 404));

        return new ShareAccessContext(link, file);
    }

    // ==================== 内部工具 ====================

    private FileShareLinkEntity requireLink(String shareCode) {
        if (shareCode == null || shareCode.isBlank()) {
            throw new BusinessException(ErrorCode.SHARE_LINK_NOT_FOUND, "分享不存在", 404);
        }
        return shareLinkRepository.findByShareCode(shareCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.SHARE_LINK_NOT_FOUND, "分享不存在", 404));
    }

    /**
     * 校验分享处于生效状态，失效时抛出对应的 403 业务异常
     */
    private void assertActive(FileShareLinkEntity link) {
        if (Boolean.TRUE.equals(link.getRevoked())) {
            throw new BusinessException(ErrorCode.SHARE_LINK_REVOKED, "该分享已被取消", 403);
        }
        if (link.getExpiresAt() != null && link.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new BusinessException(ErrorCode.SHARE_LINK_EXPIRED, "该分享已过期", 403);
        }
        if (link.getMaxVisits() != null && link.getVisitCount() >= link.getMaxVisits()) {
            throw new BusinessException(ErrorCode.SHARE_LINK_EXHAUSTED, "该分享访问次数已用尽", 403);
        }
    }

    private void assertNotLockedOut(String shareCode, String clientIp, StorageProperties.Share props) {
        String key = unlockFailKey(shareCode, clientIp);
        Object count = redisTemplate.opsForValue().get(key);
        if (count == null) {
            return;
        }
        long failures = toLong(count);
        if (failures >= props.getMaxUnlockFailAttempts()) {
            throw new BusinessException(ErrorCode.SHARE_UNLOCK_TOO_MANY_ATTEMPTS,
                    "提取码错误次数过多，请 " + props.getUnlockFailWindowMinutes() + " 分钟后再试", 403);
        }
    }

    private int recordUnlockFailure(String shareCode, String clientIp, StorageProperties.Share props) {
        String key = unlockFailKey(shareCode, clientIp);
        Long failures = redisTemplate.opsForValue().increment(key);
        redisTemplate.expire(key, Duration.ofMinutes(props.getUnlockFailWindowMinutes()));
        return failures == null ? 1 : failures.intValue();
    }

    private void clearUnlockFailures(String shareCode, String clientIp) {
        redisTemplate.delete(unlockFailKey(shareCode, clientIp));
    }

    private String unlockFailKey(String shareCode, String clientIp) {
        return RedisKey.SHARE_UNLOCK_FAIL_PREFIX + shareCode + ":" + (clientIp == null ? "unknown" : clientIp);
    }

    private String issueTicket(FileShareLinkEntity link, StorageProperties.Share props) {
        String ticket = generateCode(SHARE_CODE_ALPHABET, 32);
        redisTemplate.opsForValue().set(
                RedisKey.SHARE_TICKET_PREFIX + ticket,
                link.getShareCode(),
                Duration.ofMinutes(props.getTicketTtlMinutes()));
        return ticket;
    }

    private LocalDateTime resolveExpiresAt(Integer expireDays) {
        if (expireDays == null || expireDays <= 0) {
            Integer defaultDays = storageProperties.getShare().getDefaultExpireDays();
            if (defaultDays == null || defaultDays <= 0) {
                return null;
            }
            return LocalDateTime.now().plusDays(defaultDays);
        }
        return LocalDateTime.now().plusDays(expireDays);
    }

    private Integer resolveMaxVisits(Integer maxVisits, int limit) {
        if (maxVisits == null || maxVisits <= 0) {
            return null;
        }
        if (maxVisits > limit) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "访问次数上限不能超过 " + limit + " 次", 400);
        }
        return maxVisits;
    }

    private boolean isForbiddenMimeType(String mimeType, List<String> forbidden) {
        if (mimeType == null || mimeType.isBlank() || forbidden == null || forbidden.isEmpty()) {
            return false;
        }
        String target = mimeType.toLowerCase();
        for (String rule : forbidden) {
            if (rule == null || rule.isBlank()) {
                continue;
            }
            String normalized = rule.trim().toLowerCase();
            if (normalized.endsWith("*")) {
                if (target.startsWith(normalized.substring(0, normalized.length() - 1))) {
                    return true;
                }
            } else if (normalized.equals(target)) {
                return true;
            }
        }
        return false;
    }

    private String generateUniqueShareCode(int length) {
        for (int i = 0; i < MAX_UNIQUE_CODE_ATTEMPTS; i++) {
            String code = generateCode(SHARE_CODE_ALPHABET, length);
            if (!shareLinkRepository.findByShareCode(code).isPresent()) {
                return code;
            }
        }
        // 极端情况下（重复 8 次）加长 4 位重试，碰撞概率极低
        for (int i = 0; i < MAX_UNIQUE_CODE_ATTEMPTS; i++) {
            String code = generateCode(SHARE_CODE_ALPHABET, length + 4);
            if (!shareLinkRepository.findByShareCode(code).isPresent()) {
                return code;
            }
        }
        throw new BusinessException(ErrorCode.SYSTEM_ERROR, "分享链接生成失败，请重试", 500);
    }

    private String generateAccessCode(int length) {
        return generateCode(ACCESS_CODE_ALPHABET, length);
    }

    private String generateCode(String alphabet, int length) {
        int len = Math.max(length, 1);
        StringBuilder sb = new StringBuilder(len);
        for (int i = 0; i < len; i++) {
            sb.append(alphabet.charAt(RANDOM.nextInt(alphabet.length())));
        }
        return sb.toString();
    }

    private String resolveOwnerName(Long userId) {
        Optional<User> owner = userRepository.findById(userId);
        return owner.map(User::getUsername).orElse(null);
    }

    private long toLong(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(value.toString());
        } catch (NumberFormatException e) {
            return 0L;
        }
    }

    private ShareLinkDTO toDto(FileShareLinkEntity link, FileEntity file, String plainAccessCode) {
        return ShareLinkDTO.builder()
                .id(link.getId())
                .shareCode(link.getShareCode())
                .fileId(link.getFileId())
                .fileName(file != null ? file.getFileName() : null)
                .sizeBytes(file != null ? file.getSizeBytes() : null)
                .mimeType(file != null ? file.getMimeType() : null)
                .shareUrl("/s/" + link.getShareCode())
                .accessCode(plainAccessCode)
                .expiresAt(link.getExpiresAt() != null ? link.getExpiresAt().format(DATE_FORMATTER) : null)
                .maxVisits(link.getMaxVisits())
                .visitCount(link.getVisitCount())
                .revoked(link.getRevoked())
                .status(link.resolveStatus().name())
                .createdAt(link.getCreatedAt() != null ? link.getCreatedAt().format(DATE_FORMATTER) : null)
                .build();
    }

    /**
     * 分享访问上下文：票据校验通过后返回，供预览/下载使用
     */
    @Getter
    public static class ShareAccessContext {

        private final FileShareLinkEntity link;
        private final FileEntity file;

        public ShareAccessContext(FileShareLinkEntity link, FileEntity file) {
            this.link = link;
            this.file = file;
        }
    }
}
