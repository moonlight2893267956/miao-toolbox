package com.miao.toolbox.tool.diff;

import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.tool.diff.config.CosProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("DiffCosService 测试")
class DiffCosServiceTest {

    private DiffCosService diffCosService;

    @BeforeEach
    void setUp() {
        CosProperties cosProperties = new CosProperties();
        cosProperties.setMaxFileSize(100 * 1024 * 1024L);
        cosProperties.setBasePath("text-compare");
        diffCosService = new DiffCosService(cosProperties);
    }

    @Nested
    @DisplayName("AC6: 文件上传校验")
    class UploadValidationTest {

        @Test
        @DisplayName("文件超过 100MB 应抛出 FILE_TOO_LARGE")
        void fileTooLarge() {
            byte[] largeContent = new byte[101 * 1024 * 1024]; // 101MB
            BusinessException ex = assertThrows(BusinessException.class,
                    () -> diffCosService.upload("large.txt", largeContent));
            assertEquals("DIFF_FILE_TOO_LARGE", ex.getErrorCode());
            assertEquals(400, ex.getHttpStatus());
        }

        @Test
        @DisplayName("COS 未配置时应抛出 COS_ERROR")
        void cosNotConfigured() {
            byte[] smallContent = "hello".getBytes();
            BusinessException ex = assertThrows(BusinessException.class,
                    () -> diffCosService.upload("test.txt", smallContent));
            assertEquals("DIFF_COS_ERROR", ex.getErrorCode());
        }

        @Test
        @DisplayName("COS 未配置时下载也应抛出 COS_ERROR")
        void downloadCosNotConfigured() {
            BusinessException ex = assertThrows(BusinessException.class,
                    () -> diffCosService.download("some-key"));
            assertEquals("DIFF_COS_ERROR", ex.getErrorCode());
        }
    }
}
