package com.miao.toolbox.storage.service;

import com.miao.toolbox.storage.config.StorageProperties;
import com.miao.toolbox.storage.exception.StorageException;
import com.miao.toolbox.storage.model.CosObjectResult;
import com.miao.toolbox.storage.model.CosObjectSummary;
import com.miao.toolbox.storage.validator.FileNameValidator;
import com.miao.toolbox.tool.diff.config.CosProperties;
import com.qcloud.cos.COSClient;
import com.qcloud.cos.model.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.net.URL;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.UUID;

/**
 * 共享 COS 操作层
 * <p>
 * 封装所有 COS API 调用，FileService 不直接使用 COSClient。
 * COS key 由 buildKey() 统一生成，任何地方不得手动拼接。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class StorageService {

    private final CosProperties cosProperties;
    private final StorageProperties storageProperties;
    private final FileNameValidator fileNameValidator;

    @Autowired(required = false)
    COSClient cosClient;

    /**
     * 上传文件到 COS
     *
     * @param key         COS key（由 buildKey 生成）
     * @param inputStream 文件输入流
     * @param contentLength 文件大小
     * @param contentType MIME 类型
     * @return COS 操作结果
     */
    public CosObjectResult putObject(String key, InputStream inputStream, long contentLength, String contentType) {
        ensureCosClient();
        try {
            ObjectMetadata metadata = new ObjectMetadata();
            metadata.setContentLength(contentLength);
            if (contentType != null) {
                metadata.setContentType(contentType);
            }
            PutObjectResult result = cosClient.putObject(cosProperties.getBucket(), key, inputStream, metadata);
            log.info("File uploaded to COS: key={}, size={}, eTag={}", key, contentLength, result.getETag());
            return CosObjectResult.builder()
                    .eTag(result.getETag())
                    .key(key)
                    .build();
        } catch (Exception e) {
            log.error("COS upload failed: key={}, error={}", key, e.getMessage(), e);
            throw StorageException.uploadFailed(e.getMessage(), e);
        }
    }

    /**
     * 从 COS 下载文件
     *
     * @param key COS key
     * @return 文件输入流
     */
    public InputStream getObject(String key) {
        ensureCosClient();
        try {
            COSObject object = cosClient.getObject(cosProperties.getBucket(), key);
            return object.getObjectContent();
        } catch (com.qcloud.cos.exception.CosServiceException e) {
            if (e.getStatusCode() == 404) {
                throw StorageException.fileNotFound();
            }
            throw StorageException.downloadFailed(e.getMessage());
        } catch (Exception e) {
            throw StorageException.downloadFailed(e.getMessage());
        }
    }

    /**
     * 删除 COS 对象（幂等，key 不存在不报错）
     *
     * @param key COS key
     */
    public void deleteObject(String key) {
        ensureCosClient();
        try {
            cosClient.deleteObject(cosProperties.getBucket(), key);
            log.info("File deleted from COS: key={}", key);
        } catch (com.qcloud.cos.exception.CosServiceException e) {
            if (e.getStatusCode() == 404) {
                // 幂等：key 不存在视为成功
                log.warn("COS object not found on delete (idempotent): key={}", key);
                return;
            }
            throw StorageException.deleteFailed(e.getMessage());
        } catch (Exception e) {
            throw StorageException.deleteFailed(e.getMessage());
        }
    }

    /**
     * 复制 COS 对象
     *
     * @param sourceKey 源 key
     * @param destKey   目标 key
     */
    public void copyObject(String sourceKey, String destKey) {
        ensureCosClient();
        try {
            CopyObjectRequest copyRequest = new CopyObjectRequest(
                    cosProperties.getBucket(), sourceKey,
                    cosProperties.getBucket(), destKey);
            CopyObjectResult result = cosClient.copyObject(copyRequest);
            log.info("File copied in COS: {} -> {}, eTag={}", sourceKey, destKey, result.getETag());
        } catch (Exception e) {
            log.error("COS copy failed: {} -> {}, error={}", sourceKey, destKey, e.getMessage(), e);
            throw StorageException.copyFailed(e.getMessage());
        }
    }

    /**
     * 列出指定前缀下的 COS 对象
     *
     * @param prefix 前缀
     * @return 对象摘要列表
     */
    public List<CosObjectSummary> listObjects(String prefix) {
        ensureCosClient();
        try {
            ListObjectsRequest listRequest = new ListObjectsRequest();
            listRequest.setBucketName(cosProperties.getBucket());
            listRequest.setPrefix(prefix);
            listRequest.setMaxKeys(1000);

            List<CosObjectSummary> results = new ArrayList<>();
            ObjectListing listing = cosClient.listObjects(listRequest);

            for (com.qcloud.cos.model.COSObjectSummary summary : listing.getObjectSummaries()) {
                results.add(CosObjectSummary.builder()
                        .key(summary.getKey())
                        .size(summary.getSize())
                        .lastModified(summary.getLastModified().getTime())
                        .build());
            }

            // 处理分页
            while (listing.isTruncated()) {
                listRequest.setMarker(listing.getNextMarker());
                listing = cosClient.listObjects(listRequest);
                for (com.qcloud.cos.model.COSObjectSummary summary : listing.getObjectSummaries()) {
                    results.add(CosObjectSummary.builder()
                            .key(summary.getKey())
                            .size(summary.getSize())
                            .lastModified(summary.getLastModified().getTime())
                            .build());
                }
            }

            return results;
        } catch (Exception e) {
            throw StorageException.listFailed(e.getMessage());
        }
    }

    /**
     * 生成预签名 URL
     *
     * @param key        COS key
     * @param expiration 过期时间（秒）
     * @param httpMethod HTTP 方法
     * @param fileName   文件名（用于 Content-Disposition）
     * @param download   true=下载模式(attachment), false=预览模式(inline)
     * @return 预签名 URL
     */
    public URL generatePresignedUrl(String key, int expiration, String httpMethod, String fileName, boolean download) {
        return generatePresignedUrl(key, expiration, httpMethod, fileName, download, null);
    }

    /**
     * 生成预签名 URL
     *
     * @param key        COS key
     * @param expiration 过期时间（秒）
     * @param httpMethod HTTP 方法
     * @param fileName   文件名（用于 Content-Disposition）
     * @param download   true=下载模式(attachment), false=预览模式(inline)
     * @param mimeType   文件 MIME 类型（预览模式下覆盖 Content-Type，确保浏览器内联显示）
     * @return 预签名 URL
     */
    public URL generatePresignedUrl(String key, int expiration, String httpMethod, String fileName, boolean download, String mimeType) {
        ensureCosClient();
        try {
            Date expiryDate = new Date(System.currentTimeMillis() + (long) expiration * 1000);

            GeneratePresignedUrlRequest request = new GeneratePresignedUrlRequest(
                    cosProperties.getBucket(), key, com.qcloud.cos.http.HttpMethodName.valueOf(httpMethod));
            request.setExpiration(expiryDate);

            ResponseHeaderOverrides overrides = new ResponseHeaderOverrides();

            if (fileName != null && download) {
                // 下载模式：Content-Disposition: attachment
                overrides.setContentDisposition("attachment; filename=\"" + encodeFileName(fileName) + "\"");
            } else if (fileName != null) {
                // 预览模式：Content-Disposition: inline + Content-Type 覆盖
                overrides.setContentDisposition("inline; filename=\"" + encodeFileName(fileName) + "\"");
                if (mimeType != null) {
                    overrides.setContentType(mimeType);
                }
            }

            request.setResponseHeaders(overrides);

            return cosClient.generatePresignedUrl(request);
        } catch (Exception e) {
            throw StorageException.urlGenerationFailed(e.getMessage());
        }
    }

    /**
     * 构建 COS key
     * <p>
     * 格式：{basePath}/{userId}/{path}/{shortUUID}-{safeFileName}
     * path 为空时：{basePath}/{userId}/{shortUUID}-{safeFileName}
     * <p>
     * 任何地方不得手动拼接 COS key，必须通过此方法生成。
     *
     * @param userId   用户 ID
     * @param path     目录路径（不带尾斜杠，根路径为空字符串）
     * @param fileName 文件名（原始，未经清洗）
     * @return COS key
     */
    public String buildKey(Long userId, String path, String fileName) {
        String safeName = fileNameValidator.validate(fileName);
        String shortUuid = UUID.randomUUID().toString().substring(0, 8);
        String basePath = storageProperties.getBasePath();

        StringBuilder keyBuilder = new StringBuilder();
        keyBuilder.append(basePath).append("/").append(userId);

        if (path != null && !path.isBlank()) {
            // path 不带尾斜杠，直接拼接
            keyBuilder.append("/").append(path);
        }

        keyBuilder.append("/").append(shortUuid).append("-").append(safeName);

        return keyBuilder.toString();
    }

    /**
     * 构建消息配图 COS key
     * <p>
     * 格式：messages/{shortUUID}-{safeFileName}
     * 消息配图为系统资源，与用户文件（files/）隔离存储。
     *
     * @param fileName 文件名（原始，未经清洗）
     * @return COS key
     */
    public String buildMessageImageKey(String fileName) {
        String safeName = fileNameValidator.validate(fileName);
        String shortUuid = UUID.randomUUID().toString().substring(0, 8);
        return "messages/" + shortUuid + "-" + safeName;
    }

    /**
     * 获取 COS bucket 名称
     */
    public String getBucket() {
        return cosProperties.getBucket();
    }

    /**
     * 确认 COSClient 可用
     */
    private void ensureCosClient() {
        if (cosClient == null) {
            throw StorageException.cosNotConfigured();
        }
    }

    /**
     * 编码文件名用于 Content-Disposition header
     * 支持 RFC 5987 编码以处理中文文件名
     */
    private String encodeFileName(String fileName) {
        // 简单处理：替换引号和换行符
        return fileName.replace("\"", "\\\"").replace("\n", "").replace("\r", "");
    }
}
