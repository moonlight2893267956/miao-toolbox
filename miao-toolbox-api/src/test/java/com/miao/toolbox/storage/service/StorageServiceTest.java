package com.miao.toolbox.storage.service;

import com.miao.toolbox.storage.config.StorageProperties;
import com.miao.toolbox.storage.exception.StorageException;
import com.miao.toolbox.storage.model.CosObjectResult;
import com.miao.toolbox.storage.model.CosObjectSummary;
import com.miao.toolbox.storage.validator.FileNameValidator;
import com.miao.toolbox.tool.diff.config.CosProperties;
import com.qcloud.cos.COSClient;
import com.qcloud.cos.model.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("StorageService 单元测试")
class StorageServiceTest {

    @Mock
    private COSClient cosClient;

    private CosProperties cosProperties;
    private StorageProperties storageProperties;
    private FileNameValidator fileNameValidator;
    private StorageService storageService;

    @BeforeEach
    void setUp() {
        cosProperties = new CosProperties();
        cosProperties.setBucket("test-bucket");
        cosProperties.setRegion("ap-guangzhou");

        storageProperties = new StorageProperties();
        storageProperties.setBasePath("files");

        fileNameValidator = new FileNameValidator();
        storageService = new StorageService(cosProperties, storageProperties, fileNameValidator);
        storageService.cosClient = cosClient;
    }

    @Nested
    @DisplayName("putObject")
    class PutObject {

        @Test
        @DisplayName("成功上传文件")
        void success() {
            PutObjectResult mockResult = new PutObjectResult();
            mockResult.setETag("\"abc123\"");
            when(cosClient.putObject(eq("test-bucket"), anyString(), any(InputStream.class), any(ObjectMetadata.class)))
                    .thenReturn(mockResult);

            InputStream is = new ByteArrayInputStream("test content".getBytes());
            CosObjectResult result = storageService.putObject("files/1/test.txt", is, 12, "text/plain");

            assertThat(result.getETag()).isEqualTo("\"abc123\"");
            assertThat(result.getKey()).isEqualTo("files/1/test.txt");
        }

        @Test
        @DisplayName("COSClient 为 null 时抛出异常")
        void cosClientNull() {
            storageService.cosClient = null;
            InputStream is = new ByteArrayInputStream("test".getBytes());
            assertThatThrownBy(() -> storageService.putObject("key", is, 4, "text/plain"))
                    .isInstanceOf(StorageException.class)
                    .extracting("code").isEqualTo("STORAGE_COS_ERROR");
        }

        @Test
        @DisplayName("上传失败抛出异常")
        void uploadFailed() {
            when(cosClient.putObject(anyString(), anyString(), any(InputStream.class), any(ObjectMetadata.class)))
                    .thenThrow(new RuntimeException("COS error"));

            InputStream is = new ByteArrayInputStream("test".getBytes());
            assertThatThrownBy(() -> storageService.putObject("key", is, 4, "text/plain"))
                    .isInstanceOf(StorageException.class)
                    .extracting("code").isEqualTo("UPLOAD_FAILED");
        }
    }

    @Nested
    @DisplayName("getObject")
    class GetObject {

        @Test
        @DisplayName("成功下载文件")
        void success() {
            COSObject cosObject = mock(COSObject.class);
            COSObjectInputStream mockStream = mock(COSObjectInputStream.class);
            when(cosObject.getObjectContent()).thenReturn(mockStream);
            when(cosClient.getObject("test-bucket", "key")).thenReturn(cosObject);

            InputStream is = storageService.getObject("key");
            assertThat(is).isNotNull();
        }

        @Test
        @DisplayName("文件不存在抛出 FILE_NOT_FOUND")
        void notFound() {
            com.qcloud.cos.exception.CosServiceException ex = mock(com.qcloud.cos.exception.CosServiceException.class);
            when(ex.getStatusCode()).thenReturn(404);
            when(cosClient.getObject("test-bucket", "key")).thenThrow(ex);

            assertThatThrownBy(() -> storageService.getObject("key"))
                    .isInstanceOf(StorageException.class)
                    .extracting("code").isEqualTo("FILE_NOT_FOUND");
        }
    }

    @Nested
    @DisplayName("deleteObject")
    class DeleteObject {

        @Test
        @DisplayName("成功删除")
        void success() {
            assertThatCode(() -> storageService.deleteObject("key")).doesNotThrowAnyException();
            verify(cosClient).deleteObject("test-bucket", "key");
        }

        @Test
        @DisplayName("key 不存在幂等处理")
        void idempotent() {
            com.qcloud.cos.exception.CosServiceException ex = mock(com.qcloud.cos.exception.CosServiceException.class);
            when(ex.getStatusCode()).thenReturn(404);
            doThrow(ex).when(cosClient).deleteObject(anyString(), anyString());

            assertThatCode(() -> storageService.deleteObject("key")).doesNotThrowAnyException();
        }
    }

    @Nested
    @DisplayName("copyObject")
    class CopyObject {

        @Test
        @DisplayName("成功复制")
        void success() {
            CopyObjectResult mockResult = new CopyObjectResult();
            mockResult.setETag("\"copy-etag\"");
            when(cosClient.copyObject(any(CopyObjectRequest.class))).thenReturn(mockResult);

            assertThatCode(() -> storageService.copyObject("src", "dest")).doesNotThrowAnyException();
        }

        @Test
        @DisplayName("复制失败抛出异常")
        void failed() {
            when(cosClient.copyObject(any(CopyObjectRequest.class))).thenThrow(new RuntimeException("copy error"));

            assertThatThrownBy(() -> storageService.copyObject("src", "dest"))
                    .isInstanceOf(StorageException.class)
                    .extracting("code").isEqualTo("COPY_FAILED");
        }
    }

    @Nested
    @DisplayName("listObjects")
    class ListObjects {

        @Test
        @DisplayName("成功列出对象")
        void success() {
            ObjectListing listing = mock(ObjectListing.class);
            when(listing.isTruncated()).thenReturn(false);
            com.qcloud.cos.model.COSObjectSummary summary = new com.qcloud.cos.model.COSObjectSummary();
            summary.setKey("files/1/test.txt");
            summary.setSize(1024);
            summary.setLastModified(new java.util.Date());
            when(listing.getObjectSummaries()).thenReturn(List.of(summary));

            when(cosClient.listObjects(any(ListObjectsRequest.class))).thenReturn(listing);

            List<CosObjectSummary> results = storageService.listObjects("files/1/");
            assertThat(results).hasSize(1);
            assertThat(results.get(0).getKey()).isEqualTo("files/1/test.txt");
        }
    }

    @Nested
    @DisplayName("generatePresignedUrl")
    class GeneratePresignedUrl {

        @Test
        @DisplayName("成功生成预签名 URL")
        void success() throws Exception {
            URL mockUrl = new URL("https://test-bucket.cos.ap-guangzhou.myqcloud.com/key?sign=abc");
            when(cosClient.generatePresignedUrl(any(GeneratePresignedUrlRequest.class))).thenReturn(mockUrl);

            URL url = storageService.generatePresignedUrl("key", 3600, "GET", "test.txt", true);
            assertThat(url).isNotNull();
        }
    }

    @Nested
    @DisplayName("buildKey")
    class BuildKey {

        @Test
        @DisplayName("带路径的 key")
        void withPath() {
            String key = storageService.buildKey(1L, "docs/2026", "报告.pdf");
            assertThat(key).matches("files/1/docs/2026/[a-f0-9]{8}-报告\\.pdf");
        }

        @Test
        @DisplayName("空路径的 key")
        void emptyPath() {
            String key = storageService.buildKey(1L, "", "test.txt");
            assertThat(key).matches("files/1/[a-f0-9]{8}-test\\.txt");
        }

        @Test
        @DisplayName("null 路径的 key")
        void nullPath() {
            String key = storageService.buildKey(1L, null, "test.txt");
            assertThat(key).matches("files/1/[a-f0-9]{8}-test\\.txt");
        }

        @Test
        @DisplayName("文件名含非法字符被清洗")
        void sanitizeFileName() {
            String key = storageService.buildKey(1L, "", "../evil.txt");
            // ../evil.txt → _/evil.txt (..→_) → __evil.txt (/→_)
            assertThat(key).matches("files/1/[a-f0-9]{8}-__evil\\.txt");
            assertThat(key).doesNotContain("..");
        }

        @Test
        @DisplayName("不同文件名生成不同 key")
        void uniqueKeys() {
            String key1 = storageService.buildKey(1L, "", "a.txt");
            String key2 = storageService.buildKey(1L, "", "a.txt");
            assertThat(key1).isNotEqualTo(key2);
        }
    }
}
