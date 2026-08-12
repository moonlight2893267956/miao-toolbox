package com.miao.toolbox.user.service;

import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.tool.diff.config.CosProperties;
import com.qcloud.cos.COSClient;
import com.qcloud.cos.model.CannedAccessControlList;
import com.qcloud.cos.model.ObjectMetadata;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.time.LocalDate;
import java.util.Set;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class AvatarService {

    private static final long MAX_AVATAR_SIZE = 2 * 1024 * 1024L; // 2MB
    private static final Set<String> ALLOWED_TYPES = Set.of("image/jpeg", "image/png", "image/gif", "image/webp");
    private static final int MIN_DIMENSION = 64;
    private static final int MAX_DIMENSION = 2048;

    /** 预设头像名称白名单 */
    private static final Set<String> PRESET_AVATARS = Set.of(
            "cat", "dog", "fox", "panda", "rabbit", "owl", "penguin", "bear"
    );

    private final UserRepository userRepository;
    private final CosProperties cosProperties;

    @Autowired(required = false)
    private COSClient cosClient;

    @Transactional
    public String uploadAvatar(Long userId, MultipartFile file) {
        // 校验文件
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "请选择头像文件", 400);
        }
        if (file.getSize() > MAX_AVATAR_SIZE) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "头像文件不能超过 2MB", 400);
        }
        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_TYPES.contains(contentType)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "仅支持 JPG、PNG、GIF、WebP 格式", 400);
        }

        // 校验图片尺寸
        try {
            BufferedImage image = ImageIO.read(file.getInputStream());
            if (image == null) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED, "无法识别的图片格式", 400);
            }
            if (image.getWidth() < MIN_DIMENSION || image.getHeight() < MIN_DIMENSION) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED, "图片尺寸不能小于 " + MIN_DIMENSION + "x" + MIN_DIMENSION, 400);
            }
            if (image.getWidth() > MAX_DIMENSION || image.getHeight() > MAX_DIMENSION) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED, "图片尺寸不能超过 " + MAX_DIMENSION + "x" + MAX_DIMENSION, 400);
            }
        } catch (BusinessException e) {
            throw e;
        } catch (IOException e) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "图片读取失败", 400);
        }

        if (cosClient == null) {
            throw new BusinessException(ErrorCode.SYSTEM_ERROR, "COS 服务未配置", 500);
        }

        // 上传到 COS
        String extension = getExtension(contentType);
        String fileKey = buildAvatarKey(userId, extension);

        try {
            byte[] bytes = file.getBytes();
            ObjectMetadata metadata = new ObjectMetadata();
            metadata.setContentLength(bytes.length);
            metadata.setContentType(contentType);
            metadata.setCacheControl("max-age=86400");

            cosClient.putObject(
                    cosProperties.getBucket(),
                    fileKey,
                    new ByteArrayInputStream(bytes),
                    metadata);

            // 设置头像对象为公有读，允许直接通过 URL 访问
            cosClient.setObjectAcl(
                    cosProperties.getBucket(),
                    fileKey,
                    CannedAccessControlList.PublicRead);

            // 构建公开访问 URL
            String avatarUrl = buildPublicUrl(fileKey);

            // 更新用户头像 URL
            User user = userRepository.findById(userId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND, "用户不存在", 404));
            user.setAvatarUrl(avatarUrl);
            userRepository.save(user);

            log.info("Avatar uploaded for user {}: {}", userId, avatarUrl);
            return avatarUrl;
        } catch (BusinessException e) {
            throw e;
        } catch (IOException e) {
            throw new BusinessException(ErrorCode.SYSTEM_ERROR, "头像上传失败", 500);
        }
    }

    @Transactional
    public String setPresetAvatar(Long userId, String presetName) {
        if (!PRESET_AVATARS.contains(presetName)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "无效的预设头像", 400);
        }
        String avatarUrl = "/avatars/" + presetName + ".webp";

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND, "用户不存在", 404));
        user.setAvatarUrl(avatarUrl);
        userRepository.save(user);

        log.info("Preset avatar set for user {}: {}", userId, avatarUrl);
        return avatarUrl;
    }

    private String buildAvatarKey(Long userId, String extension) {
        String date = LocalDate.now().toString();
        String uuid = UUID.randomUUID().toString().substring(0, 8);
        return "avatars/" + date + "/" + userId + "-" + uuid + "." + extension;
    }

    private String getExtension(String contentType) {
        return switch (contentType) {
            case "image/png" -> "png";
            case "image/gif" -> "gif";
            case "image/webp" -> "webp";
            default -> "jpg";
        };
    }

    private String buildPublicUrl(String fileKey) {
        return String.format("https://%s.cos.%s.myqcloud.com/%s",
                cosProperties.getBucket(), cosProperties.getRegion(), fileKey);
    }
}
