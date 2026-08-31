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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("FileShareLinkService 外链分享单元测试")
class FileShareLinkServiceTest {

    private static final Long OWNER_ID = 1L;
    private static final Long OTHER_USER_ID = 2L;
    private static final Long FILE_ID = 100L;
    private static final String SHARE_CODE = "Ab3xK9mQpL";
    private static final String CLIENT_IP = "203.0.113.7";

    @Mock private FileShareLinkRepository shareLinkRepository;
    @Mock private FileRepository fileRepository;
    @Mock private UserRepository userRepository;
    @Mock private StorageProperties storageProperties;
    @Mock private RedisTemplate<String, Object> redisTemplate;
    @Mock private ValueOperations<String, Object> valueOperations;

    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    private FileShareLinkService service;
    private StorageProperties.Share shareProps;
    private FileEntity ownerFile;

    @BeforeEach
    void setUp() {
        shareProps = new StorageProperties.Share();
        lenient().when(storageProperties.getShare()).thenReturn(shareProps);
        lenient().when(redisTemplate.opsForValue()).thenReturn(valueOperations);

        service = new FileShareLinkService(
                shareLinkRepository, fileRepository, userRepository, storageProperties, redisTemplate);

        ownerFile = FileEntity.builder()
                .id(FILE_ID)
                .userId(OWNER_ID)
                .fileName("design-spec.pdf")
                .path("docs")
                .cosKey("files/1/docs/design-spec.pdf")
                .sizeBytes(2048L)
                .mimeType("application/pdf")
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();
    }

    private FileShareLinkEntity link(Long id, String code, String accessCodeHash,
                                     LocalDateTime expiresAt, Integer maxVisits, int visitCount, boolean revoked) {
        return FileShareLinkEntity.builder()
                .id(id)
                .shareCode(code)
                .fileId(FILE_ID)
                .userId(OWNER_ID)
                .accessCodeHash(accessCodeHash)
                .expiresAt(expiresAt)
                .maxVisits(maxVisits)
                .visitCount(visitCount)
                .revoked(revoked)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();
    }

    private FileShareLinkEntity activeLink(String plainAccessCode) {
        return link(1L, SHARE_CODE, encoder.encode(plainAccessCode), null, null, 0, false);
    }

    private CreateShareLinkRequest request(Long fileId, Integer expireDays, Integer maxVisits) {
        CreateShareLinkRequest req = new CreateShareLinkRequest();
        req.setFileId(fileId);
        req.setExpireDays(expireDays);
        req.setMaxVisits(maxVisits);
        return req;
    }

    // ==================== 创建 ====================

    @Nested
    @DisplayName("创建外链分享")
    class CreateShareLink {

        @Test
        @DisplayName("创建成功：返回明文提取码，库里存的是哈希")
        void createSuccess() {
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));
            when(shareLinkRepository.findByShareCode(anyString())).thenReturn(Optional.empty());
            when(shareLinkRepository.save(any(FileShareLinkEntity.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            ShareLinkDTO dto = service.createShareLink(OWNER_ID, request(FILE_ID, 7, null));

            assertThat(dto.getAccessCode()).isNotBlank().hasSize(shareProps.getAccessCodeLength());
            assertThat(dto.getShareCode()).isNotBlank();
            assertThat(dto.getShareUrl()).isEqualTo("/s/" + dto.getShareCode());
            assertThat(dto.getStatus()).isEqualTo("ACTIVE");
            assertThat(dto.getFileName()).isEqualTo("design-spec.pdf");
            assertThat(dto.getExpiresAt()).isNotNull();

            // 关键安全断言：落库的必须是哈希，不能是明文
            org.mockito.ArgumentCaptor<FileShareLinkEntity> captor =
                    org.mockito.ArgumentCaptor.forClass(FileShareLinkEntity.class);
            verify(shareLinkRepository).save(captor.capture());
            FileShareLinkEntity saved = captor.getValue();
            assertThat(saved.getAccessCodeHash()).isNotEqualTo(dto.getAccessCode());
            assertThat(encoder.matches(dto.getAccessCode(), saved.getAccessCodeHash())).isTrue();
            assertThat(saved.getRevoked()).isFalse();
            assertThat(saved.getVisitCount()).isZero();
        }

        @Test
        @DisplayName("永久有效：expireDays 为 null 时 expiresAt 为空")
        void createPermanent() {
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));
            when(shareLinkRepository.findByShareCode(anyString())).thenReturn(Optional.empty());
            when(shareLinkRepository.save(any(FileShareLinkEntity.class))).thenAnswer(inv -> inv.getArgument(0));

            ShareLinkDTO dto = service.createShareLink(OWNER_ID, request(FILE_ID, null, null));

            assertThat(dto.getExpiresAt()).isNull();
            assertThat(dto.getMaxVisits()).isNull();
        }

        @Test
        @DisplayName("文件不属于当前用户 → FILE_NOT_FOUND 404")
        void fileNotOwned() {
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));

            assertThatThrownBy(() -> service.createShareLink(OTHER_USER_ID, request(FILE_ID, 7, null)))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.FILE_NOT_FOUND);

            verify(shareLinkRepository, never()).save(any());
        }

        @Test
        @DisplayName("文件不存在 → FILE_NOT_FOUND 404")
        void fileMissing() {
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.createShareLink(OWNER_ID, request(FILE_ID, 7, null)))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.FILE_NOT_FOUND);
        }

        @Test
        @DisplayName("文件 ID 为空 → VALIDATION_FAILED 400")
        void fileIdBlank() {
            assertThatThrownBy(() -> service.createShareLink(OWNER_ID, request(null, 7, null)))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.VALIDATION_FAILED);
        }

        @Test
        @DisplayName("文件体积超限 → SHARE_FILE_TOO_LARGE 400")
        void fileTooLarge() {
            shareProps.setMaxFileSize(1024L);
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));

            assertThatThrownBy(() -> service.createShareLink(OWNER_ID, request(FILE_ID, 7, null)))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SHARE_FILE_TOO_LARGE);
        }

        @Test
        @DisplayName("文件类型被禁用 → SHARE_FILE_TYPE_FORBIDDEN 400")
        void fileTypeForbidden() {
            shareProps.setForbiddenMimeTypes(List.of("application/pdf"));
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));

            assertThatThrownBy(() -> service.createShareLink(OWNER_ID, request(FILE_ID, 7, null)))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SHARE_FILE_TYPE_FORBIDDEN);
        }

        @Test
        @DisplayName("类型黑名单支持前缀通配（application/*）")
        void fileTypeForbiddenByWildcard() {
            shareProps.setForbiddenMimeTypes(List.of("application/*"));
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));

            assertThatThrownBy(() -> service.createShareLink(OWNER_ID, request(FILE_ID, 7, null)))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SHARE_FILE_TYPE_FORBIDDEN);
        }

        @Test
        @DisplayName("访问次数上限超过系统限制 → VALIDATION_FAILED 400")
        void maxVisitsExceedsLimit() {
            shareProps.setMaxVisitsLimit(100);
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));

            assertThatThrownBy(() -> service.createShareLink(OWNER_ID, request(FILE_ID, 7, 101)))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.VALIDATION_FAILED);
        }

        @Test
        @DisplayName("链接码碰撞时自动重试生成新的唯一码")
        void shareCodeCollisionRetries() {
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));
            when(shareLinkRepository.findByShareCode(anyString()))
                    .thenReturn(Optional.of(activeLink("ABCD")))
                    .thenReturn(Optional.empty());
            when(shareLinkRepository.save(any(FileShareLinkEntity.class))).thenAnswer(inv -> inv.getArgument(0));

            ShareLinkDTO dto = service.createShareLink(OWNER_ID, request(FILE_ID, null, null));

            assertThat(dto.getShareCode()).isNotBlank();
            verify(shareLinkRepository, org.mockito.Mockito.times(2)).findByShareCode(anyString());
        }
    }

    // ==================== 列表与取消 ====================

    @Nested
    @DisplayName("我的分享与取消")
    class ManageShareLinks {

        @Test
        @DisplayName("列表不返回明文提取码")
        void listHidesAccessCode() {
            when(shareLinkRepository.findByUserIdOrderByIdDesc(OWNER_ID))
                    .thenReturn(List.of(link(1L, SHARE_CODE, encoder.encode("ABCD"), null, 10, 3, false)));
            when(fileRepository.findAllById(List.of(FILE_ID))).thenReturn(List.of(ownerFile));

            List<ShareLinkDTO> list = service.listMyShareLinks(OWNER_ID);

            assertThat(list).hasSize(1);
            assertThat(list.get(0).getAccessCode()).isNull();
            assertThat(list.get(0).getVisitCount()).isEqualTo(3);
            assertThat(list.get(0).getMaxVisits()).isEqualTo(10);
            assertThat(list.get(0).getStatus()).isEqualTo("ACTIVE");
        }

        @Test
        @DisplayName("列表为空时返回空集合")
        void listEmpty() {
            when(shareLinkRepository.findByUserIdOrderByIdDesc(OWNER_ID)).thenReturn(List.of());

            assertThat(service.listMyShareLinks(OWNER_ID)).isEmpty();
        }

        @Test
        @DisplayName("取消分享：标记 revoked 并持久化")
        void revokeSuccess() {
            FileShareLinkEntity target = activeLink("ABCD");
            when(shareLinkRepository.findById(1L)).thenReturn(Optional.of(target));

            service.revokeShareLink(OWNER_ID, 1L);

            assertThat(target.getRevoked()).isTrue();
            verify(shareLinkRepository).save(target);
        }

        @Test
        @DisplayName("取消他人的分享 → SHARE_LINK_NOT_FOUND 404")
        void revokeOthers() {
            when(shareLinkRepository.findById(1L)).thenReturn(Optional.of(activeLink("ABCD")));

            assertThatThrownBy(() -> service.revokeShareLink(OTHER_USER_ID, 1L))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SHARE_LINK_NOT_FOUND);

            verify(shareLinkRepository, never()).save(any());
        }

        @Test
        @DisplayName("取消不存在的分享 → SHARE_LINK_NOT_FOUND 404")
        void revokeMissing() {
            when(shareLinkRepository.findById(404L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.revokeShareLink(OWNER_ID, 404L))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SHARE_LINK_NOT_FOUND);
        }

        @Test
        @DisplayName("清理文件的分享记录")
        void cleanupByFileId() {
            service.cleanupByFileId(FILE_ID);

            verify(shareLinkRepository).deleteByFileId(FILE_ID);
        }
    }

    // ==================== 访客信息 ====================

    @Nested
    @DisplayName("分享公开信息")
    class ShareInfo {

        @Test
        @DisplayName("正常返回文件名、大小、状态，不泄露提取码")
        void infoSuccess() {
            when(shareLinkRepository.findByShareCode(SHARE_CODE)).thenReturn(Optional.of(activeLink("ABCD")));
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));
            when(userRepository.findById(OWNER_ID)).thenReturn(Optional.of(user(OWNER_ID, "阿渺")));

            ShareInfoDTO info = service.getShareInfo(SHARE_CODE);

            assertThat(info.getFileName()).isEqualTo("design-spec.pdf");
            assertThat(info.getSizeBytes()).isEqualTo(2048L);
            assertThat(info.getOwnerName()).isEqualTo("阿渺");
            assertThat(info.getStatus()).isEqualTo("ACTIVE");
            assertThat(info.getExpiresAt()).isNull();
        }

        @Test
        @DisplayName("已过期的分享仍返回信息，status 为 EXPIRED（由前端展示空状态）")
        void infoExpired() {
            when(shareLinkRepository.findByShareCode(SHARE_CODE))
                    .thenReturn(Optional.of(link(1L, SHARE_CODE, encoder.encode("ABCD"),
                            LocalDateTime.now().minusDays(1), null, 0, false)));
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));

            ShareInfoDTO info = service.getShareInfo(SHARE_CODE);

            assertThat(info.getStatus()).isEqualTo("EXPIRED");
        }

        @Test
        @DisplayName("链接不存在 → SHARE_LINK_NOT_FOUND 404")
        void infoNotFound() {
            when(shareLinkRepository.findByShareCode("NOTEXIST")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.getShareInfo("NOTEXIST"))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SHARE_LINK_NOT_FOUND);
        }

        @Test
        @DisplayName("链接码为空 → SHARE_LINK_NOT_FOUND 404")
        void infoBlankCode() {
            assertThatThrownBy(() -> service.getShareInfo("  "))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SHARE_LINK_NOT_FOUND);
        }
    }

    // ==================== 解锁 ====================

    @Nested
    @DisplayName("提取码校验解锁")
    class UnlockShare {

        @Test
        @DisplayName("校验成功：递增计数并签发票据")
        void unlockSuccess() {
            FileShareLinkEntity target = activeLink("ABCD");
            when(shareLinkRepository.findByShareCode(SHARE_CODE)).thenReturn(Optional.of(target));
            when(shareLinkRepository.incrementVisitCount(1L)).thenReturn(1);
            when(valueOperations.get(anyString())).thenReturn(null);

            String ticket = service.unlockShare(SHARE_CODE, "ABCD", CLIENT_IP);

            assertThat(ticket).isNotBlank();
            verify(shareLinkRepository).incrementVisitCount(1L);
            verify(valueOperations).set(eq(RedisKey.SHARE_TICKET_PREFIX + ticket), eq(SHARE_CODE), any(Duration.class));
        }

        @Test
        @DisplayName("提取码大小写不敏感")
        void unlockCaseInsensitive() {
            when(shareLinkRepository.findByShareCode(SHARE_CODE)).thenReturn(Optional.of(activeLink("ABCD")));
            when(shareLinkRepository.incrementVisitCount(1L)).thenReturn(1);
            when(valueOperations.get(anyString())).thenReturn(null);

            assertThat(service.unlockShare(SHARE_CODE, "abcd", CLIENT_IP)).isNotBlank();
        }

        @Test
        @DisplayName("提取码错误 → SHARE_ACCESS_CODE_INVALID 403 并累计失败次数")
        void unlockWrongCode() {
            when(shareLinkRepository.findByShareCode(SHARE_CODE)).thenReturn(Optional.of(activeLink("ABCD")));
            when(valueOperations.get(anyString())).thenReturn(null);
            when(valueOperations.increment(anyString())).thenReturn(1L);

            assertThatThrownBy(() -> service.unlockShare(SHARE_CODE, "ZZZZ", CLIENT_IP))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SHARE_ACCESS_CODE_INVALID);

            verify(shareLinkRepository, never()).incrementVisitCount(any());
        }

        @Test
        @DisplayName("提取码为空 → SHARE_ACCESS_CODE_INVALID 403")
        void unlockBlankCode() {
            when(shareLinkRepository.findByShareCode(SHARE_CODE)).thenReturn(Optional.of(activeLink("ABCD")));
            when(valueOperations.get(anyString())).thenReturn(null);
            when(valueOperations.increment(anyString())).thenReturn(1L);

            assertThatThrownBy(() -> service.unlockShare(SHARE_CODE, "  ", CLIENT_IP))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SHARE_ACCESS_CODE_INVALID);
        }

        @Test
        @DisplayName("失败次数达上限 → SHARE_UNLOCK_TOO_MANY_ATTEMPTS 403（防爆破）")
        void unlockLockedOut() {
            shareProps.setMaxUnlockFailAttempts(3);
            when(shareLinkRepository.findByShareCode(SHARE_CODE)).thenReturn(Optional.of(activeLink("ABCD")));
            when(valueOperations.get(anyString())).thenReturn(5L);

            assertThatThrownBy(() -> service.unlockShare(SHARE_CODE, "ABCD", CLIENT_IP))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SHARE_UNLOCK_TOO_MANY_ATTEMPTS);
        }

        @Test
        @DisplayName("已被取消 → SHARE_LINK_REVOKED 403")
        void unlockRevoked() {
            when(shareLinkRepository.findByShareCode(SHARE_CODE))
                    .thenReturn(Optional.of(link(1L, SHARE_CODE, encoder.encode("ABCD"), null, null, 0, true)));

            assertThatThrownBy(() -> service.unlockShare(SHARE_CODE, "ABCD", CLIENT_IP))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SHARE_LINK_REVOKED);
        }

        @Test
        @DisplayName("已过期 → SHARE_LINK_EXPIRED 403")
        void unlockExpired() {
            when(shareLinkRepository.findByShareCode(SHARE_CODE))
                    .thenReturn(Optional.of(link(1L, SHARE_CODE, encoder.encode("ABCD"),
                            LocalDateTime.now().minusMinutes(1), null, 0, false)));

            assertThatThrownBy(() -> service.unlockShare(SHARE_CODE, "ABCD", CLIENT_IP))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SHARE_LINK_EXPIRED);
        }

        @Test
        @DisplayName("次数已用尽 → SHARE_LINK_EXHAUSTED 403")
        void unlockExhausted() {
            when(shareLinkRepository.findByShareCode(SHARE_CODE))
                    .thenReturn(Optional.of(link(1L, SHARE_CODE, encoder.encode("ABCD"), null, 5, 5, false)));

            assertThatThrownBy(() -> service.unlockShare(SHARE_CODE, "ABCD", CLIENT_IP))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SHARE_LINK_EXHAUSTED);
        }

        @Test
        @DisplayName("并发下最后一个名额被抢走 → SHARE_LINK_EXHAUSTED 403")
        void unlockRaceExhausted() {
            when(shareLinkRepository.findByShareCode(SHARE_CODE))
                    .thenReturn(Optional.of(link(1L, SHARE_CODE, encoder.encode("ABCD"), null, 1, 0, false)));
            when(valueOperations.get(anyString())).thenReturn(null);
            when(shareLinkRepository.incrementVisitCount(1L)).thenReturn(0);

            assertThatThrownBy(() -> service.unlockShare(SHARE_CODE, "ABCD", CLIENT_IP))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SHARE_LINK_EXHAUSTED);
        }

        @Test
        @DisplayName("链接不存在 → SHARE_LINK_NOT_FOUND 404")
        void unlockNotFound() {
            when(shareLinkRepository.findByShareCode("NOTEXIST")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.unlockShare("NOTEXIST", "ABCD", CLIENT_IP))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SHARE_LINK_NOT_FOUND);
        }

        @Test
        @DisplayName("解锁成功后清除该 IP 的失败计数")
        void unlockClearsFailures() {
            when(shareLinkRepository.findByShareCode(SHARE_CODE)).thenReturn(Optional.of(activeLink("ABCD")));
            when(shareLinkRepository.incrementVisitCount(1L)).thenReturn(1);
            when(valueOperations.get(anyString())).thenReturn(null);

            service.unlockShare(SHARE_CODE, "ABCD", CLIENT_IP);

            verify(redisTemplate).delete(RedisKey.SHARE_UNLOCK_FAIL_PREFIX + SHARE_CODE + ":" + CLIENT_IP);
        }

        @Test
        @DisplayName("IP 为空时使用 unknown 兜底，不抛异常")
        void unlockNullIp() {
            when(shareLinkRepository.findByShareCode(SHARE_CODE)).thenReturn(Optional.of(activeLink("ABCD")));
            when(shareLinkRepository.incrementVisitCount(1L)).thenReturn(1);
            when(valueOperations.get(anyString())).thenReturn(null);

            assertThat(service.unlockShare(SHARE_CODE, "ABCD", null)).isNotBlank();
            verify(redisTemplate).delete(RedisKey.SHARE_UNLOCK_FAIL_PREFIX + SHARE_CODE + ":unknown");
        }
    }

    // ==================== 票据解析 ====================

    @Nested
    @DisplayName("访问票据解析")
    class ResolveAccess {

        @Test
        @DisplayName("票据有效：返回分享上下文（含文件实体）")
        void resolveSuccess() {
            when(valueOperations.get(RedisKey.SHARE_TICKET_PREFIX + "tk")).thenReturn(SHARE_CODE);
            when(shareLinkRepository.findByShareCode(SHARE_CODE)).thenReturn(Optional.of(activeLink("ABCD")));
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));

            FileShareLinkService.ShareAccessContext ctx = service.resolveShareAccess(SHARE_CODE, "tk");

            assertThat(ctx.getFile().getFileName()).isEqualTo("design-spec.pdf");
            assertThat(ctx.getLink().getShareCode()).isEqualTo(SHARE_CODE);
        }

        @Test
        @DisplayName("票据缺失 → SHARE_ACCESS_TICKET_INVALID 403")
        void resolveMissingTicket() {
            assertThatThrownBy(() -> service.resolveShareAccess(SHARE_CODE, null))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SHARE_ACCESS_TICKET_INVALID);
        }

        @Test
        @DisplayName("票据已过期（Redis 无记录）→ SHARE_ACCESS_TICKET_INVALID 403")
        void resolveExpiredTicket() {
            when(valueOperations.get(RedisKey.SHARE_TICKET_PREFIX + "tk")).thenReturn(null);

            assertThatThrownBy(() -> service.resolveShareAccess(SHARE_CODE, "tk"))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SHARE_ACCESS_TICKET_INVALID);
        }

        @Test
        @DisplayName("票据与其它分享链接不匹配（越权）→ SHARE_ACCESS_TICKET_INVALID 403")
        void resolveTicketScopeMismatch() {
            when(valueOperations.get(RedisKey.SHARE_TICKET_PREFIX + "tk")).thenReturn("OtherCode01");

            assertThatThrownBy(() -> service.resolveShareAccess(SHARE_CODE, "tk"))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SHARE_ACCESS_TICKET_INVALID);
        }

        @Test
        @DisplayName("票据有效但分享已被取消 → SHARE_LINK_REVOKED 403")
        void resolveRevokedLink() {
            when(valueOperations.get(RedisKey.SHARE_TICKET_PREFIX + "tk")).thenReturn(SHARE_CODE);
            when(shareLinkRepository.findByShareCode(SHARE_CODE))
                    .thenReturn(Optional.of(link(1L, SHARE_CODE, encoder.encode("ABCD"), null, null, 0, true)));

            assertThatThrownBy(() -> service.resolveShareAccess(SHARE_CODE, "tk"))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.SHARE_LINK_REVOKED);
        }

        @Test
        @DisplayName("票据有效但文件已被删除 → FILE_NOT_FOUND 404")
        void resolveFileMissing() {
            when(valueOperations.get(RedisKey.SHARE_TICKET_PREFIX + "tk")).thenReturn(SHARE_CODE);
            when(shareLinkRepository.findByShareCode(SHARE_CODE)).thenReturn(Optional.of(activeLink("ABCD")));
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.resolveShareAccess(SHARE_CODE, "tk"))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.FILE_NOT_FOUND);
        }
    }

    private User user(Long id, String username) {
        User u = new User();
        u.setId(id);
        u.setUsername(username);
        return u;
    }
}
