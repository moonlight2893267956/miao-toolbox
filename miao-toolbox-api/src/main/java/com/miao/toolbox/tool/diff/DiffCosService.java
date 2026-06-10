package com.miao.toolbox.tool.diff;

import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.tool.diff.config.CosProperties;
import com.qcloud.cos.COSClient;
import com.qcloud.cos.model.ObjectMetadata;
import com.qcloud.cos.model.PutObjectResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.UUID;

@Slf4j
@Service
public class DiffCosService {

    private final CosProperties cosProperties;

    @Autowired(required = false)
    private COSClient cosClient;

    public DiffCosService(CosProperties cosProperties) {
        this.cosProperties = cosProperties;
    }

    /**
     * 上传文件到 COS
     */
    public FileUploadResult upload(String fileName, byte[] content) {
        // AC6: 文件大小校验
        if (content.length > cosProperties.getMaxFileSize()) {
            throw new BusinessException("DIFF_FILE_TOO_LARGE", "文件大小超过 100MB 限制", 400);
        }

        if (cosClient == null) {
            throw new BusinessException("DIFF_COS_ERROR", "COS 服务未配置", 500);
        }

        String fileKey = buildFileKey(fileName);

        try (InputStream inputStream = new ByteArrayInputStream(content)) {
            ObjectMetadata metadata = new ObjectMetadata();
            metadata.setContentLength(content.length);

            cosClient.putObject(
                    cosProperties.getBucket(),
                    fileKey,
                    inputStream,
                    metadata);

            log.info("File uploaded to COS: key={}, size={}", fileKey, content.length);

            return FileUploadResult.builder()
                    .fileKey(fileKey)
                    .fileName(fileName)
                    .size(content.length)
                    .build();
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("COS upload failed: {}", e.getMessage(), e);
            throw new BusinessException("DIFF_COS_ERROR", "文件上传失败", 500);
        }
    }

    /**
     * 从 COS 下载文件内容
     */
    public String download(String fileKey) {
        if (cosClient == null) {
            throw new BusinessException("DIFF_COS_ERROR", "COS 服务未配置", 500);
        }

        try {
            com.qcloud.cos.model.COSObject object = cosClient.getObject(cosProperties.getBucket(), fileKey);
            return new String(object.getObjectContent().readAllBytes(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            log.error("COS download failed: key={}, error={}", fileKey, e.getMessage(), e);
            throw new BusinessException("DIFF_FILE_NOT_FOUND", "文件不存在", 404);
        }
    }

    private String buildFileKey(String fileName) {
        String date = LocalDate.now().toString();
        String uuid = UUID.randomUUID().toString().substring(0, 8);
        return cosProperties.getBasePath() + "/" + date + "/" + uuid + "-" + fileName;
    }
}
